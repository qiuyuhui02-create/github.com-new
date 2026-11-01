import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import {
  compareModels,
  providerConfigs,
  publicProviders,
} from "@/lib/ai/providers";
import type { ProviderId } from "@/lib/ai/types";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET() {
  return NextResponse.json(
    { providers: publicProviders(), dailyLimit: 5 },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
export async function POST(request: Request) {
  const configs = providerConfigs();
  if (!configs.some((p) => p.ready))
    return NextResponse.json(
      { error: "没有已连接并获准使用免费/试用额度的模型。" },
      { status: 503 },
    );
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    return NextResponse.json({ error: "不允许跨站请求" }, { status: 403 });
  if (Number(request.headers.get("content-length")) > 100000)
    return NextResponse.json({ error: "请求过大" }, { status: 413 });
  let body: { text: string; instructions: string; providers: ProviderId[] };
  try {
    const raw = await request.text();
    if (raw.length > 60000) throw Error();
    body = JSON.parse(raw);
    if (
      typeof body.text !== "string" ||
      !body.text.trim() ||
      body.text.length > 20000 ||
      typeof body.instructions !== "string" ||
      !body.instructions.trim() ||
      body.instructions.length > 2000 ||
      !Array.isArray(body.providers) ||
      body.providers.length < 1 ||
      body.providers.length > 3 ||
      new Set(body.providers).size !== body.providers.length ||
      body.providers.some((id) => !configs.find((p) => p.id === id)?.ready)
    )
      throw Error();
  } catch {
    return NextResponse.json(
      {
        error:
          "请求无效：单场对比上限 2 万字、要求上限 2000 字；模型必须已连接且获准。",
      },
      { status: 400 },
    );
  }
  try {
    const db = await createClient();
    if (!db)
      return NextResponse.json(
        { error: "请先配置 Supabase 并登录" },
        { status: 401 },
      );
    const {
      data: { user },
      error,
    } = await db.auth.getUser();
    if (error || !user)
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    const quota = await db.rpc("consume_studio_ai_quota");
    if (quota.error)
      return NextResponse.json(
        {
          error:
            quota.error.code === "P0001"
              ? "今日对比次数已达上限。不会自动充值。"
              : "配额表尚未配置或不可用，请执行 supabase/ai-quota.sql；未调用模型。",
        },
        { status: quota.error.code === "P0001" ? 429 : 503 },
      );
    const result = await compareModels(
      configs,
      body.providers,
      body.text,
      body.instructions,
    );
    return NextResponse.json(
      { ...result, remaining: Math.max(0, 5 - Number(quota.data)) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "请求失败，未返回模拟内容。请检查配置与登录状态。" },
      { status: 502 },
    );
  }
}
