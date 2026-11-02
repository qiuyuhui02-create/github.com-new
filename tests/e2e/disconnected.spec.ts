import { test, expect } from "@playwright/test";
import { seed } from "../../lib/model";
test("management with disconnected media keeps seven assets, versions, links and JSON export", async ({
  page,
}) => {
  const project = structuredClone(seed);
  project.assets.push({
    ...project.assets[0],
    id: "a7",
    name: "第七个原有资产",
    image: "local:ssd-file",
    references: ["local:ssd-file"],
    versions: [
      {
        at: "2026-01-01T00:00:00.000Z",
        image: "local:old-version",
        description: "历史说明",
        model: "历史模型",
      },
    ],
  });
  project.shots[0].assets.push("a7");
  await page.addInitScript(
    (data) => localStorage.setItem("framework-studio-v1", JSON.stringify(data)),
    project,
  );
  await page.goto("/");
  await page.getByRole("button", { name: "资产库", exact: true }).click();
  await expect(page.locator(".asset-card")).toHaveCount(7);
  await expect(page.locator(".asset-card").last()).toContainText("素材未连接");
  await page.locator(".asset-card").last().click();
  await page
    .getByLabel("视觉设定与描述")
    .fill("Mac 管理端修改文字，无需素材盘");
  await page.getByRole("button", { name: "保存资产", exact: true }).click();
  await page.getByRole("button", { name: "创作日程", exact: true }).click();
  await page
    .locator(".schedule-workbench")
    .getByRole("button", { name: "添加任务", exact: true })
    .click();
  await page
    .getByLabel("任务名称", { exact: true })
    .fill("等待 Windows 生成镜头");
  await page.getByRole("button", { name: "保存任务", exact: true }).click();
  await page.getByRole("button", { name: "Prompt 中心", exact: true }).click();
  await page.getByRole("button", { name: "新建 Prompt", exact: true }).click();
  await page.getByLabel("标题", { exact: true }).fill("跨设备 Prompt");
  await page.getByLabel("提示词内容").fill("夜景，日文对白");
  await page.getByRole("button", { name: "保存 Prompt", exact: true }).click();
  // Later dependent branches also verify the screenplay editor with the same disconnected data.
  const scriptButton = page.getByRole("button", {
    name: "剧本工作台",
    exact: true,
  });
  if (await scriptButton.count()) {
    await scriptButton.click();
    await page
      .getByLabel("原始剧本导入")
      .fill("内景 工作室 — 夜\n\n角色：等待 Windows 制作。");
    await page.getByRole("button", { name: "预览拆分", exact: true }).click();
    await page.getByRole("button", { name: "保留原稿并建立场景" }).click();
    await page.getByLabel("场景修改稿").fill("角色：可在 Mac 正常修改剧本。");
    await page.getByLabel("场景修改稿").blur();
  }
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("framework-studio-v1")!),
  );
  expect(saved.assets.map((a: { id: string }) => a.id)).toEqual(
    project.assets.map((a) => a.id),
  );
  expect(saved.assets[6].versions).toContainEqual(
    project.assets[6].versions[0],
  );
  expect(saved.shots).toEqual(project.shots);
  expect(
    saved.tasks.some(
      (t: { title: string }) => t.title === "等待 Windows 生成镜头",
    ),
  ).toBe(true);
  expect(
    saved.prompts.some((p: { title: string }) => p.title === "跨设备 Prompt"),
  ).toBe(true);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出项目", exact: true }).click();
  const file = await downloadPromise;
  const { readFile } = await import("node:fs/promises");
  const exported = JSON.parse(await readFile((await file.path())!, "utf8"));
  expect(exported.snapshot.format).toBe("framework-studio-snapshot");
  delete exported.snapshot;
  expect(exported).toEqual(saved);
});
