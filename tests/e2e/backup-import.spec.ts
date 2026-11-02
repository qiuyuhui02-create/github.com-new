import { test, expect, type Page } from "@playwright/test";
import { seed } from "../../lib/model";
import {
  addChapter,
  addScene,
  newBlankScreenplay,
} from "../../lib/screenplay-structure";
import { backupJSON } from "../../lib/backups";
function backup() {
  const d = structuredClone(seed);
  d.projectName = "Safari 恢复｜日本語";
  let s = newBlankScreenplay("光の記憶", "", "日本語");
  const c = addChapter(s, "自由章节");
  s = addScene(c.script, c.chapter.id, "夜の駅").script;
  d.script = s;
  return backupJSON(d, "2026-11-02T00:00:00Z");
}
async function waitLoaded(p: Page) {
  await expect(p.getByLabel("本地备份状态")).toBeVisible();
  await expect(p.getByLabel("本地备份状态")).toContainText("尚未确认");
  await expect
    .poll(() =>
      p.evaluate(() =>
        localStorage.getItem("framework-studio-v1:backup-receipt"),
      ),
    )
    .not.toBeNull();
}
async function localState(p: Page) {
  return p.evaluate(async () => {
    const local = Object.fromEntries(
      Object.keys(localStorage)
        .filter((k) => k.startsWith("framework-studio"))
        .sort()
        .map((k) => [k, localStorage.getItem(k)]),
    );
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const q = indexedDB.open("framework-studio-local", 1);
      q.onsuccess = () => resolve(q.result);
      q.onerror = () => reject(q.error);
    });
    const rows = await new Promise<unknown[]>((resolve, reject) => {
      const q = db
        .transaction("projects", "readonly")
        .objectStore("projects")
        .getAll();
      q.onsuccess = () => resolve(q.result);
      q.onerror = () => reject(q.error);
    });
    db.close();
    return { local, rows };
  });
}
for (const entry of ["home", "settings", "phone"] as const) {
  test(`Safari-compatible ${entry} file picker requires preview and explicit confirmation; cancellation is read-only`, async ({
    page,
  }) => {
    if (entry === "phone")
      await page.setViewportSize({ width: 390, height: 844 });
    const native: string[] = [];
    page.on("dialog", async (d) => {
      native.push(d.message());
      await d.dismiss();
    });
    await page.goto("/");
    await waitLoaded(page);
    if (entry !== "phone")
      await expect(page.locator(".save-state")).toContainText(
        "已保存在此浏览器",
      );
    const before = await localState(page),
      file = {
        name: "备份 日本語.json",
        mimeType: "application/json",
        buffer: Buffer.from(backup()),
      };
    async function choose() {
      if (entry === "settings") {
        await page
          .getByRole("button", { name: "云端设置", exact: true })
          .click();
        await page.getByLabel("导入项目备份到本地").setInputFiles(file);
      } else {
        const chooser = page.waitForEvent("filechooser");
        await page
          .getByRole("button", { name: "恢复备份", exact: true })
          .click();
        await (await chooser).setFiles(file);
      }
      const dialog = page.getByRole("dialog", {
        name: "导入备份预览",
        exact: true,
      });
      await expect(dialog).toBeVisible();
      for (const label of [
        "项目数量",
        "章节数量",
        "场景数量",
        "分镜数量",
        "备份导出时间",
        "不是新增或合并",
      ])
        await expect(dialog).toContainText(label);
      await expect(dialog).toContainText("2026");
      expect(native).toEqual([]);
      expect(await localState(page)).toEqual(before);
    }
    await choose();
    await page.getByRole("button", { name: "取消导入", exact: true }).click();
    expect(await localState(page)).toEqual(before);
    await choose();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("dialog", { name: "导入备份预览" }),
    ).toHaveCount(0);
    expect(await localState(page)).toEqual(before);
    await choose();
    await page
      .getByRole("button", { name: "确认覆盖当前本地项目", exact: true })
      .click();
    await expect(page.locator(".toast")).toContainText(
      entry === "phone" ? "项目快照已导入" : "已导入项目",
    );
    expect(native).toEqual([]);
    await page.reload();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            JSON.parse(localStorage.getItem("framework-studio-v1")!)
              .projectName,
        ),
      )
      .toBe("Safari 恢复｜日本語");
  });
}
test("build endpoint matches displayed page commit; version changes before final confirmation refuse all writes", async ({
  page,
}) => {
  await page.goto("/");
  await waitLoaded(page);
  await page.getByText("恢复流程与页面版本", { exact: true }).click();
  const response = await page.request.get("/api/build-info");
  expect(response.headers()["cache-control"]).toContain("no-store");
  const info = await response.json();
  expect(info.commit).toMatch(/^[0-9a-f]{40}$/);
  expect(info.backupImportFlow).toBe("preview-required-v2");
  await expect(page.getByTestId("backup-build-commit")).toContainText(
    info.commit,
  );
  const before = await localState(page);
  await page
    .getByLabel("选择恢复备份文件")
    .setInputFiles({
      name: "scene.json",
      mimeType: "application/json",
      buffer: Buffer.from(backup()),
    });
  await expect(
    page.getByRole("dialog", { name: "导入备份预览" }),
  ).toBeVisible();
  await page.route("**/api/build-info", (r) =>
    r.fulfill({ json: { ...info, commit: "f".repeat(40) } }),
  );
  await page
    .getByRole("button", { name: "确认覆盖当前本地项目", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "页面与服务器版本不一致",
  );
  expect(await localState(page)).toEqual(before);
  await page.getByRole("button", { name: "取消导入", exact: true }).click();
  await page
    .getByLabel("选择恢复备份文件")
    .setInputFiles({
      name: "scene.json",
      mimeType: "application/json",
      buffer: Buffer.from(backup()),
    });
  await expect(page.locator(".toast")).toContainText("页面与服务器版本不一致");
  await expect(page.getByRole("dialog", { name: "导入备份预览" })).toHaveCount(
    0,
  );
  expect(await localState(page)).toEqual(before);
});
test("offline restore still presents preview and cancellation changes no data", async ({
  page,
}) => {
  await page.goto("/");
  await waitLoaded(page);
  const before = await localState(page);
  await page.route("**/api/build-info", (r) => r.abort("internetdisconnected"));
  await page
    .getByLabel("选择恢复备份文件")
    .setInputFiles({
      name: "offline.json",
      mimeType: "application/json",
      buffer: Buffer.from(backup()),
    });
  await expect(
    page.getByRole("dialog", { name: "导入备份预览" }),
  ).toContainText("当前离线");
  await page.getByRole("button", { name: "取消导入", exact: true }).click();
  expect(await localState(page)).toEqual(before);
});
