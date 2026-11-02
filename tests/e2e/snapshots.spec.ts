import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { seed } from "../../lib/model";
import { importScreenplay } from "../../lib/screenplay";
test("Mac snapshot imports privately on phone, confirms replacement, shows version/time, previews and copies Prompt", async ({
  page,
  browser,
}) => {
  const data = structuredClone(seed);
  data.assets.push({
    ...data.assets[0],
    id: "original-seven",
    name: "第七资产",
    image: "local:offline",
    references: ["local:old"],
    versions: [
      {
        at: "2026-01-01T00:00:00Z",
        image: "local:old",
        description: "原有历史",
        model: "手动",
      },
    ],
  });
  data.shots[0].assets.push("original-seven");
  data.projectName = "私人的毕业电影";
  data.meta = { revision: 8, updatedAt: "2026-11-01T13:00:00Z" };
  data.journals = [
    { date: "2026-11-01", mood: "🥰 很开心", text: "私人的创作日记" },
  ];
  data.timer = {
    entries: [
      {
        id: "time1",
        title: "整理素材",
        date: "2026-11-01",
        category: "图片与资产",
        notes: "",
        durationMs: 3600000,
      },
    ],
  };
  data.script = importScreenplay("内景 卧室 — 夜\n\n私人的剧本台词。", "中文");
  data.assets[0].image = "local:thumbnail";
  data.previews = {
    thumbnail:
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
  };
  await page.addInitScript(
    (s) => localStorage.setItem("framework-studio-v1", JSON.stringify(s)),
    data,
  );
  await page.goto("/");
  await expect(page.getByLabel("电影项目名称")).toHaveValue(data.projectName);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出项目", exact: true }).click();
  const raw = await readFile((await (await download).path())!, "utf8"),
    snapshot = JSON.parse(raw);
  expect(snapshot.snapshot.revision).toBe(8);
  expect(snapshot.assets.map((a: { id: string }) => a.id)).toEqual(
    data.assets.map((a) => a.id),
  );
  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 },
    permissions: ["clipboard-read", "clipboard-write"],
  });
  try {
    const mobile = await phone.newPage();
    let requests = 0;
    await mobile.route(/\/(rest|storage)\/v1\//, (route) => {
      requests++;
      return route.abort();
    });
    await mobile.goto("http://127.0.0.1:3000/");
    await expect(mobile.getByText("只读查看", { exact: true })).toBeVisible();
    await expect(mobile.locator(".reader-hero")).toContainText(
      "尚未导入 Mac 快照",
    );
    const file = {
      name: "mac-snapshot.json",
      mimeType: "application/json",
      buffer: Buffer.from(raw),
    };
    await mobile.getByLabel("手机导入项目快照").setInputFiles(file);
    await mobile.getByRole("button", { name: "取消导入", exact: true }).click();
    await expect(mobile.locator(".reader-hero")).not.toContainText(
      data.projectName,
    );
    await mobile.getByLabel("手机导入项目快照").setInputFiles(file);
    await mobile
      .getByRole("button", { name: "确认覆盖当前本地项目", exact: true })
      .click();
    await expect(mobile.locator(".reader-hero")).toContainText(
      data.projectName,
    );
    await expect(mobile.locator(".snapshot-details")).toContainText(
      "数据版本 v8",
    );
    await expect(mobile.locator(".reader-hero")).toContainText("非实时同步");
    await expect(mobile.locator(".snapshot-details")).toContainText("2026");
    await mobile.reload();
    await expect(mobile.locator(".reader-hero")).toContainText(
      data.projectName,
    );
    await mobile.getByRole("button", { name: "资产", exact: true }).click();
    await expect(mobile.locator(".reader-asset")).toHaveCount(7);
    await expect(mobile.locator(".reader-asset img").first()).toBeVisible();
    await expect(mobile.locator(".reader-asset").last()).toContainText(
      "图片未随快照携带",
    );
    await mobile.getByLabel("搜索手机项目内容").fill("第七");
    await expect(mobile.locator(".reader-asset")).toHaveCount(1);
    await mobile.getByRole("button", { name: "剧本", exact: true }).click();
    await mobile.getByText("原始剧本", { exact: true }).click();
    await expect(mobile.locator(".reader-content")).toContainText(
      "私人的剧本台词",
    );
    await expect(mobile.locator("textarea")).toHaveCount(0);
    await mobile.getByRole("button", { name: "日程", exact: true }).click();
    await expect(mobile.locator(".reader-content")).toContainText(
      "私人的创作日记",
    );
    await expect(mobile.locator(".reader-content")).toContainText("01:00:00");
    await mobile.getByRole("button", { name: "Prompt", exact: true }).click();
    await mobile
      .getByRole("button", { name: "复制 Prompt", exact: true })
      .first()
      .click();
    expect(await mobile.evaluate(() => navigator.clipboard.readText())).toBe(
      data.prompts[0].content,
    );
    expect(requests).toBe(0);
    expect(
      await mobile.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
    await mobile.screenshot({
      path: "test-results/phone-snapshot.png",
      fullPage: true,
    });
  } finally {
    await phone.close();
  }
});
test("IndexedDB preserves local edits when localStorage is full", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === "framework-studio-v1")
        throw new DOMException("full", "QuotaExceededError");
      return original.call(this, k, v);
    };
  });
  await page.goto("/");
  await page.getByLabel("电影项目名称").fill("IndexedDB 中的安全项目");
  await expect(page.locator(".save-state")).toContainText("已保存在此浏览器");
  await page.reload();
  await expect(page.getByLabel("电影项目名称")).toHaveValue(
    "IndexedDB 中的安全项目",
  );
});
test("stale tab cannot overwrite another tab's newer project", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await expect(page.locator(".save-state")).toContainText("已保存在此浏览器");
  const stale = await context.newPage();
  await stale.goto("/");
  await expect(stale.locator(".save-state")).toContainText("已保存在此浏览器");
  await page.getByLabel("电影项目名称").fill("主窗口已保存");
  await expect(page.locator(".save-state")).toContainText("已保存在此浏览器");
  await stale.getByLabel("电影项目名称").fill("过期标签页尝试写入");
  await expect(
    stale.getByRole("alert").filter({ hasText: "另一个标签页已更新" }),
  ).toBeVisible();
  await stale.getByLabel("电影项目名称").fill("再次修改也不能覆盖");
  await page.reload();
  await expect(page.getByLabel("电影项目名称")).toHaveValue("主窗口已保存");
  await stale.close();
});
