export type EmailLinkType = "email" | "signup" | "magiclink";
export type AuthCallbackInput =
  | { kind: "pkce"; code: string; flowId?: string }
  | { kind: "hash"; tokenHash: string; type: EmailLinkType }
  | {
      kind: "error";
      reason:
        | "expired"
        | "provider_error"
        | "invalid_request"
        | "missing_credentials";
    };
const keys = [
  "code",
  "token_hash",
  "type",
  "sb_flow_id",
  "error",
  "error_code",
] as const;
export function parseAuthCallback(params: URLSearchParams): AuthCallbackInput {
  if (keys.some((k) => params.getAll(k).length > 1))
    return { kind: "error", reason: "invalid_request" };
  if (params.has("error") || params.has("error_code"))
    return {
      kind: "error",
      reason:
        params.get("error_code") === "otp_expired"
          ? "expired"
          : "provider_error",
    };
  const code = params.get("code"),
    tokenHash = params.get("token_hash"),
    type = params.get("type"),
    flowId = params.get("sb_flow_id");
  if (code && tokenHash) return { kind: "error", reason: "invalid_request" };
  if (code) {
    if (
      code.length > 2048 ||
      !/^\S+$/.test(code) ||
      (flowId && !/^[A-Za-z0-9_-]{8,64}$/.test(flowId))
    )
      return { kind: "error", reason: "invalid_request" };
    return { kind: "pkce", code, ...(flowId ? { flowId } : {}) };
  }
  if (tokenHash) {
    if (
      tokenHash.length > 4096 ||
      !/^\S+$/.test(tokenHash) ||
      !["email", "signup", "magiclink"].includes(type || "")
    )
      return { kind: "error", reason: "invalid_request" };
    return { kind: "hash", tokenHash, type: type as EmailLinkType };
  }
  return {
    kind: "error",
    reason:
      params.has("code") || params.has("token_hash") || params.has("type")
        ? "invalid_request"
        : "missing_credentials",
  };
}
// Rescue misdirected email callbacks before the browser SDK can consume a code.
export function rootCallbackTarget(url: URL): URL | null {
  if (
    url.pathname !== "/" ||
    !["code", "token_hash", "error", "error_code"].some((k) =>
      url.searchParams.has(k),
    )
  )
    return null;
  const target = new URL("/auth/callback", url.origin);
  for (const key of keys)
    for (const value of url.searchParams.getAll(key))
      target.searchParams.append(key, value);
  return target;
}
