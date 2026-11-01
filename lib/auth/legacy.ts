import type { AuthReason } from "./messages";
// URL fragments never reach an SSR callback. Do not silently treat them as a session.
export function legacyFragmentReason(hash: string): AuthReason | null {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  if (params.get("error_code") === "otp_expired") return "expired";
  if (params.has("error")) return "provider_error";
  if (params.has("access_token") || params.has("refresh_token"))
    return "missing_credentials";
  return null;
}
