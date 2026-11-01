// No external Auth calls: build and run against a test-only loopback server.
import { spawn } from "node:child_process";
const env = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54399",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_local_fixture",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
  NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3000",
  ENABLE_PAID_AI: "false",
  AUTH_FIXTURE_TEST: "1",
  AUTH_FIXTURE_PORT: "54399",
};
const children = [];
function child(args) {
  const p = spawn(process.execPath, args, { env, stdio: "inherit" });
  children.push(p);
  return p;
}
function completed(p) {
  return new Promise((resolve, reject) => {
    p.once("exit", (code) =>
      code === 0 ? resolve() : reject(Error(`Test process exited ${code}`)),
    );
    p.once("error", reject);
  });
}
async function ready(url, p) {
  for (let i = 0; i < 100; i++) {
    if (p.exitCode !== null) throw Error("Test server exited");
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw Error("Local test server did not become ready");
}
try {
  const auth = child(["tests/fixtures/auth-provider.mjs"]);
  await ready("http://127.0.0.1:54399/__test/state", auth);
  const identity = await (
    await fetch("http://127.0.0.1:54399/__test/state")
  ).json();
  if (identity.fixture !== "framework-auth-test-v1")
    throw Error("Refusing to use a non-fixture service");
  await completed(child(["node_modules/next/dist/bin/next", "build"]));
  const app = child([
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3000",
  ]);
  await ready("http://127.0.0.1:3000/auth/login", app);
  await completed(
    child([
      "node_modules/@playwright/test/cli.js",
      "test",
      ...process.argv.slice(2),
    ]),
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  for (const p of children) if (p.exitCode === null) p.kill("SIGTERM");
}
