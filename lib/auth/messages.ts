export const authMessages = {
  login_required: "请先登录并验证邮箱，再进入账号安全设置密码。",
  missing_credentials:
    "登录链接缺少验证参数，可能是邮件模板或重定向地址不匹配。请使用密码或默认 Magic Link 登录。",
  invalid_request:
    "登录链接参数不完整或类型不受支持。请回到登录页使用密码或默认 Magic Link。",
  expired:
    "这封邮件的令牌已过期、已使用或被新邮件替代。请使用最新的 Magic Link 或密码登录；不要连续发送邮件。",
  pkce_verifier_missing:
    "找不到这次登录的 PKCE verifier。请在发起登录的同一浏览器、同一网站打开旧链接，或使用密码重新登录。",
  pkce_exchange_failed:
    "PKCE 验证未完成，可能是浏览器、域名或请求不匹配。请使用密码登录，或重新申请有效的 Magic Link。",
  verification_failed:
    "暂时无法完成邮件验证。请使用密码或最新的 Magic Link；如果仍失败，请检查 Supabase Auth 日志和邮件模板。",
  unconfigured:
    "网站尚未配置正确的 Supabase 连接，请检查 Vercel 环境变量并重新部署。",
  wrong_origin:
    "当前域名与配置的登录站点不一致。请在正式登录站点重新发起登录，避免 Cookie 分散到不同域名。",
  provider_error:
    "Supabase 返回了登录错误，请使用最新 Magic Link 或密码，并检查后台 Auth 日志。",
  network: "登录服务暂时无法连接，请稍后重试。不会自动重发邮件。",
  email_rate_limit:
    "邮件发送已限流（email rate limit exceeded）。请停止重复发送，等待服务商配额恢复，并检查 Supabase 邮件限额/SMTP。验证码与链接共用发信限额。",
  verify_rate_limit: "验证请求过于频繁，请稍后手动重试。不会重新发送邮件。",
} as const;
export type AuthReason = keyof typeof authMessages;
export function authReason(value: string | null | undefined): AuthReason {
  return value && Object.hasOwn(authMessages, value)
    ? (value as AuthReason)
    : "verification_failed";
}
export function classifyAuthError(
  error: { code?: string; status?: number; name?: string; message?: string },
  stage: "send" | "verify" | "pkce",
): AuthReason {
  const code = error.code || "",
    message = error.message || "";
  if (
    error.status === 429 ||
    /rate_limit|rate limit/i.test(code + " " + message)
  )
    return stage === "send" ? "email_rate_limit" : "verify_rate_limit";
  if (/otp_expired|flow_state_expired/.test(code)) return "expired";
  if (
    stage === "pkce" &&
    (error.name === "AuthPKCECodeVerifierMissingError" ||
      /code.verifier|bad_code_verifier/i.test(code + " " + message))
  )
    return "pkce_verifier_missing";
  if (
    error.name === "AuthRetryableFetchError" ||
    /fetch failed|network|failed to fetch/i.test(message)
  )
    return "network";
  return stage === "pkce" ? "pkce_exchange_failed" : "verification_failed";
}
export function configuredSiteOrigin() {
  const value = process.env.NEXT_PUBLIC_SITE_URL;
  if (!value) return null;
  try {
    const url = new URL(value);
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !["/", ""].includes(url.pathname) ||
      !(
        ["https:"].includes(url.protocol) ||
        (url.protocol === "http:" &&
          ["localhost", "127.0.0.1"].includes(url.hostname))
      )
    )
      return "invalid";
    return url.origin;
  } catch {
    return "invalid";
  }
}
