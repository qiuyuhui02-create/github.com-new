import { test } from "node:test";
import assert from "node:assert/strict";
import { insertSelection, selectedText } from "../lib/text-selection";
import {
  addChapter,
  addScene,
  archiveChapter,
  restoreChapter,
  newBlankScreenplay,
  chaptersOf,
} from "../lib/screenplay-structure";
import {
  confirmScene,
  editDraft,
  undoWorkingDraft,
  validateScreenplay,
  generateShotDrafts,
  shotNeedsReview,
} from "../lib/screenplay";
import { seed, parseStudio } from "../lib/model";
import { cloudMetadata } from "../lib/media";
test("UTF16 selection adoption inserts at explicit caret, only replaces a verified range, refuses stale targets and preserves independent drafts", () => {
  const raw = "彼：😊朝だ。\n彼女：待って。";
  assert.equal(selectedText({ text: raw, start: 2, end: 4 }, raw), "😊");
  assert.throws(() => selectedText({ text: "old", start: 0, end: 3 }, raw));
  const target = {
    text: raw,
    start: raw.indexOf("待って"),
    end: raw.indexOf("待って") + 3,
  };
  const result = insertSelection(raw, "行こう", target, true);
  assert.equal(result.text, "彼：😊朝だ。\n彼女：行こう。");
  assert.throws(() => insertSelection(raw, "x", null, true));
  assert.throws(() =>
    insertSelection(raw, "x", { text: "stale", start: 0, end: 2 }, false),
  );
  assert.equal(
    insertSelection("abcd", "X", { text: "abcd", start: 1, end: 1 }, false)
      .text,
    "aXbcd",
  );
  assert.equal(insertSelection("abcd", "X", null, false).text, "abcd\n\nX");
  let s = newBlankScreenplay("故事", "", "中文"),
    a = addChapter(s, "自由章节");
  s = addScene(a.script, a.chapter.id, "朝").script;
  const scene = confirmScene(
    {
      ...s.scenes[0],
      original: raw,
      draft: raw,
      manualComparisons: [
        { model: "ChatGPT", text: "行こう" },
        { model: "Gemini", text: "别急" },
        { model: "Claude", text: "晚安" },
      ],
    },
    "独立定稿",
  );
  const edited = editDraft(
    editDraft(scene, scene.draft, true),
    result.text,
    true,
    "ChatGPT · 人工采用",
  );
  assert.equal(undoWorkingDraft(edited).draft, raw);
  assert.deepEqual(edited.final, scene.final);
  assert.equal(edited.original, raw);
  assert.deepEqual(edited.manualComparisons, scene.manualComparisons);
  const long = "長い台詞。".repeat(14000);
  const full = editDraft(editDraft(scene, scene.draft, true), long, true);
  assert.equal(undoWorkingDraft(full).draft, raw);
  assert.equal(validateScreenplay({ ...s, scenes: [full] }), true);
});
test("whole chapter recycle restores exact order, IDs, candidate texts, histories and storyboard links through JSON", () => {
  let s = newBlankScreenplay("物語", "", "日本語");
  const a = addChapter(s, "起点");
  s = a.script;
  const b = addChapter(s, "自由の章");
  s = b.script;
  const c = addChapter(s, "終わり");
  s = c.script;
  for (const name of ["朝", "夜"]) s = addScene(s, b.chapter.id, name).script;
  s.scenes = s.scenes.map((v) =>
    confirmScene(
      editDraft(
        {
          ...v,
          original: "原稿",
          manualComparisons: [
            { model: "ChatGPT", text: "候选A" },
            { model: "Gemini", text: "候选B" },
            { model: "Claude", text: "候选C" },
          ],
        },
        "人工稿",
        true,
      ),
      "正式稿",
    ),
  );
  const before = structuredClone(s),
    data = { ...structuredClone(seed), script: s };
  const shots = generateShotDrafts(data, s.scenes[0].id);
  s = archiveChapter(s, b.chapter.id);
  assert.equal(s.scenes.length, 0);
  assert.equal(chaptersOf(s).length, 2);
  assert.equal(shotNeedsReview(shots[0], { ...data, script: s }), true);
  assert.equal(validateScreenplay(s), true);
  assert.deepEqual(cloudMetadata({ ...data, script: s }).script, s);
  s = parseStudio(JSON.parse(JSON.stringify({ ...data, script: s }))).script!;
  s = restoreChapter(s, b.chapter.id);
  assert.deepEqual(s.chapters, before.chapters);
  assert.deepEqual(s.scenes, before.scenes);
  assert.deepEqual(s.original, before.original);
  assert.equal(shotNeedsReview(shots[0], { ...data, script: s }), false);
  const bad = archiveChapter(s, b.chapter.id);
  bad.archivedChapters![0].scenes[1].id = bad.archivedChapters![0].scenes[0].id;
  assert.equal(validateScreenplay(bad), false);
  const empty = archiveChapter(s, a.chapter.id);
  assert.equal(
    restoreChapter(empty, a.chapter.id).chapters![0].id,
    a.chapter.id,
  );
});
