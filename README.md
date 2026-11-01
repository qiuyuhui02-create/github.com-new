# FRAMEWORK Studio

中文 AI 影视制作工作台。Next.js 16 / React 19 / TypeScript / Tailwind CSS 4，兼容 Vercel。

## 免费密码登录（当前方案）

首次使用 Supabase 默认 Magic Link 验证原邮箱，进入“账号安全 → 设置密码”。以后默认使用邮箱＋密码，Magic Link 作为备用。无需 Custom SMTP、修改模板或升级套餐；不重新注册用户、不改 user ID。步骤见 [密码登录指南](docs/PASSWORD_LOGIN.md)。

## 邮箱登录修复与排查

保留 PR #6 的 PKCE、Cookie 与 token_hash 兼容修复。当前 `/auth/login` 默认密码登录，使用原始默认 Magic Link 即可完成首次验证，不以自定义模板或验证码为前提。底层排查见 [邮箱回调修复指南](docs/AUTH_LOGIN_FIX.md)，其中历史自定义模板步骤不适用于当前免费方案。

## 快速预览（无需 API Key）

需要 Node.js 20.9+（推荐 Node 22 或 24）。在本项目目录打开终端：

```bash
npm ci
npm run dev
```

用浏览器打开 http://localhost:3000 。初次打开会显示“最后的记忆”示例项目，包含 6 个资产、3 个分镜、3 个任务和 2 个 Prompt。示例封面为项目内 SVG 插画，无需外部图片服务。

生产环境本地运行：

```bash
npm run build
npm start
```

## 已实现的七个模块

- 今日计划：添加任务、日期、优先级排序、完成状态、进度、删除。
- 资产制作：人物/场景/道具创建与编辑、主图/参考图上传、模型工作流记录、状态和标签、历史版本载入、删除。
- 资产总览：卡片/列表、关键词搜索、类别和制作状态筛选。
- 分镜制作：镜号、名称、景别、时长、机位、运动、多个关联资产，编辑和删除。
- 分镜总览：故事板、按时长比例展示的时间线、前移排序。
- Prompt 中心：保存、编辑、分类字段、搜索分类/标题/内容、复制和删除。
- AI Agent：本地规则检查未完成资产及分镜关联、生成镜头 Prompt 模板、整理计划，结果可存入 Prompt 中心；另有 OpenAI 服务端接口。

## 演示模式与云端边界

未配置任何凭据也可以使用全部基础管理功能。数据自动保存在当前浏览器的 localStorage，**不会自动进入云端**。请在“项目与云端设置”导出 JSON 备份；也支持导入和恢复示例。上传单张图片限 5MB，本地浏览器总容量有限，请尽量使用压缩小图。保存失败会提示。历史版本保存上一版的图片、描述和模型，最多 20 版；恢复后需再次点击保存。

生成模型字段仅用于记录；本版本没有图像或视频生成 API，也不会执行模型调用。示例图片为插画。

Supabase 已接入官方 `@supabase/ssr`：浏览器/服务端客户端、Next.js 16 `proxy.ts` 会话刷新、PKCE 登录回调、按账号分开的本地缓存。资产、分镜、任务和 Prompt 以用户专属 JSON 项目原子保存，带版本冲突检查。支持直接把 JSON 备份与内嵌图片导入云端。

**真实数据库尚未联调**：本次环境出站规则不允许目标 Supabase 域名。仓库提供可重复执行的 SQL 升级脚本、只读审计脚本和 PostgreSQL 双用户 RLS 自动化测试。请按下方操作完成真实项目配置。

## 配置 Supabase 与 Vercel

完整的新手步骤见 [Supabase / Vercel 配置指南](docs/SUPABASE_SETUP.md)，包括数据库检查、建表、RLS、邮箱回调、环境变量、备份迁移和两个账号的验收方法。

需要在 Vercel 设置 `NEXT_PUBLIC_SUPABASE_URL` 与 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`，重新部署；在 Supabase 执行 `supabase/schema.sql`，配置 `/auth/callback` 回调地址。无需数据库密码、service_role 或 Secret Key。

## 可选 OpenAI（可能收费）

仅在你决定授权调用后设置服务端变量：

```dotenv
OPENAI_API_KEY=你的密钥
OPENAI_MODEL=gpt-4.1-mini
ENABLE_PAID_AI=true
```

不要使用 `NEXT_PUBLIC_` 前缀保存 OpenAI Key。`.env.local` 已被 Git 忽略。服务端还要求有效 Supabase 用户令牌，并只读取该用户受 RLS 保护的云端数据。先推送项目再调用；每次界面调用前都会弹出费用确认。关闭开关或缺少 Key 时返回 503，不会调用 OpenAI。服务商网络需允许 Supabase 与 api.openai.com。

## 检查与测试

```bash
npm test
npm run typecheck
npm run build
```

浏览器回归测试（先启动 `npm start` 或 `npm run dev`）：

```bash
# 此开发容器已有 /usr/bin/chromium；本机可改为自己的 Chromium 可执行路径
CHROMIUM_PATH=/usr/bin/chromium npx playwright test
```

测试覆盖资产工作流、移动端、云端导入和冲突处理，以及基于 PGlite PostgreSQL 的双用户 RLS、私有目录边界和幂等升级测试。真实云端联调仍需完成控制台配置及双账号验收。

## 后续部署到 Vercel

1. 将开发分支推送到 GitHub，在 Vercel 中 Import 此仓库。
2. Framework 选择 Next.js，构建命令 `npm run build`（其余保持默认）。
3. 配置上述环境变量；如仅需演示，不配置任何密钥即可。`ENABLE_PAID_AI` 保持 false。
4. 部署后在 Supabase 配置新的回调域名。
5. 验证登录、RLS、上传和项目推拉后，再按需开启 AI。

当前版本没有自动部署到 Vercel。
