import { test } from "node:test";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import {
  addHighlight,
  highlightSegments,
  mapHighlights,
  nativeTextChange,
  reanchorHighlight,
  validHighlights,
  textHash,
  type TextChange,
} from "../lib/highlights";
import {
  importScreenplay,
  editDraft,
  undoWorkingDraft,
  confirmScene,
  validateScreenplay,
} from "../lib/screenplay";
import {
  addChapter,
  moveScene,
  archiveChapter,
  restoreChapter,
} from "../lib/screenplay-structure";
import { seed, parseStudio } from "../lib/model";
import { cloudMetadata } from "../lib/media";
import { createSnapshot } from "../lib/snapshots";
const select = (text: string, start: number, end: number) => ({
  text,
  start,
  end,
});
test("precise ranges, four colors, overlaps and recolor retain independent plain-text annotations", () => {
  const text = "彼：朝だ。她：光还在。😊";
  let marks = addHighlight([], text, select(text, 2, 5), "yellow", "摄影重点");
  marks = addHighlight(marks, text, select(text, 3, 9), "blue");
  assert.equal(marks.length, 2);
  const parts = highlightSegments(text, marks);
  assert.equal(parts.map((v) => v.text).join(""), text);
  assert.deepEqual(
    parts.filter((p) => p.mark).map((p) => [p.start, p.end, p.mark!.color]),
    [
      [2, 3, "yellow"],
      [3, 9, "blue"],
    ],
  );
  const id = marks[0].id;
  marks = addHighlight(marks, text, select(text, 2, 5), "green");
  assert.equal(marks.length, 2);
  assert.equal(marks.at(-1)!.id, id);
  assert.equal(marks.at(-1)!.note, "摄影重点");
  assert.equal(
    highlightSegments(text, marks, true).filter((p) => p.mark).length,
    0,
  );
  assert.equal(validHighlights(marks, text), true);
  assert.throws(() => addHighlight(marks, text, select(text, 0, 0), "pink"));
  assert.throws(() =>
    addHighlight([], text, select(text, text.length - 1, text.length), "pink"),
  );
});
test("native insertions/deletions move repeated quotes by exact source edit, ambiguous external edits require review", () => {
  const before = "同じ 同じ",
    start = 3;
  const mark = addHighlight([], before, select(before, start, 5), "pink");
  const change: TextChange = { before, from: 0, to: 0, insert: "同じ " },
    after = "同じ " + before;
  const precise = mapHighlights(mark, before, after, { change })!;
  assert.equal(precise[0].status, "active");
  assert.equal(precise[0].start, 6);
  const ambiguous = mapHighlights(mark, before, after)!;
  assert.equal(ambiguous[0].status, "review");
  assert.equal(
    highlightSegments(after, ambiguous).filter((p) => p.mark).length,
    0,
  );
  const deleted = mapHighlights(precise, after, before, {
    change: { before: after, from: 0, to: 3, insert: "" },
  })!;
  assert.equal(deleted[0].start, 3);
  const stale = mapHighlights(mark, before, after, {
    change: { ...change, before: "wrong" },
  })!;
  assert.equal(stale[0].status, "review");
});
test("boundary insertion does not color newly typed text; overlapping edits are quarantined until exact undo or manual reanchor", () => {
  const text = "A 光を待つ B";
  const mark = addHighlight([], text, select(text, 2, 6), "yellow", "台词");
  for (const point of [2, 6]) {
    const after = text.slice(0, point) + "X" + text.slice(point);
    const result = mapHighlights(mark, text, after, {
      change: { before: text, from: point, to: point, insert: "X" },
    })!;
    assert.equal(result[0].status, "active");
    assert.equal(after.slice(result[0].start, result[0].end), "光を待つ");
  }
  const after = "A 光を失う B";
  const review = mapHighlights(mark, text, after, {
    change: { before: text, from: 3, to: 6, insert: "を失う" },
  })!;
  assert.equal(review[0].status, "review");
  assert.equal(review[0].note, "台词");
  const undo = mapHighlights(review, after, text)!;
  assert.equal(undo[0].status, "active");
  assert.equal(undo[0].start, 2);
  const anchored = reanchorHighlight(review[0], after, select(after, 2, 6));
  assert.equal(anchored.id, mark[0].id);
  assert.equal(anchored.quote, "光を失う");
  assert.equal(anchored.status, "active");
});
test("backspace, forward delete, paste and replacement hints use UTF16 offsets and reject history/invalid ranges", () => {
  assert.deepEqual(
    nativeTextChange(select("A😊B", 3, 3), "AB", "deleteContentBackward"),
    { before: "A😊B", from: 1, to: 3, insert: "" },
  );
  assert.deepEqual(
    nativeTextChange(select("A😊B", 1, 1), "AB", "deleteContentForward"),
    { before: "A😊B", from: 1, to: 3, insert: "" },
  );
  assert.equal(
    nativeTextChange(select("abc", 1, 1), "a中文bc", "insertFromPaste")?.insert,
    "中文",
  );
  assert.equal(
    nativeTextChange(select("abc", 0, 2), "日文c", "insertText")?.to,
    2,
  );
  assert.equal(
    nativeTextChange(select("abc", 1, 1), "xyz", "historyUndo"),
    undefined,
  );
  assert.equal(
    nativeTextChange(select("abc", 1, 1), "xyz", "insertText"),
    undefined,
  );
});
test("AI full replacement and application undo preserve notes, original/final, versions and stable IDs", () => {
  let script = importScreenplay("内景 家 — 日\n她：保留这句。", "中文"),
    scene = confirmScene(script.scenes[0], "独立定稿");
  const start = scene.draft.indexOf("保留");
  scene = {
    ...scene,
    highlights: addHighlight(
      [],
      scene.draft,
      select(scene.draft, start, start + 4),
      "blue",
      "重点",
    ),
    highlightsHidden: false,
  };
  const before = structuredClone(scene);
  scene = editDraft(scene, "外景 完全不同的内容", true, "AI · 人工采用");
  assert.equal(scene.highlights![0].status, "review");
  assert.equal(scene.highlights![0].quote, "保留这句");
  scene = undoWorkingDraft(scene);
  assert.equal(scene.draft, before.draft);
  assert.equal(scene.highlights![0].status, "active");
  assert.equal(scene.highlights![0].id, before.highlights![0].id);
  assert.equal(scene.highlights![0].note, "重点");
  assert.deepEqual(scene.final, before.final);
  assert.equal(scene.original, before.original);
  assert.equal(
    scene.versions.some((v) =>
      v.highlights?.some((m) => m.id === before.highlights![0].id),
    ),
    true,
  );
  const initialVersions = scene.versions.length;
  scene = {
    ...scene,
    highlights: scene.highlights!.map((m) => ({ ...m, note: "新版备注" })),
  };
  scene = editDraft(scene, scene.draft, true);
  assert.equal(scene.versions.length, initialVersions + 1);
  scene = editDraft(scene, scene.draft, true);
  assert.equal(scene.versions.length, initialVersions + 1);
  script = { ...script, scenes: [scene] };
  assert.equal(validateScreenplay(script), true);
});
test("JSON, snapshot and strict metadata roundtrips keep multilingual marks, history and legacy seven-asset data", () => {
  const data = structuredClone(seed);
  data.assets.push({ ...data.assets[0], id: "sample-seven" });
  data.script = importScreenplay(
    "○駅・夜\n彼：光を待つ。\n她：记住这里。",
    "日本語",
  );
  let s = data.script.scenes[0];
  s = {
    ...s,
    highlights: addHighlight(
      [],
      s.draft,
      select(s.draft, 0, 3),
      "pink",
      "镜头 / カメラ",
    ),
    highlightsHidden: true,
  };
  data.script.scenes[0] = editDraft(s, s.draft, true);
  const before = structuredClone(data);
  const restored = parseStudio(
    JSON.parse(JSON.stringify(createSnapshot(data))),
  );
  assert.deepEqual(restored.script, data.script);
  assert.deepEqual(restored.assets, data.assets);
  assert.deepEqual(cloudMetadata(data).script, data.script);
  assert.deepEqual(data, before);
  const old = {
    ...data,
    script: importScreenplay("内景 旧剧本\n没有标注", "中文"),
  };
  assert.deepEqual(parseStudio(JSON.parse(JSON.stringify(old))), old);
});
test("backup validation rejects wrong active offsets, duplicate IDs and unsafe shape while retaining reviewed anchors", () => {
  const text = "光の記憶",
    marks = addHighlight([], text, select(text, 0, 2), "green");
  const s = importScreenplay(text, "日本語");
  s.scenes[0].highlights = marks;
  assert.equal(validateScreenplay(s), true);
  assert.equal(
    validHighlights([{ ...marks[0], start: 1, end: 3 }], text),
    false,
  );
  assert.equal(validHighlights([marks[0], marks[0]], text), false);
  assert.equal(validHighlights([{ ...marks[0], color: "red" }], text), false);
  assert.equal(
    validHighlights([{ ...marks[0], note: "x".repeat(301) }], text),
    false,
  );
  assert.equal(
    validHighlights([{ ...marks[0], status: "review" }], "短"),
    true,
  );
  assert.equal(
    validHighlights(
      [{ ...marks[0], anchors: [{ hash: "bad", start: 0, end: 2 }] }],
      text,
    ),
    false,
  );
});
test("bounded anchors and long-script edit benchmark keep safe text mapping without per-character span DOM data", () => {
  const before = "序文\n" + "台詞を記録。".repeat(24000);
  let text = before,
    marks = Array.from(
      { length: 80 },
      (_, i) =>
        addHighlight(
          [],
          text,
          select(
            text,
            text.length - 10000 + i * 100,
            text.length - 9996 + i * 100,
          ),
          "yellow",
        )[0],
    );
  const began = performance.now();
  for (let i = 0; i < 60; i++) {
    const after = "x" + text;
    marks = mapHighlights(marks, text, after, {
      change: { before: text, from: 0, to: 0, insert: "x" },
      checkpoint: i % 2 === 0,
    })!;
    text = after;
  }
  assert.ok(
    performance.now() - began < 6000,
    "60 edits on a large script should remain bounded",
  );
  assert.equal(
    marks.every((m) => m.anchors.length <= 32 && m.status === "active"),
    true,
  );
  assert.ok(highlightSegments(text, marks).length <= 161);
  assert.equal(marks[0].anchors[0].hash, textHash(before));
});

test("CRLF and CR source offsets match the native LF editor without rewriting original text", () => {
  const text = "序文\r\n彼：光を待つ。\r\n她：原文。",
    start = text.indexOf("光"),
    marks = addHighlight([], text, select(text, start, start + 4), "yellow");
  const native = text.replace(/\r\n?/g, "\n"),
    next = "新：" + native;
  const result = mapHighlights(marks, text, next, {
    change: { before: native, from: 0, to: 0, insert: "新：" },
  })!;
  assert.equal(result[0].status, "active");
  assert.equal(result[0].start, next.indexOf("光"));
  assert.equal(validHighlights(result, next), true);
  assert.equal(mapHighlights(result, next, text)![0].start, start);
  const cross = addHighlight([], text, select(text, 0, text.length), "blue");
  assert.equal(cross[0].quote, native);
  assert.equal(validHighlights(cross, text), true);
});

test("chapter recycling and restoration retain annotation IDs and snapshots without touching unrelated assets", () => {
  const data = structuredClone(seed);
  data.script = importScreenplay("夜の駅\n彼：待って。", "日本語");
  const s = data.script.scenes[0];
  s.highlights = addHighlight(
    [],
    s.draft,
    select(s.draft, 0, 3),
    "blue",
    "撮影",
  );
  data.script.scenes[0] = editDraft(s, s.draft, true);
  const chapter = addChapter(data.script, "自由章");
  const grouped = moveScene(chapter.script, s.id, chapter.chapter.id),
    archived = archiveChapter(grouped, chapter.chapter.id);
  const roundtrip = parseStudio(
    JSON.parse(JSON.stringify({ ...data, script: archived })),
  );
  assert.deepEqual(roundtrip.script, archived);
  assert.deepEqual(
    cloudMetadata({ ...data, script: archived }).script,
    archived,
  );
  assert.deepEqual(
    restoreChapter(roundtrip.script!, chapter.chapter.id).scenes[0].highlights,
    s.highlights,
  );
  assert.deepEqual(roundtrip.assets, data.assets);
});
test("anchor hashes distinguish exact UTF16 including malformed surrogates, and annotation budgets reject without mutation", () => {
  assert.notEqual(textHash("\ud800"), textHash("\ud801"));
  const text = "光".repeat(200000);
  const mark = addHighlight(
    [],
    text,
    select(text, 0, text.length),
    "yellow",
  )[0];
  const list = Array.from({ length: 5 }, (_, i) => ({
    ...mark,
    id: "same-range-" + i,
  }));
  const before = structuredClone(list);
  assert.equal(validHighlights(list, text), true);
  assert.throws(
    () => addHighlight(list, text, select(text, 1, text.length), "green"),
    /100万/,
  );
  assert.deepEqual(list, before);
});

test("manual re-confirmation to an identical second quote cannot be undone into the old historical binding", () => {
  const before = "同じ 間 同じ",
    after = "前文 " + before;
  let scene = importScreenplay(before, "日本語").scenes[0];
  scene.highlights = addHighlight(
    [],
    before,
    select(before, 0, 2),
    "blue",
    "保持这条备注",
  );
  scene = editDraft(scene, scene.draft, true);
  const oldBinding = scene.highlights![0].bindingId;
  scene = editDraft(scene, after, true);
  const mark = reanchorHighlight(
    scene.highlights![0],
    after,
    select(after, after.lastIndexOf("同じ"), after.length),
  );
  assert.equal(mark.id, scene.highlights![0].id);
  assert.notEqual(mark.bindingId, oldBinding);
  scene = { ...scene, highlights: [mark] };
  scene = editDraft(scene, before, true);
  assert.equal(scene.highlights![0].status, "review");
  assert.equal(
    highlightSegments(before, scene.highlights).filter((v) => v.mark).length,
    0,
  );
  assert.equal(scene.highlights![0].note, "保持这条备注");
});
