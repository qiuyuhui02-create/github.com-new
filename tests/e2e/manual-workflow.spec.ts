import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { seed } from "../../lib/model";
import { importScreenplay, confirmScene } from "../../lib/screenplay";
const original =
  "内景 自宅 — 日\n\n人物：今天也要继续。\n\n外景 公園 — 夕\n\n風が吹く。";
function fixture() {
  const s = structuredClone(seed);
  s.assets.push({
    ...s.assets[0],
    id: "existing-seven",
    name: "原有第七资产",
    image: "local:offline-seven",
    versions: [
      {
        at: "2026-01-01T00:00:00Z",
        image: "local:old-seven",
        description: "原有历史",
        model: "旧模型",
      },
    ],
  });
  s.shots[0].assets.push("existing-seven");
  s.script = importScreenplay(original, "中文");
  s.script.scenes[0] = confirmScene(
    s.script.scenes[0],
    s.script.scenes[0].original,
  );
  return s;
}
test("manual script: common prompt clipboard, selected paragraph adoption, undo, final isolation and reload", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const initial = fixture();
  await page.addInitScript((s) => {
    if (!localStorage.getItem("framework-studio-v1"))
      localStorage.setItem("framework-studio-v1", JSON.stringify(s));
  }, initial);
  let ai = 0;
  await page.route(
    /generativelanguage|api\.openai|openrouter|anthropic|\/api\/script|\/api\/agent/,
    (route) => {
      ai++;
      return route.abort();
    },
  );
  await page.goto("/");
  await page.getByRole("button", { name: "剧本工作台", exact: true }).click();
  await expect(page.getByLabel("场景修改稿", { exact: true })).toHaveValue(
    initial.script!.scenes[0].draft,
  );
  await page.getByRole("button", { name: "AI 版本对比", exact: true }).click();
  await expect(
    page.getByRole("tab", { name: "ChatGPT", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.getByText("更多：修改要求与版本", { exact: true }).click();
  await page
    .getByLabel("统一修改要求", { exact: true })
    .fill("自然对白，保留日本語，简化解释性台词。");
  await page
    .getByRole("button", { name: "复制统一修改提示", exact: true })
    .click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain("自然对白，保留日本語");
  expect(copied).toContain("人物：今天也要继续");
  expect(copied).not.toContain("風が吹く");
  const candidate = page.getByLabel("AI 修改结果 1", { exact: true });
  await candidate.fill("人物：新的手动候选。\n\n不要自动采用第二段。");
  await expect(page.getByLabel("场景修改稿", { exact: true })).toHaveCount(0);
  await candidate.focus();
  await candidate.press("Control+Home");
  await candidate.press("Shift+End");
  await page.getByRole("button", { name: "采用选中文字", exact: true }).click();
  await page.getByRole("button", { name: "正文编辑", exact: true }).click();
  await expect(page.getByLabel("场景修改稿", { exact: true })).toHaveValue(
    initial.script!.scenes[0].draft + "\n\n人物：新的手动候选。",
  );
  await page.getByRole("button", { name: "正文编辑", exact: true }).click();
  await page.getByRole("button", { name: "撤销最近修改", exact: true }).click();
  await expect(page.getByLabel("场景修改稿", { exact: true })).toHaveValue(
    initial.script!.scenes[0].draft,
  );
  await page.getByRole("button", { name: "AI 版本对比", exact: true }).click();
  await page.getByText("更多：修改要求与版本", { exact: true }).click();
  await page
    .getByRole("button", { name: "保存当前候选版本", exact: true })
    .click();
  await page.getByRole("button", { name: "正文编辑", exact: true }).click();
  await page.getByLabel("场景修改稿", { exact: true }).fill("单独的人工改写");
  await page.getByText("更多：原稿、差异与历史", { exact: true }).click();
  await page.getByRole("button", { name: "修改差异", exact: true }).click();
  await expect(page.locator(".diff-row.changed").first()).toBeVisible();
  await page.getByRole("button", { name: "确认定稿", exact: true }).click();
  await expect(page.locator(".final-text")).toHaveText(
    initial.script!.scenes[0].final!.text,
  );
  await page.reload();
  await page.getByRole("button", { name: "剧本工作台", exact: true }).click();
  await page.getByRole("button", { name: "AI 版本对比", exact: true }).click();
  await page.getByText("更多：修改要求与版本", { exact: true }).click();
  await expect(page.getByLabel("统一修改要求", { exact: true })).toHaveValue(
    "自然对白，保留日本語，简化解释性台词。",
  );
  await expect(candidate).toHaveValue(
    "人物：新的手动候选。\n\n不要自动采用第二段。",
  );
  await page.getByRole("button", { name: "正文编辑", exact: true }).click();
  await page.getByRole("button", { name: "撤销最近修改", exact: true }).click();
  await expect(page.getByLabel("场景修改稿", { exact: true })).toHaveValue(
    initial.script!.scenes[0].draft,
  );
  expect(ai).toBe(0);
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("framework-studio-v1")!),
  );
  expect(saved.assets).toEqual(initial.assets);
  expect(saved.script.original).toEqual(initial.script!.original);
  expect(saved.script.scenes[0].final).toEqual(initial.script!.scenes[0].final);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/manual-script.png",
    fullPage: true,
  });
});
test("manual shot, nine-grid order and four independent video references survive full backup and phone import", async ({
  page,
  browser,
}) => {
  test.setTimeout(60000);
  const initial = fixture();
  for (let n = 4; n <= 11; n++)
    initial.shots.push({
      ...initial.shots[0],
      id: "shot" + n,
      number: `SH-${String(n).padStart(3, "0")}`,
      title: "预留镜头" + n,
    });
  await page.addInitScript((s) => {
    if (!localStorage.getItem("framework-studio-v1"))
      localStorage.setItem("framework-studio-v1", JSON.stringify(s));
  }, initial);
  await page.goto("/");
  await page.getByRole("button", { name: "剧本工作台", exact: true }).click();
  await page
    .getByRole("button", { name: "手动新建本场镜头", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("镜头名称", { exact: true }).fill("人工规划的庭院镜头");
  await page.getByLabel("构图", { exact: true }).fill("三分法，留出空镜空间");
  await page
    .getByLabel("环境音与音效说明", { exact: true })
    .fill("风声、远处脚步声");
  const png = {
    name: "story.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
      "base64",
    ),
  };
  await page.getByLabel("分镜参考图", { exact: true }).setInputFiles(png);
  await expect(page.locator(".operation-overlay")).toHaveCount(0);
  await page.getByRole("button", { name: "保存分镜", exact: true }).click();
  await page.getByRole("button", { name: "九宫格总览", exact: true }).click();
  await expect(page.locator(".nine-grid .shot-card")).toHaveCount(9);
  await page.getByRole("button", { name: "下一组九宫格", exact: true }).click();
  await expect(page.locator(".nine-grid .shot-card")).toHaveCount(3);
  await expect(page.locator(".nine-placeholder")).toHaveCount(6);
  await page
    .locator(".nine-grid .shot-card")
    .last()
    .getByRole("button", { name: "前移", exact: true })
    .click();
  await expect(page.locator(".nine-grid .shot-card").nth(1)).toContainText(
    "人工规划的庭院镜头",
  );
  await page
    .locator(".nine-grid .shot-card")
    .nth(1)
    .getByRole("button", { name: "后移", exact: true })
    .click();
  await expect(page.locator(".nine-grid .shot-card").last()).toContainText(
    "人工规划的庭院镜头",
  );
  await expect(
    page.locator(".nine-grid .shot-card").last().locator("img"),
  ).toBeVisible();
  let saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("framework-studio-v1")!),
  );
  const shot = saved.shots.find(
    (s: { title: string }) => s.title === "人工规划的庭院镜头",
  );
  expect(shot.sourceSceneId).toBe(initial.script!.scenes[0].id);
  await page
    .getByRole("button", { name: "视频提示词与制作", exact: true })
    .click();
  await page
    .getByLabel("为分镜新建视频制作任务", { exact: true })
    .selectOption(shot.id);
  for (const field of ["首帧素材", "尾帧素材", "分镜图参考", "人物参考图"])
    await expect(page.getByLabel(field, { exact: true })).toHaveValue("");
  await page
    .getByRole("button", { name: "仅登记此镜头的分镜图引用", exact: true })
    .click();
  await expect(page.getByLabel("分镜图参考", { exact: true })).toHaveValue(
    shot.image,
  );
  await expect(page.getByLabel("首帧素材", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("尾帧素材", { exact: true })).toHaveValue("");
  for (const [label, name] of [
    ["上传首帧素材", "first.png"],
    ["上传尾帧素材", "last.png"],
    ["上传人物参考图", "person.png"],
  ]) {
    await page
      .getByLabel(label, { exact: true })
      .setInputFiles({ ...png, name });
    await expect(page.locator(".operation-overlay")).toHaveCount(0);
  }
  await page.getByLabel("视频模型", { exact: true }).fill("WAN 外部手动");
  await page
    .getByLabel("视频 Prompt", { exact: true })
    .fill("缓缓推进，庭院自然光，风吹过人物衣角。");
  await page.getByLabel("视频文件名", { exact: true }).fill("garden-v1.mp4");
  await page
    .getByLabel("SSD 视频相对路径", { exact: true })
    .fill("videos/garden-v1.mp4");
  await page.getByRole("button", { name: "保存生成版本", exact: true }).click();
  await expect(page.locator(".video-version")).toHaveCount(1);
  saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("framework-studio-v1")!),
  );
  const job = saved.videoJobs[0],
    version = job.versions[0];
  expect(
    new Set([
      job.firstFrame,
      job.lastFrame,
      job.storyboardReference,
      job.characterReferences,
    ]).size,
  ).toBe(4);
  expect(version.firstFrame).toBe(job.firstFrame);
  expect(version.storyboardReference).toBe(shot.image);
  await page.getByLabel("首帧素材", { exact: true }).fill("只修改当前首帧.png");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出项目", exact: true }).click();
  const raw = await readFile((await (await download).path())!, "utf8"),
    backup = JSON.parse(raw);
  expect(backup.assets).toEqual(initial.assets);
  expect(backup.videoJobs[0].versions[0].firstFrame).toBe(version.firstFrame);
  expect(backup.videoJobs[0].firstFrame).toBe("只修改当前首帧.png");
  expect(backup.shots.find((s: { id: string }) => s.id === shot.id).image).toBe(
    shot.image,
  );
  expect(backup.previews).toBeTruthy();
  await page.reload();
  await page
    .getByRole("button", { name: "视频提示词与制作", exact: true })
    .click();
  await expect(page.getByLabel("首帧素材", { exact: true })).toHaveValue(
    "只修改当前首帧.png",
  );
  await expect(page.getByLabel("分镜图参考", { exact: true })).toHaveValue(
    shot.image,
  );
  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  try {
    const mobile = await phone.newPage();
    await mobile.goto("http://127.0.0.1:3000/");
    await mobile.getByLabel("手机导入项目快照").setInputFiles({
      name: "manual.json",
      mimeType: "application/json",
      buffer: Buffer.from(raw),
    });
    await mobile
      .getByRole("button", { name: "确认覆盖当前本地项目", exact: true })
      .click();
    await expect(mobile.locator(".toast")).toContainText("项目快照已导入");
    await mobile.getByRole("button", { name: "Prompt", exact: true }).click();
    const video = mobile
      .locator(".reader-content .panel")
      .filter({ hasText: "视频 Prompt" });
    await video.getByText("首尾帧与参考素材", { exact: true }).click();
    await expect(video).toContainText("只修改当前首帧.png");
    await expect(video).toContainText("人物图：");
  } finally {
    await phone.close();
  }
});
