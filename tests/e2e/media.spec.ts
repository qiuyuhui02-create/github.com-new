import { test, expect } from "@playwright/test";
import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import path from "node:path";
test("local manifest survives reload, folder verification detects missing and relocation rejects wrong file", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "本地素材库", exact: true }).click();
  const bytes = Buffer.from("local-media-original");
  await page
    .locator(".upload-button")
    .filter({ hasText: "登记本地文件" })
    .locator("input")
    .setInputFiles({
      name: "video.mov",
      mimeType: "video/quicktime",
      buffer: bytes,
    });
  await expect(page.locator(".media-records article")).toHaveCount(1);
  const metadata = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("framework-studio-v1")!),
  );
  const entry = metadata.files[0];
  expect(entry.sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(JSON.stringify(metadata)).not.toContain("data:");
  expect(entry.relativePath).not.toContain("/Users/");
  await page.reload();
  await page.getByRole("button", { name: "本地素材库", exact: true }).click();
  await expect(page.locator(".media-records")).toContainText("未连接");
  await mkdir("work", { recursive: true });
  const folder = await mkdtemp(path.resolve("work/media-fixture-"));
  try {
    await mkdir(path.dirname(path.join(folder, entry.relativePath)), {
      recursive: true,
    });
    await writeFile(path.join(folder, entry.relativePath), bytes);
    await page.locator("input[webkitdirectory]").setInputFiles(folder);
    await expect(page.locator(".media-records")).toContainText("已校验");
    await rm(path.join(folder, entry.relativePath));
    await writeFile(path.join(folder, "other.txt"), "unrelated");
    await page.locator("input[webkitdirectory]").setInputFiles(folder);
    await expect(page.locator(".media-records")).toContainText(
      "所选目录未找到",
    );
    page.on("dialog", (d) => d.accept("moved/video.mov"));
    await page.locator(".media-records .upload-button input").setInputFiles({
      name: "wrong.mov",
      mimeType: "video/quicktime",
      buffer: Buffer.from("wrong"),
    });
    await expect(page.locator(".toast")).toContainText("文件校验不符");
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("SSD directory selection registers existing relative paths without copying, and reconnect preserves metadata", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "本地素材库", exact: true }).click();
  await expect(page.locator(".media-library")).toContainText("素材未连接");
  await mkdir("work", { recursive: true });
  const folder = await mkdtemp(path.resolve("work/ssd-registration-"));
  const relative = "OriginalProjects/日文项目/v2/shot.mov";
  const original = Buffer.from("original-video-data");
  try {
    await mkdir(path.dirname(path.join(folder, relative)), { recursive: true });
    await writeFile(path.join(folder, relative), original);
    await page.locator("input[webkitdirectory]").setInputFiles(folder);
    await expect(page.getByLabel("目录中的素材（可多选）")).toBeVisible();
    await page
      .getByRole("combobox", { name: "素材用途", exact: true })
      .selectOption("生成视频");
    await page
      .getByRole("combobox", { name: "关联资产", exact: true })
      .selectOption("a1");
    await page.getByLabel("目录中的素材（可多选）").selectOption([relative]);
    await page
      .getByRole("button", { name: "登记所选目录素材（1）", exact: true })
      .click();
    await expect(page.locator(".media-records article")).toHaveCount(1);
    const before = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("framework-studio-v1")!),
    );
    expect(before.files[0].relativePath).toBe(relative);
    expect(before.files[0].assetId).toBe("a1");
    expect(JSON.stringify(before)).not.toContain(folder);
    await page.getByLabel("目录中的素材（可多选）").selectOption([relative]);
    await page
      .getByRole("button", { name: "登记所选目录素材（1）", exact: true })
      .click();
    await expect(page.locator(".toast")).toContainText("重连已有 1 项");
    const after = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("framework-studio-v1")!),
    );
    expect(after).toEqual(before);
    await page.getByRole("button", { name: "断开本次素材连接" }).click();
    await expect(page.locator(".media-records")).toContainText("素材未连接");
    await expect(page.locator(".media-records")).not.toContainText(
      "所选目录未找到",
    );
    expect(
      await import("node:fs/promises").then((fs) =>
        fs.readFile(path.join(folder, relative)),
      ),
    ).toEqual(original);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
