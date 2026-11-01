// Explicit operator-only test. Never run by build, CI, npm test, or page navigation.
import { NextRequest } from "next/server";
import { geminiConfig } from "../lib/gemini/config";
import { handleGemini } from "../lib/gemini/handler";
async function main() {
  if (process.env.RUN_GEMINI_SMOKE_ONCE !== "1")
    throw Error("未明确启用单次真实测试；没有发送请求。");
  const c = geminiConfig();
  if (!c) {
    console.log(
      JSON.stringify({
        status: "not_run",
        code: "safe_config_missing",
        providerRequests: 0,
        actualProviderTest: false,
      }),
    );
    process.exitCode = 1;
    return;
  }
  const response = await handleGemini(
    new NextRequest("https://local-test.invalid/api/script/gemini", {
      method: "POST",
      headers: {
        Origin: "https://local-test.invalid",
        Authorization: `Bearer ${c.accessCode}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: "○ 放課後の教室\n\n遥：明日も、来る？\n凛：うん。",
        direction: "日系自然对白",
        instructions: "保留人物与场景，让对白稍微含蓄；最多150字。",
        requestId: "00000000-0000-4000-8000-000000000001",
      }),
    }),
  );
  const result = await response.json();
  console.log(
    JSON.stringify({
      status: response.status,
      code: result.code || "ok",
      model: result.proposal?.model,
      scriptCharacters: result.proposal?.script?.length,
      reasons: result.proposal?.reasons?.length,
      actualProviderTest: response.ok,
    }),
  );
  if (!response.ok) process.exitCode = 1;
}
main().catch(() => {
  console.error(
    "真实测试未完成：请核对安全配置和网络。没有自动重试，也不会打印密钥或剧本。",
  );
  process.exitCode = 1;
});
