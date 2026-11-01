import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseConfig } from "./config";
// A Route Handler owns its final response: do not silently drop Set-Cookie writes.
export function createRouteClient(
  request: NextRequest,
  transport?: typeof fetch,
) {
  const config = getSupabaseConfig();
  if (!config) return null;
  const writes = new Map<
    string,
    { name: string; value: string; options: CookieOptions }
  >();
  const client = createServerClient(config.url, config.key, {
    ...(transport ? { global: { fetch: transport } } : {}),
    cookieOptions: {
      path: "/",
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
    },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (items) => {
        for (const item of items) {
          writes.set(item.name, item);
          request.cookies.set(item.name, item.value);
        }
      },
    },
  });
  return {
    client,
    applyCookies: (response: NextResponse) => {
      for (const { name, value, options } of writes.values())
        response.cookies.set(name, value, options);
      return response;
    },
  };
}
