import { test } from "node:test";
import assert from "node:assert/strict";
import {
  importScreenplay,
  editDraft,
  confirmScene,
  undoFinal,
  generateShotDrafts,
  shotNeedsReview,
  validateScreenplay,
  lineDiff,
  sentences,
} from "../lib/screenplay";
import { seed, parseStudio } from "../lib/model";
import { cloudMetadata } from "../lib/media";
test("Chinese and Japanese sluglines are split and exact original remains immutable", () => {
  const raw = "内景 房间 — 夜\n\n林：你好。\n\n外景 街道 — 日\n\n雨停了。";
  const s = importScreenplay(raw, "中文");
  assert.equal(s.scenes.length, 2);
  assert.equal(s.original.text, raw);
  const edit = editDraft(s.scenes[0], "人工修改");
  assert.equal(edit.original, s.scenes[0].original);
  assert.equal(
    importScreenplay("○駅・朝\n彼：行こう。\n○家・夜\n沈黙。", "日本語").scenes
      .length,
    2,
  );
  assert.equal(validateScreenplay(s), true);
});
test("manual partial finalization is independent; edits flag shots without changing them; undo preserves revision identity", () => {
  const script = importScreenplay("内景 房间\n\n第一句。\n\n第二句。", "中文");
  let scene = confirmScene(script.scenes[0], "人工选择的最终内容。");
  assert.equal(scene.status, "已定稿");
  script.scenes[0] = scene;
  const data = { ...structuredClone(seed), script };
  const shots = generateShotDrafts(data, scene.id);
  data.shots.push(...shots);
  assert.equal(shotNeedsReview(shots[0], data), false);
  scene = editDraft(scene, "新修改");
  assert.equal(scene.final?.text, "人工选择的最终内容。");
  data.script.scenes[0] = scene;
  assert.equal(shotNeedsReview(shots[0], data), true);
  assert.equal(shots[0].title, "人工选择的最终内容。");
  scene = confirmScene(scene, "第二版定稿");
  const restored = undoFinal(scene);
  assert.equal(restored.final?.text, "人工选择的最终内容。");
  assert.equal(restored.final?.revision, 3);
});
test("scene draft generation rejects unconfirmed and duplicate versions; cloud roundtrip keeps script and shot links", () => {
  const script = importScreenplay(
    "INT. LAB - NIGHT\n\nA light turns on.",
    "中文",
  );
  const data = { ...structuredClone(seed), script };
  assert.throws(() => generateShotDrafts(data, script.scenes[0].id), /定稿/);
  script.scenes[0] = confirmScene(script.scenes[0], script.scenes[0].draft);
  data.shots.push(...generateShotDrafts(data, script.scenes[0].id));
  assert.throws(
    () => generateShotDrafts(data, script.scenes[0].id),
    /重复生成/,
  );
  const restored = parseStudio(cloudMetadata(data));
  assert.deepEqual(restored.script, script);
  assert.deepEqual(restored.shots, data.shots);
  assert.ok(lineDiff("旧句", "新句")[0].changed);
  assert.deepEqual(sentences("你好。再见！"), ["你好。", "再见！"]);
});
