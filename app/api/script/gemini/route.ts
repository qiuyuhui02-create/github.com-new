import type { NextRequest } from "next/server";
import { geminiStatus, handleGemini } from "@/lib/gemini/handler";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;
export const GET = geminiStatus;
export async function POST(request: NextRequest) {
  return handleGemini(request);
}
