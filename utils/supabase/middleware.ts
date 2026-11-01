import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseConfig } from "./config";
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  response.headers.set("Cache-Control", "private, no-store");
  const config = getSupabaseConfig();
  if (!config) return response;
  const client = createServerClient(config.url, config.key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (items) => {
        items.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        response.headers.set("Cache-Control", "private, no-store");
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
