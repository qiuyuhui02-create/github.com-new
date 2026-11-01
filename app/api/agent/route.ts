import { NextResponse } from "next/server";
// This free MVP never invokes a paid API, even if an old deployment has API keys.
export async function POST() {
  return NextResponse.json(
    {
      error:
        "付费 AI 未启用。本版本仅使用本地规则检查和手动粘贴，不调用外部 AI 服务。",
    },
    { status: 503 },
  );
}
