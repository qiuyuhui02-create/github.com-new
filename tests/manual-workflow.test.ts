import { test } from "node:test";
import assert from "node:assert/strict";
import { seed, parseStudio } from "../lib/model";
import {
  importScreenplay,
  confirmScene,
  editDraft,
  appendCandidateToDraft,
  undoWorkingDraft,
  externalRevisionPrompt,
} from "../lib/screenplay";
import {
  manualSceneShot,
  moveShot,
  newVideoJob,
  recordVideoVersion,
  nextShotNumber,
} from "../lib/production";
import { cloudMetadata } from "../lib/media";
import { createSnapshot } from "../lib/snapshots";
function fixture() {
  const s = structuredClone(seed);
  s.assets.push({
    ...s.assets[0],
    id: "legacy-7",
    references: ["local:original"],
    versions: [
      {
        at: "2026-01-01T00:00:00Z",
        description: "原有版本",
        model: "旧模型",
        image: "local:old",
      },
    ],
  });
  s.shots[0].assets.push("legacy-7");
  s.script = importScreenplay(
    "内景 自宅 — 日\n\n人物：你好。\n\n外景 公園 — 夕\n\n風が吹く。",
    "中文",
  );
  s.script.scenes[0] = confirmScene(
    s.script.scenes[0],
    s.script.scenes[0].original,
  );
  return s;
}
test("legacy project reads without migration; seven assets and old candidate provenance remain exact", () => {
  const s = fixture();
  s.script!.scenes[0].manualComparisons = [
    { model: "原有 Gemini", text: "旧候选一" },
    { model: "原有模型二", text: "旧候选二" },
    { model: "原有模型三", text: "旧候选三" },
  ];
  const raw = JSON.stringify(s);
  assert.deepEqual(parseStudio(JSON.parse(raw)), s);
  assert.equal(JSON.stringify(s), raw);
  const backup = createSnapshot(s);
  assert.deepEqual(backup.assets, s.assets);
  assert.deepEqual(backup.shots, s.shots);
  assert.deepEqual(backup.script, s.script);
});
test("candidate adoption appends selected text and undo never replaces original or final with candidate history", () => {
  const s = fixture(),
    original = s.script!.scenes[0];
  let scene = editDraft(original, "人工工作稿");
  scene = editDraft(scene, scene.draft, true);
  const final = structuredClone(scene.final);
  scene.versions.push({
    id: "candidate-version",
    text: "不应撤销到这一候选",
    model: "人工修改",
    kind: "candidate",
    at: new Date().toISOString(),
  });
  scene = appendCandidateToDraft(scene, "日本語の選択段落。\n下一句。");
  assert.equal(scene.draft, "人工工作稿\n\n日本語の選択段落。\n下一句。");
  assert.deepEqual(scene.final, final);
  assert.equal(scene.original, original.original);
  scene = undoWorkingDraft(scene);
  assert.equal(scene.draft, "人工工作稿");
  scene = undoWorkingDraft(scene);
  assert.equal(scene.draft, original.original);
  assert.deepEqual(scene.final, final);
  assert.ok(scene.versions.some((v) => v.id === "candidate-version"));
  assert.throws(() => appendCandidateToDraft(scene, " "));
});
test("unified prompt only copies chosen scene, persists instructions and draft checkpoints in JSON", () => {
  const s = fixture();
  s.script!.revisionInstructions = "自然对白，保留人物身份；日本語を保つ。";
  const scene = s.script!.scenes[0];
  scene.draft = "人工改写的本场内容";
  const prompt = externalRevisionPrompt(scene, s.script!.revisionInstructions);
  assert.ok(prompt.includes(scene.original));
  assert.ok(prompt.includes(s.script!.revisionInstructions));
  assert.ok(!prompt.includes("風が吹く"));
  assert.ok(!prompt.includes(scene.draft));
  assert.ok(externalRevisionPrompt(scene, "", "draft").includes(scene.draft));
  s.script!.scenes[0] = appendCandidateToDraft(scene, "选中段落");
  assert.deepEqual(parseStudio(JSON.parse(JSON.stringify(s))), s);
  assert.deepEqual(cloudMetadata(s).script, s.script);
  assert.throws(() =>
    parseStudio({ ...s, script: { ...s.script, revisionInstructions: 42 } }),
  );
});
test("manual shots require confirmed scene, use free numbers and keep source/asset IDs through reordering", () => {
  const s = fixture(),
    before = structuredClone(s);
  assert.throws(() => manualSceneShot(s, s.script!.scenes[1].id));
  const shot = manualSceneShot(s, s.script!.scenes[0].id);
  assert.equal(shot.sourceFinalRevision, s.script!.scenes[0].final!.revision);
  assert.equal(shot.sourceSceneId, s.script!.scenes[0].id);
  assert.equal(shot.description, s.script!.scenes[0].final!.text);
  assert.equal(shot.image, undefined);
  assert.deepEqual(s, before);
  const list = [...s.shots, shot],
    next = moveShot(list, shot.id, -1);
  assert.equal(next[2], shot);
  assert.deepEqual(moveShot(next, shot.id, 1), list);
  assert.equal(
    nextShotNumber([
      { ...shot, number: "SH-001" },
      { ...shot, number: "SH-003" },
    ]),
    "SH-002",
  );
});
test("video references stay independent, versions freeze every setting and legacy versions gain no invented fields", () => {
  const s = fixture();
  s.shots[0].image = "local:storyboard-image";
  const job = newVideoJob(s, s.shots[0].id);
  assert.equal(job.firstFrame, "");
  assert.equal(job.lastFrame, "");
  assert.equal(job.storyboardReference, "");
  assert.equal(job.characterReferences, "");
  job.storyboardReference = s.shots[0].image;
  assert.equal(job.firstFrame, "");
  job.firstFrame = "local:first";
  job.lastFrame = "local:last";
  job.characterReferences = "local:character1\nlocal:character2";
  job.model = "WAN 手动";
  const v = recordVideoVersion(job, "shot-v1.mp4", "videos/shot-v1.mp4");
  job.firstFrame = "new-first.png";
  job.assets.push("later");
  assert.equal(v.firstFrame, "local:first");
  assert.equal(v.lastFrame, "local:last");
  assert.equal(v.storyboardReference, "local:storyboard-image");
  assert.ok(!v.assets!.includes("later"));
  const legacy = {
    id: "old",
    model: "旧模型",
    prompt: "旧 Prompt",
    status: "已完成",
    filename: "old.mp4",
    relativePath: "videos/old.mp4",
    notes: "旧记录",
    at: "2026-01-01T00:00:00Z",
  };
  job.versions = [legacy, v];
  s.videoJobs = [job];
  assert.deepEqual(parseStudio(JSON.parse(JSON.stringify(s))), s);
  assert.equal(s.videoJobs[0].versions[0].firstFrame, undefined);
  assert.throws(() => recordVideoVersion(job, "x", "C:/absolute.mp4"));
  assert.throws(() =>
    parseStudio({ ...s, videoJobs: [{ ...job, storyboardReference: 42 }] }),
  );
});
