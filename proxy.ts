import { type NextRequest } from "next/server";
import { updateSession } from "./utils/supabase/middleware";
// Next.js 16 calls this entry point proxy.ts (formerly middleware.ts).
export async function proxy(request: NextRequest) {
  return updateSession(request);
}
export const config = { matcher: ["/", "/auth/:path*"] };
