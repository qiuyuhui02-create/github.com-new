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
  indexDirectoryFiles,
  isMediaLibraryConnected,
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
  assert.equal(mediaStatus(meta.id), "已选择·位置待核验");
  Object.defineProperty(file, "webkitRelativePath", {
    value: "Project/assets/characters/test.png",
  });
  assert.equal(await inspectDirectory([meta], [file]), 1);
  assert.equal(mediaStatus(meta.id), "已校验");
  await inspectDirectory([meta], [new File(["unrelated"], "other.png")]);
  assert.equal(mediaStatus(meta.id), "所选目录未找到");
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

test("directory registration uses actual SSD paths, reconnects without changing IDs and rejects overwrite conflicts", async () => {
  clearMedia();
  assert.equal(mediaStatus("missing-on-this-device"), "素材未连接");
  assert.equal(isMediaLibraryConnected(), false);
  const a = new File(["image"], "主角.png", { type: "image/png" });
  Object.defineProperty(a, "webkitRelativePath", {
    value: "SSDProject/现有目录/镜头一/主角.png",
  });
  const first = await indexDirectoryFiles([], [a], "人物", {
    assetId: "asset-7",
  });
  assert.equal(first.files[0].relativePath, "现有目录/镜头一/主角.png");
  assert.equal(first.files[0].assetId, "asset-7");
  const before = structuredClone(first.files);
  const next = await indexDirectoryFiles(first.files, [a], "道具", {
    assetId: "do-not-reassign",
  });
  assert.deepEqual(next.files, before);
  assert.equal(next.added.length, 0);
  assert.equal(next.bindings[0].id, first.files[0].id);
  const changed = new File(["different"], "主角.png", { type: "image/png" });
  Object.defineProperty(changed, "webkitRelativePath", {
    value: a.webkitRelativePath,
  });
  await assert.rejects(
    indexDirectoryFiles(first.files, [changed], "人物"),
    /不会改写现有索引/,
  );
  assert.deepEqual(first.files, before);
  const cancelled = await inspectDirectory(first.files, []);
  assert.equal(cancelled, 0);
  assert.equal(isMediaLibraryConnected(), false);
  assert.equal(mediaStatus(first.files[0].id), "素材未连接");
  const metadata = structuredClone(seed);
  metadata.assets.push({ ...metadata.assets[0], id: "a7" });
  metadata.files = first.files;
  metadata.assets[6].image = `local:${first.files[0].id}`;
  metadata.assets[6].versions = [
    {
      at: new Date().toISOString(),
      image: "local:previous",
      description: "old version",
      model: "old-model",
    },
  ];
  metadata.shots[0].assets.push("a7");
  const original = structuredClone(metadata);
  assert.deepEqual(parseStudio(JSON.parse(JSON.stringify(metadata))), original);
  assert.deepEqual(cloudMetadata(metadata), original);
  assert.equal(original.assets.length, 7);
  const newer = new File(["video"], "clip.mov", { type: "video/quicktime" });
  Object.defineProperty(newer, "webkitRelativePath", {
    value: "SSDProject/versions/v2/clip.mov",
  });
  const version = await indexDirectoryFiles(first.files, [newer], "生成视频", {
    previousId: first.files[0].id,
    version: 2,
    assetId: "asset-7",
  });
  assert.equal(version.files[1].previousId, first.files[0].id);
  assert.equal(version.files[1].version, 2);
  assert.deepEqual(version.files[0], before[0]);
  clearMedia();
});
