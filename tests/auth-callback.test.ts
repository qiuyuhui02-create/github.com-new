import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { createBrowserClient } from "@supabase/ssr";
import { handleAuthCallback } from "../lib/auth/callback";
import { parseAuthCallback, rootCallbackTarget } from "../lib/auth/parameters";
import { authReason, classifyAuthError } from "../lib/auth/messages";
import { createRouteClient } from "../utils/supabase/route";
import { HEAD } from "../app/auth/callback/route";
const base = "https://studio.example";
const user = {
  id: "11111111-1111-4111-8111-111111111111",
  aud: "authenticated",
  role: "authenticated",
  email: "owner@example.com",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: { bio: "x".repeat(7000) },
  created_at: new Date().toISOString(),
  identities: [],
};
function session() {
  return {
    access_token: `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600, role: "authenticated" })).toString("base64url")}.test`,
    refresh_token: "test-refresh",
    token_type: "bearer",
    expires_in: 3600,
    user,
  };
}
function setup() {
  const old = {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    site: process.env.NEXT_PUBLIC_SITE_URL,
  };
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://auth-test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
  delete process.env.NEXT_PUBLIC_SITE_URL;
  return () => {
    for (const [k, v] of Object.entries({
      NEXT_PUBLIC_SUPABASE_URL: old.url,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: old.key,
      NEXT_PUBLIC_SITE_URL: old.site,
    })) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  };
}
function post(params: URLSearchParams, origin = base) {
  return new NextRequest(base + "/auth/callback", {
    method: "POST",
    headers: {
      Origin: origin,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });
}
test("callback parsing separates PKCE, hash and safe errors; never trusts next or error descriptions", () => {
  assert.equal(parseAuthCallback(new URLSearchParams("code=abc")).kind, "pkce");
  assert.equal(
    parseAuthCallback(new URLSearchParams("token_hash=hash&type=email")).kind,
    "hash",
  );
  for (const q of [
    "token_hash=hash&type=recovery",
    "code=a&code=b",
    "code=a&token_hash=b",
    "token_hash=hash",
    "code=",
  ])
    assert.equal(parseAuthCallback(new URLSearchParams(q)).kind, "error");
  const target = rootCallbackTarget(
    new URL(
      base + "/?code=abc&next=https://evil.example&error_description=secret",
    ),
  );
  assert.equal(target?.pathname, "/auth/callback");
  assert.equal(target?.search, "?code=abc");
  assert.equal(authReason("toString"), "verification_failed");
  assert.equal(
    classifyAuthError(
      { code: "over_email_send_rate_limit", status: 429 },
      "send",
    ),
    "email_rate_limit",
  );
});
test("token hash GET and HEAD do not consume tokens; explicit same-origin POST writes all session cookie chunks", async () => {
  const restore = setup();
  try {
    let calls = 0;
    const transport = (async (_url, init) => {
      calls++;
      const body = JSON.parse(init!.body as string);
      assert.equal(body.token_hash, "private-hash");
      assert.equal(body.type, "email");
      assert.equal("code_verifier" in body, false);
      return Response.json(session());
    }) as typeof fetch;
    const factory = (r: NextRequest) => createRouteClient(r, transport);
    const get = await handleAuthCallback(
      new NextRequest(
        base +
          "/auth/callback?token_hash=private-hash&type=email&next=https://evil.example",
      ),
      factory,
    );
    assert.equal(calls, 0);
    assert.equal(
      new URL(get.headers.get("location")!).pathname,
      "/auth/confirm",
    );
    assert.equal((await HEAD()).status, 200);
    assert.equal(calls, 0);
    const response = await handleAuthCallback(
      post(new URLSearchParams("token_hash=private-hash&type=email")),
      factory,
    );
    assert.equal(calls, 1);
    assert.equal(response.status, 303);
    assert.equal(new URL(response.headers.get("location")!).origin, base);
    assert.equal(new URL(response.headers.get("location")!).pathname, "/");
    assert.ok(!response.headers.get("location")!.includes("private-hash"));
    assert.match(response.headers.get("cache-control")!, /no-store/);
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    const chunks = response.headers
      .getSetCookie()
      .filter((s) => /sb-auth-test-auth-token\.\d+=/.test(s));
    assert.ok(chunks.length >= 2);
    assert.ok(
      chunks.every(
        (c) =>
          c.includes("Secure") &&
          c.includes("SameSite=lax") &&
          c.includes("Path=/"),
      ),
    );
    const cookieHeader = response.cookies
      .getAll()
      .filter((c) => c.value)
      .map((c) => `${c.name}=${c.value}`)
      .join("; ");
    const next = createRouteClient(
      new NextRequest(base, { headers: { cookie: cookieHeader } }),
      transport,
    )!;
    const read = await next.client.auth.getSession();
    assert.equal(read.data.session?.user.id, user.id);
    assert.equal(calls, 1);
  } finally {
    restore();
  }
});
test("PKCE exchange uses real SSR verifier cookies, forwards flow id, and attaches cookies to redirect", async () => {
  const restore = setup();
  try {
    const cookies = new Map<string, string>();
    let challenge = "",
      exchanges = 0;
    const transport = (async (url, init) => {
      const body = JSON.parse(init!.body as string);
      if (String(url).includes("/otp")) {
        challenge = body.code_challenge;
        return Response.json({});
      }
      assert.match(String(url), /grant_type=pkce/);
      exchanges++;
      assert.equal(body.auth_code, "one-time-code");
      assert.equal(
        createHash("sha256").update(body.code_verifier).digest("base64url"),
        challenge,
      );
      return Response.json(session());
    }) as typeof fetch;
    const browser = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      {
        isSingleton: false,
        global: { fetch: transport },
        auth: { autoRefreshToken: false, detectSessionInUrl: false },
        cookies: {
          getAll: () =>
            Array.from(cookies, ([name, value]) => ({ name, value })),
          setAll: (items) =>
            items.forEach((c) =>
              c.options?.maxAge === 0
                ? cookies.delete(c.name)
                : cookies.set(c.name, c.value),
            ),
        },
      },
    );
    const sent = await browser.auth.signInWithOtp({
      email: user.email,
      options: { emailRedirectTo: base + "/auth/callback" },
    });
    assert.equal(sent.error, null);
    assert.ok(challenge);
    const cookieHeader = Array.from(cookies, ([k, v]) => `${k}=${v}`).join(
      "; ",
    );
    const response = await handleAuthCallback(
      new NextRequest(base + "/auth/callback?code=one-time-code", {
        headers: { cookie: cookieHeader },
      }),
      (r) => createRouteClient(r, transport),
    );
    assert.equal(response.status, 303);
    assert.equal(exchanges, 1);
    assert.ok(
      response.headers
        .getSetCookie()
        .some((s) => s.includes("sb-auth-test-auth-token")),
    );
    // Current SDK also supports per-flow verifier slots; ensure callback passes the reserved ID.
    let forwarded = "";
    const fakeFactory = ((_r: NextRequest) => ({
      client: {
        auth: {
          exchangeCodeForSession: async (
            _code: string,
            options: { flowId: string },
          ) => {
            forwarded = options.flowId;
            return { data: { session: session() }, error: null };
          },
        },
      },
      applyCookies: (r: unknown) => r,
    })) as unknown as typeof createRouteClient;
    await handleAuthCallback(
      new NextRequest(
        base + "/auth/callback?code=code&sb_flow_id=abcdefgh1234",
      ),
      fakeFactory,
    );
    assert.equal(forwarded, "abcdefgh1234");
  } finally {
    restore();
  }
});
test("missing verifier is distinguished, expired tokens cannot clear an existing session or leak credentials", async () => {
  const restore = setup();
  try {
    let calls = 0;
    const transport = (async () => {
      calls++;
      return Response.json(
        { code: "otp_expired", msg: "expired secret token" },
        { status: 403, headers: { "x-supabase-api-version": "2024-01-01" } },
      );
    }) as typeof fetch;
    const pkce = await handleAuthCallback(
      new NextRequest(base + "/auth/callback?code=sensitive-code"),
      (r) => createRouteClient(r, transport),
    );
    assert.equal(calls, 0);
    assert.equal(
      new URL(pkce.headers.get("location")!).searchParams.get("reason"),
      "pkce_verifier_missing",
    );
    assert.ok(!pkce.headers.get("location")!.includes("sensitive-code"));
    const request = post(
      new URLSearchParams("token_hash=sensitive-hash&type=email"),
    );
    request.cookies.set("existing-session", "do-not-delete");
    const expired = await handleAuthCallback(request, (r) =>
      createRouteClient(r, transport),
    );
    assert.equal(
      new URL(expired.headers.get("location")!).searchParams.get("reason"),
      "expired",
    );
    assert.equal(expired.headers.getSetCookie().length, 0);
    assert.equal(
      request.cookies.get("existing-session")?.value,
      "do-not-delete",
    );
    assert.ok(!expired.headers.get("location")!.includes("sensitive"));
  } finally {
    restore();
  }
});
test("cross-origin confirmation and canonical domain mismatch are rejected before any auth request", async () => {
  const restore = setup();
  try {
    const factory = (() => {
      throw Error("must not construct a client");
    }) as typeof createRouteClient;
    assert.equal(
      (
        await handleAuthCallback(
          post(
            new URLSearchParams("token_hash=hash&type=email"),
            "https://evil.example",
          ),
          factory,
        )
      ).status,
      403,
    );
    process.env.NEXT_PUBLIC_SITE_URL = "https://production.example";
    const mismatch = await handleAuthCallback(
      new NextRequest(base + "/auth/callback?code=secret"),
      factory,
    );
    assert.equal(
      new URL(mismatch.headers.get("location")!).searchParams.get("reason"),
      "wrong_origin",
    );
  } finally {
    restore();
  }
});
import { legacyFragmentReason } from "../lib/auth/legacy";
import { readCooldown, cooldownKey } from "../lib/auth/cooldown";
import { authRequestUrl } from "../lib/auth/request-url";
test("cooldown tolerates disabled storage; fragment and loopback handling never propagate tokens or forwarded-host redirects", () => {
  assert.equal(
    readCooldown({
      getItem: () => {
        throw Error("disabled");
      },
    }),
    0,
  );
  assert.equal(
    readCooldown({ getItem: (k) => (k === cooldownKey ? "1060" : null) }, 1000),
    1060,
  );
  assert.equal(
    legacyFragmentReason("#access_token=private&refresh_token=other"),
    "missing_credentials",
  );
  assert.equal(legacyFragmentReason("#asset-7"), null);
  const local = new NextRequest("http://localhost:3000/auth/callback", {
    headers: { host: "127.0.0.1:3000" },
  });
  assert.equal(authRequestUrl(local).origin, "http://127.0.0.1:3000");
  const actual = new NextRequest("https://studio.example/auth/callback", {
    headers: { host: "evil.example", "x-forwarded-host": "evil.example" },
  });
  assert.equal(authRequestUrl(actual).origin, "https://studio.example");
});
