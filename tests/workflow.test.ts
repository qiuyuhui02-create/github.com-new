import { test } from "node:test";
import assert from "node:assert/strict";
import {
  timerAction,
  elapsed,
  validLedger,
  type TimerLedger,
} from "../lib/workflow";
import { parseStudio, seed } from "../lib/model";
import { cloudMetadata } from "../lib/media";
import { importScreenplay } from "../lib/screenplay";
const entry = {
  id: "clock1",
  title: "制作人物图",
  date: "2026-11-01",
  category: "图片与资产",
  notes: "真实时间戳",
};
test("timer uses timestamps across background/reload, excludes pauses and refuses duplicate starts", () => {
  let l: TimerLedger = timerAction({ entries: [] }, "start", entry, 1000);
  assert.equal(elapsed(l.active!, 61000), 60000);
  l = JSON.parse(JSON.stringify(l));
  assert.throws(() => timerAction(l, "start", entry, 70000), /已有/);
  l = timerAction(l, "pause", undefined, 61000);
  assert.equal(elapsed(l.active!, 180000), 60000);
  l = timerAction(l, "resume", undefined, 301000);
  l = timerAction(l, "resume", undefined, 350000);
  l = timerAction(l, "finish", undefined, 361000);
  assert.equal(l.entries[0].durationMs, 120000);
  assert.equal(l.active, undefined);
  assert.ok(validLedger(l));
});
test("complete local backup keeps seven existing assets, all new workflow data and manual AI drafts", () => {
  const s = structuredClone(seed);
  s.assets.push({
    ...s.assets[0],
    id: "existing-7",
    versions: [
      {
        at: "2026-01-01T00:00:00Z",
        image: "local:old",
        description: "旧描述",
        model: "旧模型",
      },
    ],
  });
  s.shots[0].assets.push("existing-7");
  s.deadline = "2026-12-01";
  s.projectName = "卒業映画";
  s.tasks[0] = {
    ...s.tasks[0],
    time: "12:30",
    location: "図書館",
    category: "学习",
    status: "进行中",
    notes: "保留记录",
  };
  s.journals = [{ date: "2026-11-01", mood: "😊 状态不错", text: "私人日记" }];
  s.timer = timerAction({ entries: [] }, "start", entry, 1000);
  s.previews = { small: "data:image/jpeg;base64,YQ==" };
  s.script = importScreenplay("内景 工作室 — 日\n\n角色：你好。", "中文");
  s.script.scenes[0].manualComparisons = [1, 2, 3].map((n) => ({
    model: "手动" + n,
    text: "案" + n,
  }));
  s.videoJobs = [
    {
      id: "v1",
      shotId: s.shots[0].id,
      prompt: "影片",
      assets: ["existing-7"],
      firstFrame: "人物.png",
      lastFrame: "",
      references: "场景",
      duration: 5,
      ratio: "16:9",
      movement: "推进",
      model: "WAN",
      status: "待审核",
      notes: "调整灯光",
      versions: [
        {
          id: "vv1",
          model: "WAN",
          prompt: "影片",
          status: "待审核",
          filename: "1.mp4",
          relativePath: "videos/1.mp4",
          notes: "失败细节",
          at: "2026-11-01T00:00:00Z",
        },
      ],
    },
  ];
  assert.deepEqual(parseStudio(JSON.parse(JSON.stringify(s))), s);
  const cloud = cloudMetadata(s);
  assert.equal(cloud.assets.length, 7);
  assert.deepEqual(cloud.assets[6], s.assets[6]);
  assert.deepEqual(cloud.shots, s.shots);
  assert.deepEqual(cloud.videoJobs, s.videoJobs);
  assert.deepEqual(cloud.tasks, s.tasks);
  assert.deepEqual(cloud.script, s.script);
  assert.equal(cloud.previews, undefined);
  assert.equal(cloud.journals, undefined);
  assert.equal(cloud.timer, undefined);
  assert.ok(!JSON.stringify(cloud).includes("base64"));
  assert.throws(() =>
    parseStudio({ ...s, timer: { entries: [{ ...entry, durationMs: -5 }] } }),
  );
  assert.throws(() =>
    parseStudio({
      ...s,
      videoJobs: [
        {
          ...s.videoJobs![0],
          versions: [
            { ...s.videoJobs![0].versions[0], relativePath: "C:/secret.mp4" },
          ],
        },
      ],
    }),
  );
});
import { createSnapshot, editProject } from "../lib/snapshots";
test("snapshot version/time is explicit, pauses exported active timer without changing Mac, and rejects invalid schemas", () => {
  const source = editProject(
    structuredClone(seed),
    { projectName: "私人的项目" },
    "2026-11-01T13:00:00.000Z",
  );
  source.timer = timerAction({ entries: [] }, "start", entry, 1000);
  const snapshot = createSnapshot(source, "2026-11-01T13:01:00.000Z");
  assert.equal(snapshot.snapshot?.revision, 1);
  assert.equal(snapshot.snapshot?.updatedAt, "2026-11-01T13:00:00.000Z");
  assert.equal(snapshot.timer?.active?.runningSince, null);
  assert.equal(source.timer.active?.runningSince, 1000);
  assert.deepEqual(parseStudio(JSON.parse(JSON.stringify(snapshot))), snapshot);
  assert.throws(() =>
    parseStudio({
      ...snapshot,
      snapshot: { ...snapshot.snapshot, schemaVersion: 999 },
    }),
  );
});
