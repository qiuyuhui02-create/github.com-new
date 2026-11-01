export function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  if (key.startsWith("sb_secret_"))
    throw new Error("Supabase 浏览器配置不能使用 Secret Key");
  // Reject legacy service-role JWTs too. This is configuration validation, not JWT verification.
  try {
    const payload = JSON.parse(atob(key.split(".")[1] || ""));
    if (payload.role === "service_role")
      throw new Error("Supabase 浏览器配置不能使用 service_role Key");
  } catch (error) {
    if (error instanceof Error && error.message.includes("service_role"))
      throw error;
  }
  return { url, key };
}
