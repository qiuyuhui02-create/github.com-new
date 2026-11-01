import { NextRequest, NextResponse } from "next/server";
import { authRequestUrl } from "../auth/request-url";
import { geminiConfig, ownerAuthorized, type GeminiConfig } from "./config";
import { reserveBudget, GeminiFailure } from "./budget";
import { validInput, limitedText, reviseScene } from "./provider";
import { GEMINI_MODEL } from "./shared";
const messages: Record<string, string> = {
  unconfigured: "Gemini 自动修改尚未安全启用；请继续手动三 AI 对比。",
  unauthorized: "个人访问码不正确或未填写。此访问码不是 Gemini API Key。",
  wrong_origin: "请从当前网站发起请求。",
  invalid_input: "只允许发送一场 6000 字以内剧本和 1000 字以内修改要求。",
  limiter_unavailable: "请求计数服务暂不可用，已停止自动调用。手动对比仍可用。",
  provider_quota:
    "Gemini 免费额度或频率限制已触发，今日自动调用已停止；不会重试或切换收费模型。",
  daily_limit: "今日个人自动修改次数已用完（最多 10 次），请继续手动对比。",
  cooldown: "请等待至少 60 秒后手动发起下一次修改。",
  duplicate: "本次请求已登记，不会重复发送。请先检查已有结果。",
  provider_unavailable:
    "Gemini 模型或免费访问权限不可用，已停止调用，不切换模型。",
  provider_error: "Gemini 暂时不可用；未自动重试，原稿与定稿未修改。",
  incomplete_result:
    "Gemini 未返回完整有效结果；未采用部分内容，请继续手动对比。",
};
function reply(data: unknown, status = 200, retry?: number) {
  const r = NextResponse.json(data, { status });
  r.headers.set("Cache-Control", "private, no-store, max-age=0");
  r.headers.set("Referrer-Policy", "no-referrer");
  r.headers.set("X-Content-Type-Options", "nosniff");
  if (retry) r.headers.set("Retry-After", String(retry));
  return r;
}
export function geminiStatus() {
  return reply({
    available: !!geminiConfig(),
    model: GEMINI_MODEL,
    accessProtected: true,
    message: geminiConfig()
      ? "需要个人访问码；仅发送当前场景，免费限额以 Google 为准。"
      : messages.unconfigured,
  });
}
type Dependencies = {
  config?: () => GeminiConfig | null;
  budget?: typeof reserveBudget;
  revise?: typeof reviseScene;
};
export async function handleGemini(
  request: NextRequest,
  deps: Dependencies = {},
) {
  const config = (deps.config || geminiConfig)();
  const fail = (code: string, status: number, retry?: number) =>
    reply(
      { code, error: messages[code] || messages.provider_error },
      status,
      retry,
    );
  if (
    request.headers.get("origin") !== authRequestUrl(request).origin ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    return fail("wrong_origin", 403);
  if (!config) return fail("unconfigured", 503);
  if (!ownerAuthorized(request.headers.get("authorization"), config))
    return fail("unauthorized", 401);
  let input;
  try {
    if (
      !request.headers.get("content-type")?.startsWith("application/json") ||
      Number(request.headers.get("content-length")) > 32000
    )
      throw Error();
    input = JSON.parse(await limitedText(request, 32000));
    if (!validInput(input)) throw Error();
  } catch {
    return fail("invalid_input", 400);
  }
  const budget = deps.budget || reserveBudget;
  try {
    await budget(config, input.requestId);
    const proposal = await (deps.revise || reviseScene)(input, config.apiKey);
    return reply({ proposal });
  } catch (error) {
    const e =
      error instanceof GeminiFailure
        ? error
        : new GeminiFailure("provider_error", 503);
    if (e.code === "provider_quota" && !e.retryAfter) {
      try {
        await budget(config, input.requestId, "block");
      } catch {
        /* A failed limiter never authorizes another provider request. */
      }
    }
    return fail(e.code, e.status, e.retryAfter);
  }
}
