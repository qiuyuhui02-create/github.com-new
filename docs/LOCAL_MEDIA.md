# 第一阶段：Mac 本地素材库 + Supabase 元数据

## Safari 技术结论

Vercel 是远程网站，不能访问 Mac 的绝对路径。`showDirectoryPicker` / `showSaveFilePicker` 属于 File System Access API，不能当作 Safari 的通用能力。浏览器私有 OPFS 也不是用户在 Finder 里管理的素材目录，且受配额与清理影响，不适合当作唯一原件库。

本版采用 File / Blob、用户发起的文件选择和下载流程：Safari 允许时用 `<input webkitdirectory>` 选择文件夹；不支持目录选择的版本可逐文件重新定位。**目录选择仅用于读取，不代表持久写权限**。不调用 `showDirectoryPicker`，不自动写入、覆盖、移动或删除磁盘文件。

参考能力说明（实现时以功能检测与手动流程为准）：
- https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker
- https://developer.mozilla.org/en-US/docs/Web/API/HTMLInputElement/webkitdirectory
- https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system

未在真实 macOS Safari 上自动化验收；当前自动化浏览器为 Chromium。首次使用请用 Safari 按下面步骤检查。文件选择 API 本身不在浏览器测试中模拟为可持久写入能力。

## 文件放哪里

```text
FRAMEWORK-Project/
  assets/characters/<文件ID>/v1/<文件名>
  assets/environments/<文件ID>/v1/<文件名>
  assets/props/<文件ID>/v1/<文件名>
  references/<文件ID>/v1/<文件名>
  storyboards/<文件ID>/v1/<文件名>
  videos/generated/<文件ID>/v1/<文件名>
  videos/final/<文件ID>/v1/<文件名>
  scripts/
  backups/
```

可以在“本地素材库”登记原件，复制清单的相对路径，用 Finder 建立这些子目录并复制文件进去。不会记录或上传 `/Users/...`、`/Volumes/...` 等根路径。

清单包含稳定文件 ID、名称、相对路径、大小、格式、SHA-256、版本号、上一版文件 ID、资产/分镜 ID。新版本登记为新文件，不覆盖前一版本。视频逐块（4MiB）计算 SHA-256，内存使用不随完整 4K 文件大小增长。很大的文件校验仍需要时间、耗电，关闭页面会中断。

## 日常使用

1. 在资产编辑器选择本地主图，或在“本地素材库”登记图片/视频，并设置用途、关联资产/分镜、上一版。
2. 新选择文件显示“本次已选择·待归档”。网页只能证明读取到了你选的文件，不能证明它已经放进清单目录。
3. 下载原件副本（如果需要），在 Finder 按清单路径归档。Safari 的下载目录由浏览器设置决定；应用不能指定本机绝对路径。
4. 点击“选择项目素材目录并检查缺失”，选择根文件夹。路径、大小和 SHA-256 全部一致才标记“已校验”。内容不同不会自动覆盖任何东西。
5. 如文件移动，点击“重新定位”，选择同一内容文件并输入新的项目内相对路径。校验值不符会拒绝；若是新内容，请作为新版本登记。
6. 刷新后媒体临时引用释放，重新选择目录才能预览。JSON 元数据仍会自动保存在当前账号的浏览器缓存，但原件不保存在浏览器缓存中。
7. 推送到 Supabase 的只是元数据。数据库写入前有严格字段白名单、2MB 上限、Base64/二进制 URI/常见绝对路径拦截。

## 升级数据库

保留原 `schema.sql` 与 RLS。已运行过的项目仅需在 Supabase SQL Editor 执行 `supabase/hybrid-storage.sql`。新项目先运行 `schema.sql`，再运行 `hybrid-storage.sql`。

新增触发器只检查新的 INSERT / UPDATE，不修改或删除旧记录。它阻止直接 REST 或 RPC 将 Base64、blob/file URI、Mac/Windows 绝对路径或超过 2MB 的数据写入 JSONB。旧云端图片依旧可读，新版不再上传到 Storage。原有 Storage 文件与权限都保留。

**旧部署版本仍可能向 Storage 上传文件。**上线时停用旧的可写预览，更新生产部署；旧 JSONB 写入会被触发器拒绝，但我们不会删除你的 Storage 桶来阻止旧客户端。

## 旧数据迁移（不要跳过备份）

1. 在旧版或新版先导出完整原 JSON，保存到 Mac 的 backups，保留不动。
2. 新版导入旧 JSON 到本地，或登录原账号载入旧云端项目；旧数据仍可显示。
3. 打开“本地素材库” → “提取旧图片迁移包”。明确确认后才读取旧 Supabase 图片；不会删除云端任何文件。
4. 下载 ZIP，解压到**新的空目录**。迁移包只处理旧图片（单张≤5MB、合计≤50MB），不打包 4K 视频。包内包含图片、`backups/project.json`、迁移报告。
5. 当前数据此时仍未切换。检查报告与图片，确认保留原 JSON 后点击“确认已备份并解压，应用迁移清单”。也可放弃。
6. 重新选择解压后的根目录进行校验。失败的旧图片引用会保留，报告列出需手动处理的项，不会伪装成成功。
7. 所有旧 Base64 和绝对路径解决后，才可推送云端元数据。旧 Supabase 对象引用可暂时保留，但完整本地化前请逐项完成迁移。

云端导入入口现在只接受轻量元数据，不会再自动上传内嵌图片。含 Base64 的旧备份应先导入本地并执行上述迁移。

## 素材迁移、恢复与丢失边界

- 完整备份 = 最新项目 JSON + **整个素材目录**。JSON 不含媒体文件；单独保存 JSON 不能恢复图片/视频。
- 用 Finder 或 Time Machine 复制整个根目录到其他磁盘，保留内部相对目录。复制后重新选择目标目录，检查全部校验通过；旧盘保持不动直到确认。
- 恢复时先导入备份 JSON 到本地，再选备份素材根目录。不要先覆盖当前目录；先核验新空目录。
- 浏览器数据被清理会丢失尚未导出的元数据；Mac 文件不会因此删除。
- 文件缺失可能是目录选错；“重新定位”只更新清单，不执行磁盘移动。
- 云端冲突保护仍生效；不要用旧备份无提示覆盖新项目。
- 本阶段没有安装本地服务，没有本地端口暴露，没有桌面文件写权限。若未来需要后台整理多 GB 视频，推荐一个仅监听回环地址、需配对授权的本地辅助程序或 Tauri 外壳；网页与当前清单格式继续复用。该部分尚未实现。
