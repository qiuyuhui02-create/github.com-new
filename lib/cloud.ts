import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "../utils/supabase/config";
import { parseStudio, type Studio } from "./model";
import { cloudMetadata } from "./media";
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
  const valid = cloudMetadata(parseStudio(data));
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
