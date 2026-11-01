import { sha256 } from "@noble/hashes/sha2.js";
import type { Studio } from "./model";
export type MediaKind =
  "人物" | "场景" | "道具" | "参考图" | "分镜图" | "生成视频" | "最终视频";
export type LocalMedia = {
  id: string;
  relativePath: string;
  name: string;
  size: number;
  format: string;
  sha256: string;
  version: number;
  previousId?: string;
  assetId?: string;
  shotId?: string;
  kind: MediaKind;
  createdAt: string;
};
export const mediaFolders: Record<MediaKind, string> = {
  人物: "assets/characters",
  场景: "assets/environments",
  道具: "assets/props",
  参考图: "references",
  分镜图: "storyboards",
  生成视频: "videos/generated",
  最终视频: "videos/final",
};
export function safeRelative(path: string) {
  return (
    typeof path === "string" &&
    !!path &&
    path.length <= 1024 &&
    !/^(\/|\\|[A-Za-z]:|~|file:)/i.test(path) &&
    !path.includes("\\") &&
    !path.split("/").some((p) => !p || p === "." || p === "..") &&
    !/[\x00-\x1f:]/.test(path)
  );
}
export function filename(name: string) {
  return (
    name
      .normalize("NFC")
      .replace(/[\x00-\x1f/\\:]/g, "_")
      .replace(/^\.+/, "_") || "untitled"
  );
}
export async function checksum(file: Blob) {
  const hash = sha256.create();
  for (let n = 0; n < file.size; n += 4 * 1024 * 1024)
    hash.update(
      new Uint8Array(await file.slice(n, n + 4 * 1024 * 1024).arrayBuffer()),
    );
  return Array.from(hash.digest(), (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
}
export async function describeFile(
  file: File,
  kind: MediaKind,
  options: Partial<
    Pick<
      LocalMedia,
      "assetId" | "shotId" | "previousId" | "version" | "relativePath"
    >
  > = {},
): Promise<LocalMedia> {
  const id = crypto.randomUUID(),
    path =
      options.relativePath ||
      `${mediaFolders[kind]}/${id}/v${options.version || 1}/${filename(file.name)}`;
  if (!safeRelative(path)) throw Error("只允许项目内的相对路径");
  return {
    id,
    name: filename(file.name),
    relativePath: path,
    size: file.size,
    format: file.type || file.name.split(".").pop()?.toLowerCase() || "unknown",
    sha256: await checksum(file),
    kind,
    version: options.version || 1,
    createdAt: new Date().toISOString(),
    ...options,
  };
}
export function validateMedia(input: unknown): input is LocalMedia[] {
  if (!Array.isArray(input) || input.length > 10000) return false;
  const ids = new Set<string>();
  return input.every((m) => {
    if (
      !m ||
      typeof m !== "object" ||
      typeof m.id !== "string" ||
      !m.id ||
      ids.has(m.id) ||
      !safeRelative(m.relativePath) ||
      typeof m.name !== "string" ||
      typeof m.format !== "string" ||
      !Number.isSafeInteger(m.size) ||
      m.size < 0 ||
      !Number.isSafeInteger(m.version) ||
      m.version < 1 ||
      !Object.keys(mediaFolders).includes(m.kind) ||
      !/^[a-f0-9]{64}$/.test(m.sha256) ||
      !Number.isFinite(Date.parse(m.createdAt)) ||
      ["assetId", "shotId", "previousId"].some(
        (k) => m[k] !== undefined && typeof m[k] !== "string",
      )
    )
      return false;
    ids.add(m.id);
    return true;
  });
}
export type MediaStatus =
  "素材未连接" | "已选择·位置待核验" | "已校验" | "所选目录未找到" | "内容不符";
const bound = new Map<
  string,
  { file: File; url: string; status: MediaStatus }
>();
const statuses = new Map<string, MediaStatus>();
const listeners = new Set<() => void>();
let generation = 0;
let scopeToken = 0;
export const mediaScope = () => scopeToken;
let directoryConnected = false;
export const isMediaLibraryConnected = () => directoryConnected;
function notify() {
  generation++;
  listeners.forEach((f) => f());
}
export const subscribeMedia = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export const mediaSnapshot = () => generation;
export const mediaStatus = (id: string): MediaStatus =>
  statuses.get(id) || bound.get(id)?.status || "素材未连接";
export const mediaURL = (id: string) => bound.get(id)?.url || "";
export const mediaFile = (id: string) => bound.get(id)?.file;
export function bindMedia(
  id: string,
  file: File,
  verified = false,
  scope = scopeToken,
) {
  if (scope !== scopeToken) return false;
  const old = bound.get(id);
  if (old) URL.revokeObjectURL(old.url);
  bound.set(id, {
    file,
    url: URL.createObjectURL(file),
    status: verified ? "已校验" : "已选择·位置待核验",
  });
  statuses.delete(id);
  notify();
  return true;
}
export function clearMedia() {
  scopeToken++;
  directoryConnected = false;
  bound.forEach((v) => URL.revokeObjectURL(v.url));
  bound.clear();
  statuses.clear();
  notify();
}
export function directoryPath(file: File) {
  const path = file.webkitRelativePath;
  return (path ? path.split("/").slice(1).join("/") : file.name).normalize(
    "NFC",
  );
}
export async function inspectDirectory(manifest: LocalMedia[], files: File[]) {
  if (!files.length) return 0;
  const scope = scopeToken;
  directoryConnected = true;
  const byPath = new Map(files.map((f) => [directoryPath(f), f]));
  let found = 0;
  for (const entry of manifest) {
    if (scope !== scopeToken) return 0;
    const f = byPath.get(entry.relativePath.normalize("NFC"));
    const old = bound.get(entry.id);
    if (old) {
      URL.revokeObjectURL(old.url);
      bound.delete(entry.id);
    }
    if (!f) {
      statuses.set(entry.id, "所选目录未找到");
      continue;
    }
    const digest = f.size === entry.size ? await checksum(f) : "";
    if (scope !== scopeToken) return 0;
    if (f.size !== entry.size || digest !== entry.sha256) {
      statuses.set(entry.id, "内容不符");
      continue;
    }
    bindMedia(entry.id, f, true);
    found++;
  }
  notify();
  return found;
}
export async function relinkMedia(entry: LocalMedia, file: File, path: string) {
  const scope = scopeToken;
  if (!safeRelative(path)) throw Error("请输入相对路径，不要输入 设备绝对路径");
  if (file.size !== entry.size || (await checksum(file)) !== entry.sha256)
    throw Error("文件校验不符。请作为新版本登记，不会替换旧素材。");
  if (scope !== scopeToken)
    throw Error("工作空间已变化，请在当前账号重新选择文件");
  bindMedia(entry.id, file);
  return { ...entry, relativePath: path.normalize("NFC") };
}
export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
export function assertCloudSafe(value: unknown) {
  function walk(x: unknown) {
    if (
      typeof x === "string" &&
      x.startsWith("/") &&
      !/^\/art\/[a-z0-9_-]+\.svg$/i.test(x)
    )
      throw Error("不能向云端上传绝对路径");
    if (
      typeof x === "string" &&
      /(?:^|\s)(?:data:|blob:|file:\/\/|[A-Za-z]:[\\/])|\/(?:Users|Volumes|private|home)\/|^~[\\/]/i.test(
        x,
      )
    )
      throw Error(
        "云端只允许轻量元数据：请先在本地素材库迁移 Base64 或绝对路径。",
      );
    if (x && typeof x === "object") {
      if (
        x instanceof Blob ||
        x instanceof ArrayBuffer ||
        ArrayBuffer.isView(x)
      )
        throw Error("二进制数据不能上传到数据库");
      Object.values(x).forEach(walk);
    }
  }
  walk(value);
  if (new TextEncoder().encode(JSON.stringify(value)).length > 2 * 1024 * 1024)
    throw Error("云端元数据超过 2MB，请拆分项目；大文件应保存在本地 SSD。");
}
// Strict allowlist prevents accidental persistence of browser handles or binary fields.
export function cloudMetadata(data: Studio): Studio {
  const result: Studio = {
    assets: data.assets.map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      status: a.status,
      description: a.description,
      model: a.model,
      tags: a.tags,
      image: a.image,
      references: [...a.references],
      versions: a.versions.map((v) => ({
        at: v.at,
        image: v.image,
        description: v.description,
        model: v.model,
      })),
    })),
    shots: data.shots.map((s) => ({
      id: s.id,
      number: s.number,
      title: s.title,
      size: s.size,
      duration: s.duration,
      camera: s.camera,
      movement: s.movement,
      assets: [...s.assets],
      ...(s.image ? { image: s.image } : {}),
      ...(s.sourceSceneId
        ? {
            sourceSceneId: s.sourceSceneId,
            sourceFinalRevision: s.sourceFinalRevision,
          }
        : {}),
    })),
    tasks: data.tasks.map((t) => ({
      id: t.id,
      title: t.title,
      priority: t.priority,
      date: t.date,
      done: t.done,
    })),
    prompts: data.prompts.map((p) => ({
      id: p.id,
      title: p.title,
      category: p.category,
      content: p.content,
    })),
  };
  if (data.files)
    result.files = data.files.map((f) => ({
      id: f.id,
      relativePath: f.relativePath,
      name: f.name,
      size: f.size,
      format: f.format,
      sha256: f.sha256,
      version: f.version,
      kind: f.kind,
      createdAt: f.createdAt,
      ...(f.previousId ? { previousId: f.previousId } : {}),
      ...(f.assetId ? { assetId: f.assetId } : {}),
      ...(f.shotId ? { shotId: f.shotId } : {}),
    }));
  if (data.script)
    result.script = {
      original: {
        text: data.script.original.text,
        language: data.script.original.language,
        at: data.script.original.at,
      },
      scenes: data.script.scenes.map((s) => ({
        id: s.id,
        heading: s.heading,
        original: s.original,
        draft: s.draft,
        draftRevision: s.draftRevision,
        ...(s.undoTargetRevision
          ? { undoTargetRevision: s.undoTargetRevision }
          : {}),
        ...(s.mergeCandidate !== undefined
          ? { mergeCandidate: s.mergeCandidate }
          : {}),
        status: s.status,
        assetIds: [...s.assetIds],
        ...(s.variants
          ? {
              variants: s.variants.map((v) => ({
                id: v.id,
                text: v.text,
                model: v.model,
                at: v.at,
                ...(v.inputHash ? { inputHash: v.inputHash } : {}),
                ...(v.sourceRevision
                  ? { sourceRevision: v.sourceRevision }
                  : {}),
                ...(v.requestId ? { requestId: v.requestId } : {}),
              })),
            }
          : {}),
        versions: s.versions.map((v) => ({
          id: v.id,
          text: v.text,
          model: v.model,
          at: v.at,
        })),
        ...(s.final
          ? {
              final: {
                text: s.final.text,
                revision: s.final.revision,
                at: s.final.at,
              },
            }
          : {}),
        finalHistory: s.finalHistory.map((v) => ({
          text: v.text,
          revision: v.revision,
          at: v.at,
        })),
      })),
    };
  assertCloudSafe(result);
  return result;
}

// Plan metadata additions only. Never move files or modify existing IDs/relationships.
export async function indexDirectoryFiles(
  manifest: LocalMedia[],
  selected: File[],
  kind: MediaKind,
  options: Partial<
    Pick<LocalMedia, "assetId" | "shotId" | "previousId" | "version">
  > = {},
) {
  if (options.previousId && selected.length !== 1)
    throw Error("登记新版本时请只选择一个文件");
  const files = [...manifest],
    added: LocalMedia[] = [],
    bindings: { id: string; file: File }[] = [];
  for (const file of selected) {
    if (!file.webkitRelativePath)
      throw Error("请通过项目根目录选择文件，以读取真实相对路径");
    const relativePath = directoryPath(file);
    const entry = await describeFile(file, kind, { ...options, relativePath });
    const existing = files.filter(
      (f) => f.relativePath.normalize("NFC") === relativePath,
    );
    const same = existing.find(
      (f) => f.sha256 === entry.sha256 && f.size === entry.size,
    );
    if (same) {
      bindings.push({ id: same.id, file });
      continue;
    }
    if (existing.length)
      throw Error(
        `所选路径已有不同内容：${relativePath}。请在 SSD 另存版本后登记，不会改写现有索引。`,
      );
    files.push(entry);
    added.push(entry);
    bindings.push({ id: entry.id, file });
  }
  return { files, added, bindings };
}
