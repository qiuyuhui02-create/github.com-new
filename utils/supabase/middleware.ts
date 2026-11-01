import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseConfig } from "./config";
import { rootCallbackTarget } from "../../lib/auth/parameters";
import { authRequestUrl } from "../../lib/auth/request-url";
export async function updateSession(request: NextRequest) {
  const target = rootCallbackTarget(authRequestUrl(request));
  if (target) {
    const redirect = NextResponse.redirect(target, 303);
    redirect.headers.set("Cache-Control", "private, no-store");
    redirect.headers.set("Referrer-Policy", "no-referrer");
    return redirect;
  }
  let response = NextResponse.next({ request });
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set(
    "Referrer-Policy",
    request.nextUrl.pathname === "/auth/confirm"
      ? "same-origin"
      : "no-referrer",
  );
  if (["/auth/callback", "/auth/confirm"].includes(request.nextUrl.pathname))
    return response;
  const config = getSupabaseConfig();
  if (!config) return response;
  const client = createServerClient(config.url, config.key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (items) => {
        items.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        response.headers.set("Cache-Control", "private, no-store");
        response.headers.set("Referrer-Policy", "no-referrer");
        items.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });
  // Creating a client alone does not refresh sessions. Verify the user on each request.
  try {
    await client.auth.getUser();
  } catch {
    /* Offline auth must not prevent opening local demo data. */
  }
  return response;
}
