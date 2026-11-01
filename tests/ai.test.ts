import { test } from "node:test";
import assert from "node:assert/strict";
import {
  providerConfigs,
  publicProviders,
  compareModels,
  sameInput,
} from "../lib/ai/providers";
const env = {
  GEMINI_API_KEY: "test-g",
  GEMINI_MODEL: "test-model",
  GEMINI_COMPARE_ENABLED: "true",
  GEMINI_FREE_TIER_CONFIRMED: "true",
  OPENROUTER_API_KEY: "test-o",
  OPENROUTER_MODEL: "test/model:free",
  OPENROUTER_COMPARE_ENABLED: "true",
  DOUBAO_API_KEY: "test-d",
  DOUBAO_MODEL: "test-endpoint",
  DOUBAO_COMPARE_ENABLED: "true",
  DOUBAO_TRIAL_CONFIRMED: "true",
};
test("models are opt-in, no keys mean disconnected; free/trial eligibility cannot be assumed", () => {
  assert.ok(
    providerConfigs({}).every((p) => !p.ready && p.status === "未连接"),
  );
  assert.equal(
    providerConfigs({ ...env, OPENROUTER_MODEL: "paid/model" })[1].ready,
    false,
  );
  assert.equal(
    providerConfigs({ ...env, GEMINI_FREE_TIER_CONFIRMED: "false" })[0].ready,
    false,
  );
  assert.equal(
    providerConfigs({ ...env, DOUBAO_TRIAL_CONFIRMED: "false" })[2].ready,
    false,
  );
  assert.ok(
    !JSON.stringify(publicProviders(providerConfigs(env))).includes("test-g"),
  );
});
test("three adapters receive identical text/instructions, fixed endpoints and no paid fallback", async () => {
  const sent: string[] = [];
  let calls = 0;
  const mock = (async (url, init) => {
    calls++;
    const body = JSON.parse(init!.body as string);
    if (String(url).includes("googleapis")) {
      sent.push(body.contents[0].parts[0].text);
      assert.equal(new Headers(init?.headers).get("x-goog-api-key"), "test-g");
      return Response.json({
        candidates: [
          {
            finishReason: "STOP",
            content: {
              parts: [{ text: "真实响应替身，用于测试 Gemini 适配" }],
            },
          },
        ],
      });
    }
    sent.push(body.messages[1].content);
    if (String(url).includes("openrouter")) {
      assert.ok(body.model.endsWith(":free"));
      assert.equal(body.provider.allow_fallbacks, false);
      assert.deepEqual(body.provider.max_price, { prompt: 0, completion: 0 });
    }
    return Response.json({
      choices: [
        { finish_reason: "stop", message: { content: "测试服务响应" } },
      ],
    });
  }) as typeof fetch;
  const result = await compareModels(
    providerConfigs(env),
    ["gemini", "openrouter", "doubao"],
    "○駅\n彼：行こう。",
    "对白更自然",
    mock,
  );
  assert.equal(calls, 3);
  assert.equal(new Set(sent).size, 1);
  assert.equal(sent[0], sameInput("○駅\n彼：行こう。", "对白更自然"));
  assert.match(result.inputHash, /^[a-f0-9]{64}$/);
  assert.ok(result.results.every((r) => r.text && !r.error));
});
test("quota failure returns error without retry or fabricated reply; disabled configuration dispatches nothing", async () => {
  let calls = 0;
  const transport = (async () => {
    calls++;
    return Response.json({ error: "quota" }, { status: 429 });
  }) as typeof fetch;
  const result = await compareModels(
    providerConfigs(env),
    ["openrouter"],
    "剧本",
    "要求",
    transport,
  );
  assert.equal(calls, 1);
  assert.equal(result.results[0].text, undefined);
  assert.match(result.results[0].error!, /未重试/);
  await assert.rejects(
    compareModels(providerConfigs({}), ["gemini"], "剧本", "要求", transport),
    /未连接/,
  );
  assert.equal(calls, 1);
});
