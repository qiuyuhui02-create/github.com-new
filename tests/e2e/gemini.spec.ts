import { test, expect } from "@playwright/test";
import { seed } from "../../lib/model";
import { importScreenplay, confirmScene } from "../../lib/screenplay";
const code = "test-only-personal-access-12345678901234567890",
  model = "gemini-2.5-flash-lite";
const text = "内景 教室 — 午后\n\n遥：你明天还来吗？\n凛：嗯。";
function project() {
  const s = structuredClone(seed);
  s.script = importScreenplay(text, "中文");
  s.script.scenes[0] = confirmScene(s.script.scenes[0], text);
  s.script.scenes[0].manualComparisons = [
    { model: "旧 Gemini", text: "原有对比结果" },
    { model: "手动模型2", text: "手动建议2" },
    { model: "手动模型3", text: "手动建议3" },
  ];
  return s;
}
test("mock Gemini: only sends current scene, preserves concurrent edits and finals, requires confirmation to adopt, survives backup", async ({
  page,
}) => {
  const initial = project();
  await page.addInitScript(
    (s) => localStorage.setItem("framework-studio-v1", JSON.stringify(s)),
    initial,
  );
  let calls = 0,
    upstream = 0,
    release: () => void = () => {};
  const wait = new Promise<void>((r) => (release = r));
  await page.route("**/api/script/gemini", async (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({
        json: { available: true, message: "模拟服务 · 仅本地测试" },
      });
    calls++;
    expect(route.request().headers().authorization).toBe(`Bearer ${code}`);
    const b = route.request().postDataJSON();
    expect(Object.keys(b).sort()).toEqual([
      "direction",
      "instructions",
      "requestId",
      "text",
    ]);
    expect(b.text).toBe(text);
    await wait;
    return route.fulfill({
      json: {
        proposal: {
          script: "遥：明天……\n凛：我会来的。",
          reasons: ["通过未完句表达犹豫。"],
          model,
          source: b.text,
          direction: b.direction,
          instructions: b.instructions,
          at: "2026-11-01T12:00:00Z",
        },
      },
    });
  });
  await page.route("**/generativelanguage.googleapis.com/**", (route) => {
    upstream++;
    return route.abort();
  });
  await page.goto("/");
  await page.getByRole("button", { name: "剧本工作台", exact: true }).click();
  await page.getByLabel("Gemini 个人访问码").fill(code);
  await page
    .getByLabel("Gemini 修改要求", { exact: true })
    .fill("减少解释性对白");
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "AI 修改本场剧本", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "正在修改本场…", exact: true }),
  ).toBeDisabled();
  await page
    .getByLabel("场景修改稿", { exact: true })
    .fill("人工正在编辑的工作稿，不能被覆盖。");
  await page
    .getByLabel("AI 修改结果 2", { exact: true })
    .fill("等待期间保存的另一模型建议");
  release();
  await expect(page.locator(".gemini-proposal")).toContainText(
    "通过未完句表达犹豫",
  );
  await expect(page.getByLabel("场景修改稿", { exact: true })).toHaveValue(
    "人工正在编辑的工作稿，不能被覆盖。",
  );
  await expect(page.getByLabel("AI 修改结果 1", { exact: true })).toHaveValue(
    "原有对比结果",
  );
  await expect(page.getByLabel("AI 修改结果 2", { exact: true })).toHaveValue(
    "等待期间保存的另一模型建议",
  );
  await page.screenshot({
    path: "test-results/gemini-desktop.png",
    fullPage: true,
  });
  page.once("dialog", (d) => d.dismiss());
  await page
    .getByRole("button", { name: "确认采用到 Gemini 对比栏", exact: true })
    .click();
  await expect(page.getByLabel("AI 修改结果 1", { exact: true })).toHaveValue(
    "原有对比结果",
  );
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "确认采用到 Gemini 对比栏", exact: true })
    .click();
  await expect(page.getByLabel("AI 修改结果 1", { exact: true })).toHaveValue(
    "遥：明天……\n凛：我会来的。",
  );
  await page.getByRole("button", { name: "最终剧本", exact: true }).click();
  await expect(page.locator(".final-text")).toHaveText(text);
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("framework-studio-v1")!),
  );
  expect(saved.script.scenes[0].final).toEqual(initial.script!.scenes[0].final);
  expect(saved.script.scenes[0].original).toBe(text);
  expect(saved.script.scenes[0].geminiProposal.reasons).toHaveLength(1);
  expect(JSON.stringify(saved)).not.toContain(code);
  expect(calls).toBe(1);
  expect(upstream).toBe(0);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出项目", exact: true }).click();
  const { readFile } = await import("node:fs/promises"),
    backup = JSON.parse(
      await readFile((await (await download).path())!, "utf8"),
    );
  expect(backup.script.scenes[0].geminiProposal).toEqual(
    saved.script.scenes[0].geminiProposal,
  );
  expect(JSON.stringify(backup)).not.toContain(code);
});
test("quota failure stops automatic calls while all three manual result fields remain editable", async ({
  page,
}) => {
  await page.addInitScript(
    (s) => localStorage.setItem("framework-studio-v1", JSON.stringify(s)),
    project(),
  );
  let calls = 0;
  await page.route("**/api/script/gemini", (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ json: { available: true, message: "模拟服务" } });
    calls++;
    return route.fulfill({
      status: 429,
      json: {
        code: "provider_quota",
        error: "免费额度已耗尽，今日自动修改停止。",
      },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "剧本工作台", exact: true }).click();
  await page.getByLabel("Gemini 个人访问码").fill(code);
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "AI 修改本场剧本", exact: true })
    .click();
  await expect(page.locator(".gemini-status")).toContainText("免费额度已耗尽");
  await expect(
    page.getByRole("button", { name: "AI 修改本场剧本", exact: true }),
  ).toBeDisabled();
  for (let i = 1; i <= 3; i++) {
    await page
      .getByLabel(`AI 修改结果 ${i}`, { exact: true })
      .fill(`继续手动粘贴 ${i}`);
  }
  expect(calls).toBe(1);
});
test("missing safe server configuration disables only Gemini automation", async ({
  page,
  request,
}) => {
  await page.addInitScript(
    (s) => localStorage.setItem("framework-studio-v1", JSON.stringify(s)),
    project(),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "剧本工作台", exact: true }).click();
  await expect(page.locator(".gemini-status")).toContainText("尚未安全启用");
  await expect(
    page.getByRole("button", { name: "AI 修改本场剧本", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("AI 修改结果 1", { exact: true }).fill("手动仍可编辑");
  const r = await request.post("/api/script/gemini", {
    headers: { Origin: "http://127.0.0.1:3000" },
    data: { text },
  });
  expect(r.status()).toBe(503);
  expect((await r.json()).code).toBe("unconfigured");
});
