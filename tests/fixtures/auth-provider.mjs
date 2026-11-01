// Test-only loopback Auth substitute. Never sends mail or connects to a database.
import http from "node:http";
import { createHash } from "node:crypto";
const host = "127.0.0.1",
  port = Number(process.env.AUTH_FIXTURE_PORT || 54399);
export const user = {
  id: "11111111-1111-4111-8111-111111111111",
  aud: "authenticated",
  role: "authenticated",
  email: "owner@example.com",
  email_confirmed_at: new Date().toISOString(),
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: {},
  identities: [],
  created_at: new Date().toISOString(),
};
let state, usedHashes, challenge, accountPassword, requireReauth, emailVerified;
const currentUser = () => ({
  ...user,
  email_confirmed_at: emailVerified ? user.email_confirmed_at : undefined,
});
function reset() {
  state = {
    fixture: "framework-auth-test-v1",
    passwordLogins: 0,
    passwordUpdates: 0,
    passwordUpdateAttempts: 0,
    userCreations: 0,
    userDeletions: 0,
    emails: 0,
    hashVerifications: 0,
    otpVerifications: 0,
    exchanges: 0,
    databaseRequests: 0,
  };
  usedHashes = new Set();
  challenge = "";
  accountPassword = "";
  requireReauth = false;
  emailVerified = true;
}
reset();
function session() {
  return {
    access_token: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${Buffer.from(JSON.stringify({ sub: user.id, email: user.email, exp: Math.floor(Date.now() / 1000) + 3600, role: "authenticated", aud: "authenticated" })).toString("base64url")}.test`,
    refresh_token: "local-fixture-refresh",
    token_type: "bearer",
    expires_in: 3600,
    user: currentUser(),
  };
}
const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "authorization,apikey,content-type,x-client-info,x-supabase-api-version",
  );
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
  res.setHeader("x-supabase-api-version", "2024-01-01");
  res.setHeader("Content-Type", "application/json");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  const path = new URL(req.url, `http://${host}:${port}`).pathname;
  const json = (status, data) => {
    res.writeHead(status);
    res.end(JSON.stringify(data));
  };
  if (path === "/__test/reset") {
    reset();
    return json(200, { ok: true });
  }
  if (path === "/__test/state") return json(200, state);
  let text = "";
  for await (const chunk of req) {
    text += chunk;
    if (text.length > 100000) return json(413, { error: "oversize" });
  }
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    return json(400, { error: "json" });
  }
  if (path === "/__test/config") {
    if (typeof body.password === "string") accountPassword = body.password;
    if (typeof body.requireReauth === "boolean")
      requireReauth = body.requireReauth;
    if (typeof body.emailVerified === "boolean")
      emailVerified = body.emailVerified;
    return json(200, { ok: true });
  }
  if (path === "/auth/v1/signup" || path.startsWith("/auth/v1/admin")) {
    state.userCreations++;
    return json(500, { error: "User creation/admin API forbidden" });
  }
  if (path.startsWith("/rest/") || path.startsWith("/storage/")) {
    state.databaseRequests++;
    return json(500, { error: "Fixture forbids data operations" });
  }
  if (path === "/auth/v1/otp") {
    state.emails++;
    if (body.create_user !== false) {
      state.userCreations++;
      return json(500, { error: "Implicit signup forbidden" });
    }
    if (body.email === "limited@example.com")
      return json(429, {
        code: "over_email_send_rate_limit",
        msg: "email rate limit exceeded",
      });
    challenge = body.code_challenge;
    return json(200, {});
  }
  if (path === "/auth/v1/verify") {
    if (body.token_hash) {
      state.hashVerifications++;
      if (
        !["valid-hash", "signup-hash"].includes(body.token_hash) ||
        usedHashes.has(body.token_hash)
      )
        return json(403, {
          code: "otp_expired",
          msg: "Token has expired or is invalid",
        });
      usedHashes.add(body.token_hash);
      return json(200, session());
    }
    state.otpVerifications++;
    if (
      body.email !== user.email ||
      !["123456", "12345678"].includes(body.token)
    )
      return json(403, {
        code: "otp_expired",
        msg: "Token has expired or is invalid",
      });
    return json(200, session());
  }
  if (path === "/auth/v1/token") {
    if (
      new URL(req.url, `http://${host}:${port}`).searchParams.get(
        "grant_type",
      ) === "password"
    ) {
      state.passwordLogins++;
      if (
        body.email !== user.email ||
        !accountPassword ||
        body.password !== accountPassword
      )
        return json(400, {
          code: "invalid_credentials",
          msg: "Invalid login credentials",
        });
      if (!emailVerified)
        return json(400, {
          code: "email_not_confirmed",
          msg: "Email not confirmed",
        });
      return json(200, session());
    }
    state.exchanges++;
    if (
      body.auth_code !== "valid-code" ||
      !challenge ||
      createHash("sha256")
        .update(body.code_verifier || "")
        .digest("base64url") !== challenge
    )
      return json(400, {
        code: "bad_code_verifier",
        msg: "code verifier does not match",
      });
    return json(200, session());
  }
  if (path === "/auth/v1/user") {
    if (req.method === "PUT") {
      state.passwordUpdateAttempts++;
      if (!emailVerified)
        return json(403, {
          code: "email_not_confirmed",
          msg: "Email not confirmed",
        });
      if (requireReauth)
        return json(400, {
          code: "reauthentication_needed",
          msg: "Reauthentication required",
        });
      // auth-js adds null PKCE fields even when updating only a password.
      if (
        Object.keys(body).some(
          (k) =>
            k !== "password" &&
            !(
              ["code_challenge", "code_challenge_method"].includes(k) &&
              body[k] === null
            ),
        )
      )
        return json(400, { error: "Only password may be updated" });
      if (body.password === accountPassword)
        return json(400, { code: "same_password", msg: "Same password" });
      accountPassword = body.password;
      state.passwordUpdates++;
      return json(200, currentUser());
    }
    if (req.method === "DELETE") {
      state.userDeletions++;
      return json(500, { error: "Deletion forbidden" });
    }
    return json(200, currentUser());
  }
  if (path === "/auth/v1/logout") return json(200, {});
  return json(404, { error: "Unimplemented fixture endpoint" });
});
server.listen(port, host, () =>
  console.log(`Auth test fixture listening on http://${host}:${port}`),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => server.close(() => process.exit(0)));
