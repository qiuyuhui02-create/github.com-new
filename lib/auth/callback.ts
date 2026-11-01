import { NextRequest, NextResponse } from "next/server";
import { createRouteClient } from "../../utils/supabase/route";
import {
  classifyAuthError,
  configuredSiteOrigin,
  type AuthReason,
} from "./messages";
import { parseAuthCallback } from "./parameters";
import { authRequestUrl } from "./request-url";
export function protectAuthResponse(response: NextResponse) {
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}
function failure(request: NextRequest, reason: AuthReason) {
  // Only fixed reason codes, never auth codes, token hashes, email or provider errors.
  console.warn("[auth/callback]", { reason });
  const url = new URL("/auth/login", authRequestUrl(request));
  url.searchParams.set("reason", reason);
  url.searchParams.set("mode", "magic");
  return protectAuthResponse(NextResponse.redirect(url.href + "#", 303));
}
export async function handleAuthCallback(
  request: NextRequest,
  factory: typeof createRouteClient = createRouteClient,
) {
  const requestUrl = authRequestUrl(request);
  const site = configuredSiteOrigin();
  if (site === "invalid") return failure(request, "unconfigured");
  if (site && site !== requestUrl.origin)
    return failure(request, "wrong_origin");
  if (request.method === "POST") {
    const origin = request.headers.get("origin");
    if (!origin || origin !== requestUrl.origin)
      return protectAuthResponse(
        NextResponse.json({ error: "不允许跨站验证请求" }, { status: 403 }),
      );
  }
  let params = request.nextUrl.searchParams;
  if (request.method === "POST") {
    try {
      if (Number(request.headers.get("content-length")) > 8192)
        return failure(request, "invalid_request");
      const raw = await request.text();
      if (raw.length > 8192) return failure(request, "invalid_request");
      params = new URLSearchParams(raw);
    } catch {
      return failure(request, "invalid_request");
    }
  }
  const input = parseAuthCallback(params);
  if (input.kind === "error") return failure(request, input.reason);
  if (request.method === "GET" && input.kind === "hash") {
    // GET never consumes a hash: email scanners may follow links before the user.
    const url = new URL("/auth/confirm", authRequestUrl(request));
    url.searchParams.set("token_hash", input.tokenHash);
    url.searchParams.set("type", input.type);
    return protectAuthResponse(NextResponse.redirect(url, 303));
  }
  if (request.method === "POST" && input.kind !== "hash")
    return failure(request, "invalid_request");
  try {
    const route = factory(request);
    if (!route) return failure(request, "unconfigured");
    const result =
      input.kind === "pkce"
        ? await route.client.auth.exchangeCodeForSession(
            input.code,
            input.flowId ? { flowId: input.flowId } : undefined,
          )
        : await route.client.auth.verifyOtp({
            token_hash: input.tokenHash,
            type: input.type,
          });
    if (result.error)
      return failure(
        request,
        classifyAuthError(
          result.error,
          input.kind === "pkce" ? "pkce" : "verify",
        ),
      );
    if (!result.data.session?.access_token)
      return failure(request, "verification_failed");
    // Commit every cookie chunk onto the response the browser actually receives.
    return protectAuthResponse(
      route.applyCookies(
        NextResponse.redirect(
          new URL("/?auth=success#", authRequestUrl(request)),
          303,
        ),
      ),
    );
  } catch {
    return failure(request, "network");
  }
}
