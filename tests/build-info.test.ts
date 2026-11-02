import { test } from "node:test";
import assert from "node:assert/strict";
import { buildInfo, verifyBackupBuild } from "../lib/build-info";
import { GET } from "../app/api/build-info/route";
test("restore version probe uses no-store and exposes no project data or server secrets", async () => {
  let called = false;
  const result = await verifyBackupBuild((async (url, options) => {
    called = true;
    assert.equal(url, "/api/build-info");
    assert.equal(options?.cache, "no-store");
    assert.equal(options?.credentials, "same-origin");
    assert.equal(options?.body, undefined);
    return Response.json(buildInfo);
  }) as typeof fetch);
  assert.equal(called, true);
  assert.equal(result.warning, "");
  const response = GET();
  assert.match(response.headers.get("cache-control")!, /no-store/);
  assert.deepEqual(Object.keys(await response.json()).sort(), [
    "backupImportFlow",
    "branch",
    "commit",
  ]);
});
test("older server flow, non-JSON response and old-server 404 stop restore; offline retains explicit local preview workflow", async () => {
  await assert.rejects(
    verifyBackupBuild((async () =>
      Response.json({
        ...buildInfo,
        backupImportFlow: "old-direct-import",
      })) as typeof fetch),
    /版本不一致/,
  );
  await assert.rejects(
    verifyBackupBuild(
      (async () => new Response("old page", { status: 404 })) as typeof fetch,
    ),
    /停止恢复/,
  );
  await assert.rejects(
    verifyBackupBuild(
      (async () =>
        new Response("<html>wrong deployment</html>")) as typeof fetch,
    ),
    /版本信息无效/,
  );
  const result = await verifyBackupBuild((async () => {
    throw TypeError("offline");
  }) as typeof fetch);
  assert.match(result.warning, /预览后确认/);
});
