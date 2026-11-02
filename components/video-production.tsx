"use client";
import { useState } from "react";
import { Copy, Plus, Save } from "lucide-react";
import { type ReactNode } from "react";
import { newVideoJob, recordVideoVersion } from "@/lib/production";
import { type Studio } from "@/lib/model";
import { type VideoJob } from "@/lib/workflow";
const states = ["待生成", "生成中", "待审核", "已完成", "需重做"];
export default function VideoProduction({
  data,
  onChange,
  tell,
  onReferenceFile,
  renderReference,
}: {
  onReferenceFile: (
    jobId: string,
    role:
      | "firstFrame"
      | "lastFrame"
      | "storyboardReference"
      | "characterReferences",
    file: File,
  ) => Promise<void>;
  renderReference: (src: string, alt: string) => ReactNode;
  data: Studio;
  onChange: (s: Partial<Studio>) => void;
  tell: (s: string) => void;
}) {
  const [selected, setSelected] = useState(""),
    [filename, setFilename] = useState(""),
    [path, setPath] = useState("");
  const jobs = data.videoJobs || [],
    job = jobs.find((j) => j.id === selected) || jobs[0];
  function patch(change: Partial<VideoJob>) {
    if (job)
      onChange({
        videoJobs: jobs.map((j) => (j.id === job.id ? { ...j, ...change } : j)),
      });
  }
  function create(shotId: string) {
    const j = newVideoJob(data, shotId);
    onChange({ videoJobs: [...jobs, j] });
    setSelected(j.id);
  }
  return (
    <div className="video-workbench">
      <section className="panel">
        <div className="section-intro">
          <h2>把镜头交给你的制作工具</h2>
          <span className="tag">手动制作 · 不生成或上传视频</span>
        </div>
        <p className="help">
          在 Seedance、WAN、Runway 等工具中制作，在这里记录
          Prompt、参考素材和每次生成的版本。NTFS SSD 上只登记真实相对路径。
        </p>
        <label>
          为分镜新建视频制作任务
          <select
            aria-label="为分镜新建视频制作任务"
            value=""
            onChange={(e) => {
              create(e.target.value);
              setFilename("");
              setPath("");
            }}
          >
            <option value="">选择一个分镜……</option>
            {data.shots.map((s) => (
              <option key={s.id} value={s.id}>
                {s.number} · {s.title}
              </option>
            ))}
          </select>
        </label>
      </section>
      {job ? (
        <div className="video-layout">
          <nav className="panel video-directory" aria-label="视频任务目录">
            {jobs.map((j) => (
              <button
                key={j.id}
                className={j.id === job.id ? "selected" : ""}
                onClick={() => {
                  setSelected(j.id);
                  setFilename("");
                  setPath("");
                }}
              >
                <strong>
                  {data.shots.find((s) => s.id === j.shotId)?.number ||
                    "分镜未关联"}
                </strong>
                <span>
                  {data.shots.find((s) => s.id === j.shotId)?.title || j.shotId}
                </span>
                <small>
                  {j.status} · {j.model || "未选择模型"}
                </small>
              </button>
            ))}
          </nav>
          <section className="panel editor-fields">
            <div className="section-intro">
              <h2>视频 Prompt 与制作记录</h2>
              <span className="help">文字更改自动保存</span>
            </div>
            <label>
              视频 Prompt
              <textarea
                aria-label="视频 Prompt"
                rows={9}
                maxLength={50000}
                value={job.prompt}
                onChange={(e) => patch({ prompt: e.target.value })}
              />
            </label>
            <button
              className="secondary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(job.prompt);
                  tell("视频 Prompt 已复制");
                } catch {
                  tell("剪贴板不可用，请在编辑框中手动复制");
                }
              }}
            >
              <Copy size={15} />
              复制视频 Prompt
            </button>
            <div className="form-grid">
              {(
                [
                  ["firstFrame", "首帧素材"],
                  ["lastFrame", "尾帧素材"],
                  ["storyboardReference", "分镜图参考"],
                  ["characterReferences", "人物参考图"],
                ] as const
              ).map(([role, label]) => (
                <div className="video-reference-role" key={role}>
                  <label>
                    {label}
                    <textarea
                      aria-label={label}
                      rows={2}
                      value={job[role] || ""}
                      onChange={(e) => patch({ [role]: e.target.value })}
                      placeholder={
                        role === "characterReferences"
                          ? "每行一个人物图引用 / 文件名"
                          : "独立填写，不自动从其他参考图复制"
                      }
                    />
                  </label>
                  <label className="upload-button">
                    上传{label}
                    <input
                      aria-label={`上传${label}`}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (f) await onReferenceFile(job.id, role, f);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  {(job[role] || "")
                    .split("\n")
                    .filter(Boolean)
                    .map((src, i) => (
                      <div className="video-reference-preview" key={i}>
                        {/^(local:|storage:|data:image\/|\/art\/)/.test(src) ? (
                          renderReference(src, label)
                        ) : (
                          <small>仅登记文字引用 · 素材未连接</small>
                        )}
                      </div>
                    ))}
                </div>
              ))}
              <p className="help video-reference-note">
                四类图片独立保存。分镜参考图只在明确选择或上传后登记到“分镜图参考”，不会自动成为首帧或尾帧。
              </p>
              <button
                type="button"
                className="secondary"
                disabled={!data.shots.find((s) => s.id === job.shotId)?.image}
                onClick={() => {
                  const image = data.shots.find(
                    (s) => s.id === job.shotId,
                  )?.image;
                  if (
                    image &&
                    (!job.storyboardReference ||
                      confirm(
                        "替换本任务的分镜图引用？首帧、尾帧和人物图保持不变。",
                      ))
                  )
                    patch({ storyboardReference: image });
                }}
              >
                仅登记此镜头的分镜图引用
              </button>
              <label>
                目标时长（秒）
                <input
                  type="number"
                  min="0.1"
                  max="600"
                  step="0.1"
                  value={job.duration}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (n > 0 && n <= 600) patch({ duration: n });
                  }}
                />
              </label>
              <label>
                画幅比例
                <select
                  value={job.ratio}
                  onChange={(e) => patch({ ratio: e.target.value })}
                >
                  {["16:9", "2.39:1", "9:16", "4:3", "1:1"].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label>
                视频模型
                <input
                  value={job.model}
                  placeholder="Seedance / WAN / Runway…"
                  onChange={(e) => patch({ model: e.target.value })}
                />
              </label>
              <label>
                制作状态
                <select
                  value={job.status}
                  onChange={(e) => patch({ status: e.target.value })}
                >
                  {states.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label>
                视频镜头运动
                <input
                  value={job.movement}
                  onChange={(e) => patch({ movement: e.target.value })}
                />
              </label>
            </div>
            <label>
              其他参考素材清单（保留原有记录）
              <textarea
                rows={3}
                value={job.references}
                onChange={(e) => patch({ references: e.target.value })}
              />
            </label>
            <label>关联人物、场景、道具及其他素材</label>
            <div className="asset-checkboxes">
              {data.assets.map((a) => (
                <label key={a.id}>
                  <input
                    type="checkbox"
                    checked={job.assets.includes(a.id)}
                    onChange={(e) =>
                      patch({
                        assets: e.target.checked
                          ? [...job.assets, a.id]
                          : job.assets.filter((id) => id !== a.id),
                      })
                    }
                  />
                  {a.name}
                  <span>{a.type}</span>
                </label>
              ))}
            </div>
            <label>
              失败原因与修改意见
              <textarea
                rows={4}
                value={job.notes}
                onChange={(e) => patch({ notes: e.target.value })}
              />
            </label>
            <div className="inline-editor">
              <h3>记录一次生成版本</h3>
              <div className="form-grid">
                <label>
                  视频文件名
                  <input
                    value={filename}
                    placeholder="SH-001-v1.mp4"
                    onChange={(e) => setFilename(e.target.value)}
                  />
                </label>
                <label>
                  SSD 视频相对路径
                  <input
                    value={path}
                    placeholder="videos/generated/SH-001-v1.mp4"
                    onChange={(e) => setPath(e.target.value)}
                  />
                </label>
              </div>
              <button
                className="primary"
                disabled={job.versions.length >= 100}
                onClick={() => {
                  try {
                    const version = recordVideoVersion(job, filename, path);
                    patch({ versions: [...job.versions, version] });
                  } catch (e) {
                    return tell((e as Error).message);
                  }
                  setFilename("");
                  setPath("");
                  tell("生成版本已记录，未读取或上传视频");
                }}
              >
                <Save size={15} />
                保存生成版本
              </button>
            </div>
            <h3>历史生成版本 · {job.versions.length}</h3>
            {[...job.versions].reverse().map((v, i) => (
              <details className="video-version" key={v.id}>
                <summary>
                  v{job.versions.length - i} · {v.model || "未填写模型"} ·{" "}
                  {v.status} · {v.filename || "未登记文件"}
                </summary>
                <p>{new Date(v.at).toLocaleString("zh-CN")}</p>
                <code>{v.relativePath || "素材未连接"}</code>
                <pre>{v.prompt}</pre>
                <p>{v.notes}</p>
                <dl className="version-reference-list">
                  {(
                    [
                      ["firstFrame", "首帧"],
                      ["lastFrame", "尾帧"],
                      ["storyboardReference", "分镜图"],
                      ["characterReferences", "人物图"],
                      ["references", "其他参考"],
                      ["ratio", "比例"],
                      ["movement", "运镜"],
                    ] as const
                  ).map(([key, label]) => (
                    <div key={key}>
                      <dt>{label}</dt>
                      <dd>
                        {v[key] === undefined
                          ? "旧版本未记录此项"
                          : v[key] || "未填写"}
                      </dd>
                    </div>
                  ))}
                  <div>
                    <dt>时长</dt>
                    <dd>
                      {v.duration === undefined
                        ? "旧版本未记录此项"
                        : v.duration + " 秒"}
                    </dd>
                  </div>
                  <div>
                    <dt>参考资产</dt>
                    <dd>
                      {v.assets === undefined
                        ? "旧版本未记录此项"
                        : v.assets
                            .map(
                              (id) =>
                                data.assets.find((a) => a.id === id)?.name ||
                                id,
                            )
                            .join(" / ") || "未选择"}
                    </dd>
                  </div>
                </dl>
              </details>
            ))}
          </section>
        </div>
      ) : (
        <div className="empty panel">
          先创建分镜，再选择分镜建立视频制作任务。
        </div>
      )}
    </div>
  );
}
