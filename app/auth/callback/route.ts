import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (code) {
    const client = await createClient();
    if (client) {
      try {
        const { error } = await client.auth.exchangeCodeForSession(code);
        if (!error) return NextResponse.redirect(new URL("/", request.url));
      } catch {
        /* Display a recoverable sign-in error without leaking provider errors. */
      }
    }
  }
  return NextResponse.redirect(new URL("/?auth_error=1", request.url));
}
