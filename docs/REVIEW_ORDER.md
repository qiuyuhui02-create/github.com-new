# 分阶段审阅、预览与上线

本轮没有修改 main，没有执行线上 SQL，没有删除 Supabase 数据或 SSD 素材，没有执行真实模型调用。

三个分支串联，后一个包含前一个的代码：

1. `feat/hybrid-media`：第一阶段本地素材与迁移，PR #3 → main。
2. `feat/script-workbench`：第二阶段剧本，PR #4 → feat/hybrid-media（便于只审阅本阶段差异）。
3. `feat/multi-ai-compare`：第三阶段模型对比，PR #5 → feat/script-workbench。

## 合并顺序

先审阅合并 #3。之后在 #4 的 GitHub 页面点击标题旁 Edit，将 base 改为 main，再审阅合并 #4。最后将 #5 的 base 改为 main 并合并。不要把后两项直接合并到前一个开发分支后就误以为生产 main 已更新；本轮不自动合并。

## 预览完整版本

若 Vercel 已连接 GitHub，请打开最后一个 PR 的 Vercel Preview（需你的 Vercel 配置允许分支预览）。最后分支含全部三个阶段。或者在 Vercel 新建预览部署，选择 `feat/multi-ai-compare`，使用现有项目设置。

本地预览：Node.js 20.9+，切换最后分支，`npm ci`、`npm run dev`，浏览器打开 http://localhost:3000。原 `.env.local` 不在仓库里；需要登录时按 `.env.example` 配置公开 Supabase URL/Publishable Key。不开启任何模型也可验证素材、剧本、分镜功能。

## 数据库与上线

- 本次不执行 SQL 或修改生产数据库。`hybrid-storage.sql` 暂缓，先备份与检查既有资产，确认旧 Base64 迁移和新版读写后，再单独安排。现有 schema.sql 与 RLS 保留。
- 只有要启用多模型对比时才执行 `supabase/ai-quota.sql`；未执行时新模型接口拒绝调用。
- 模型 Key 留空、开关 false 即可上线手工工作流。无需付费订阅。
- 升级前按 [本地素材指南](LOCAL_MEDIA.md) 导出原 JSON 并保留原件。上线后不要再使用旧版可写部署上传新媒体。
- 真实 macOS Safari 和 Supabase 仍需手动验收：Mac 不连接素材时编辑文字；Windows 从 NTFS SSD 登记真实相对路径、刷新后重连，以及双账号隔离。自动化 Chromium 不能代替真实 Safari 的操作系统权限验收。

## 回退

优先使用 Vercel 已有部署回退页面代码，保留原 JSON 和素材目录，不删除或重置数据库。混合存储触发器仍会阻止旧版向 JSONB 写入 Base64；不要为了回退界面直接关闭此保护。若旧版无法写入，可继续本地导出备份，待新版修复后迁移。
