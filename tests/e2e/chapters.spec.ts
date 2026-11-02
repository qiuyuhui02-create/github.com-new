import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
test("blank writing, freely named chapters, rename, drag, one-confirmation recycling, autosave and full backup", async ({
  page,
  browser,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "剧本工作台", exact: true }).click();
  await page.getByRole("button", { name: "从零开始创作", exact: true }).click();
  await page.getByLabel("剧本名称", { exact: true }).fill("雨の日");
  await page.getByLabel("剧本简介", { exact: true }).fill("日本語と中文");
  await page.getByRole("button", { name: "新建空白剧本", exact: true }).click();
  const save = async () =>
    page.getByRole("button", { name: "保存名称", exact: true }).click();
  await page.getByRole("button", { name: "新增章节", exact: true }).click();
  await page.getByLabel("章节名称", { exact: true }).fill("自由な名前");
  await save();
  await page
    .getByRole("button", { name: "新增场景到 自由な名前", exact: true })
    .click();
  await page.getByLabel("场景名称", { exact: true }).fill("窓辺");
  await save();
  await expect(page.getByLabel("AI 修改结果 1", { exact: true })).toHaveCount(
    0,
  );
  await page
    .getByLabel("场景修改稿", { exact: true })
    .fill("彼：おはよう。\n\n她：早上好。");
  await page.getByLabel("场景修改稿", { exact: true }).blur();
  const before = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("framework-studio-v1")!),
  );
  await page.locator(".chapter-name").dblclick();
  await page.getByLabel("重命名章节", { exact: true }).fill("朝の光");
  await page.getByLabel("重命名章节", { exact: true }).press("Enter");
  await page.locator(".chapter-name").click({ button: "right" });
  await page.getByRole("menuitem", { name: "重命名", exact: true }).click();
  await page.getByLabel("重命名章节", { exact: true }).fill("雨の余白");
  await page.getByLabel("重命名章节", { exact: true }).press("Enter");
  await page.getByRole("button", { name: "新增章节", exact: true }).click();
  await page.getByLabel("章节名称", { exact: true }).fill("帰り道");
  await save();
  await page
    .locator(".chapter-node")
    .nth(1)
    .dragTo(page.locator(".chapter-node").nth(0));
  await expect(page.locator(".chapter-name").first()).toHaveText("帰り道");
  await page
    .getByRole("button", { name: "章节菜单 雨の余白", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "删除章节", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(page.getByLabel("接收场景的章节")).toHaveCount(0);
  await page.getByRole("button", { name: "取消删除", exact: true }).click();
  await expect(page.locator(".chapter-name")).toHaveCount(2);
  await page
    .getByRole("button", { name: "章节菜单 雨の余白", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "删除章节", exact: true }).click();
  await page.getByRole("button", { name: "确认删除章节", exact: true }).click();
  await expect(page.locator(".chapter-name")).toHaveCount(1);
  await page.getByText("章节回收站 · 1 项", { exact: true }).click();
  await page
    .getByRole("button", { name: "恢复章节 雨の余白", exact: true })
    .click();
  await expect(page.locator(".chapter-name")).toHaveCount(2);
  await page.locator(".scene-select").click();
  await expect(page.getByLabel("场景修改稿", { exact: true })).toHaveValue(
    "彼：おはよう。\n\n她：早上好。",
  );
  await page.reload();
  await page.getByRole("button", { name: "剧本工作台", exact: true }).click();
  await expect(page.getByLabel("场景修改稿", { exact: true })).toHaveValue(
    "彼：おはよう。\n\n她：早上好。",
  );
  await page
    .getByRole("button", { name: "章节菜单 雨の余白", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "复制章节", exact: true }).click();
  await expect(page.locator(".chapter-name")).toHaveCount(3);
  await page
    .getByRole("button", { name: "折叠章节 雨の余白（副本）", exact: true })
    .click();
  await expect(page.locator(".scene-select")).toHaveCount(1);
  await page.locator(".scene-select").click();
  await page.getByText("场景信息、所属章节与关联资产", { exact: true }).click();
  page.on("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "删除当前场景（移入回收站）", exact: true })
    .click();
  await page.getByText(/场景回收站/).click();
  await page
    .getByRole("button", { name: "恢复到当前章节", exact: true })
    .click();
  await expect(page.getByLabel("场景修改稿", { exact: true })).toHaveValue(
    "彼：おはよう。\n\n她：早上好。",
  );
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出项目", exact: true }).click();
  const backup = JSON.parse(
    await readFile((await (await download).path())!, "utf8"),
  );
  expect(backup.assets).toEqual(before.assets);
  expect(backup.script.scenes[0].id).toBe(before.script.scenes[0].id);
  expect(backup.script.chapters[0].name).toBe("帰り道");
  expect(backup.script.synopsis).toBe("日本語と中文");
  expect(backup.script.chapters[2].collapsed).toBe(true);
  expect(backup.script.scenes[1].id).not.toBe(backup.script.scenes[0].id);
  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  try {
    const mobile = await phone.newPage();
    await mobile.goto("http://127.0.0.1:3000/");
    await mobile.getByLabel("手机导入项目快照").setInputFiles({
      name: "chapters.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(backup)),
    });
    await mobile
      .getByRole("button", { name: "确认覆盖当前本地项目", exact: true })
      .click();
    await expect(mobile.locator(".toast")).toContainText("项目快照已导入");
    await mobile.getByRole("button", { name: "剧本", exact: true }).click();
    await expect(mobile.locator(".reader-content")).toContainText(
      "雨の余白（副本）",
    );
    await expect(mobile.locator(".reader-content")).toContainText("雨の日");
  } finally {
    await phone.close();
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/chapter-desktop.png",
    fullPage: true,
  });
});
test("Markdown import is previewed before saving and retains exact source with editable boundaries", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "剧本工作台", exact: true }).click();
  const raw =
    "# 雨の名前\r\n\r\nまだ場面ではない台詞。\r\n\r\nINT. 家 - 日\r\n彼：行こう。\r\n\r\n○駅・夜\r\n彼女：待って。\r\n";
  await page.getByLabel("读取本地剧本文本", { exact: true }).setInputFiles({
    name: "雨の名前.md",
    mimeType: "text/markdown",
    buffer: Buffer.from(raw),
  });
  await page.getByRole("button", { name: "预览拆分", exact: true }).click();
  await expect(
    page.getByText("拆分预览 · 尚未导入", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("framework-studio-v1")!).script,
    ),
  ).toBeUndefined();
  await page.getByLabel("区间 2 起始行", { exact: true }).fill("0");
  await expect(
    page.getByRole("button", { name: "保留原稿并建立场景", exact: true }),
  ).toBeDisabled();
  await expect(page.getByLabel("区间 1 起始行", { exact: true })).toBeEnabled();
  await page.getByLabel("区间 1 起始行", { exact: true }).fill("5");
  await page.getByLabel("区间 1 名称", { exact: true }).fill("自由な序");
  await page
    .getByRole("button", { name: "保留原稿并建立场景", exact: true })
    .click();
  await expect(page.locator(".chapter-name")).toHaveText("自由な序");
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("framework-studio-v1")!),
  );
  expect(saved.script.original.text).toBe(raw);
  expect(
    saved.script.scenes.map((s: { original: string }) => s.original).join(""),
  ).toContain("まだ場面ではない台詞。");
  await page.getByRole("button", { name: "AI 版本对比", exact: true }).click();
  await expect(page.getByLabel("AI 修改结果 1", { exact: true })).toBeVisible();
  await expect(page.getByLabel("场景修改稿", { exact: true })).toHaveCount(0);
});
