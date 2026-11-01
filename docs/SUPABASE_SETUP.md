# FRAMEWORK Studio：Supabase 与 Vercel 配置（新手步骤）

这份说明适用于 Supabase 项目 **framework-studio-db**。项目 URL 是 `https://tbwfywkegjyjsrwddcko.supabase.co`。项目已创建不代表表、RLS、Storage 或登录回调已经配置。

本次开发没有连接到真实数据库：开发环境的出站规则未允许该域名，也没有数据库管理凭据。已通过本地 PostgreSQL 的双用户 RLS 与保存冲突测试；以下控制台步骤仍需你执行。

> 混合存储版本请同时阅读 [Mac 本地素材指南](LOCAL_MEDIA.md)。数据库在 schema.sql 后追加执行 hybrid-storage.sql；以下登录与部署设置继续有效。新媒体不再上传到 Supabase。

## 1. 先保护现有数据

1. 打开当前网站，点击左下角“项目与云端设置”。
2. 点击“导出 JSON 备份”，把文件保存在电脑上。
3. 如果 Supabase 已有重要数据，可先在控制台进行备份。下面的升级 SQL 保留项目记录，不会删除它们。
4. 当前每个用户拥有一个云端项目，资产、分镜、任务和 Prompt 在同一 JSON 快照中保存。不是四个独立表，也暂不支持多人共同编辑一个项目。

## 2. 检查真实数据库

1. 打开 Supabase 控制台，选择 **framework-studio-db**。
2. 左侧打开 **SQL Editor**，点击 **New query**。
3. 从仓库打开 `supabase/check.sql`，复制全部内容到编辑器，点击 **Run**。
4. 这是只读检查，不会修改数据。表尚不存在时，相关结果会是空的。
5. 检查是否已有 `public.studio_projects`，其中 `user_id` 应为 UUID 主键、关联 `auth.users(id)`；`data` 为 JSONB；`updated_at` 为时间；`version` 为 bigint。
6. `rls_enabled` 和 `rls_forced` 应为 `true`；`assets` bucket 的 `public` 应为 `false`。

## 3. 创建或升级表、策略、存储桶

1. SQL Editor 新建另一个查询。
2. 复制仓库最新版 **`supabase/schema.sql`** 全部内容，点击 **Run**。
3. 此脚本可以重复运行，会为旧表补充 `version`，更新本应用的策略，并创建 `save_studio_project` 函数。已有项目数据保持不变。
4. 再运行 `check.sql`，确认：
   - `studio_projects` 有 `version` 列。
   - `Owner reads/inserts/updates/deletes` 四个策略只允许 `auth.uid() = user_id`。
   - `Owner boundary` 是 restrictive 策略，防止其他宽松策略扩大本表的用户权限。
   - `save_studio_project` 为 `INVOKER`，通过登录用户和 RLS 执行，不是管理员提权函数。
   - Storage 存在 `Owner uploads/views/removes`、`Asset owner boundary`、`No anonymous assets` 策略。
   - `assets` 是私有桶，只接受 PNG、JPEG、WebP，单文件上限 5MB。
5. 表结构与上述完全不同或执行报错时，保留错误信息，不要删表重建。可把错误文本发给开发者排查。

说明：Supabase 的 SQL Editor 通常使用高权限 `postgres` 角色，它可能绕过 RLS。因此“在 SQL Editor 能看见所有数据”不能用来判断普通用户是否串号。请执行第 8 节的双账号验证。

## 4. 配置邮箱登录

1. 左侧进入 **Authentication → Sign In / Providers → Email**（控制台版本不同，名称可能略有变化），启用 Email 登录。
2. 进入 **Authentication → URL Configuration**。
3. **Site URL** 填你的正式 Vercel 网站地址，例如 `https://你的项目.vercel.app`。
4. 在 **Redirect URLs** 添加：
   - `https://你的项目.vercel.app/auth/callback`
   - `http://localhost:3000/auth/callback`（仅本地开发需要）
   - 如果使用 Vercel Preview，为需要测试的预览域名添加对应的 `/auth/callback`；不要随意允许不受控的域名。
5. 保存设置。
6. 默认可以通过邮件中的登录链接登录。如果希望也使用验证码，在 Email Templates 的 Magic Link 模板保留 `{{ .ConfirmationURL }}`，并加入验证码 `{{ .Token }}`。不要自行把登录链接改成普通网站首页。
7. 默认邮件服务有发送频率和收件人限制；若邮件无法发送，检查 Auth 日志、垃圾邮件和邮件服务限制。公开上线可按 Supabase 指引配置 SMTP。

新实现采用 PKCE：登录链接最好在发起登录的同一浏览器打开。跨设备登录请在原浏览器输入邮件验证码。旧版本登录状态需要重新登录。

## 5. 配置 Vercel 环境变量

1. 打开 Vercel Dashboard，选中已部署的 FRAMEWORK Studio 项目。
2. 进入 **Settings → Environment Variables**。
3. 添加以下两项，值从 Supabase 项目的 Connect / API Keys 页面复制：

| 名称 | 填写内容 | 环境 |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | 项目 URL | Production；需要预览测试时也勾选 Preview |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_` 开头的 Publishable Key | 同上 |
| `ENABLE_PAID_AI` | `false` | Production / Preview |

Publishable Key 本来就会发送到浏览器，安全隔离依靠登录身份和 RLS。**不要填写数据库密码、`service_role`、`sb_secret_` Key，也不需要配置 `DATABASE_URL`。**旧的 `NEXT_PUBLIC_SUPABASE_ANON_KEY` 仍兼容，但新变量优先，推荐使用 Publishable Key。

4. 保存后进入 **Deployments**，部署此次代码所在分支。环境变量会在构建时写入浏览器代码，必须重新部署才生效。
5. 如果 Vercel 的 Production Branch 是 `main`，提交到开发分支只会生成 Preview（取决于你的 Vercel Git 设置）；验证后再把开发分支合并到生产分支。本次代码提交不会擅自修改生产分支设置。
6. AI 不属于本次数据库配置，不需要 OpenAI Key。保留付费开关关闭。

## 6. 本地开发（可选）

本次已在开发工作区写入 `.env.local`，Git 会忽略它；代码仓库只保留无实际值的 `.env.example`。在你自己的电脑上运行时：

1. 安装 Node.js 20.9+（推荐 22 或 24）。
2. 下载对应开发分支，在项目目录复制 `.env.example` 为 `.env.local`。
3. 填入上表两项配置，保存。
4. 运行 `npm ci`、`npm run dev`，打开 `http://localhost:3000`。
5. 配置变更后重启开发服务。

## 7. 登录、保存与 JSON 导入

### 普通云端使用

1. 打开网站 → “项目与云端设置”，输入邮箱 → “发送登录邮件”。
2. 点击邮件登录链接，或在网站输入邮件验证码并验证。
3. 登录后点击 **从云端载入**。新账号没有数据时，会得到空项目；原有演示数据仍保留在未登录的演示空间。
4. 创建或编辑资产、分镜、任务、Prompt。编辑首先保存在此浏览器的当前账号缓存。
5. 点击 **推送到云端**，成功后会显示同步时间。四类数据一次原子保存。
6. 换设备登录后点击 **从云端载入**，恢复云端项目。不会自动上传演示项目或自动覆盖云端。

### 把旧演示数据导入云端

先导出原 JSON。含 Base64 或旧 Storage 图片的备份先导入本地，按 [迁移指南](LOCAL_MEDIA.md) 提取旧图片到 Mac，再推送轻量元数据。已有本地文件清单的 JSON 可通过“导入 JSON 元数据到云端（不含媒体）”导入；该操作替换整个当前用户项目，不与云端合并。媒体原件必须另外备份，不能靠 JSON 恢复。

### 冲突与失败

- 若其他页面已经更新云端项目，旧版本保存会被拒绝，不会无声覆盖。先导出本地 JSON，再从云端载入并整理需要保留的更改，然后重试。
- 断网或 RLS 错误时，本地项目保持原样。不要把本地自动保存提示当成云端同步成功。
- 新版只登记本地文件，Supabase 不接收新媒体。旧云端素材保留，不会自动删除。
- 历史版本最多保留 20 版。签名图片链接有效期一小时，过期后刷新页面。
- 账号缓存按用户 ID 分开，不会把账号 A 的内容直接显示给 B；但浏览器本地缓存不是加密保险箱，共用电脑上使用后应退出并按需清理网站数据。

## 8. 上线前实际验收（免费，无需调用 OpenAI）

1. 用两个不同邮箱创建账号 A、B，分别使用普通浏览器和无痕窗口登录。
2. A 从云端载入后创建“只属于 A 的资产”，创建一个关联此资产的分镜、任务、Prompt，推送。
3. B 从云端载入，不应该看到 A 的任何记录。B 创建自己的项目并推送。
4. A 再次载入，A 的项目仍完整，且看不到 B 的内容。
5. A 登记本地图片并推送；B 不应看到 A 的元数据。旧 Storage 私有素材权限保持不变；新媒体不上传云端。
6. 用 A 打开两个窗口，都载入相同版本。第一个窗口修改并推送；第二个窗口推送应提示版本冲突。
7. A 导出轻量 JSON，在同账号导入云端，再另开浏览器载入。元数据应恢复；媒体必须重新选择 Mac 本地目录。
8. 退出登录后应回到原来的本地演示空间；付费 AI 保持关闭。

## 9. 常见问题

- **表或函数尚未配置**：执行当前分支的 `supabase/schema.sql`，然后重新载入项目。
- **权限不足 / RLS**：先确认登录成功，再检查 SQL 是否完整执行。不要通过关闭 RLS 或换 service_role Key 解决。
- **登录链接无法验证**：检查 `/auth/callback` 白名单、同一浏览器和邮件有效期，重新发送链接或使用验证码。
- **邮件发送失败**：查看 Supabase Auth Logs 与 SMTP 配置。
- **数据库项目暂停**：到 Supabase 控制台恢复项目，再重试。
- **本地正常、Vercel 不正常**：检查环境变量是否勾选了对应部署环境，并重新部署。
- **未显示实时云端状态**：配置存在只表示可尝试连接；界面在实际成功读写前显示“云端尚未验证”。
