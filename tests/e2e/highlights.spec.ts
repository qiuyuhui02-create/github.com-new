import { test, expect, type Page, type Locator } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { seed } from "../../lib/model";
import { importScreenplay, confirmScene } from "../../lib/screenplay";
const raw = "林：光を待つ。\n她：请保留这句对白。\n同じ 同じ";
function fixture(text = raw) {
  const d = structuredClone(seed);
  d.assets.push({ ...d.assets[0], id: "existing-seven" });
  d.script = importScreenplay(text, "日本語");
  d.script.scenes[0] = confirmScene(d.script.scenes[0], "独立定稿");
  if (text.includes("\r")) {
    d.script.scenes[0].draft = text;
    d.script.scenes[0].original = text;
    d.script.scenes[0].versions[0].text = text;
  }
  d.shots[0].sourceSceneId = d.script.scenes[0].id;
  return d;
}
async function open(page: Page, text = raw) {
  const data = fixture(text);
  await page.addInitScript((d) => {
    if (!localStorage.getItem("framework-studio-v1"))
      localStorage.setItem("framework-studio-v1", JSON.stringify(d));
  }, data);
  await page.goto("/");
  await page.getByRole("button", { name: "剧本工作台", exact: true }).click();
  return data;
}
async function range(editor: Locator, start: number, end: number) {
  await editor.focus();
  await editor.evaluate(
    (el, p) => {
      const t = el as HTMLTextAreaElement;
      t.setSelectionRange(p.start, p.end);
      t.dispatchEvent(new Event("select", { bubbles: true }));
    },
    { start, end },
  );
}
async function color(page: Page, name: string) {
  await page.getByRole("button", { name: "荧光笔", exact: true }).click();
  await page.getByRole("button", { name: name + "标注", exact: true }).click();
}
async function scene(page: Page) {
  return page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("framework-studio-v1")!).script.scenes[0],
  );
}
test.use({ viewport: { width: 1440, height: 1000 } });
test("native drag selection highlights only selected text, keeps DOM/caret, supports notes, overlap, hide, recolor and remove", async ({
  page,
  context,
  browserName,
}) => {
  if (browserName === "chromium")
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await open(page);
  const editor = page.getByLabel("场景修改稿", { exact: true });
  await editor.evaluate((el) => {
    (window as any).__originalEditor = el;
    el.scrollIntoView({ block: "center" });
    (el as HTMLTextAreaElement).scrollTop = 0;
  });
  const point = await editor.evaluate((el) => {
    const r = el.getBoundingClientRect(),
      c = getComputedStyle(el);
    return {
      x: r.x + parseFloat(c.paddingLeft) + 1,
      y: r.y + parseFloat(c.paddingTop) + parseFloat(c.lineHeight) / 2 + 1,
    };
  });
  await page.mouse.move(point.x + 32, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + 96, point.y, { steps: 14 });
  await page.mouse.up();
  const selected = await editor.evaluate((el) => {
    const e = el as HTMLTextAreaElement;
    return {
      start: e.selectionStart,
      end: e.selectionEnd,
      text: e.value.slice(e.selectionStart, e.selectionEnd),
    };
  });
  expect(selected.text.length).toBeGreaterThan(0);
  expect(selected.text).not.toContain("\n");
  await color(page, "黄色");
  const saved = await scene(page);
  expect(saved.highlights[0].quote).toBe(selected.text);
  expect(saved.highlights[0].start).toBe(selected.start);
  expect(saved.draft).toBe(raw);
  expect(saved.original).toBe(raw);
  expect(saved.final.text).toBe("独立定稿");
  expect(
    await editor.evaluate((el) => el === (window as any).__originalEditor),
  ).toBe(true);
  expect(
    await editor.evaluate((el) => (el as HTMLTextAreaElement).selectionStart),
  ).toBe(selected.start);
  await expect(page.locator('mark[data-color="yellow"]')).toContainText(
    selected.text,
  );
  expect(
    await editor.evaluate((el) => getComputedStyle(el).backgroundColor),
  ).toBe("rgba(0, 0, 0, 0)");
  expect(
    await page
      .locator('[aria-hidden="true"]')
      .filter({ has: page.locator("mark") })
      .evaluate((el) => getComputedStyle(el).pointerEvents),
  ).toBe("none");
  await page.getByText("标注 1 条", { exact: true }).click();
  const row = page.locator("[data-annotation-id]").first();
  await row.getByRole("textbox").fill("这里修改对白 / カメラ");
  await row.getByRole("combobox").selectOption("green");
  await expect(page.locator('mark[data-color="green"]')).toHaveCount(1);
  await page.getByRole("button", { name: "隐藏全部标注", exact: true }).click();
  await expect(page.locator("mark[data-color]")).toHaveCount(0);
  await page.getByRole("button", { name: "显示全部标注", exact: true }).click();
  await expect(page.locator('mark[data-color="green"]')).toHaveCount(1);
  await range(editor, selected.start, Math.min(selected.end + 2, raw.length));
  await color(page, "粉色");
  expect((await scene(page)).highlights).toHaveLength(2);
  await expect(page.locator('mark[data-color="pink"]')).toBeVisible();
  if (browserName === "chromium") {
    await editor.press("Control+a");
    await editor.press("Control+c");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(raw);
  }
  await page
    .locator("[data-annotation-id]")
    .last()
    .getByRole("button", { name: "取消标注", exact: true })
    .click();
  expect((await scene(page)).highlights).toHaveLength(1);
  await expect(page.locator('mark[data-color="green"]')).toHaveCount(1);
  await page.reload();
  await page.getByRole("button", { name: "剧本工作台", exact: true }).click();
  await expect(page.locator('mark[data-color="green"]')).toHaveCount(1);
  expect((await scene(page)).highlights[0].note).toBe("这里修改对白 / カメラ");
  await page.screenshot({
    path: "test-results/highlights-desktop.png",
    fullPage: true,
  });
});
test("native repeated-word insertion follows exact range; overlapping deletion and AI replacement require review, undo restores positions", async ({
  page,
}) => {
  await open(page);
  const editor = page.getByLabel("场景修改稿", { exact: true }),
    start = raw.lastIndexOf("同じ");
  await range(editor, start, start + 2);
  await color(page, "蓝色");
  const id = (await scene(page)).highlights[0].id;
  await range(editor, 0, 0);
  await page.keyboard.insertText("新：");
  expect((await scene(page)).highlights[0].start).toBe(start + 2);
  expect((await scene(page)).highlights[0].status).toBe("active");
  await range(editor, start + 2, start + 4);
  await editor.press("Backspace");
  await expect(
    page.getByRole("status").filter({ hasText: "需重新确认" }),
  ).toBeVisible();
  await expect(page.locator("mark[data-color]")).toHaveCount(0);
  await editor.press("Control+z");
  await expect(page.locator('mark[data-color="blue"]')).toHaveCount(1);
  expect((await scene(page)).highlights[0].start).toBe(start + 2);
  await page.getByRole("button", { name: "AI 版本对比", exact: true }).click();
  await page
    .getByLabel("AI 修改结果 1", { exact: true })
    .fill("完全不同的修改稿。");
  page.on("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "采用全文", exact: true }).click();
  await page.getByRole("button", { name: "正文编辑", exact: true }).click();
  await expect(page.locator("mark[data-color]")).toHaveCount(0);
  expect((await scene(page)).highlights[0].status).toBe("review");
  await page.getByRole("button", { name: "撤销最近修改", exact: true }).click();
  await expect(page.locator('mark[data-color="blue"]')).toHaveCount(1);
  expect((await scene(page)).highlights[0].id).toBe(id);
  expect((await scene(page)).final.text).toBe("独立定稿");
  await page.getByRole("button", { name: "AI 版本对比", exact: true }).click();
  await page.getByRole("button", { name: "切换双栏", exact: true }).click();
  await page.getByLabel("对照来源", { exact: true }).selectOption("draft");
  const target = page.getByLabel("对照正文", { exact: true }),
    candidate = page.getByLabel("AI 修改结果 1", { exact: true });
  await range(target, 0, 2);
  await candidate.fill("不同人物");
  await range(candidate, 0, 4);
  await page.getByLabel("采用方式", { exact: true }).selectOption("replace");
  await page.getByRole("button", { name: "采用选中文字", exact: true }).click();
  expect((await scene(page)).highlights[0].status).toBe("active");
  expect((await scene(page)).highlights[0].start).toBe(start + 4);
});
test("manual re-confirmation uses a fresh selection and preserves note and annotation ID", async ({
  page,
}) => {
  await open(page);
  const editor = page.getByLabel("场景修改稿", { exact: true });
  await range(editor, 2, 6);
  await color(page, "黄色");
  const id = (await scene(page)).highlights[0].id;
  await page.getByText("标注 1 条", { exact: true }).click();
  await page
    .locator(`[data-annotation-id="${id}"]`)
    .getByRole("textbox")
    .fill("备注不会丢失");
  await range(editor, 2, 6);
  await page.keyboard.insertText("完全改写");
  await expect(page.locator("mark[data-color]")).toHaveCount(0);
  await range(editor, 2, 6);
  await page
    .getByRole("button", { name: "用当前选区重新确认", exact: true })
    .click();
  const s = await scene(page);
  expect(s.highlights[0].id).toBe(id);
  expect(s.highlights[0].quote).toBe("完全改写");
  expect(s.highlights[0].note).toBe("备注不会丢失");
  expect(s.highlights[0].status).toBe("active");
  await expect(page.locator('mark[data-color="yellow"]')).toContainText(
    "完全改写",
  );
});
test("large-script scroll/resize and composition keep plain native text; JSON restores marks, histories and seven sample assets", async ({
  page,
  browser,
}) => {
  test.setTimeout(60000);
  const text = raw + "\n" + "中文と日本語の台詞。\n".repeat(500);
  const initial = await open(page, text);
  const editor = page.getByLabel("场景修改稿", { exact: true });
  await range(editor, 2, 6);
  await color(page, "绿色");
  await page
    .getByRole("button", { name: "保存工作稿版本", exact: true })
    .click();
  await editor.evaluate((el) => {
    const t = el as HTMLTextAreaElement;
    t.style.height = "480px";
    t.scrollTop = 280;
    t.dispatchEvent(new Event("scroll"));
  });
  await expect
    .poll(() =>
      page
        .locator('[aria-hidden="true"]')
        .filter({ has: page.locator("mark") })
        .locator("div")
        .evaluate((el) => el.style.transform),
    )
    .toContain("-280px");
  expect(await editor.evaluate((el) => el.clientWidth)).toBe(
    await page
      .locator('[aria-hidden="true"]')
      .filter({ has: page.locator("mark") })
      .evaluate((el) => parseFloat(el.style.width)),
  );
  // Composition events exercise our no-value-assignment guard; real OS IME remains manual acceptance.
  await editor.dispatchEvent("compositionstart", { data: "" });
  await expect(page.locator("mark[data-color]")).toHaveCount(0);
  await range(editor, text.length, text.length);
  await page.keyboard.insertText("日本語の追記");
  await editor.dispatchEvent("compositionend", { data: "日本語の追記" });
  await expect(editor).toHaveValue(text + "日本語の追記");
  expect((await scene(page)).highlights[0].status).toBe("active");
  await page.getByRole("button", { name: "隐藏全部标注", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出项目", exact: true }).click();
  const rawJSON = await readFile((await (await download).path())!, "utf8"),
    backup = JSON.parse(rawJSON);
  expect(backup.script.scenes[0].highlights).toHaveLength(1);
  expect(
    backup.script.scenes[0].versions.some(
      (v: { highlights?: unknown[] }) => v.highlights?.length,
    ),
  ).toBeTruthy();
  expect(backup.assets).toEqual(initial.assets);
  const fresh = await browser.newContext();
  try {
    const p = await fresh.newPage();
    await p.goto("http://127.0.0.1:3000/");
    await p.getByRole("button", { name: "云端设置", exact: true }).click();
    p.on("dialog", (d) => d.accept());
    await p.getByLabel("导入项目备份到本地").setInputFiles({
      name: "highlights.json",
      mimeType: "application/json",
      buffer: Buffer.from(rawJSON),
    });
    // Backup UI belongs to main / separate PR #11; do not port that implementation here.
    const importPreview = p.getByRole("dialog", {
      name: "导入备份预览",
      exact: true,
    });
    await expect
      .poll(
        async () =>
          (await importPreview.isVisible()) ||
          (await p
            .locator(".toast")
            .filter({ hasText: "已导入项目" })
            .isVisible()),
      )
      .toBe(true);
    if (await importPreview.isVisible())
      await p
        .getByRole("button", { name: "确认覆盖当前本地项目", exact: true })
        .click();
    await expect(p.locator(".toast")).toContainText("已导入项目");
    const settings = p.getByRole("dialog", {
      name: "项目与云端设置",
      exact: true,
    });
    if (await settings.isVisible())
      await settings
        .getByRole("button", { name: "关闭窗口", exact: true })
        .click();
    await p.getByRole("button", { name: "剧本工作台", exact: true }).click();
    await expect(p.locator("mark[data-color]")).toHaveCount(0);
    await p.getByRole("button", { name: "显示全部标注", exact: true }).click();
    await expect(p.locator('mark[data-color="green"]')).toHaveCount(1);
    expect((await scene(p)).highlights).toEqual(
      backup.script.scenes[0].highlights,
    );
    expect((await scene(p)).draft).toBe(text + "日本語の追記");
  } finally {
    await fresh.close();
  }
});

test("CRLF import offsets remain aligned and original text stays exact through marking, native edits and undo", async ({
  page,
}) => {
  const source = "序文\r\n彼：光を待つ。\r\n她：中文台词。",
    native = source.replace(/\r\n/g, "\n");
  await open(page, source);
  const editor = page.getByLabel("场景修改稿", { exact: true });
  await expect(editor).toHaveValue(native);
  const start = native.indexOf("光");
  await range(editor, start, start + 4);
  await color(page, "蓝色");
  expect((await scene(page)).draft).toBe(source);
  expect((await scene(page)).highlights[0].start).toBe(source.indexOf("光"));
  await expect(page.locator('mark[data-color="blue"]')).toHaveText("光を待つ");
  await range(editor, 0, 0);
  await page.keyboard.insertText("新");
  expect((await scene(page)).highlights[0].start).toBe(
    ("新" + native).indexOf("光"),
  );
  expect((await scene(page)).highlights[0].status).toBe("active");
  expect((await scene(page)).original).toBe(source);
  await page.getByRole("button", { name: "撤销最近修改", exact: true }).click();
  expect((await scene(page)).draft).toBe(source);
  expect((await scene(page)).highlights[0].start).toBe(source.indexOf("光"));
  await expect(page.locator('mark[data-color="blue"]')).toHaveText("光を待つ");
});
