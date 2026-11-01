import type { NextRequest } from "next/server";
import { setPassword } from "@/lib/auth/set-password";
export async function POST(request: NextRequest) {
  return setPassword(request);
}
