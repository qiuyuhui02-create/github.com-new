import { createHash } from "node:crypto";
import type { GeminiConfig } from "./config";
// A single durable Redis hash and one atomic Lua script: shared by all Vercel instances.
// Only counts/request UUIDs are stored; never script text, credentials, or personal data.
export const BUDGET_LUA = `
local k=KEYS[1]
local now=tonumber(redis.call('TIME')[1])
local day=math.floor((now+28800)/86400)
local reset=(day+1)*86400-28800
if tonumber(redis.call('HGET',k,'day') or '-1')~=day then
 redis.call('DEL',k)
 redis.call('HSET',k,'day',day,'count',0,'last',0)
end
redis.call('EXPIREAT',k,reset+86400)
if ARGV[1]=='block' then
 redis.call('HSET',k,'blocked',1)
 return {0,'provider_quota',reset-now}
end
if redis.call('HGET',k,'blocked')=='1' then return {0,'provider_quota',reset-now} end
if redis.call('HEXISTS',k,'seen:'..ARGV[2])==1 then return {0,'duplicate',60} end
if tonumber(redis.call('HGET',k,'count') or '0')>=10 then return {0,'daily_limit',reset-now} end
local wait=60-(now-tonumber(redis.call('HGET',k,'last') or '0'))
if wait>0 then return {0,'cooldown',wait} end
redis.call('HINCRBY',k,'count',1)
redis.call('HSET',k,'last',now,'seen:'..ARGV[2],1)
return {1,'allowed',0}
`;
export class GeminiFailure extends Error {
  constructor(
    public code: string,
    public status: number,
    public retryAfter?: number,
  ) {
    super(code);
  }
}
export async function reserveBudget(
  config: GeminiConfig,
  id: string,
  action: "reserve" | "block" = "reserve",
  transport: typeof fetch = fetch,
) {
  const key = `framework:gemini:${createHash("sha256").update(config.apiKey).digest("hex").slice(0, 24)}:budget`;
  try {
    const response = await transport(config.redisUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.redisToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(["EVAL", BUDGET_LUA, "1", key, action, id]),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw Error();
    const body = await response.json(),
      r = body.result;
    if (
      body.error ||
      !Array.isArray(r) ||
      r.length !== 3 ||
      ![0, 1].includes(r[0]) ||
      ![
        "allowed",
        "provider_quota",
        "duplicate",
        "daily_limit",
        "cooldown",
      ].includes(r[1]) ||
      !Number.isSafeInteger(r[2]) ||
      r[2] < 0
    )
      throw Error();
    if ((r[0] === 1) !== (r[1] === "allowed")) throw Error();
    if (action === "block") return;
    if (r[0] !== 1) throw new GeminiFailure(r[1], 429, Math.max(1, r[2]));
  } catch (e) {
    if (e instanceof GeminiFailure) throw e;
    throw new GeminiFailure("limiter_unavailable", 503);
  }
}
