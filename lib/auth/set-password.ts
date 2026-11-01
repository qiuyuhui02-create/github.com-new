import { NextRequest, NextResponse } from "next/server";
import { createRouteClient } from "../../utils/supabase/route";
import { protectAuthResponse } from "./callback";
import { authRequestUrl } from "./request-url";
import { configuredSiteOrigin } from "./messages";
import { passwordValidation, canSetPassword, passwordError } from "./passwords";
export async function setPassword(
  request: NextRequest,
  factory: typeof createRouteClient = createRouteClient,
) {
  const respond = (data: unknown, status: number) =>
    protectAuthResponse(NextResponse.json(data, { status }));
  const origin = authRequestUrl(request).origin,
    site = configuredSiteOrigin();
  if (request.headers.get("origin") !== origin || (site && site !== origin))
    return respond(
      { code: "wrong_origin", error: "请在同一站点提交密码设置" },
      403,
    );
  let password: string, confirmation: string;
  try {
    if (
      !request.headers.get("content-type")?.startsWith("application/json") ||
      Number(request.headers.get("content-length")) > 8192
    )
      throw Error();
    const raw = await request.text();
    if (raw.length > 8192) throw Error();
    const body = JSON.parse(raw);
    if (
      !body ||
      typeof body !== "object" ||
      Object.keys(body).some((k) => !["password", "confirmation"].includes(k))
    )
      throw Error();
    password = body.password;
    confirmation = body.confirmation;
  } catch {
    return respond({ code: "invalid_request", error: "密码请求无效" }, 400);
  }
  const invalid = passwordValidation(password, confirmation);
  if (invalid)
    return respond({ code: "invalid_password", error: invalid }, 400);
  try {
    const route = factory(request);
    if (!route)
      return respond({ code: "unconfigured", error: "尚未配置 Supabase" }, 503);
    const reply = (data: unknown, status: number) =>
      route.applyCookies(respond(data, status));
    const {
      data: { user },
      error,
    } = await route.client.auth.getUser();
    if (error || !user)
      return reply(
        { code: "login_required", error: "请先登录，再设置密码" },
        401,
      );
    if (!canSetPassword(user))
      return reply(
        {
          code: "email_unverified",
          error: "仅允许已验证邮箱的登录用户设置密码，请先通过 Magic Link 验证",
        },
        403,
      );
    // The authenticated-user API has no user ID/email target. Never use signUp/admin/SQL.
    const result = await route.client.auth.updateUser({ password });
    if (result.error) {
      const failure = passwordError(result.error, "update");
      return reply(
        { code: failure.code, error: failure.message },
        result.error.status === 429 ? 429 : 400,
      );
    }
    if (!result.data.user || result.data.user.id !== user.id)
      return reply(
        {
          code: "update_failed",
          error: "无法确认密码设置结果，请重新登录核对",
        },
        502,
      );
    return reply({ ok: true }, 200);
  } catch {
    return respond(
      { code: "network", error: "密码设置暂时不可用，请稍后重试" },
      502,
    );
  }
}
