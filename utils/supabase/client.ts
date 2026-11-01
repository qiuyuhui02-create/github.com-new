import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseConfig } from "./config";
export function createClient() {
  const config = getSupabaseConfig();
  return config
    ? createBrowserClient(config.url, config.key, {
        auth: { detectSessionInUrl: false },
        cookieOptions: {
          path: "/",
          sameSite: "lax",
          secure:
            typeof window !== "undefined" &&
            window.location.protocol === "https:",
        },
      })
    : null;
}
