"use client";
import { useState } from "react";
import { Copy, Plus, Save } from "lucide-react";
import { uid, type Studio } from "@/lib/model";
import { safeVideoPath, type VideoJob } from "@/lib/workflow";
const states = ["待生成", "生成中", "待审核", "已完成", "需重做"];
export default function VideoProduction({
  data,
  onChange,
  tell,
}: {
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
    const shot = data.shots.find((s) => s.id === shotId);
    if (!shot) return;
    const j: VideoJob = {
      id: uid(),
      shotId,
      prompt: shot.description || shot.title,
      assets: [...shot.assets],
      firstFrame: "",
      lastFrame: "",
      references: "",
      duration: shot.duration,
      ratio: "16:9",
      movement: shot.movement,
      model: "",
      status: "待生成",
      notes: "",
      versions: [],
    };
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
              <label>
                首帧素材
                <input
                  value={job.firstFrame}
                  placeholder="资产编号 / 文件名 / 相对路径"
                  onChange={(e) => patch({ firstFrame: e.target.value })}
                />
              </label>
              <label>
                尾帧素材
                <input
                  value={job.lastFrame}
                  onChange={(e) => patch({ lastFrame: e.target.value })}
                />
              </label>
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
              参考素材清单
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
                  if (path && !safeVideoPath(path))
                    return tell(
                      "只登记项目内真实相对路径，不接受盘符、绝对路径或上级目录",
                    );
                  if (!job.prompt.trim()) return tell("请先填写视频 Prompt");
                  patch({
                    versions: [
                      ...job.versions,
                      {
                        id: uid(),
                        model: job.model,
                        prompt: job.prompt,
                        status: job.status,
                        filename,
                        relativePath: path,
                        notes: job.notes,
                        at: new Date().toISOString(),
                      },
                    ],
                  });
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
