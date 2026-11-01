import { test } from "node:test";
import assert from "node:assert/strict";
import {
  newBlankScreenplay,
  addChapter,
  addScene,
  chaptersOf,
  renameChapter,
  renameScene,
  reorderChapter,
  moveScene,
  removeChapter,
  duplicateChapter,
  collapseChapter,
  archiveScene,
  restoreScene,
  suggestBoundaries,
  importRegions,
  confirmImport,
  sourceLines,
} from "../lib/screenplay-structure";
import {
  validateScreenplay,
  importScreenplay,
  confirmScene,
  generateShotDrafts,
  shotNeedsReview,
} from "../lib/screenplay";
import { seed, parseStudio } from "../lib/model";
import { cloudMetadata } from "../lib/media";
test("lossless Markdown/Japanese/CRLF/BOM import previews every character and preserves uncertain dialogue", () => {
  const raw =
    "\uFEFF# 夏の記憶\r\n\r\n誰にも言えない前書き。\r\n\r\nINT. 家 - 日\r\n彼：行こう。\r\n\r\n# 自由な章\r\n\r\n○駅・夜\r\n彼女：待って。\r\n";
  const plan = suggestBoundaries(raw);
  assert.equal(
    importRegions(raw, plan)
      .map((r) => r.text)
      .join(""),
    raw,
  );
  const s = confirmImport(raw, "日本語", "夏", "简介", plan);
  assert.equal(s.original.text, raw);
  assert.equal(
    s
      .chapters!.flatMap((c) => [
        c.originalText || "",
        ...c.sceneIds.map((id) => s.scenes.find((v) => v.id === id)!.original),
      ])
      .join(""),
    raw,
  );
  assert.equal(validateScreenplay(s), true);
  const unknown = "前言\r台詞一\r\r台詞二\n";
  assert.equal(sourceLines(unknown).join(""), unknown);
  const manual = [
    { id: "a", line: 1, kind: "scene" as const, name: "自由名" },
    { id: "b", line: 4, kind: "scene" as const, name: "続き" },
  ];
  assert.equal(
    confirmImport(unknown, "中文", "故事", "", manual)
      .scenes.map((v) => v.original)
      .join(""),
    unknown,
  );
  assert.throws(() => importRegions(raw, [...plan, plan[0]]));
  assert.throws(() => importRegions(raw, [{ ...plan[0], line: 2 }]));
  assert.throws(() => importRegions(raw, [plan[0], { ...plan[0], line: 999 }]));
  assert.equal(
    confirmImport(unknown, "中文", "故事", "", suggestBoundaries(unknown))
      .scenes[0].original,
    unknown,
  );
});
test("free chapter names, ordering, movement and safe deletion preserve scene IDs, versions and storyboard references", () => {
  let s = newBlankScreenplay("雨の日", "简介", "日本語");
  const a = addChapter(s, "プロローグ");
  s = a.script;
  const b = addChapter(s, "雨后的车站");
  s = b.script;
  const made = addScene(s, a.chapter.id, "朝の会話");
  s = made.script;
  s.scenes[0] = confirmScene(
    { ...s.scenes[0], draft: "台词", assetIds: [seed.assets[0].id] },
    "正式台词",
  );
  const scene = structuredClone(s.scenes[0]),
    data = { ...structuredClone(seed), script: s };
  const shots = generateShotDrafts(data, scene.id);
  assert.equal(shots.length, 1);
  s = renameChapter(s, a.chapter.id, "不使用章号");
  s = renameScene(s, scene.id, "任意名称");
  s = reorderChapter(s, b.chapter.id, a.chapter.id);
  assert.equal(s.chapters![0].name, "雨后的车站");
  assert.throws(() => removeChapter(s, a.chapter.id));
  assert.throws(() => removeChapter(s, a.chapter.id, a.chapter.id));
  s = removeChapter(s, a.chapter.id, b.chapter.id);
  assert.equal(s.scenes[0].id, scene.id);
  assert.deepEqual(s.scenes[0].final, scene.final);
  assert.deepEqual(s.scenes[0].versions, scene.versions);
  assert.deepEqual(s.scenes[0].assetIds, scene.assetIds);
  assert.equal(shotNeedsReview(shots[0], { ...data, script: s }), false);
  const clone = duplicateChapter(s, b.chapter.id);
  assert.notEqual(clone.script.scenes[1].id, scene.id);
  assert.equal(clone.script.scenes[1].final!.text, scene.final!.text);
  s = moveScene(
    clone.script,
    scene.id,
    clone.chapter.id,
    clone.script.scenes[1].id,
  );
  assert.equal(s.chapters![1].sceneIds[0], scene.id);
  s = collapseChapter(s, clone.chapter.id);
  assert.equal(s.chapters![1].collapsed, true);
  s = archiveScene(s, scene.id);
  assert.equal(shotNeedsReview(shots[0], { ...data, script: s }), true);
  s = restoreScene(s, scene.id, b.chapter.id);
  assert.equal(shotNeedsReview(shots[0], { ...data, script: s }), false);
  assert.equal(validateScreenplay(s), true);
  assert.deepEqual(
    parseStudio(JSON.parse(JSON.stringify({ ...data, script: s }))).script,
    s,
  );
  assert.deepEqual(cloudMetadata({ ...data, script: s }).script, s);
});
test("legacy flat projects remain unchanged; chapter backup validation rejects ambiguous references without losing seven sample assets", () => {
  const script = importScreenplay("内景 房间 — 日\n人物：旧项目。", "中文");
  const old = { ...structuredClone(seed), script };
  old.assets.push({ ...old.assets[0], id: "sample-seventh" });
  const raw = JSON.stringify(old);
  assert.deepEqual(parseStudio(JSON.parse(raw)), old);
  assert.equal(script.chapters, undefined);
  assert.equal(chaptersOf(script)[0].sceneIds[0], script.scenes[0].id);
  assert.equal(JSON.stringify(old), raw);
  const grouped = addChapter(script, "自由章节").script;
  assert.equal(grouped.scenes[0].id, script.scenes[0].id);
  const archive = archiveScene(grouped, script.scenes[0].id);
  const restored = parseStudio(
    JSON.parse(JSON.stringify({ ...old, script: archive })),
  );
  assert.deepEqual(restored.assets, old.assets);
  assert.equal(restored.assets.length, 7);
  assert.deepEqual(restored.script!.archivedScenes, archive.archivedScenes);
  const bad = structuredClone(grouped);
  bad.chapters![1].sceneIds.push(script.scenes[0].id);
  assert.equal(validateScreenplay(bad), false);
  bad.chapters![1].sceneIds = ["missing"];
  assert.equal(validateScreenplay(bad), false);
});
