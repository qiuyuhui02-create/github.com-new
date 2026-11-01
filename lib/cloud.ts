import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "../utils/supabase/config";
import { parseStudio, type Studio } from "./model";
export const emptyStudio = (): Studio => ({
  assets: [],
  shots: [],
  tasks: [],
  prompts: [],
});
export const cacheKey = (userId: string | null) =>
  userId ? `framework-studio-v2:user:${userId}` : "framework-studio-v1";
export function cloudError(error: { code?: string; message?: string }): Error {
  if (error.code === "40001" || error.code === "23505")
    return Error("云端项目已更新，请先导出本地备份，再从云端载入后重试。");
  if (
    error.code === "42P01" ||
    error.code === "PGRST202" ||
    error.code === "42703" ||
    error.code === "PGRST205"
  )
    return Error(
      "云端表或函数尚未配置，请先在 Supabase 执行最新版 schema.sql。",
    );
  if (error.code === "42501" || error.code === "PGRST301")
    return Error("登录失效或数据库权限不足，请重新登录并检查 RLS。");
  return Error("云端操作失败，请检查网络、登录状态与 Supabase 配置。");
}
export async function loadCloud(client: SupabaseClient, userId: string) {
  const { data, error } = await client
    .from("studio_projects")
    .select("data,version,updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw cloudError(error);
  if (!data) return null;
  if (!Number.isSafeInteger(Number(data.version)) || Number(data.version) < 1)
    throw Error("云端版本字段无效，请执行最新版 schema.sql");
  return {
    data: parseStudio(data.data),
    version: Number(data.version),
    at: String(data.updated_at),
  };
}
export async function saveCloud(
  client: SupabaseClient,
  data: Studio,
  version: number,
) {
  const valid = parseStudio(data);
  const { data: row, error } = await client.rpc("save_studio_project", {
    project_data: valid,
    expected_version: version,
  });
  if (error) throw cloudError(error);
  const result = Array.isArray(row) ? row[0] : row;
  if (!result || !Number.isSafeInteger(Number(result.version)))
    throw Error("云端返回无效的项目版本");
  return { version: Number(result.version), at: String(result.updated_at) };
}
// Preserve IDs/links and migrate embedded backup images, including version history.
export async function migrateImages(
  client: SupabaseClient,
  input: Studio,
  userId: string,
): Promise<Studio> {
  const data = structuredClone(parseStudio(input));
  const mapped = new Map<string, string>();
  async function image(src: string): Promise<string> {
    if (!src || src.startsWith("/art/")) return src;
    if (src.startsWith("storage:")) {
      if (!src.slice(8).startsWith(`${userId}/`))
        throw Error(
          "备份引用了其他账号的私有素材，请用原账号导出图片后重新上传。",
        );
      return src;
    }
    if (mapped.has(src)) return mapped.get(src)!;
    const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(
      src,
    );
    if (!match)
      throw Error("备份含不支持的图片，请使用 JPG、PNG 或 WebP 重新上传。");
    if (match[2].length > Math.ceil((5 * 1024 * 1024 * 4) / 3) + 4)
      throw Error("备份图片超过 5MB");
    let raw: string;
    try {
      raw = atob(match[2]);
    } catch {
      throw Error("备份图片内容无效");
    }
    const bytes = Uint8Array.from(raw, (c) => c.charCodeAt(0));
    if (bytes.length > 5 * 1024 * 1024) throw Error("备份图片超过 5MB");
    const path = `${userId}/${crypto.randomUUID()}.${match[1]}`;
    const { error } = await client.storage
      .from("assets")
      .upload(path, bytes, { contentType: `image/${match[1]}`, upsert: false });
    if (error) throw cloudError(error);
    const value = `storage:${path}`;
    mapped.set(src, value);
    return value;
  }
  for (const asset of data.assets) {
    asset.image = await image(asset.image);
    asset.references = await Promise.all(asset.references.map(image));
    for (const version of asset.versions)
      version.image = await image(version.image);
  }
  return data;
}

// Pin each operation to one verified token; account changes cannot retarget a request.
export async function verifiedClient(base: SupabaseClient, owner: string) {
  const {
    data: { session },
    error,
  } = await base.auth.getSession();
  if (error || !session || session.user.id !== owner)
    throw Error("登录已变化，请重新登录");
  const result = await base.auth.getUser(session.access_token);
  if (result.error || result.data.user?.id !== owner)
    throw Error("登录已变化，请重新登录");
  const config = getSupabaseConfig();
  if (!config) throw Error("请先配置 Supabase");
  return createClient(config.url, config.key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: { headers: { Authorization: `Bearer ${session.access_token}` } },
  });
}
