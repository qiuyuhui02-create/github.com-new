import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { seed } from "../../lib/model";
import { confirmScene, importScreenplay } from "../../lib/screenplay";
import { addChapter, moveScene } from "../../lib/screenplay-structure";
function fixture() {
  const data = structuredClone(seed);
  let s = importScreenplay(
    "内景 家 — 日\n彼：原稿。\n外景 公園 — 夜\n彼女：待って。",
    "日本語",
  );
  s.scenes = s.scenes.map((v) =>
    confirmScene(
      {
        ...v,
        manualComparisons: [
          { model: "ChatGPT", text: "AI first paragraph\n第二段。" },
          { model: "Gemini", text: "Gemini 独立" },
          { model: "Claude", text: "Claude 独立" },
        ],
      },
      "正式定稿",
    ),
  );
  const a = addChapter(s, "序幕");
  s = a.script;
  for (const v of [...s.scenes]) s = moveScene(s, v.id, a.chapter.id);
  data.script = s;
  data.shots[0].sourceSceneId = s.scenes[0].id;
  data.shots[0].sourceFinalRevision = s.scenes[0].final!.revision;
  return data;
}
test("native long-text clipboard, selection retention, explicit replacement, undo, independent platforms and focus mode", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const initial = fixture();
  await page.addInitScript((s) => {
    if (!localStorage.getItem("framework-studio-v1"))
      localStorage.setItem("framework-studio-v1", JSON.stringify(s));
  }, initial);
  let requests = 0;
  await page.route(
    /generativelanguage|api\.openai|openrouter|anthropic/,
    (r) => {
      requests++;
      return r.abort();
    },
  );
  await page.goto("/");
  await expect(page).toHaveTitle(/aikari/);
  await expect(page.getByRole("link", { name: "aikari 首页" })).toBeVisible();
  await page.getByRole("button", { name: "剧本工作台", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "正文编辑", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "AI 版本对比", exact: true }).click();
  const editor = page.getByLabel("AI 修改结果 1", { exact: true });
  await expect(editor).toBeVisible();
  expect((await editor.boundingBox())!.height).toBeGreaterThanOrEqual(450);
  await expect(page.getByLabel("AI 修改结果 2", { exact: true })).toBeHidden();
  const long =
    "ALPHA paragraph for mouse selection.\n\n" +
    "日文と中文の長い台詞。\n".repeat(6000);
  await page.evaluate((text) => navigator.clipboard.writeText(text), long);
  await editor.focus();
  await editor.press("Control+a");
  await editor.press("Control+v");
  await expect(editor).toHaveValue(long);
  await editor.press("Control+a");
  await editor.press("Control+c");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(long);
  // Real mouse drag, not a synthetic select event. Autosave must leave the same node and range.
  await editor.press("Control+Home");
  await editor.scrollIntoViewIfNeeded();
  await editor.evaluate((el) => {
    const e = el as HTMLTextAreaElement;
    e.scrollTop = 0;
  });
  const box = (await editor.boundingBox())!;

  await page.mouse.move(box.x + 26, box.y + 40);
  await page.mouse.down();
  await page.mouse.move(box.x + 110, box.y + 40, { steps: 12 });
  await page.mouse.up();
  const selected = await editor.evaluate((el) => {
    const e = el as HTMLTextAreaElement;
    return {
      text: e.value.slice(e.selectionStart, e.selectionEnd),
      start: e.selectionStart,
      end: e.selectionEnd,
    };
  });
  expect(selected.text.length).toBeGreaterThan(0);
  await page.getByRole("button", { name: "复制选中文字", exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    selected.text,
  );
  expect(
    await editor.evaluate((el) => (el as HTMLTextAreaElement).selectionStart),
  ).toBe(selected.start);
  await page.getByRole("button", { name: "采用选中文字", exact: true }).click();
  let saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("framework-studio-v1")!),
  );
  expect(saved.script.scenes[0].draft).toBe(
    initial.script!.scenes[0].draft + "\n\n" + selected.text,
  );
  await page.getByRole("button", { name: "撤销采用", exact: true }).click();
  await page.getByRole("button", { name: "切换双栏", exact: true }).click();
  await page.getByLabel("对照来源", { exact: true }).selectOption("draft");
  const work = page.getByLabel("对照正文", { exact: true });
  await work.fill("TARGET\nkeep this.");
  await work.press("Control+Home");
  await work.press("Shift+End");
  await editor.focus();
  await editor.press("Control+Home");
  await editor.press("Shift+End");
  const replacement = await editor.evaluate((el) => {
    const e = el as HTMLTextAreaElement;
    return e.value.slice(e.selectionStart, e.selectionEnd);
  });
  expect(replacement.length).toBeGreaterThan(0);
  await page.getByLabel("采用方式", { exact: true }).selectOption("replace");
  await page.getByRole("button", { name: "采用选中文字", exact: true }).click();
  await expect(work).toHaveValue(replacement + "\nkeep this.");
  await page.getByRole("button", { name: "撤销采用", exact: true }).click();
  await expect(work).toHaveValue("TARGET\nkeep this.");
  // Native typing undo/redo, cut/paste and right click are not intercepted.
  await editor.press("Control+End");
  await editor.press("End");
  await editor.press("x");
  await editor.press("Control+z");
  await expect(editor).toHaveValue(long);
  await editor.press("Control+Shift+z");
  await expect(editor).toHaveValue(long + "x");
  await editor.press("Control+Home");
  await editor.press("Shift+End");
  await editor.press("Control+x");
  await editor.press("Control+v");
  await expect(editor).toHaveValue(long + "x");
  await editor.click({ button: "right" });
  await page.keyboard.press("Escape");
  for (const name of ["Gemini", "Claude", "ChatGPT"])
    await page.getByRole("tab", { name, exact: true }).click();
  await expect(editor).toHaveValue(long + "x");
  await page.getByRole("button", { name: "专注编辑", exact: true }).click();
  await expect(page.locator(".focus-mode")).toBeVisible();
  await editor.press("Escape");
  await expect(page.locator(".focus-mode")).toHaveCount(0);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "采用全文", exact: true }).click();
  await expect(work).toHaveValue(long + "x");
  await page.getByRole("button", { name: "撤销采用", exact: true }).click();
  await expect(work).toHaveValue("TARGET\nkeep this.");
  saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("framework-studio-v1")!),
  );
  expect(saved.script.scenes[0].original).toBe(
    initial.script!.scenes[0].original,
  );
  expect(saved.script.scenes[0].final).toEqual(initial.script!.scenes[0].final);
  expect(saved.script.scenes[0].manualComparisons[1]).toEqual(
    initial.script!.scenes[0].manualComparisons![1],
  );
  await page.reload();
  await page.getByRole("button", { name: "剧本工作台", exact: true }).click();
  await expect(page.getByLabel("场景修改稿", { exact: true })).toHaveValue(
    "TARGET\nkeep this.",
  );
  await page.getByRole("button", { name: "AI 版本对比", exact: true }).click();
  await expect(editor).toHaveValue(long + "x");
  expect(requests).toBe(0);
  await page.getByRole("button", { name: "切换双栏", exact: true }).click();
  await page.screenshot({
    path: "test-results/aikari-writing.png",
    fullPage: true,
  });
});
test("one chapter confirmation archives all scenes, reload and JSON restore retain IDs and other chapters", async ({
  page,
  browser,
}) => {
  const initial = fixture();
  await page.addInitScript((s) => {
    if (!localStorage.getItem("framework-studio-v1"))
      localStorage.setItem("framework-studio-v1", JSON.stringify(s));
  }, initial);
  await page.goto("/");
  await page.getByRole("button", { name: "剧本工作台", exact: true }).click();
  await page
    .getByRole("button", { name: "章节菜单 序幕", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "删除章节", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("2 个场景");
  await page.getByRole("button", { name: "确认删除章节", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".scene-select")).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "剧本工作台", exact: true }).click();
  await page.getByText("章节回收站 · 1 项", { exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出项目", exact: true }).click();
  const raw = await readFile((await (await download).path())!, "utf8"),
    backup = JSON.parse(raw);
  expect(backup.script.archivedChapters[0].scenes).toEqual(
    initial.script!.scenes,
  );
  const fresh = await browser.newContext();
  try {
    const p = await fresh.newPage();
    await p.goto("http://127.0.0.1:3000/");
    await p.getByRole("button", { name: "云端设置", exact: true }).click();
    p.on("dialog", (d) => d.accept());
    await p.getByLabel("导入项目备份到本地").setInputFiles({
      name: "aikari.json",
      mimeType: "application/json",
      buffer: Buffer.from(raw),
    });
    await expect(p.locator(".toast")).toContainText("已导入项目");
    await p.getByRole("button", { name: "关闭窗口", exact: true }).click();
    await p.getByRole("button", { name: "剧本工作台", exact: true }).click();
    await p.getByText("章节回收站 · 1 项", { exact: true }).click();
    await p.getByRole("button", { name: "恢复章节 序幕", exact: true }).click();
    const saved = await p.evaluate(() =>
      JSON.parse(localStorage.getItem("framework-studio-v1")!),
    );
    expect(saved.script.scenes).toEqual(initial.script!.scenes);
    expect(saved.script.chapters).toEqual(initial.script!.chapters);
    expect(saved.assets).toEqual(initial.assets);
    expect(saved.shots).toEqual(initial.shots);
  } finally {
    await fresh.close();
  }
});
