# Gemini 单场剧本修改：免费、个人访问码、跨实例限流

本改动基于 PR #8 的新版剧本工作台。原稿、工作稿和人工定稿不会被自动修改；手动三 AI 栏始终可以使用，不要求 Supabase 登录。不执行 SQL，不创建或修改 Supabase 表/策略，不启用收费模型或收费回退。

## 1. 先确认免费边界

2026-11-01 核验 [Google 官方价格页](https://ai.google.dev/gemini-api/docs/pricing)：`gemini-2.5-flash-lite` 的 Standard 文本输入/输出支持 Free Tier。本版本在服务端固定这一型号，不能从浏览器切换模型、URL 或 API Key，不使用搜索、工具、缓存、Batch、图片、视频或其他模型。

你已确认当前 Google 项目为 Free Tier、未关联付费结算账户。请持续保持这个状态。API 没有一个可以在每次 generateContent 请求中强制“只走免费层”的参数；同名模型在付费项目下可能收费，因此只使用未关联结算的免费项目 Key。`GEMINI_FREE_TIER_CONFIRMED=true` 是管理员核验声明，不是自动查账或免费余额证明。如果以后更换 Key、关联结算或免费政策变化，先把 `GEMINI_ENABLED=false` 并重新部署，复核后再决定。

真实剩余额度由 Google 管理，本网站不伪造余额。详见 [Google 计费说明](https://ai.google.dev/gemini-api/docs/billing) 与 [实时限额说明](https://ai.google.dev/gemini-api/docs/rate-limits)。Google 的免费服务可能将输入/输出用于改进产品：调用前页面会明确提示，只发送选中的一场文字与修改要求，不读取整个项目，不发送人物资产、私人日记或完整毕业剧本。

## 2. 为什么需要免费的共享计数库

Vercel 会运行多个无状态实例，内存 Map、浏览器 localStorage 和 Cookie 无法可靠限制整个部署的请求次数。为满足可靠限流，同时不修改 Supabase，本版本使用 **Upstash Redis Free** 的单条原子 Lua 命令。

- 独立的个人访问码（至少 32 字符，建议随机 64 位十六进制）验证通过后才访问计数库。
- 相同 Gemini Key 的 Preview/Production 共享计数，跨实例串行检查。
- 每 60 秒最多接受 1 次；每个北京时间自然日最多接受 10 次。失败/取消也占已登记次数，不退款、不自动重试。
- 已登记的请求 UUID 拒绝重放，直到该预算日期结束。
- Google 返回 429 时，标记共享停止状态，当日后续调用不再到达 Google。即使只是分钟限额，也保守停止到下一预算日；Google 的额度重置时间可能不同，下一日仍不足时会再次停止。
- 计数库不可用、配置缺失或免费额度用完时停止自动调用，不退回单实例内存计数，不自动升级。
- Redis 只存次数、时间、去重 UUID 和停止状态；不存剧本、理由、访问码或 Gemini Key。计数键只使用 Key 的截断 SHA-256 标识。

在 [Upstash Console](https://console.upstash.com/) 自行创建 **Free / $0** Redis 数据库，不添加银行卡、不选择 Pay as You Go、不启用 Auto Upgrade。建议使用专用库并关闭逐出/自动升级；不要删除计数键或让其他应用清空它。不要通过要求购买或绑定支付的集成路径创建。官方参考：[Free 定价](https://upstash.com/pricing/redis)、[REST 接口](https://upstash.com/docs/redis/features/restapi)、[升级与付款方式的影响](https://upstash.com/docs/redis/howto/upgrade-database)。若不希望新增免费计数库，就保持 Gemini 自动功能关闭，手动三栏不受影响。

## 3. Vercel Preview 环境变量

进入 Vercel → framework-studio → Settings → Environment Variables。在 **Preview** 环境设置，最好仅绑定 `feat/gemini-screenplay` 分支：

| 名称                         | 值                                   | 保护方式                                    |
| ---------------------------- | ------------------------------------ | ------------------------------------------- |
| `GEMINI_API_KEY`             | 现有未关联付费结算的 Google 项目 Key | Secret；Production 的值不会自动进入 Preview |
| `GEMINI_ACCESS_CODE`         | 你单独生成的随机个人访问码           | Secret，不是 Gemini Key                     |
| `GEMINI_ENABLED`             | `true`                               | 主动启用；默认 `false`                      |
| `GEMINI_FREE_TIER_CONFIRMED` | `true`                               | 已人工确认项目免费、未关联结算              |
| `UPSTASH_REDIS_REST_URL`     | Free 数据库的 HTTPS REST URL         | 仅服务端，不加 `NEXT_PUBLIC_`               |
| `UPSTASH_REDIS_REST_TOKEN`   | Free 数据库的可写 REST Token         | Secret，不能用 Readonly Token               |

在 Mac 本地生成独立访问码（不要把生成的值发到聊天或提交 Git）：

```bash
node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))'
```

将生成值保存到自己的密码管理器，并填入 Vercel 的 `GEMINI_ACCESS_CODE`。修改环境变量后 **Redeploy Preview**。无需 `GEMINI_MODEL` 变量，也没有允许付费回退的开关。既有 Supabase 变量保持不变；Preview 不要错误继承正式域名的 canonical 登录设置。

不要给不可信的外部分支/PR 共享这些 Secret。Production 原有 `GEMINI_API_KEY` 不足以单独启用接口；要上线自动修改，需要在 Production 也设置其余五项并重新部署。在用户验收前不合并或变更生产环境。

## 4. Preview 的访问保护

Vercel → 项目 Settings → Deployment Protection：启用 **Vercel Authentication**，覆盖 Preview（Standard Protection/Preview 部署范围，按控制台名称选择）。用自己的 Vercel 账号访问受保护的 Preview。这是预览部署保护，不是 Supabase 邮箱登录，不会发送 Supabase 登录邮件。

不要开启 **Password Protection**，该功能不属于 Hobby 免费能力。参考 [Vercel Authentication](https://vercel.com/docs/deployment-protection/methods-to-protect-deployments/vercel-authentication) 和 [保护方式/套餐](https://vercel.com/docs/deployment-protection)。不要公开带 bypass 的分享链接，不向浏览器设置任何 bypass Secret。

即使 Preview 有 Vercel 保护，应用内的 Gemini API 仍要求个人访问码和共享限流。正式网站可继续公开提供本地核心功能，无需 Supabase 登录；只有 Gemini 自动修改要求个人访问码。它只保存在当前组件内存，刷新/切换场景或离开修改页后需要重新输入，不写入 JSON、localStorage、Cookie 或日志。

## 5. 页面使用及单次短场景验收

先完成模拟测试，再进行下面 **一次** 真实测试。请用临时示例项目，不要导入完整毕业剧本；预览域名与正式域名的本地缓存独立。

1. 打开 Preview → 剧本工作台，将下面的临时短场景作为原始剧本导入：

   ```text
   ○ 放課後の教室

   遥：明日も、来る？
   凛：うん。
   ```

2. 在 Gemini 本场修改中选择“本场原始剧本”，方向“日系自然对白”，修改要求“保留人物与场景，让对白稍微含蓄；最多150字”。输入**个人访问码**，不要输入 API Key。
3. 点击一次“AI 修改本场剧本”，核对提示仅发送这一小场景后确认。不会在打开页面、选择方向、保存项目或刷新时自动调用。
4. 成功后出现独立的“Gemini 修改结果与理由”。先核对剧本和理由，原稿、工作稿与正式定稿应完全不变。
5. 只有点击“确认采用到 Gemini 对比栏”并确认后，结果才写入结果1；随后仍要自己合并候选并确认，才成为正式定稿。取消采用不会覆盖原结果1。
6. 自动结果和理由自动保存在本地，并进入 JSON 备份；此新增独立建议暂不推送 Supabase。确认采用后的文字按既有手动栏规则保存。手机只读模式可阅读建议。
7. 若 429、服务未配置、网络或结果不完整，界面会停止/提示，已有建议和三栏手动内容保持。不要用支付、升级或自动重试来解决。

可选的开发者单次测试：在本机安全配置上述六项后运行下列命令。脚本只使用上面的固定临时日文短场景，固定去重 UUID，同一天最多真实发送一次；摘要只打印状态、模型、字符数和理由数量，不打印密钥或剧本。

```bash
RUN_GEMINI_SMOKE_ONCE=1 node --env-file=.env.local --import tsx scripts/gemini-smoke.ts
```

`.env.local` 已忽略，不提交；不要将 Secret 放在 shell 命令参数、截图或聊天中。脚本不由 build、npm test、CI 或页面访问自动运行。

## 6. 已验证与未完成的部分

- 模拟官方 REST 返回、错误/截断/安全拦截、缺配置/错误访问码/跨域/超长/非法模型字段、密钥不泄露、限流失败关闭、额度停止。
- 本地真实 Redis 验证原子并发、重放、每日上限、日期重置和共享停止，不是只用内存模拟限流。
- 浏览器模拟返回验证并发人工编辑保留、独立理由、取消/确认采用、定稿不变、JSON 备份、额度耗尽后仍可手动编辑。
- 真实 Google 短测尚未完成：当前开发环境没有 Production Secret，也没有 Gemini/Upstash 域名出站权限。显式 smoke 入口在配置检查处停止，没有发送真实 Google 请求。Vercel Preview 完成上述设置后需按第5节执行一次验收；不能把模拟测试或“部署成功”当作真实调用通过。

本地回归：

```bash
npm test
npm run test:auth:e2e
npm run build
npm run typecheck
```

Redis 集成测试需要本机 Redis 二进制，使用临时 Unix socket，测试结束删除临时目录，不访问云端：

```bash
REDIS_SERVER_BIN=/path/to/redis-server REDIS_CLI_BIN=/path/to/redis-cli npm test
```

未指定二进制时这一项明确标记 skipped，其余测试仍运行。本次开发环境已用 Redis 7.4.2 实际执行，不连接生产 Redis。浏览器测试固定关闭真实 Gemini，模拟认证邮件也只到本地替身。

## 7. PR 依赖

本开发分支从 PR #8 的 `b5924d5` 开始；当前 main 尚未合并 #8。新的 Gemini PR 暂以 #8 分支为 base，便于单独审查 Gemini 差异，不会更改 #8 分支。上线顺序：先验收并合并 #8，再将 Gemini PR 的 base 改为 main，复核后单独合并。开发过程不自动合并任何 PR，不修改已有 #3/#4/#5 或生产数据。
