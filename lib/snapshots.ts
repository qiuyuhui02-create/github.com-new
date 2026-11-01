import { elapsed } from "./workflow";
import { parseStudio, type Studio } from "./model";
export type ProjectMeta = { revision: number; updatedAt: string };
export type SnapshotMeta = {
  format: "framework-studio-snapshot";
  schemaVersion: 1;
  exportedAt: string;
  revision: number;
  updatedAt: string;
};
export function validProjectMeta(x: unknown): x is ProjectMeta {
  if (!x || typeof x !== "object") return false;
  const m = x as ProjectMeta;
  return (
    Number.isSafeInteger(m.revision) &&
    m.revision >= 0 &&
    typeof m.updatedAt === "string" &&
    Number.isFinite(Date.parse(m.updatedAt))
  );
}
export function validSnapshotMeta(x: unknown): x is SnapshotMeta {
  if (!validProjectMeta(x)) return false;
  const m = x as SnapshotMeta;
  return (
    m.format === "framework-studio-snapshot" &&
    m.schemaVersion === 1 &&
    typeof m.exportedAt === "string" &&
    Number.isFinite(Date.parse(m.exportedAt))
  );
}
export function editProject(
  data: Studio,
  changes: Partial<Studio>,
  now = new Date().toISOString(),
): Studio {
  if (
    Object.entries(changes).every(
      ([key, value]) =>
        JSON.stringify(data[key as keyof Studio]) === JSON.stringify(value),
    )
  )
    return data;
  return {
    ...data,
    ...changes,
    meta: {
      revision: (data.meta?.revision || data.snapshot?.revision || 0) + 1,
      updatedAt: now,
    },
  };
}
export function createSnapshot(
  data: Studio,
  now = new Date().toISOString(),
): Studio {
  const valid = parseStudio(data),
    meta = valid.meta || { revision: 0, updatedAt: now };
  const copy = structuredClone(valid);
  if (copy.timer?.active)
    copy.timer.active = {
      ...copy.timer.active,
      elapsedMs: elapsed(copy.timer.active, Date.parse(now)),
      runningSince: null,
    };
  return {
    ...copy,
    snapshot: {
      format: "framework-studio-snapshot",
      schemaVersion: 1,
      exportedAt: now,
      revision: meta.revision,
      updatedAt: meta.updatedAt,
    },
  };
}
export const timestamp = (s?: string) =>
  s
    ? new Date(s).toLocaleString("zh-CN", { hour12: false })
    : "未知（旧版 JSON 未记录）";
