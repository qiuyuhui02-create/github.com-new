import { test } from "node:test";
import assert from "node:assert/strict";
import {
  safeRelative,
  checksum,
  describeFile,
  cloudMetadata,
  bindMedia,
  inspectDirectory,
  mediaStatus,
  clearMedia,
  relinkMedia,
} from "../lib/media";
import { seed, parseStudio } from "../lib/model";
import { migrateLegacy } from "../lib/migration";
import { unzipSync, strFromU8 } from "fflate";
test("relative paths reject traversal and absolute Mac/Windows paths", () => {
  for (const p of [
    "/Users/mac/a.png",
    "/Volumes/drive/x",
    "../x",
    "a/../x",
    "C:\\x",
    "file:///x",
    "~/x",
    "a\\x",
    "a//x",
  ])
    assert.equal(safeRelative(p), false, p);
  assert.equal(safeRelative("assets/人物/v1/写真.png"), true);
});
test("SHA-256, folder verification, mismatch and relocation preserve identity", async () => {
  const file = new File(["abc"], "test.png", { type: "image/png" });
  assert.equal(
    await checksum(file),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
  const meta = await describeFile(file, "人物", {
    relativePath: "assets/characters/test.png",
    assetId: "a1",
  });
  bindMedia(meta.id, file);
  assert.equal(mediaStatus(meta.id), "本次已选择·待归档");
  Object.defineProperty(file, "webkitRelativePath", {
    value: "Project/assets/characters/test.png",
  });
  assert.equal(await inspectDirectory([meta], [file]), 1);
  assert.equal(mediaStatus(meta.id), "已校验");
  await inspectDirectory([meta], []);
  assert.equal(mediaStatus(meta.id), "文件缺失");
  await assert.rejects(
    relinkMedia(meta, new File(["wrong"], "other.png"), "new/file.png"),
    /校验不符/,
  );
  const moved = await relinkMedia(meta, file, "moved/test.png");
  assert.equal(moved.id, meta.id);
  assert.equal(moved.relativePath, "moved/test.png");
  clearMedia();
});
test("cloud write strips unknown data, blocks Base64 and absolute paths, retains legacy read", () => {
  const data = structuredClone(seed);
  data.assets[0].image = "data:image/png;base64,YWJj";
  assert.doesNotThrow(() => parseStudio(data));
  assert.throws(() => cloudMetadata(data), /轻量元数据/);
  data.assets[0].image = "/Users/me/image.png";
  assert.throws(() => cloudMetadata(data), /绝对路径|轻量元数据/);
  data.assets[0].image = "local:id";
  (data as unknown as Record<string, unknown>).largeBinary = "hidden";
  assert.equal("largeBinary" in cloudMetadata(data), false);
});
test("legacy migration exports images plus restorable JSON, preserving IDs and scene links", async () => {
  const data = structuredClone(seed);
  data.assets[0].image = "data:image/png;base64,YWJj";
  const result = await migrateLegacy(data);
  assert.equal(result.issues.length, 0);
  assert.equal(data.assets[0].image, "data:image/png;base64,YWJj");
  assert.match(result.data.assets[0].image, /^local:/);
  const archive = unzipSync(result.zip);
  const restored = parseStudio(
    JSON.parse(strFromU8(archive["backups/project.json"])),
  );
  assert.deepEqual(restored.shots, data.shots);
  assert.equal(restored.files?.length, 1);
  assert.equal(
    new TextDecoder().decode(archive[restored.files![0].relativePath]),
    "abc",
  );
  clearMedia();
});
test("in-flight file verification cannot rebind files after account changes", async () => {
  const file = new File(["abc"], "file.png");
  const meta = await describeFile(file, "人物", { relativePath: "file.png" });
  const pending = inspectDirectory([meta], [file]);
  clearMedia();
  await pending;
  assert.equal(mediaStatus(meta.id), "未连接");
});
