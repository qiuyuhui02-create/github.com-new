import { test, expect } from "@playwright/test";
test("asset creation, filters, upload, versions and reload persistence", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: "资产库", exact: true }).click();
  await expect(page.getByRole("heading", { name: "资产库." })).toBeVisible();
  await expect(page.locator(".asset-card")).toHaveCount(6);
  await page.getByRole("button", { name: "新建资产", exact: true }).click();
  await page.getByLabel("资产名称", { exact: true }).fill("测试飞船");
  await page.getByLabel("资产分类").selectOption("道具");
  await page.getByLabel("视觉设定与描述").fill("银色的小型飞船");
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
    "base64",
  );
  await page
    .locator(".upload-button input")
    .setInputFiles({ name: "test.png", mimeType: "image/png", buffer: png });
  await expect(page.locator(".editor-image img")).toBeVisible();
  await page.getByRole("button", { name: "保存资产", exact: true }).click();
  await expect(page.locator(".asset-card")).toHaveCount(7);
  await page.reload();
  await page.getByRole("button", { name: "资产库", exact: true }).click();
  await expect(page.locator(".asset-card")).toHaveCount(7);
  await page.getByPlaceholder("搜索资产名称、描述或标签…").fill("测试飞船");
  await expect(page.locator(".asset-card")).toHaveCount(1);
  await expect(page.locator(".asset-card img")).toBeVisible();
  await page.locator(".asset-card").click();
  await page.getByLabel("视觉设定与描述").fill("金色的新版本飞船");
  await page.getByRole("button", { name: "保存资产", exact: true }).click();
  await page.locator(".asset-card").click();
  await expect(page.locator(".version-row")).toHaveCount(1);
  await page.getByRole("button", { name: "载入", exact: true }).click();
  await expect(page.getByLabel("视觉设定与描述")).toHaveValue("银色的小型飞船");
  await page.getByRole("button", { name: "保存资产", exact: true }).click();
  expect(errors).toEqual([]);
});
test("shots, tasks, prompt library and free agent analysis", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "资产库", exact: true }).click();
  await page.getByRole("button", { name: "分镜工作台", exact: true }).click();
  await page.getByRole("button", { name: "新建分镜", exact: true }).click();
  await page.getByLabel("镜头名称").fill("记忆重现");
  await page.getByLabel("时长（秒）").fill("8");
  await page.getByLabel("林 · 城市漫游者").check();
  await page.getByRole("button", { name: "保存分镜", exact: true }).click();
  await expect(page.locator(".shot-card")).toHaveCount(4);
  await page.getByRole("button", { name: "分镜工作台", exact: true }).click();
  await expect(page.locator(".timeline-track button")).toHaveCount(4);
  await page.getByRole("button", { name: "创作日程", exact: true }).click();
  await page
    .locator(".schedule-workbench")
    .getByRole("button", { name: "添加任务", exact: true })
    .click();
  await page.getByLabel("任务名称", { exact: true }).fill("审核新增分镜");
  await page.getByRole("button", { name: "保存任务", exact: true }).click();
  await page.getByLabel("完成 审核新增分镜").check();
  await expect(page.locator(".schedule-task.done")).toHaveCount(2);
  await page.getByRole("button", { name: "Prompt 中心", exact: true }).click();
  await page.getByRole("button", { name: "新建 Prompt", exact: true }).click();
  await page.getByLabel("标题", { exact: true }).fill("测试电影提示词");
  await page.getByLabel("提示词内容").fill("cinematic light");
  await page.getByRole("button", { name: "保存 Prompt", exact: true }).click();
  await expect(page.locator(".prompt-card")).toHaveCount(3);
  await page.getByRole("button", { name: "AI Agent", exact: true }).click();
  await page.getByRole("button", { name: "检查制作缺口" }).click();
  await expect(page.locator(".agent-output pre")).toContainText("3 项待完成");
  await page.getByRole("button", { name: "生成镜头 Prompt" }).click();
  await expect(page.locator(".agent-output pre")).toContainText("记忆重现");
  await page.getByRole("button", { name: "保存到 Prompt 中心" }).click();
  await page.getByRole("button", { name: "Prompt 中心", exact: true }).click();
  await expect(page.locator(".prompt-card")).toHaveCount(4);
});
test("mobile defaults to read-only snapshot view and fits viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByText("只读查看", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.getByRole("button", { name: "资产", exact: true }).click();
  await expect(page.locator(".reader-asset")).toHaveCount(6);
  await expect(
    page.getByRole("button", { name: "新建资产", exact: true }),
  ).toHaveCount(0);
});
test("paid endpoint stays disabled without configuration", async ({
  request,
}) => {
  const r = await request.post("/api/agent", {
    data: { question: "检查项目" },
  });
  expect(r.status()).toBe(503);
  expect((await r.json()).error).toContain("付费 AI 未启用");
});
