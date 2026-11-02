import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
test("free local workflow: schedule, timer across tabs/reload, mood, three drafts, video and complete backup restore", async ({
  page,
  context,
}) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "创作日程." })).toBeVisible();
  await page.getByLabel("电影项目名称").fill("夏の記憶 · 毕业短片");
  await page.getByLabel("项目截止日期").fill("2026-12-10");
  await page
    .locator(".schedule-workbench")
    .getByRole("button", { name: "添加任务", exact: true })
    .click();
  await page.getByLabel("任务名称", { exact: true }).fill("制作第一场人物图");
  await page.getByLabel("任务时间", { exact: true }).fill("10:30");
  await page.getByLabel("学习或制作地点").fill("图书馆 / 自宅");
  await page.getByLabel("任务备注").fill("先完成角色一致性");
  await page.getByRole("button", { name: "保存任务", exact: true }).click();
  await expect(page.locator(".schedule-task-list")).toContainText(
    "图书馆 / 自宅",
  );
  await page.getByRole("button", { name: "😊 状态不错", exact: true }).click();
  await page
    .getByLabel("创作日记", { exact: true })
    .fill("今日は良い一日。完成了角色设定。");
  await page.getByLabel("计时任务名称", { exact: true }).fill("角色图迭代");
  await page.getByRole("button", { name: "开始计时", exact: true }).click();
  const other = await context.newPage();
  await other.goto("/");
  await expect(
    other.getByRole("button", { name: "暂停计时", exact: true }),
  ).toBeVisible();
  await expect(
    other.getByRole("button", { name: "开始计时", exact: true }),
  ).toHaveCount(0);
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: "暂停计时", exact: true }).click();
  await expect(page.getByLabel("当前计时")).toContainText("00:00:0");
  await expect(
    page.getByRole("button", { name: "继续计时", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "继续计时", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "继续计时", exact: true }).click();
  await page.getByRole("button", { name: "结束并保存", exact: true }).click();
  await expect(page.locator(".time-entry")).toContainText("角色图迭代");
  await other.close();
  await page.getByRole("button", { name: "修改工时", exact: true }).click();
  await page.getByLabel("实际用时（分钟）").fill("25");
  await page.getByRole("button", { name: "保存工时", exact: true }).click();
  await expect(page.locator(".time-entry")).toContainText("00:25:00");
  await page.screenshot({
    path: "test-results/mvp-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "剧本工作台", exact: true }).click();
  await page
    .getByLabel("原始剧本导入")
    .fill(
      "内景 工作室 — 日\n\n角色：这是原始对白。\n\n外景 庭院 — 午后\n\n風が吹く。",
    );
  await page.getByRole("button", { name: "预览拆分", exact: true }).click();
  await page.getByRole("button", { name: "保留原稿并建立场景" }).click();
  await page.getByRole("button", { name: "AI 版本对比", exact: true }).click();
  for (let i = 1; i <= 3; i++) {
    await page
      .getByRole("tab", {
        name: ["ChatGPT", "Gemini", "Claude"][i - 1],
        exact: true,
      })
      .click();
    await page
      .getByLabel(`AI 修改结果 ${i}`, { exact: true })
      .fill(`模型 ${i} 第一段。\n\n模型 ${i} 第二段。`);
  }
  await page.getByRole("tab", { name: "Gemini", exact: true }).click();
  await page.getByText("更多：修改要求与版本", { exact: true }).click();
  await page.getByRole("button", { name: "送入定稿候选", exact: true }).click();
  await page.getByRole("button", { name: "确认定稿", exact: true }).click();
  await expect(page.getByLabel("人工合并候选", { exact: true })).toHaveValue(
    "模型 2 第一段。\n\n模型 2 第二段。",
  );
  page.on("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "人工确认并保存本场定稿" }).click();
  await page
    .getByText("从定稿批量建立文字分镜草稿（本地）", { exact: true })
    .click();
  await page.getByRole("button", { name: "从本场定稿生成分镜草稿" }).click();
  await page.getByRole("button", { name: "AI 版本对比", exact: true }).click();
  await page.getByRole("tab", { name: "Gemini", exact: true }).click();
  await page
    .getByLabel("AI 修改结果 2", { exact: true })
    .fill("后续修改不可覆盖定稿。");
  await page.getByRole("button", { name: "确认定稿", exact: true }).click();
  await expect(page.locator(".final-text")).toContainText("模型 2 第一段。");
  await page
    .getByRole("button", { name: "视频提示词与制作", exact: true })
    .click();
  await page
    .getByLabel("为分镜新建视频制作任务", { exact: true })
    .selectOption("s1");
  await page
    .getByLabel("视频 Prompt", { exact: true })
    .fill("镜头缓缓推进，薄荷色庭院，cinematic, 風が吹く。");
  await page.getByLabel("视频模型", { exact: true }).fill("WAN（外部工具）");
  await page.getByLabel("视频文件名", { exact: true }).fill("SH-001-v1.mp4");
  await page
    .getByLabel("SSD 视频相对路径", { exact: true })
    .fill("videos/generated/SH-001-v1.mp4");
  await page.getByRole("button", { name: "保存生成版本", exact: true }).click();
  await expect(page.locator(".video-version")).toContainText("SH-001-v1.mp4");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出项目", exact: true }).click();
  const backup = JSON.parse(
    await readFile((await (await download).path())!, "utf8"),
  );
  expect(backup.assets).toHaveLength(6);
  expect(backup.journals[0].text).toContain("今日は");
  expect(backup.timer.entries[0].durationMs).toBe(1500000);
  expect(backup.script.scenes[0].manualComparisons).toHaveLength(3);
  expect(backup.videoJobs[0].versions[0].relativePath).toBe(
    "videos/generated/SH-001-v1.mp4",
  );
  await page.getByRole("button", { name: "云端设置", exact: true }).click();
  await page.getByLabel("导入项目备份到本地").setInputFiles({
    name: "complete.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await expect(page.locator(".toast")).toContainText("已导入项目");
  await page.getByRole("button", { name: "关闭窗口", exact: true }).click();
  await page.reload();
  await expect(page.getByLabel("创作日记", { exact: true })).toHaveValue(
    backup.journals[0].text,
  );
  await expect(page.locator(".time-entry")).toContainText("00:25:00");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: "test-results/mvp-mobile.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("corrupt legacy cache is protected from automatic seed overwrite", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("framework-studio-v1", '{"assets":"broken"}'),
  );
  await page.goto("/");
  await expect(
    page.getByRole("alert").filter({ hasText: "原缓存格式异常" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("framework-studio-v1")),
  ).toBe('{"assets":"broken"}');
});
