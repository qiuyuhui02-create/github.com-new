import { createHash, timingSafeEqual } from "node:crypto";
export type GeminiConfig = {
  apiKey: string;
  accessCode: string;
  redisUrl: string;
  redisToken: string;
};
export function geminiConfig(
  env: Record<string, string | undefined> = process.env,
): GeminiConfig | null {
  if (
    env.GEMINI_ENABLED !== "true" ||
    env.GEMINI_FREE_TIER_CONFIRMED !== "true" ||
    !env.GEMINI_API_KEY ||
    !env.GEMINI_ACCESS_CODE ||
    env.GEMINI_ACCESS_CODE.length < 32 ||
    env.GEMINI_ACCESS_CODE.length > 256 ||
    !env.UPSTASH_REDIS_REST_TOKEN
  )
    return null;
  // Fixed model verified against Google's standard Free Tier pricing 2026-11-01.
  // No client-selected models, alternate endpoints, paid fallback, search or batch APIs.
  try {
    const u = new URL(env.UPSTASH_REDIS_REST_URL || "");
    if (
      u.protocol !== "https:" ||
      !u.hostname.endsWith(".upstash.io") ||
      u.username ||
      u.password ||
      u.search ||
      u.hash ||
      u.pathname !== "/"
    )
      return null;
    return {
      apiKey: env.GEMINI_API_KEY,
      accessCode: env.GEMINI_ACCESS_CODE,
      redisUrl: u.origin,
      redisToken: env.UPSTASH_REDIS_REST_TOKEN,
    };
  } catch {
    return null;
  }
}
export function ownerAuthorized(header: string | null, config: GeminiConfig) {
  if (!header?.startsWith("Bearer ") || header.length > 263) return false;
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(digest(header.slice(7)), digest(config.accessCode));
}
