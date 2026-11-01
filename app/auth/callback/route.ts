import { NextRequest, NextResponse } from "next/server";
import { handleAuthCallback, protectAuthResponse } from "@/lib/auth/callback";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  return handleAuthCallback(request);
}
export async function POST(request: NextRequest) {
  return handleAuthCallback(request);
}
// Do not let Next.js implement HEAD by running the credential-consuming GET path.
export async function HEAD() {
  return protectAuthResponse(new NextResponse(null, { status: 200 }));
}
