# Supabase 邮箱登录修复与后台配置

目标生产站点：**https://framework-studio-psi.vercel.app**。本修复从 main 独立建立 `fix/supabase-email-login`，不依赖或更新 PR #3/#4/#5。不需要 SQL，不修改任何项目记录、RLS、素材、资产编号或备份。

## 已确认的代码问题与线上待核验项

原回调只读取 `code` 并调用 `exchangeCodeForSession`，不处理 `token_hash`；缺少参数、缺少 verifier、服务失败等都统一变成“链接过期”。邮件模板与前端协议稍有不同就无法定位问题。

本修复补齐：

| 输入/场景 | 处理方式 |
| --- | --- |
| `/auth/callback?code=...` | 服务端 PKCE 交换；支持 `sb_flow_id`，缺失 verifier 单独提示 |
| 根地址误收到 `?code=...` / `?token_hash=...` | Proxy 在浏览器 SDK 初始化前转交 callback，防止重复兑换 |
| `token_hash` + 邮件类型 | GET 跳到确认页，不兑换；用户按按钮同站 POST 后 `verifyOtp` |
| 邮箱 + 数字验证码 | 浏览器 `verifyOtp({email,token,type:'email'})`，不依赖原 PKCE verifier |
| 旧的 `#access_token` 隐式链接 | 不把 fragment 当作服务端会话；清除敏感片段，提示改用验证码 |
| 验证成功 | 将 SDK 产生的全部 Cookie 分片写到最终重定向响应，再进入工作台 |
| 验证失败 | 只传固定错误原因到登录页，不传令牌/邮箱/原始服务商错误，不清除现有会话 |

浏览器关闭自动 URL 兑换，回调只由服务端处理；Proxy 不在 callback/confirm 上抢先刷新会话。HTTPS 会话 Cookie 使用 Secure、SameSite=Lax、Path=/，保持 SSR 浏览器客户端可读的 Cookie 模式，不错误地强设 HttpOnly。Auth 响应禁用缓存，确认页只允许同源 referrer（保证原生 POST 的 Origin 正确，且不发送给外站），其他回调使用 no-referrer。

代码问题可确认；**不能据此断言生产环境唯一原因**。本环境没有 Supabase 管理连接，出站规则也不允许直接访问项目域名，无法读取真实邮件模板、SMTP、Auth 日志或 Vercel 部署配置；公开站点抓取也未成功。需要按下面步骤核对。没有发送任何真实测试邮件。

## 第一步：先部署修复代码，再改邮件模板

1. 审阅这个独立修复 PR。修复代码还没部署时，不要先切换生产模板，否则旧回调不认识 token_hash。
2. 在 Vercel 用修复分支生成 Preview；要更新正式网站，需要你审阅后安排部署到该正式域名。本次不会自动合并或发布生产。
3. Vercel → 项目 → Settings → Environment Variables，确认 Production 配置：

| 变量 | 填写内容 |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://tbwfywkegjyjsrwddcko.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | 从同一个 Supabase 项目的 API Keys 页面复制 `sb_publishable_...` Key |
| `NEXT_PUBLIC_SITE_URL` | `https://framework-studio-psi.vercel.app`（可选但推荐，根域名，无 /auth 路径） |

4. 保留现有 OpenAI 付费开关为 false；无需添加任何数据库密码、service_role 或 Secret Key。
5. 公开环境变量是在构建时嵌入浏览器代码的，修改后必须重新部署。生产 Build Command 仍是 `npm run build`。
6. Preview 环境不要硬套生产 `NEXT_PUBLIC_SITE_URL`：留空，或填写该 Preview 的精确 origin，并把 Preview 的 callback 加入 Supabase 白名单。登录应从你要使用的同一网站发起。
7. 不要把本地测试用的 loopback URL、测试 Key、`AUTH_FIXTURE_TEST` 或测试启动命令配置到 Vercel。

## 第二步：核对 Supabase 的登录域名

1. Supabase 控制台打开 **framework-studio-db**。
2. Authentication → URL Configuration：
   - **Site URL**：`https://framework-studio-psi.vercel.app`
   - **Redirect URLs**：添加 `https://framework-studio-psi.vercel.app/auth/callback`
3. 本地开发确有需要时，额外添加 `http://localhost:3000/auth/callback`、`http://127.0.0.1:3000/auth/callback`；不要混用这两个地址发起/完成旧 PKCE 链接登录，它们不是同一 Cookie 域名。
4. Preview 测试需要把实际 Preview 的 `/auth/callback` 加入白名单，不要随意添加全域通配符。
5. `/auth/confirm` 是本网站内部的确认页，不需要作为 `signInWithOtp` 的额外回调白名单项。
6. Authentication → Sign In / Providers → Email，确认启用邮箱登录。

## 第三步：邮件同时提供验证码和安全确认链接

在 Supabase **Authentication → Email Templates**，先保留原模板副本，再更新下面两个登录相关模板。不同控制台版本的菜单可能显示为 Emails / Templates。

### Magic Link（已有用户）

可把主题改为“FRAMEWORK Studio 登录验证码”，正文复制：

```html
<h2>登录 FRAMEWORK Studio</h2>
<p>推荐回到发起登录的网站，输入本次验证码：</p>
<p style="font-size: 28px; letter-spacing: 4px;"><strong>{{ .Token }}</strong></p>
<p>也可以打开下面的链接，在页面上再次确认登录：</p>
<p><a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&amp;type=email">继续验证登录</a></p>
<p>只使用最新一封邮件。链接与验证码共用一次性令牌；成功后不要重复使用。</p>
<p>如果不是你发起的请求，请忽略这封邮件。</p>
```

### Confirm signup（首次使用邮箱）

使用相同内容，但将链接中的 `type=email` 改成 `type=signup`：

```html
<p><strong>{{ .Token }}</strong></p>
<p><a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&amp;type=signup">确认邮箱并登录</a></p>
```

`.RedirectTo` 来自前端传入的完整 `https://当前站点/auth/callback`，请从网站的“发送登录邮件”按钮测试，不要把 `?token_hash=...` 手动加到已有 `.ConfirmationURL` 后面。不要只发一个普通首页链接。若你的模板固定使用 `.SiteURL`，也必须明确拼接 `/auth/callback?token_hash=...&type=...`；Preview 链接便会始终去 Site URL，不适合验证 Preview。

**不需要调整重置密码、邀请、邮箱变更模板。**这些不是本次登录回调支持的流程。

如果使用外部 SMTP 的点击跟踪 / link tracking，请在服务商后台关闭认证邮件的链接重写。邮件安全扫描可能提前访问链接；新模板的应用 GET 不会兑换令牌，要用户点击确认按钮才 POST 验证。旧 `.ConfirmationURL` 在到达网站前就可能被消耗，旧邮件无法通过改代码恢复，改用最新邮件。

## 第四步：处理 email rate limit exceeded

验证码与 Magic Link 使用同一个发信机制，改用验证码**不能绕过发送配额**。

- 不要反复点击发送；新 UI 默认 60 秒冷却，429 时本地冷却 10 分钟，不自动重试，刷新不立即解除冷却。
- 10 分钟只是客户端防重复点击措施，不代表 Supabase 配额会在 10 分钟后恢复。
- Authentication → Rate Limits / Logs，查看是否是项目发信配额、同邮箱间隔或 IP 验证频率。记录错误码与时间，不分享完整邮件链接、令牌或 Cookie。
- 官方文档当前注明内置邮件服务按项目限额 **2 封/小时**，同用户 OTP 请求默认间隔 60 秒；实际以你项目后台和邮件供应商设置为准。
- 可先等待配额恢复后只发一封做验收，不需要购买服务。若已有可用 SMTP，可按官方设置接入并检查它自己的发送额度、授权收件人及发件域名。不需要为本次修复购买订阅。
- 验证已收到的有效验证码，不会再次发信；但验证码验证也有独立的频率限制。

## 第五步：低频验收，不碰项目数据

1. 打开正式域名的 `/auth/login`（或工作台 → 项目与云端设置）。
2. 输入你原来使用的同一个邮箱，只点击一次“发送登录邮件”。
3. 优先复制最新邮件的数字验证码，在目标浏览器输入“邮箱”和“邮箱验证码”，点击“验证并登录”。此方式不要求邮件在同一浏览器打开。
4. 成功后刷新，确认仍显示登录状态。登录本身不会推送、迁移或覆盖项目数据。需要查看旧项目时再手动“从云端载入”，不要点击恢复示例或推送空项目。
5. 测试链接时，在免费邮件配额允许的情况下再单独申请一封新邮件：打开链接 → 看到确认页 → 点击“确认并登录” → 回到工作台。确认页为避免保留敏感 URL，会清理地址栏；若刷新确认页，应重新打开原邮件或输入验证码，不必连续重发邮件。
6. 旧 `?code=` 链接只有在发起登录的同一设备、同一浏览器、同一 origin 保留 verifier 时才能兑换。邮件应用内置浏览器可能是另一个 Cookie 空间，优先用验证码回到 Safari/Chrome 登录。
7. 链接和 OTP 一次成功后都不应重复使用；连续申请新邮件可能使旧邮件不可用。
8. 如果错误重现：Vercel Runtime Logs 搜索 `[auth/callback]` 的固定 `reason`；Supabase Auth Logs 查对应时间。`pkce_verifier_missing` 表示本地 verifier 不存在，不一定真的过期；`missing_credentials` 多为模板/跳转参数问题；`expired` 才对应令牌过期/已用；`wrong_origin` 检查 Vercel canonical 配置与访问域名。

不要通过关闭 RLS、重建表、删除用户、清理全部网站数据或复制 service_role Key 来修登录。这些操作与本修复无关，可能影响已有项目。

## 本地测试方式

```bash
npm test
npm run build
npm run typecheck
npm run test:auth:e2e
```

最后一个命令会创建仅监听回环地址的 Auth 替身、用测试 URL/Key 构建并启动网站，再运行浏览器用例。不发送真实邮件、不访问生产 Supabase、不执行项目数据操作。fixture 记录的项目数据请求应为 0。不会修改 `.env.local`。测试完成自动停止两个本地服务。

此命令生成的 `.next` 是专门的测试构建；之后若要正常 `npm start`，请先用真实本地配置重新运行 `npm run build`。Vercel 不要使用测试启动命令。

服务端测试用真实 Supabase SDK 验证 Cookie 分片、PKCE challenge/verifier 和 token_hash 分支；浏览器端覆盖 fresh-browser hash 确认、旧 PKCE、首页误重定向、验证码、冷却、429、重复链接和刷新后会话保留。真实邮件送达、Safari Cookie 策略、后台模板和生产域名仍需按上述步骤验收。

## 官方依据

- [SSR 客户端与 Cookie](https://supabase.com/docs/guides/auth/server-side/creating-a-client?queryGroups=framework&framework=nextjs)
- [PKCE verifier 的同浏览器限制](https://supabase.com/docs/guides/auth/sessions/pkce-flow)
- [邮箱验证码 / token_hash](https://supabase.com/docs/guides/auth/auth-email-passwordless)
- [邮件模板、预取和点击跟踪](https://supabase.com/docs/guides/auth/auth-email-templates)
- [邮件与验证限额](https://supabase.com/docs/guides/auth/rate-limits)
