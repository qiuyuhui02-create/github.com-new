import { test, expect } from "@playwright/test";
test("script original, draft autosave, partial confirmation, final history and storyboard warnings", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "剧本工作台", exact: true }).click();
  const raw =
    "内景 修复室 — 夜\n\n林：记忆还在。\n\n外景 街道 — 夜\n\n雨落下。";
  await page.getByLabel("原始剧本导入").fill(raw);
  await page.getByRole("button", { name: "保留原稿并建立场景" }).click();
  await expect(page.locator(".scene-directory button")).toHaveCount(2);
  await page
    .getByLabel("场景修改稿")
    .fill("内景 修复室 — 夜\n\n林：我找到了记忆。");
  await page.getByRole("button", { name: "整版加入确认候选" }).click();
  await page.getByLabel("人工合并候选").fill("林：这是一句人工确认的台词。");
  page.on("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "人工确认并保存本场定稿" }).click();
  await expect(
    page.getByRole("button", { name: "从本场定稿生成分镜草稿" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "从本场定稿生成分镜草稿" }).click();
  await page.getByLabel("场景修改稿").fill("林：这一版仍在修改中。");
  await page.getByRole("button", { name: "最终剧本", exact: true }).click();
  await expect(page.locator(".final-text")).toHaveText(
    "林：这是一句人工确认的台词。",
  );
  await page.getByRole("button", { name: "原始剧本", exact: true }).click();
  await expect(page.locator(".screenplay-text")).toContainText(
    "林：记忆还在。",
  );
  await page.getByRole("button", { name: "分镜总览", exact: true }).click();
  await expect(page.locator(".shot-warning")).toHaveCount(1);
  await page.reload();
  await page.getByRole("button", { name: "剧本工作台", exact: true }).click();
  await expect(page.getByLabel("场景修改稿")).toHaveValue(
    "林：这一版仍在修改中。",
  );
  await expect(page.getByLabel("人工合并候选")).toHaveValue(
    "林：这是一句人工确认的台词。",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});
