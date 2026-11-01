export function passwordValidation(
  password: unknown,
  confirmation: unknown,
): string | null {
  if (typeof password !== "string" || typeof confirmation !== "string")
    return "请输入两次新密码";
  if (password !== confirmation) return "两次输入的密码不一致";
  if (password.length < 12) return "请使用至少 12 个字符的密码";
  if (new TextEncoder().encode(password).length > 72)
    return "密码过长，请控制在 72 个 UTF-8 字节以内";
  return null;
}
export function canSetPassword(
  user: {
    id: string;
    email?: string;
    email_confirmed_at?: string | null;
    is_anonymous?: boolean;
  } | null,
) {
  return (
    !!user?.id &&
    !!user.email &&
    !!user.email_confirmed_at &&
    !user.is_anonymous
  );
}
export function passwordError(
  error: { code?: string; status?: number; name?: string },
  operation: "login" | "update",
) {
  if (error.status === 429)
    return {
      code: "rate_limited",
      message: "请求过于频繁，请稍后手动重试。不会自动发送邮件。",
    };
  if (error.code === "email_not_confirmed")
    return {
      code: "email_unverified",
      message: "邮箱尚未验证。请使用原邮箱的 Magic Link 完成验证后继续。",
    };
  if (
    [
      "reauthentication_needed",
      "reauthentication_not_valid",
      "session_not_found",
      "refresh_token_not_found",
    ].includes(error.code || "")
  )
    return {
      code: "reauthentication_required",
      message:
        "需要重新认证。请重新登录（首次设置可用 Magic Link），再返回设置密码；不会自动发信。",
    };
  if (error.code === "weak_password")
    return {
      code: "weak_password",
      message: "密码不满足 Supabase 的安全要求，请使用更强的密码。",
    };
  if (error.code === "same_password")
    return {
      code: "same_password",
      message: "新密码与现有密码相同，请选择不同的密码。",
    };
  if (error.name === "AuthRetryableFetchError")
    return {
      code: "network",
      message: "登录服务暂时无法连接，请稍后手动重试。",
    };
  return operation === "login"
    ? {
        code: "invalid_credentials",
        message:
          "邮箱或密码不正确，或暂时无法登录。首次使用请先通过 Magic Link 登录，再设置密码。",
      }
    : {
        code: "update_failed",
        message: "密码设置失败，请稍后重试或重新登录；不会重新注册或删除账号。",
      };
}
