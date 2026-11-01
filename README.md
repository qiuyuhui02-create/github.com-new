# FRAMEWORK Studio

中文 AI 影视制作工作台。Next.js 16 / React 19 / TypeScript / Tailwind CSS 4，兼容 Vercel。

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

Supabase 已实现邮箱登录、手动推送/载入项目和私有图片存储适配，**尚未连接真实 Supabase 项目或进行云端联调**。云端使用按用户隔离的 JSON 项目快照，不含多人协作或冲突合并。推送会覆盖当前用户的云端快照，载入会替换本地项目，操作前有确认。登录不会自动上传演示数据。

OpenAI 接口已实现，但默认关闭。开发测试仅验证关闭状态，没有执行付费调用。本地 Agent 是确定性的规则和模板，界面已标注，不是大模型推理。

## 配置 Supabase

1. 在 Supabase 新建项目，在 SQL Editor 执行 `supabase/schema.sql`（首次执行一次），创建项目表、RLS 策略和私有 `assets` bucket。
2. 在 Authentication → URL Configuration 填入本地与 Vercel 域名的 Site URL / Redirect URLs。
3. 开启邮箱登录。可点击登录邮件中的链接；如使用验证码，请在 Supabase 邮件模板中包含 `{{ .Token }}`。
4. 复制 `.env.example` 为 `.env.local`，填入项目 URL 和浏览器可用的 anon/publishable key。不要填 service_role。
5. 重启 `npm run dev`，在左下角“项目与云端设置”登录。
6. 点击“推送到云端”，再测试“从云端载入”。已登录上传图片时会存入私有 Storage，显示时生成 1 小时签名 URL；过期后刷新页面。上传后请保存资产并推送项目。

私有图片对象不会在移除资产/版本时立即物理删除，避免历史版本与快照断链；可在 Supabase Storage 控制台管理孤立对象。此版本不是素材存储清理工具。

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

测试覆盖资产新增/上传/版本/持久化、搜索、分镜关联和时间线、任务完成、Prompt 管理、本地 Agent、移动端布局和关闭付费 API 的行为。云端联调需要你自己的服务账号。

## 后续部署到 Vercel

1. 将开发分支推送到 GitHub，在 Vercel 中 Import 此仓库。
2. Framework 选择 Next.js，构建命令 `npm run build`（其余保持默认）。
3. 配置上述环境变量；如仅需演示，不配置任何密钥即可。`ENABLE_PAID_AI` 保持 false。
4. 部署后在 Supabase 配置新的回调域名。
5. 验证登录、RLS、上传和项目推拉后，再按需开启 AI。

当前版本没有自动部署到 Vercel。
