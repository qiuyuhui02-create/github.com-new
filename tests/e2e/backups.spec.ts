import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { seed } from "../../lib/model";
import {
  newBlankScreenplay,
  addChapter,
  addScene,
  archiveChapter,
} from "../../lib/screenplay-structure";
import { editDraft, confirmScene } from "../../lib/screenplay";
import { newVideoJob, recordVideoVersion } from "../../lib/production";
import { backupJSON } from "../../lib/backups";
const key = "framework-studio-v1";
function fixture() {
  const d = structuredClone(seed);
  d.projectName = "あかり｜私人的电影";
  d.assets.push({ ...d.assets[0], id: "seventh", name: "第七资产" });
  let s = newBlankScreenplay("雨の記憶", "保留中文与日本語", "日本語");
  let c = addChapter(s, "自由章节");
  s = c.script;
  for (const name of ["清晨", "夜"]) s = addScene(s, c.chapter.id, name).script;
  s.scenes = s.scenes.map((v) =>
    confirmScene(
      confirmScene(
        editDraft(
          {
            ...v,
            original: "彼：おはよう。\r\n她：你好。",
            assetIds: [d.assets[0].id],
            manualComparisons: [
              { model: "ChatGPT", text: "候选一" },
              { model: "Gemini", text: "静かな朝。" },
              { model: "Claude", text: "候选三" },
            ],
          },
          "独立工作稿",
          true,
        ),
        "定稿一",
      ),
      "定稿二",
    ),
  );
  c = addChapter(s, "回收章节");
  s = addScene(c.script, c.chapter.id, "恢复内容").script;
  d.script = archiveChapter(s, c.chapter.id);
  d.shots[0].sourceSceneId = d.script.scenes[0].id;
  d.shots[0].sourceFinalRevision = 2;
  d.shots[0].assets.push("seventh");
  d.previews = {
    thumb:
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
  };
  d.assets[0].image = "local:thumb";
  d.assets[0].versions = [
    {
      at: "2026-11-01T00:00:00Z",
      image: "local:thumb",
      description: "旧版缩略图",
      model: "手动",
    },
  ];
  const job = newVideoJob(d, d.shots[0].id);
  job.prompt = "风吹过庭院。ゆっくり前進。";
  job.firstFrame = "local:thumb";
  job.versions = [recordVideoVersion(job, "庭院.mp4", "videos/garden.mp4")];
  d.videoJobs = [job];
  d.timer = {
    entries: [
      {
        id: "old-time",
        title: "旧工时",
        date: "2026-11-01",
        category: "图片与资产",
        notes: "保留",
        durationMs: 60000,
      },
    ],
  };
  d.journals = [
    { date: "2026-11-01", mood: "🥰 很开心", text: "私人创作日记" },
  ];
  return d;
}
async function saved(page: Page) {
  await expect(page.locator(".save-state")).toContainText("已保存在此浏览器");
}
async function stage(page: Page, raw: string) {
  await page.getByRole("button", { name: "云端设置", exact: true }).click();
  await page.getByLabel("导入项目备份到本地").setInputFiles({
    name: "aikari-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(raw),
  });
}
test("one-click full JSON, acknowledged export date, preview/cancel/restore, previews and previous-project recovery copy", async ({
  page,
  browser,
}) => {
  const data = fixture();
  await page.addInitScript((d) => {
    if (!localStorage.getItem("framework-studio-v1"))
      localStorage.setItem("framework-studio-v1", JSON.stringify(d));
  }, data);
  await page.goto("/");
  await saved(page);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "一键备份", exact: true }).click();
  const raw = await readFile((await (await download).path())!, "utf8"),
    backup = JSON.parse(raw);
  expect(backup.script).toEqual(data.script);
  expect(backup.assets).toEqual(data.assets);
  expect(backup.previews).toEqual(data.previews);
  expect(backup.videoJobs).toEqual(data.videoJobs);
  await expect(page.getByLabel("本地备份状态")).toContainText("尚未确认");
  await page.getByRole("button", { name: "文件已保存", exact: true }).click();
  await page.reload();
  await expect(page.getByLabel("本地备份状态")).not.toContainText("尚未确认");
  await expect(page.getByLabel("本地备份状态")).toContainText(
    "不代表云端自动备份",
  );
  const fresh = await browser.newContext();
  try {
    const p = await fresh.newPage();
    await p.goto("http://127.0.0.1:3000/");
    await saved(p);
    const old = await p.evaluate(() =>
      localStorage.getItem("framework-studio-v1"),
    );
    await stage(p, raw);
    const dialog = p.getByRole("dialog", { name: "导入备份预览" });
    await expect(dialog).toContainText("项目数量");
    await expect(dialog).toContainText("章节数量");
    await expect(dialog).toContainText("场景数量");
    await expect(dialog).toContainText("分镜数量");
    await expect(dialog).toContainText("备份导出时间");
    await expect(dialog).toContainText("不是新增或合并");
    await expect(dialog).toContainText("不包含外部原始高清图片和视频");
    expect(
      await p.evaluate(() => localStorage.getItem("framework-studio-v1")),
    ).toBe(old);
    await p.getByRole("button", { name: "取消导入", exact: true }).click();
    expect(
      await p.evaluate(() => localStorage.getItem("framework-studio-v1")),
    ).toBe(old);
    await stage(p, raw);
    await p
      .getByRole("button", { name: "确认覆盖当前本地项目", exact: true })
      .click();
    await expect(p.locator(".toast")).toContainText("已导入项目");
    await saved(p);
    await p.reload();
    await saved(p);
    const restored = await p.evaluate(() =>
      JSON.parse(localStorage.getItem("framework-studio-v1")!),
    );
    expect(restored).toEqual(backup);
    await p.getByRole("button", { name: "资产库", exact: true }).click();
    const image = p.locator(".asset-card img").first();
    await expect(image).toHaveAttribute("src", data.previews!.thumb);
    expect(
      await image.evaluate((el) => (el as HTMLImageElement).naturalWidth),
    ).toBe(1);
    await p.getByRole("button", { name: "云端设置", exact: true }).click();
    const recovery = p.waitForEvent("download");
    await p
      .getByRole("button", { name: "导出上次导入前快照", exact: true })
      .click();
    const before = JSON.parse(
      await readFile((await (await recovery).path())!, "utf8"),
    );
    expect(before.assets).toEqual(JSON.parse(old!).assets);
  } finally {
    await fresh.close();
  }
});
test("invalid JSON and synchronous IDB abort preserve project, timer and previous recovery copy; retry restores successfully", async ({
  page,
}) => {
  const data = fixture();
  await page.addInitScript((d) => {
    if (!localStorage.getItem("framework-studio-v1")) {
      localStorage.setItem("framework-studio-v1", JSON.stringify(d));
      localStorage.setItem(
        "framework-studio-v1:timer",
        JSON.stringify(d.timer),
      );
      localStorage.setItem(
        "framework-studio-v1:recovery",
        "previous recovery sentinel",
      );
    }
  }, data);
  await page.goto("/");
  await saved(page);
  const old = await page.evaluate(() =>
    localStorage.getItem("framework-studio-v1"),
  );
  await stage(page, "{invalid");
  await expect(page.locator(".toast")).toContainText("JSON 文件无法解析");
  expect(
    await page.evaluate(() => localStorage.getItem("framework-studio-v1")),
  ).toBe(old);
  await page.getByRole("button", { name: "关闭窗口", exact: true }).click();
  const incoming = { ...data, projectName: "新项目", timer: { entries: [] } };
  await stage(page, backupJSON(incoming));
  await page.evaluate(() => {
    const real = IDBObjectStore.prototype.put;
    (window as any).__failPut = true;
    IDBObjectStore.prototype.put = function (value, key) {
      if ((window as any).__failPut && key === "framework-studio-v1")
        throw new DOMException("模拟事务写入失败", "QuotaExceededError");
      return real.call(this, value, key!);
    };
  });
  await page
    .getByRole("button", { name: "确认覆盖当前本地项目", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "原项目未修改",
  );
  expect(
    await page.evaluate(() => localStorage.getItem("framework-studio-v1")),
  ).toBe(old);
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("framework-studio-v1:timer")!),
    ),
  ).toEqual(data.timer);
  expect(
    await page.evaluate(() =>
      localStorage.getItem("framework-studio-v1:restore-journal"),
    ),
  ).toBeNull();
  const recovery = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((r) => {
      const q = indexedDB.open("framework-studio-local", 1);
      q.onsuccess = () => r(q.result);
    });
    const row = await new Promise<any>((r) => {
      const q = db
        .transaction("projects")
        .objectStore("projects")
        .get("framework-studio-v1:recovery");
      q.onsuccess = () => r(q.result);
    });
    db.close();
    return row?.raw;
  });
  expect(recovery).toBeUndefined();
  await page.evaluate(() => {
    (window as any).__failPut = false;
  });
  await page
    .getByRole("button", { name: "确认覆盖当前本地项目", exact: true })
    .click();
  await expect(page.locator(".toast")).toContainText("已导入项目");
  await expect(page.getByLabel("电影项目名称")).toHaveValue("新项目");
});
test("gentle three-day reminder ignores unconfirmed or failed downloads and persists confirmed timestamp", async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem("framework-studio-v1:backup-receipt"))
      localStorage.setItem(
        "framework-studio-v1:backup-receipt",
        JSON.stringify({ firstSeenAt: "2020-01-01T00:00:00Z" }),
      );
  });
  await page.goto("/");
  await expect(page.getByLabel("本地备份状态")).toContainText(
    "有一段时间未确认备份",
  );
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "一键备份", exact: true }).click();
  await download;
  await expect(page.getByLabel("本地备份状态")).toContainText(
    "有一段时间未确认备份",
  );
  await page.getByRole("button", { name: "文件已保存", exact: true }).click();
  await expect(page.getByLabel("本地备份状态")).not.toContainText(
    "有一段时间未确认备份",
  );
  await page.reload();
  await expect(page.getByLabel("本地备份状态")).not.toContainText("尚未确认");
  const before = await page.evaluate(() =>
    localStorage.getItem("framework-studio-v1:backup-receipt"),
  );
  await page.evaluate(() => {
    URL.createObjectURL = () => {
      throw Error("模拟下载失败");
    };
  });
  await page.getByRole("button", { name: "一键备份", exact: true }).click();
  await expect(page.locator(".toast")).toContainText("导出失败");
  expect(
    await page.evaluate(() =>
      localStorage.getItem("framework-studio-v1:backup-receipt"),
    ),
  ).toBe(before);
});
test("interrupted restore journal chooses committed timer and rolls back an uncommitted timer on reopening", async ({
  page,
}) => {
  await page.goto("/");
  await saved(page);
  for (const committed of [false, true]) {
    const result = await page.evaluate(async (committed) => {
      const key = "framework-studio-v1",
        before = { entries: [] },
        after = {
          entries: [
            {
              id: "recover-timer",
              title: "日本語の制作",
              date: "2026-11-01",
              category: "图片与资产",
              notes: "恢复测试",
              durationMs: 70000,
            },
          ],
        };
      const raw = localStorage.getItem(key)!;
      const db = await new Promise<IDBDatabase>((r) => {
        const q = indexedDB.open("framework-studio-local", 1);
        q.onsuccess = () => r(q.result);
      });
      await new Promise<void>((r, j) => {
        const t = db.transaction("projects", "readwrite");
        t.objectStore("projects").put(
          {
            raw,
            mirror: raw,
            ...(committed ? { restoreId: "simulated-crash" } : {}),
          },
          key,
        );
        t.oncomplete = () => r();
        t.onerror = () => j(t.error);
      });
      db.close();
      localStorage.setItem(key + ":timer", JSON.stringify(after));
      localStorage.setItem(
        key + ":restore-journal",
        JSON.stringify({
          id: "simulated-crash",
          before: JSON.stringify(before),
          after: JSON.stringify(after),
        }),
      );
      return committed ? after : before;
    }, committed);
    await page.reload();
    await saved(page);
    expect(
      await page.evaluate(() =>
        JSON.parse(localStorage.getItem("framework-studio-v1:timer")!),
      ),
    ).toEqual(result);
    expect(
      await page.evaluate(() =>
        localStorage.getItem("framework-studio-v1:restore-journal"),
      ),
    ).toBeNull();
  }
});

test("timer quota and unavailable IndexedDB abort safely; a stale tab cannot replace a newer project", async ({
  page,
  context,
}) => {
  const data = fixture();
  await page.addInitScript((d) => {
    if (!localStorage.getItem("framework-studio-v1")) {
      localStorage.setItem("framework-studio-v1", JSON.stringify(d));
      localStorage.setItem(
        "framework-studio-v1:timer",
        JSON.stringify(d.timer),
      );
    }
  }, data);
  await page.goto("/");
  await saved(page);
  const old = await page.evaluate(() =>
    localStorage.getItem("framework-studio-v1"),
  );
  await stage(page, backupJSON({ ...data, projectName: "不应静默覆盖" }));
  await page.evaluate(() => {
    const set = Storage.prototype.setItem,
      open = IDBFactory.prototype.open;
    (window as any).__fault = "timer";
    Storage.prototype.setItem = function (k, v) {
      if (
        (window as any).__fault === "timer" &&
        k === "framework-studio-v1:timer"
      )
        throw new DOMException("模拟计时存储已满", "QuotaExceededError");
      return set.call(this, k, v);
    };
    IDBFactory.prototype.open = function (
      ...args: Parameters<IDBFactory["open"]>
    ) {
      if ((window as any).__fault === "idb")
        throw Error("模拟 IndexedDB 不可用");
      return open.apply(this, args);
    };
  });
  for (const fault of ["timer", "idb"]) {
    await page.evaluate((mode) => {
      (window as any).__fault = mode;
    }, fault);
    await page
      .getByRole("button", { name: "确认覆盖当前本地项目", exact: true })
      .click();
    await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
      "原项目未修改",
    );
    expect(
      await page.evaluate(() => localStorage.getItem("framework-studio-v1")),
    ).toBe(old);
    expect(
      await page.evaluate(() =>
        JSON.parse(localStorage.getItem("framework-studio-v1:timer")!),
      ),
    ).toEqual(data.timer);
    expect(
      await page.evaluate(() =>
        localStorage.getItem("framework-studio-v1:restore-journal"),
      ),
    ).toBeNull();
  }
  await page.evaluate(() => {
    (window as any).__fault = "";
  });
  const other = await context.newPage();
  await other.goto("/");
  await saved(other);
  await other.getByLabel("电影项目名称").fill("主窗口新数据");
  await saved(other);
  await page
    .getByRole("button", { name: "确认覆盖当前本地项目", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "另一个标签页已更新",
  );
  await other.reload();
  await expect(other.getByLabel("电影项目名称")).toHaveValue("主窗口新数据");
  await other.close();
});

test("another tab waits for the active restore lock before reconciling a pending journal", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await saved(page);
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      void navigator.locks.request(
        "framework-studio-v1:timer",
        () =>
          new Promise<void>((release) => {
            (window as any).__releaseRestore = release;
            resolve();
          }),
      );
    });
    const before = localStorage.getItem("framework-studio-v1:timer"),
      after = JSON.stringify({ entries: [] });
    localStorage.setItem(
      "framework-studio-v1:restore-journal",
      JSON.stringify({ id: "other-tab-restore", before, after }),
    );
    localStorage.setItem("framework-studio-v1:timer", after);
  });
  const other = await context.newPage();
  await other.goto("/");
  await expect(other.locator(".save-state")).toContainText("正在载入");
  await page.evaluate(async () => {
    const key = "framework-studio-v1",
      mirror = localStorage.getItem(key)!,
      data = JSON.parse(mirror);
    data.projectName = "并发恢复已完成";
    const db = await new Promise<IDBDatabase>((resolve) => {
      const r = indexedDB.open("framework-studio-local", 1);
      r.onsuccess = () => resolve(r.result);
    });
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction("projects", "readwrite");
      t.objectStore("projects").put(
        { raw: JSON.stringify(data), mirror, restoreId: "other-tab-restore" },
        key,
      );
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
    db.close();
    (window as any).__releaseRestore();
  });
  await expect(other.getByLabel("电影项目名称")).toHaveValue("并发恢复已完成");
  await saved(other);
  expect(
    await other.evaluate(() =>
      localStorage.getItem("framework-studio-v1:restore-journal"),
    ),
  ).toBeNull();
  await other.close();
});
