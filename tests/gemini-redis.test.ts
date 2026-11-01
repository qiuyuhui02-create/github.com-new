import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BUDGET_LUA } from "../lib/gemini/budget";
const exec = promisify(execFile),
  server = process.env.REDIS_SERVER_BIN,
  cli = process.env.REDIS_CLI_BIN;
test(
  "real Redis Lua atomically enforces concurrency, dedup, daily quota, reset and shared provider stop",
  { skip: !server || !cli },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), "framework-gemini-")),
      socket = join(dir, "redis.sock");
    const child = spawn(
      server!,
      [
        "--port",
        "0",
        "--unixsocket",
        socket,
        "--save",
        "",
        "--appendonly",
        "no",
      ],
      { stdio: "ignore" },
    );
    const cmd = async (...args: string[]) =>
      JSON.parse((await exec(cli!, ["-s", socket, "--json", ...args])).stdout);
    try {
      let ready = false;
      for (let i = 0; i < 100; i++) {
        try {
          await cmd("PING");
          ready = true;
          break;
        } catch {
          await new Promise((r) => setTimeout(r, 20));
        }
      }
      assert.ok(ready, "local Redis ready");
      const reserve = (id: string) =>
        cmd("EVAL", BUDGET_LUA, "1", "test-budget", "reserve", id);
      const results = await Promise.all(
        Array.from({ length: 12 }, (_, i) => reserve("id" + i)),
      );
      assert.equal(results.filter((r) => r[0] === 1).length, 1);
      assert.equal(results.filter((r) => r[1] === "cooldown").length, 11);
      const winner = results.findIndex((r) => r[0] === 1);
      assert.equal((await reserve("id" + winner))[1], "duplicate");
      for (let i = 1; i < 10; i++) {
        await cmd("HSET", "test-budget", "last", "0");
        assert.equal((await reserve("more" + i))[0], 1);
      }
      await cmd("HSET", "test-budget", "last", "0");
      assert.equal((await reserve("daily-over"))[1], "daily_limit");
      await cmd("HSET", "test-budget", "day", "-1");
      assert.equal((await reserve("next-day"))[0], 1);
      await cmd("EVAL", BUDGET_LUA, "1", "test-budget", "block", "id");
      await cmd("HSET", "test-budget", "last", "0");
      assert.equal(
        (await reserve("blocked-other-instance"))[1],
        "provider_quota",
      );
      assert.ok((await cmd("TTL", "test-budget")) > 0);
    } finally {
      child.kill("SIGTERM");
      await new Promise((r) => child.once("exit", r));
      await rm(dir, { recursive: true, force: true });
    }
  },
);
