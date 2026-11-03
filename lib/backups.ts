import { parseStudio, type Studio } from "./model";
import { createSnapshot } from "./snapshots";
import { chaptersOf } from "./screenplay-structure";
export const MAX_BACKUP_BYTES = 100 * 1024 * 1024;
export const BACKUP_INTERVAL_MS = 3 * 24 * 60 * 60 * 1000;
export type BackupReceipt = {
  firstSeenAt: string;
  generatedAt?: string;
  confirmedAt?: string;
};
const date = (s: unknown): s is string =>
  typeof s === "string" && Number.isFinite(Date.parse(s));
export function validReceipt(x: unknown): x is BackupReceipt {
  if (!x || typeof x !== "object") return false;
  const r = x as BackupReceipt;
  return (
    date(r.firstSeenAt) &&
    (r.generatedAt === undefined || date(r.generatedAt)) &&
    (r.confirmedAt === undefined || date(r.confirmedAt))
  );
}
export function backupDue(r: BackupReceipt, now = Date.now()) {
  return now - Date.parse(r.confirmedAt || r.firstSeenAt) >= BACKUP_INTERVAL_MS;
}
export function backupJSON(data: Studio, now = new Date().toISOString()) {
  const raw = JSON.stringify(createSnapshot(data, now), null, 2);
  if (new TextEncoder().encode(raw).length > MAX_BACKUP_BYTES)
    throw Error(
      "完整备份超过100MB，已停止生成，项目未改动；请保留浏览器数据并另行整理备份",
    );
  return raw;
}
export function decodeBackup(raw: string): Studio {
  let value: unknown;
  try {
    value = JSON.parse(raw.replace(/^\uFEFF/, ""));
  } catch {
    throw Error("JSON 文件无法解析，可能未下载完整或不是 JSON。原项目未修改。");
  }
  if (
    value &&
    typeof value === "object" &&
    ("projects" in value || Array.isArray(value))
  )
    throw Error(
      "目前只支持单项目 JSON 备份，请选择单个完整项目；不会只导入其中一部分。",
    );
  // Older protected-cache exports used {data, version}; unwrap only this known shape.
  if (
    value &&
    typeof value === "object" &&
    !("assets" in value) &&
    "data" in value &&
    "version" in value
  )
    value = (value as { data: unknown }).data;
  try {
    return parseStudio(value);
  } catch {
    throw Error(
      "备份结构或关联格式无效，可能缺少必要字段、存在重复 ID，或来自不支持的版本。原项目未修改，请选择完整备份。",
    );
  }
}
export async function readBackupFile(file: File) {
  if (file.size > MAX_BACKUP_BYTES)
    throw Error("备份超过 100MB，已停止读取；原项目未修改。");
  return decodeBackup(await file.text());
}
export function backupSummary(data: Studio) {
  const referenced = new Set<string>();
  function visit(x: unknown) {
    if (typeof x === "string") {
      for (const m of x.matchAll(/local:([a-zA-Z0-9_-]+)/g))
        referenced.add(m[1]);
    } else if (x && typeof x === "object") Object.values(x).forEach(visit);
  }
  visit([data.assets, data.shots, data.videoJobs]);
  return {
    projects: 1,
    name: data.projectName || "未命名电影项目",
    chapters: data.script ? chaptersOf(data.script).length : 0,
    scenes: data.script?.scenes.length || 0,
    archivedChapters: data.script?.archivedChapters?.length || 0,
    archivedScenes:
      (data.script?.archivedScenes?.length || 0) +
      (data.script?.archivedChapters || []).reduce(
        (n, e) => n + e.scenes.length,
        0,
      ),
    shots: data.shots.length,
    assets: data.assets.length,
    prompts: data.prompts.length,
    videoJobs: data.videoJobs?.length || 0,
    tasks: data.tasks.length,
    previews: Object.keys(data.previews || {}).length,
    missingPreviews: [...referenced].filter((id) => !data.previews?.[id])
      .length,
    exportedAt: data.snapshot?.exportedAt,
    updatedAt: data.meta?.updatedAt || data.snapshot?.updatedAt,
  };
}
