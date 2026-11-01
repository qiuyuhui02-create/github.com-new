import { test, expect } from "@playwright/test";
test("unconnected providers produce no response; mocked comparison saves variants and manual adoption preserves final", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "剧本工作台", exact: true }).click();
  await page.getByLabel("原始剧本导入").fill("○駅・朝\n彼：行こう。");
  await page.getByRole("button", { name: "保留原稿并建立场景" }).click();
  page.on("dialog", (d) => d.accept());
  await page.getByLabel("人工合并候选").fill("人工定稿内容。");
  await page.getByRole("button", { name: "人工确认并保存本场定稿" }).click();
  await page.getByRole("button", { name: "多 AI 对比", exact: true }).click();
  await expect(page.locator(".provider-card")).toHaveCount(3);
  await expect(
    page.getByRole("button", { name: "发送同稿进行多模型对比" }),
  ).toBeDisabled();
  await expect(page.locator(".comparison-grid")).toHaveCount(0);
  const disabled = await request.post("/api/script/compare", {
    data: { text: "测试", instructions: "修改", providers: ["gemini"] },
  });
  expect(disabled.status()).toBe(503);
  await page.route("**/api/script/compare", async (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({
        json: {
          providers: [
            {
              id: "gemini",
              name: "Gemini",
              model: "mock-g",
              tier: "免费额度",
              ready: true,
              status: "可请求",
            },
            {
              id: "openrouter",
              name: "OpenRouter",
              model: "mock/o:free",
              tier: "免费模型",
              ready: true,
              status: "可请求",
            },
          ],
        },
      });
    const body = route.request().postDataJSON();
    expect(body.providers).toEqual(["gemini", "openrouter"]);
    expect(body.text).toContain("彼：行こう。");
    return route.fulfill({
      json: {
        inputHash: "a".repeat(64),
        remaining: 4,
        results: [
          { provider: "gemini", model: "mock-g", text: "彼：一緒に行こう。" },
          {
            provider: "openrouter",
            model: "mock/o:free",
            text: "彼：さあ、行こう。",
          },
        ],
      },
    });
  });
  await page.getByRole("button", { name: "修改与确认", exact: true }).click();
  await page.getByRole("button", { name: "多 AI 对比", exact: true }).click();
  await expect(page.locator(".provider-card")).toHaveCount(2);
  await page.locator(".provider-card input").nth(0).check();
  await page.locator(".provider-card input").nth(1).check();
  await page.getByRole("button", { name: "发送同稿进行多模型对比" }).click();
  await expect(page.locator(".comparison-grid article")).toHaveCount(2);
  await page
    .locator(".comparison-grid article")
    .first()
    .getByRole("button", { name: "整版载入工作稿" })
    .click();
  await page.getByRole("button", { name: "最终剧本", exact: true }).click();
  await expect(page.locator(".final-text")).toHaveText("人工定稿内容。");
  await page.getByRole("button", { name: "修改与确认", exact: true }).click();
  await expect(page.getByLabel("场景修改稿")).toHaveValue("彼：一緒に行こう。");
  const saved = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("framework-studio-v1")!).script.scenes[0],
  );
  expect(saved.variants).toHaveLength(2);
  expect(saved.final.text).toBe("人工定稿内容。");
});
