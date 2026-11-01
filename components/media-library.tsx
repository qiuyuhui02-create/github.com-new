"use client";
import { useState, useSyncExternalStore, useRef, useEffect } from "react";
import type { Studio } from "@/lib/model";
import {
  bindMedia,
  describeFile,
  directoryPath,
  downloadBlob,
  inspectDirectory,
  mediaFile,
  mediaFolders,
  mediaSnapshot,
  mediaStatus,
  mediaURL,
  relinkMedia,
  subscribeMedia,
  type MediaKind,
} from "@/lib/media";
import { migrateLegacy } from "@/lib/migration";
import { supabase } from "@/lib/supabase";
export default function MediaLibrary({
  data,
  onChange,
  tell,
}: {
  data: Studio;
  onChange: (d: Partial<Studio>) => void;
  tell: (s: string) => void;
}) {
  const [busy, setBusy] = useState(false),
    [kind, setKind] = useState<MediaKind>("参考图"),
    [assetId, setAssetId] = useState(""),
    [shotId, setShotId] = useState(""),
    [previousId, setPreviousId] = useState("");
  useSyncExternalStore(subscribeMedia, mediaSnapshot, () => 0);
  const [pending, setPending] = useState<{
    data: Studio;
    issues: string[];
  } | null>(null);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  const files = data.files || [];
  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } catch (e) {
      tell((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="media-library">
      <div className="panel">
        <h2>本地素材库 · Mac 文件为原件</h2>
        <p className="help">
          Safari
          网页无法后台自动写入你的素材文件夹。这里登记文件、校验与重新定位；不会移动、删除或覆盖磁盘原件。刷新后请重新选择文件夹。已选择的文件只在本次页面会话可预览。
        </p>
        <div className="field-pair">
          <label>
            素材用途
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as MediaKind)}
            >
              {Object.keys(mediaFolders).map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label>
            关联资产
            <select
              value={assetId}
              onChange={(e) => setAssetId(e.target.value)}
            >
              <option value="">不关联</option>
              {data.assets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            关联分镜
            <select value={shotId} onChange={(e) => setShotId(e.target.value)}>
              <option value="">不关联</option>
              {data.shots.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.number} {s.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            上一版本
            <select
              value={previousId}
              onChange={(e) => setPreviousId(e.target.value)}
            >
              <option value="">新素材</option>
              {files.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} v{f.version}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="upload-button">
          登记本地文件（不上传）
          <input
            type="file"
            disabled={busy}
            accept="image/*,video/*,.mov,.mkv,.exr,.psd,.blend,.wav,.mp3"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              void run(async () => {
                const previous = files.find((f) => f.id === previousId);
                const entry = await describeFile(file, kind, {
                  ...(assetId ? { assetId } : {}),
                  ...(shotId ? { shotId } : {}),
                  ...(previous
                    ? { previousId: previous.id, version: previous.version + 1 }
                    : {}),
                });
                if (!live.current) return;
                bindMedia(entry.id, file);
                onChange({
                  files: [...files, entry],
                  ...(assetId && file.type.startsWith("image/")
                    ? {
                        assets: data.assets.map((a) =>
                          a.id === assetId
                            ? {
                                ...a,
                                references: [
                                  ...a.references,
                                  `local:${entry.id}`,
                                ],
                              }
                            : a,
                        ),
                      }
                    : {}),
                  ...(shotId && kind === "分镜图"
                    ? {
                        shots: data.shots.map((s) =>
                          s.id === shotId
                            ? { ...s, image: `local:${entry.id}` }
                            : s,
                        ),
                      }
                    : {}),
                });
                tell(
                  "已登记。请下载原文件副本并按清单路径归档，然后选择整个素材目录核验。",
                );
              });
              e.target.value = "";
            }}
          />
        </label>
        <label className="upload-button">
          选择项目素材目录并检查缺失
          <input
            type="file"
            {...{ webkitdirectory: "", directory: "" }}
            multiple
            disabled={busy}
            onChange={(e) => {
              const selected = Array.from(e.target.files || []);
              void run(async () => {
                const found = await inspectDirectory(files, selected);
                tell(
                  `检查完成：${found}/${files.length} 个文件已校验。其他项为缺失或内容不符。`,
                );
              });
              e.target.value = "";
            }}
          />
        </label>
        <p className="help">
          如果 Safari
          不显示文件夹选择，请使用下方逐文件“重新定位”。生成视频与最终 4K
          视频通过 Finder 复制到清单目录，不经过 Vercel 或 Supabase。
        </p>
        <div className="button-row">
          <button
            className="secondary"
            disabled={busy}
            onClick={() =>
              downloadBlob(
                new Blob([JSON.stringify(data, null, 2)], {
                  type: "application/json",
                }),
                `framework-backup-${Date.now()}.json`,
              )
            }
          >
            下载项目 JSON 清单
          </button>
          <button
            className="secondary"
            disabled={busy}
            onClick={() => {
              if (
                !confirm(
                  "提取旧 Base64 或 Supabase 图片到本地 ZIP？原文件和原数据库不删除。请先导出原 JSON 备份，解压到新空文件夹以避免覆盖。",
                )
              )
                return;
              void run(async () => {
                const result = await migrateLegacy(data, async (src) => {
                  if (!supabase) throw Error("请先登录原 Supabase 账号");
                  const path = src.slice(8);
                  const {
                    data: { user },
                  } = await supabase.auth.getUser();
                  if (!user || !path.startsWith(`${user.id}/`))
                    throw Error("请用素材原账号登录");
                  const { data: link, error } = await supabase.storage
                    .from("assets")
                    .createSignedUrl(path, 300);
                  if (error || !link) throw Error("旧云端图片读取失败");
                  const response = await fetch(link.signedUrl);
                  if (!response.ok) throw Error("旧云端图片下载失败");
                  return response.blob();
                });
                downloadBlob(
                  new Blob([new Uint8Array(result.zip)], {
                    type: "application/zip",
                  }),
                  `framework-migration-${Date.now()}.zip`,
                );
                if (!live.current) return;
                setPending(result);
                tell(
                  `旧图片迁移包已下载。未解决项 ${result.issues.length} 个；请查看包内报告，解压后重新选目录核验。`,
                );
              });
            }}
          >
            提取旧图片迁移包
          </button>
        </div>
        {pending && (
          <div className="panel">
            <p className="help">
              迁移清单尚未应用；当前原数据保持不变。未解决项{" "}
              {pending.issues.length} 个。请先保存原 JSON，再解压迁移 ZIP
              到新空目录。
            </p>
            <button
              className="secondary"
              onClick={() => {
                if (
                  confirm(
                    "已保留原备份且确认迁移包已解压？使用迁移清单后请重新选择目录核验。",
                  )
                ) {
                  onChange(pending.data);
                  setPending(null);
                }
              }}
            >
              确认已备份并解压，应用迁移清单
            </button>
            <button className="text-button" onClick={() => setPending(null)}>
              放弃此次迁移
            </button>
          </div>
        )}
        {busy && <p role="status">正在分块校验／处理本地文件，请勿离开页面…</p>}
      </div>
      <div className="panel">
        <h3>目录约定</h3>
        <pre className="directory-tree">{`FRAMEWORK-Project/\n  assets/characters/    人物\n  assets/environments/  场景\n  assets/props/         道具\n  references/          参考图\n  storyboards/         分镜图\n  videos/generated/    生成视频\n  videos/final/        最终/4K视频\n  scripts/             剧本导出\n  backups/             JSON清单与迁移报告\n每项素材：<目录>/<文件ID>/v<版本号>/<文件名>`}</pre>
        <p className="help">
          迁移整个库：用 Finder 复制根文件夹与最新
          JSON，保留内部相对目录；在新位置导入 JSON 后重新选择根文件夹。只有
          SHA-256 一致才会显示“已校验”。JSON
          不包含媒体原件，请同时备份整个素材目录。
        </p>
      </div>
      <div className="media-records">
        {files.map((f) => (
          <article className="panel" key={f.id}>
            <div className="section-intro">
              <h3>
                {f.name} · v{f.version}
              </h3>
              <span>{mediaStatus(f.id)}</span>
            </div>
            <p className="help">
              {f.kind} · {(f.size / 1024 / 1024).toFixed(2)} MB · {f.format}
            </p>
            <code>{f.relativePath}</code>
            <details>
              <summary>文件标识与校验信息</summary>
              <p className="help">
                ID：{f.id}
                <br />
                SHA-256：{f.sha256}
                <br />
                关联：{f.assetId || f.shotId || "无"}
                <br />
                上一版本：{f.previousId || "无"}
              </p>
            </details>
            {mediaURL(f.id) && f.format.startsWith("video/") && (
              <video controls preload="metadata" src={mediaURL(f.id)} />
            )}
            {mediaURL(f.id) && f.format.startsWith("image/") && (
              <img
                className="media-preview"
                alt={f.name}
                src={mediaURL(f.id)}
              />
            )}
            <div className="button-row">
              <button
                className="secondary"
                disabled={!mediaFile(f.id) || busy}
                onClick={() => {
                  const file = mediaFile(f.id);
                  if (file) downloadBlob(file, f.name);
                }}
              >
                下载原件副本
              </button>
              <label className="upload-button">
                重新定位
                <input
                  type="file"
                  disabled={busy}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const path = prompt(
                      "输入文件在项目根目录内的新相对路径（不会移动磁盘文件）",
                      file.webkitRelativePath
                        ? directoryPath(file)
                        : f.relativePath,
                    );
                    if (path)
                      void run(async () => {
                        const updated = await relinkMedia(f, file, path);
                        if (!live.current) return;
                        onChange({
                          files: files.map((x) =>
                            x.id === f.id ? updated : x,
                          ),
                        });
                        tell(
                          "内容校验通过，已更新相对路径。请再次选择根目录核验归档位置。",
                        );
                      });
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
          </article>
        ))}
      </div>
      {!files.length && (
        <p className="empty">
          还没有本地文件清单。演示图片仍可使用；新素材请登记为本地文件。
        </p>
      )}
    </section>
  );
}
