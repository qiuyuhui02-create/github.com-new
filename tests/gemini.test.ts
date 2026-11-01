import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import {
  geminiConfig,
  ownerAuthorized,
  type GeminiConfig,
} from "../lib/gemini/config";
import { handleGemini } from "../lib/gemini/handler";
import { reserveBudget, GeminiFailure } from "../lib/gemini/budget";
import {
  reviseScene,
  validInput,
  limitedText,
  type RevisionInput,
} from "../lib/gemini/provider";
import {
  GEMINI_MODEL,
  revisionDirections,
  validProposal,
  type GeminiProposal,
} from "../lib/gemini/shared";
import { seed, parseStudio } from "../lib/model";
import { importScreenplay, confirmScene } from "../lib/screenplay";
import { cloudMetadata } from "../lib/media";
const config: GeminiConfig = {
  apiKey: "test-only-server-gemini-key",
  accessCode: "test-only-personal-code-12345678901234567890",
  redisUrl: "https://fixture.upstash.io",
  redisToken: "test-only-redis-token",
};
const input: RevisionInput = {
  text: "内景 教室 — 午后\n\n遥：你明天还来吗？\n凛：嗯。",
  direction: revisionDirections[0],
  instructions: "对白更含蓄",
  requestId: "11111111-1111-4111-8111-111111111111",
};
const proposal: GeminiProposal = {
  script: "内景 教室 — 午后\n\n遥：明天……\n凛：我会来的。",
  reasons: ["用未完句表现犹豫。"],
  model: GEMINI_MODEL,
  source: input.text,
  direction: input.direction,
  instructions: input.instructions,
  at: "2026-11-01T12:00:00.000Z",
};
function request(
  body: unknown = input,
  origin = "https://studio.example",
  code = config.accessCode,
) {
  return new NextRequest("https://studio.example/api/script/gemini", {
    method: "POST",
    headers: {
      Origin: origin,
      Authorization: `Bearer ${code}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}
const transport = (
  fn: (url: string, init: RequestInit) => Response | Promise<Response>,
) =>
  (async (url: unknown, init: RequestInit) =>
    fn(String(url), init)) as typeof fetch;
test("Gemini requires explicit free confirmation, API key, long personal code and dedicated HTTPS limiter", () => {
  const env = {
    GEMINI_ENABLED: "true",
    GEMINI_FREE_TIER_CONFIRMED: "true",
    GEMINI_API_KEY: config.apiKey,
    GEMINI_ACCESS_CODE: config.accessCode,
    UPSTASH_REDIS_REST_URL: config.redisUrl,
    UPSTASH_REDIS_REST_TOKEN: config.redisToken,
  };
  assert.deepEqual(geminiConfig(env), config);
  for (const key of Object.keys(env)) {
    assert.equal(geminiConfig({ ...env, [key]: "" }), null);
  }
  assert.equal(geminiConfig({ ...env, GEMINI_ACCESS_CODE: "short" }), null);
  assert.equal(
    geminiConfig({ ...env, UPSTASH_REDIS_REST_URL: "https://evil.example" }),
    null,
  );
  assert.equal(ownerAuthorized("Bearer wrong", config), false);
  assert.equal(ownerAuthorized(`Bearer ${config.accessCode}`, config), true);
});
test("unauthorized, cross-origin, invalid and oversized requests cannot reach budget or provider", async () => {
  let touched = 0;
  const deps = {
    config: () => config,
    budget: async () => {
      touched++;
    },
    revise: async () => {
      touched++;
      return proposal;
    },
  };
  assert.equal(
    (await handleGemini(request(input, "https://evil.example"), deps)).status,
    403,
  );
  assert.equal(
    (await handleGemini(request(input, undefined, "wrong"), deps)).status,
    401,
  );
  for (const bad of [
    { ...input, model: "paid-model" },
    { ...input, text: "x".repeat(6001) },
    { ...input, instructions: "x".repeat(1001) },
    { ...input, direction: "unknown" },
    { ...input, requestId: "replay" },
  ])
    assert.equal((await handleGemini(request(bad), deps)).status, 400);
  assert.equal(
    (await handleGemini(request(), { ...deps, config: () => null })).status,
    503,
  );
  assert.equal(touched, 0);
  assert.ok(validInput(input));
  assert.ok(!validInput({ ...input, text: "" }));
});
test("official model POST has structured text only, fixed limits, no tools, redirects or key in URL; proposal is independent", async () => {
  let calls = 0;
  const result = await reviseScene(
    input,
    config.apiKey,
    transport((url, init) => {
      calls++;
      assert.equal(
        url,
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      );
      assert.ok(!url.includes(config.apiKey));
      assert.equal(
        (init.headers as Record<string, string>)["x-goog-api-key"],
        config.apiKey,
      );
      assert.equal(init.redirect, "error");
      const b = JSON.parse(String(init.body));
      assert.equal(b.tools, undefined);
      assert.equal(b.generationConfig.maxOutputTokens, 4096);
      assert.equal(b.generationConfig.responseMimeType, "application/json");
      assert.equal(b.generationConfig.thinkingConfig.thinkingBudget, 0);
      assert.equal(JSON.parse(b.contents[0].parts[0].text).scene, input.text);
      return Response.json({
        candidates: [
          {
            finishReason: "STOP",
            content: { parts: [{ text: JSON.stringify(proposal) }] },
          },
        ],
      });
    }),
  );
  assert.equal(calls, 1);
  assert.ok(validProposal(result));
  assert.equal(result.script, proposal.script);
  const data = structuredClone(seed);
  data.script = importScreenplay(input.text, "中文");
  const scene = confirmScene(data.script.scenes[0], input.text),
    before = structuredClone(scene);
  data.script.scenes[0] = { ...scene, geminiProposal: result };
  assert.deepEqual(parseStudio(JSON.parse(JSON.stringify(data))), data);
  assert.deepEqual(data.script.scenes[0].final, before.final);
  assert.equal(data.script.scenes[0].draft, before.draft);
  assert.equal(data.script.scenes[0].original, before.original);
  assert.equal(cloudMetadata(data).script!.scenes[0].geminiProposal, undefined);
});
test("quota, errors, unsafe and truncated results never retry or fall back and never leak credentials", async () => {
  for (const status of [429, 401, 403, 404, 500]) {
    let count = 0;
    await assert.rejects(
      reviseScene(
        input,
        config.apiKey,
        transport(() => {
          count++;
          return new Response(JSON.stringify({ secret: config.apiKey }), {
            status,
          });
        }),
      ),
      (e) => e instanceof GeminiFailure && !e.message.includes(config.apiKey),
    );
    assert.equal(count, 1);
  }
  for (const b of [
    { promptFeedback: { blockReason: "SAFETY" } },
    {
      candidates: [
        {
          finishReason: "MAX_TOKENS",
          content: { parts: [{ text: "partial" }] },
        },
      ],
    },
    {
      candidates: [
        {
          finishReason: "STOP",
          content: { parts: [{ text: '{"script":"partial"}' }] },
        },
      ],
    },
  ])
    await assert.rejects(
      reviseScene(
        input,
        config.apiKey,
        transport(() => Response.json(b)),
      ),
      GeminiFailure,
    );
  await assert.rejects(limitedText(new Response("x".repeat(1024)), 100));
});
test("durable limiter errors fail closed and provider quota trips shared circuit; no plaintext scripts in Redis", async () => {
  let reservations = 0,
    calls = 0;
  const blocked = await handleGemini(request(), {
    config: () => config,
    budget: async () => {
      throw new GeminiFailure("limiter_unavailable", 503);
    },
    revise: async () => {
      calls++;
      return proposal;
    },
  });
  assert.equal(blocked.status, 503);
  assert.equal(calls, 0);
  const response = await handleGemini(request(), {
    config: () => config,
    budget: async (_c, _id, action) => {
      reservations++;
      if (reservations === 2) assert.equal(action, "block");
    },
    revise: async () => {
      calls++;
      throw new GeminiFailure("provider_quota", 429);
    },
  });
  assert.equal(response.status, 429);
  assert.equal(reservations, 2);
  assert.equal(calls, 1);
  assert.equal(
    response.headers.get("cache-control"),
    "private, no-store, max-age=0",
  );
  const body = await response.text();
  assert.ok(
    !body.includes(config.apiKey) &&
      !body.includes(config.accessCode) &&
      !body.includes(config.redisToken),
  );
  await reserveBudget(
    config,
    input.requestId,
    "reserve",
    transport((url, init) => {
      assert.equal(url, config.redisUrl);
      assert.ok(!String(init.body).includes(input.text));
      assert.ok(!String(init.body).includes(config.apiKey));
      assert.ok(!String(init.body).includes(config.accessCode));
      return Response.json({ result: [1, "allowed", 0] });
    }),
  );
  for (const r of [
    Response.json({ result: [0, "daily_limit", 500] }),
    Response.json({ error: "oops" }),
    new Response("bad", { status: 503 }),
  ])
    await assert.rejects(
      reserveBudget(
        config,
        input.requestId,
        "reserve",
        transport(() => r),
      ),
      GeminiFailure,
    );
});
test("successful protected handler reserves before exactly one call and returns no credentials", async () => {
  const order: string[] = [];
  const r = await handleGemini(request(), {
    config: () => config,
    budget: async () => {
      order.push("budget");
    },
    revise: async (i, key) => {
      order.push("provider");
      assert.deepEqual(i, input);
      assert.equal(key, config.apiKey);
      return proposal;
    },
  });
  assert.equal(r.status, 200);
  assert.deepEqual(order, ["budget", "provider"]);
  const body = await r.text();
  assert.deepEqual(JSON.parse(body).proposal, proposal);
  for (const secret of [config.apiKey, config.accessCode, config.redisToken])
    assert.ok(!body.includes(secret));
});
