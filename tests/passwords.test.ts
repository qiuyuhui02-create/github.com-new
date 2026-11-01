import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { setPassword } from "../lib/auth/set-password";
import {
  passwordValidation,
  canSetPassword,
  passwordError,
} from "../lib/auth/passwords";
import type { createRouteClient } from "../utils/supabase/route";
const origin = "https://studio.example",
  user = {
    id: "existing-user-7",
    email: "owner@example.com",
    email_confirmed_at: "2026-01-01T00:00:00Z",
  };
function request(body: unknown, site = origin) {
  return new NextRequest(origin + "/auth/password", {
    method: "POST",
    headers: { origin: site, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
function factory(current: unknown = user, error: unknown = null) {
  let updates = 0;
  const attrs: unknown[] = [];
  return {
    get updates() {
      return updates;
    },
    attrs,
    client: (() => ({
      client: {
        auth: {
          getUser: async () => ({ data: { user: current }, error: null }),
          updateUser: async (a: unknown) => {
            updates++;
            attrs.push(a);
            return { data: { user: current }, error };
          },
        },
      },
      applyCookies: (r: unknown) => r,
    })) as unknown as typeof createRouteClient,
  };
}
const valid = {
  password: "Only-for-test-12345",
  confirmation: "Only-for-test-12345",
};
test("password validation preserves exact text and catches mismatch, weak and oversized passwords", () => {
  assert.equal(passwordValidation(valid.password, valid.confirmation), null);
  assert.match(
    passwordValidation("long-enough-password", "different")!,
    /不一致/,
  );
  assert.match(passwordValidation("short", "short")!, /12/);
  assert.match(passwordValidation("密".repeat(30), "密".repeat(30))!, /72/);
  assert.equal(canSetPassword(user), true);
  assert.equal(canSetPassword({ ...user, email_confirmed_at: null }), false);
});
test("setting password updates only the authenticated user, with no ID/email/admin target", async () => {
  const mock = factory();
  const response = await setPassword(request(valid), mock.client);
  assert.equal(response.status, 200);
  assert.equal(mock.updates, 1);
  assert.deepEqual(mock.attrs, [{ password: valid.password }]);
  assert.deepEqual(await response.json(), { ok: true });
  assert.match(response.headers.get("Cache-Control")!, /no-store/);
});
test("unauthenticated and unverified users cannot call updateUser", async () => {
  for (const [current, status] of [
    [null, 401],
    [{ ...user, email_confirmed_at: undefined }, 403],
    [{ ...user, is_anonymous: true }, 403],
  ] as const) {
    const mock = factory(current);
    const response = await setPassword(request(valid), mock.client);
    assert.equal(response.status, status);
    assert.equal(mock.updates, 0);
  }
});
test("cross-origin, mismatched confirmation and user targeting are denied before updates", async () => {
  const mock = factory();
  assert.equal(
    (await setPassword(request(valid, "https://evil.example"), mock.client))
      .status,
    403,
  );
  assert.equal(
    (
      await setPassword(
        request({ ...valid, confirmation: "not-matching" }),
        mock.client,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await setPassword(
        request({ ...valid, user_id: "someone-else" }),
        mock.client,
      )
    ).status,
    400,
  );
  assert.equal(mock.updates, 0);
});
test("provider reauthentication and wrong password errors are actionable and do not disclose credentials", async () => {
  const mock = factory(user, {
    code: "reauthentication_needed",
    message: "private",
  });
  const response = await setPassword(request(valid), mock.client);
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.code, "reauthentication_required");
  assert.ok(!JSON.stringify(body).includes(valid.password));
  assert.equal(
    passwordError({ code: "invalid_credentials" }, "login").code,
    "invalid_credentials",
  );
  assert.equal(
    passwordError({ code: "email_not_confirmed" }, "login").code,
    "email_unverified",
  );
  assert.equal(
    passwordError({ code: "same_password" }, "update").code,
    "same_password",
  );
});
