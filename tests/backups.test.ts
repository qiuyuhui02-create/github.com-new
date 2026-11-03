import { test } from "node:test";
import assert from "node:assert/strict";
import { seed } from "../lib/model";
import {
  backupJSON,
  decodeBackup,
  backupSummary,
  backupDue,
  validReceipt,
  BACKUP_INTERVAL_MS,
} from "../lib/backups";
import {
  newBlankScreenplay,
  addChapter,
  addScene,
  archiveChapter,
} from "../lib/screenplay-structure";
import { confirmScene, editDraft } from "../lib/screenplay";
test("complete backup roundtrip retains multilingual screenplay histories, archived chapters, previews, video references and IDs", () => {
  const data = structuredClone(seed);
  let script = newBlankScreenplay("あかり｜光", "中文与日本語简介", "日本語");
  const c = addChapter(script, "记忆の庭");
  script = c.script;
  const v = addScene(script, c.chapter.id, "夜明け");
  script = v.script;
  script.scenes[0] = confirmScene(
    editDraft(
      {
        ...v.scene,
        original: "彼：原稿。\r\n她：你好。",
        assetIds: [data.assets[0].id],
        manualComparisons: [
          { model: "ChatGPT", text: "光がある" },
          { model: "Gemini", text: "你好" },
          { model: "Claude", text: "また明日" },
        ],
      },
      "人工工作稿\n日本語の台詞。",
      true,
    ),
    "人工确认定稿",
  );
  script.scenes[0] = confirmScene(script.scenes[0], "第二次定稿");
  const shot = {
    ...data.shots[0],
    sourceSceneId: v.scene.id,
    sourceFinalRevision: 2,
  };
  data.shots = [shot];
  data.script = archiveChapter(script, c.chapter.id);
  const image = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB";
  data.previews = { thumb: image };
  data.assets[0].image = "local:thumb";
  data.assets[0].versions = [
    {
      at: "2026-11-01T00:00:00Z",
      image: "local:thumb",
      description: "旧版",
      model: "手动",
    },
  ];
  const now = "2026-11-02T03:00:00Z",
    before = structuredClone(data),
    restored = decodeBackup(backupJSON(data, now));
  const { snapshot, ...rest } = restored;
  assert.deepEqual(rest, before);
  assert.equal(snapshot?.exportedAt, now);
  assert.deepEqual(data, before);
  const summary = backupSummary(restored);
  assert.equal(summary.projects, 1);
  assert.equal(summary.archivedChapters, 1);
  assert.equal(summary.archivedScenes, 1);
  assert.equal(summary.shots, 1);
  assert.equal(summary.previews, 1);
  assert.equal(summary.missingPreviews, 0);
});
test("rejects corrupt or unsupported backups before modification, accepts older plain JSON and protected wrapper without inventing timestamps", () => {
  for (const raw of ["{", "null", "[]", '{"projects":[]}', '{"assets":[]}'])
    assert.throws(() => decodeBackup(raw));
  assert.deepEqual(decodeBackup("\uFEFF" + JSON.stringify(seed)), seed);
  assert.deepEqual(
    decodeBackup(JSON.stringify({ data: seed, version: 3 })),
    seed,
  );
  assert.equal(backupSummary(seed).exportedAt, undefined);
  const broken = structuredClone(seed);
  broken.assets.push(broken.assets[0]);
  assert.throws(() => decodeBackup(JSON.stringify(broken)));
  const missing = structuredClone(seed);
  missing.assets[0].image = "local:no-file";
  assert.equal(backupSummary(missing).missingPreviews, 1);
});
test("backup reminders use confirmed saves, not generated/cancelled downloads or imported snapshot dates", () => {
  const firstSeenAt = "2026-11-01T00:00:00Z",
    base = Date.parse(firstSeenAt);
  assert.equal(
    backupDue({ firstSeenAt }, base + BACKUP_INTERVAL_MS - 1),
    false,
  );
  assert.equal(
    backupDue(
      { firstSeenAt, generatedAt: "2026-11-04T00:00:00Z" },
      base + BACKUP_INTERVAL_MS,
    ),
    true,
  );
  assert.equal(
    backupDue(
      { firstSeenAt, confirmedAt: "2026-11-04T00:00:00Z" },
      base + BACKUP_INTERVAL_MS,
    ),
    false,
  );
  assert.equal(validReceipt({ firstSeenAt, confirmedAt: "bad" }), false);
});
