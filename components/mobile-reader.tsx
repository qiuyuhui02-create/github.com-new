"use client";
import { useRef, useState } from "react";
import {
  CalendarDays,
  Film,
  LayoutGrid,
  Clapperboard,
  AudioLines,
  Search,
  Upload,
  Copy,
  BookOpen,
} from "lucide-react";
import type { Studio } from "@/lib/model";
import { parseStudio } from "@/lib/model";
import { type VideoJob, localDate, timeText } from "@/lib/workflow";
import { timestamp } from "@/lib/snapshots";
const tabs = [
  { name: "概览", icon: LayoutGrid },
  { name: "日程", icon: CalendarDays },
  { name: "剧本", icon: BookOpen },
  { name: "资产", icon: Film },
  { name: "分镜", icon: Clapperboard },
  { name: "Prompt", icon: AudioLines },
];
export default function MobileReader({
  data,
  onImport,
  tell,
  onEdit,
  saveStatus,
  onExport,
}: {
  data: Studio;
  saveStatus?: string;
  onExport: () => void;
  onImport: (d: Studio) => Promise<void>;
  tell: (s: string) => void;
  onEdit: () => void;
}) {
  const [tab, setTab] = useState("概览"),
    [search, setSearch] = useState(""),
    [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null),
    snap = data.snapshot;
  const meta = data.meta || snap;
  const changed = !!(
    snap &&
    data.meta &&
    (data.meta.revision !== snap.revision ||
      data.meta.updatedAt !== snap.updatedAt)
  );
  const match = (...parts: (string | undefined)[]) =>
    parts.join(" ").toLowerCase().includes(search.toLowerCase());
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      tell("Prompt 已复制");
    } catch {
      tell("剪贴板不可用，请长按选择文字复制");
    }
  }
  function preview(src?: string) {
    if (!src) return "";
    if (src.startsWith("local:")) return data.previews?.[src.slice(6)] || "";
    if (
      /^\/art\/[a-z0-9_-]+\.svg$/i.test(src) ||
      /^data:image\/(jpeg|png|webp);base64,/.test(src)
    )
      return src;
    return "";
  }
  const allPrompt: {
    id: string;
    title: string;
    content: string;
    info: string;
    job?: VideoJob;
  }[] = [
    ...data.prompts.map((p) => ({
      id: p.id,
      title: p.title,
      content: p.content,
      info: p.category,
    })),
    ...(data.videoJobs || []).map((j) => ({
      id: j.id,
      title: `${data.shots.find((s) => s.id === j.shotId)?.number || "镜头"} · 视频 Prompt`,
      content: j.prompt,
      info: `${j.model || "未填模型"} · ${j.duration}s · ${j.ratio} · ${j.status}`,
      job: j,
    })),
  ];
  return (
    <main className="mobile-reader">
      <header className="reader-header">
        <a href="/" className="reader-brand">
          FRAMEWORK <small>STUDIO / 随身创作手册</small>
        </a>
        <span className="tag">只读查看</span>
      </header>
      <section className="reader-hero">
        <span className="eyebrow">MY LITTLE FILM JOURNAL</span>
        <h1>{data.projectName || "我的电影项目"}</h1>
        <p>
          {changed
            ? "本机已编辑 · 与导入快照不同，非实时同步"
            : snap
              ? "Mac 项目快照 · 手动更新，非实时同步"
              : "尚未导入 Mac 快照 · 当前为本机内容 / 初始示例"}
        </p>
        <div className="snapshot-details">
          <strong>
            数据版本{" "}
            {snap
              ? `v${meta?.revision ?? snap.revision}${changed ? `（快照 v${snap.revision}）` : ""}`
              : data.meta
                ? `本机 v${data.meta.revision}`
                : "未标记"}
          </strong>
          <span>项目最后更新：{timestamp(meta?.updatedAt)}</span>
          <span>快照导出时间：{timestamp(snap?.exportedAt)}</span>
          <span>当前设备：{saveStatus || "本地保存"} · 无需登录</span>
        </div>
        <div className="button-row">
          <button
            className="primary"
            disabled={busy}
            onClick={() => file.current?.click()}
          >
            <Upload size={15} />
            {busy ? "正在导入…" : "导入 Mac 项目快照"}
          </button>
          <button className="secondary" onClick={onExport}>
            导出当前快照
          </button>
          <button className="text-button" onClick={onEdit}>
            切换编辑工作台
          </button>
        </div>
        <input
          ref={file}
          aria-label="手机导入项目快照"
          hidden
          type="file"
          accept=".json,application/json"
          onChange={async (e) => {
            const input = e.target,
              f = input.files?.[0];
            if (!f) return;
            setBusy(true);
            try {
              if (f.size > 100 * 1024 * 1024) throw Error("快照超过 100MB");
              const d = parseStudio(JSON.parse(await f.text()));
              if (
                !confirm(
                  `导入“${d.projectName || f.name}”${d.snapshot ? `（v${d.snapshot.revision}，导出于 ${timestamp(d.snapshot.exportedAt)}）` : "（旧版 JSON，更新时间未知）"}？这将替换当前手机本地快照；当前内容会保留一份恢复前快照，不会修改 Mac、Supabase 或原始素材。`,
                )
              )
                return;
              await onImport(d);
            } catch (error) {
              tell(`导入失败：${(error as Error).message}`);
            } finally {
              setBusy(false);
              input.value = "";
            }
          }}
        />
      </section>
      <nav className="reader-nav" aria-label="手机简洁导航">
        {tabs.map((t) => (
          <button
            key={t.name}
            aria-pressed={tab === t.name}
            className={tab === t.name ? "selected" : ""}
            onClick={() => {
              setTab(t.name);
              setSearch("");
            }}
          >
            <t.icon size={18} />
            {t.name}
          </button>
        ))}
      </nav>
      <label className="reader-search">
        <Search size={17} />
        <input
          aria-label="搜索手机项目内容"
          placeholder="搜索当前分类的文字内容…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      <div className="reader-content">
        {tab === "概览" && (
          <>
            <section className="reader-stats">
              {[
                ["资产", data.assets.length],
                ["分镜", data.shots.length],
                [
                  "任务完成",
                  `${data.tasks.filter((t) => t.done).length}/${data.tasks.length}`,
                ],
                ["剧本场景", data.script?.scenes.length || 0],
              ].map(([label, v]) => (
                <article key={label}>
                  <strong>{v}</strong>
                  <small>{label}</small>
                </article>
              ))}
            </section>
            <article className="panel">
              <h2>项目进度</h2>
              <p>截止日期：{data.deadline || "未设置"}</p>
              <p>
                已确认剧本：
                {data.script?.scenes.filter((s) => s.final).length || 0} 场
              </p>
              <p>
                分镜预计总长：{data.shots.reduce((s, x) => s + x.duration, 0)}{" "}
                秒
              </p>
              <p>
                已记录制作工时：
                {timeText(
                  (data.timer?.entries || []).reduce(
                    (s, t) => s + t.durationMs,
                    0,
                  ),
                )}
              </p>
              <p className="help">
                未结束计时不会在手机继续运行，原记录仍完整保存在快照中。
              </p>
            </article>
            <article className="panel">
              <h2>今日计划 · {localDate()}</h2>
              {data.tasks
                .filter((t) => t.date === localDate())
                .map((t) => (
                  <p key={t.id}>
                    {t.done ? "✓" : "○"} {t.title} {t.time} ·{" "}
                    {t.location || "地点未填"}
                  </p>
                ))}
              {!data.tasks.some((t) => t.date === localDate()) && (
                <p>快照中今天还没有任务。</p>
              )}
            </article>
            <article className="panel">
              <h2>如何从 Mac 更新</h2>
              <p>
                在 Mac 点击“导出项目”，通过微信、AirDrop 或文件传输把 JSON
                发到手机，再点击上方“导入 Mac 项目快照”。
              </p>
              <p className="help">
                快照包含私人日记和制作记录，请只发送给自己的设备。本网站不会公开发布项目内容。缩略图仅在
                JSON 已携带时显示，原始图片和视频不包含在快照中。
              </p>
            </article>
          </>
        )}
        {tab === "日程" && (
          <>
            <h2>任务与历史日程</h2>
            {[...data.tasks]
              .sort((a, b) => a.date.localeCompare(b.date))
              .filter((t) =>
                match(t.title, t.date, t.location, t.category, t.notes),
              )
              .map((t) => (
                <article className="panel" key={t.id}>
                  <span className="tag">
                    {t.status || (t.done ? "已完成" : "待开始")}
                  </span>
                  <h3>{t.title}</h3>
                  <p>
                    {t.date} {t.time} · {t.priority}优先级
                  </p>
                  <p>
                    {t.location || "地点未填写"} · {t.category || "制作"}
                  </p>
                  <p>{t.notes}</p>
                </article>
              ))}
            <h2>心情与创作日记 · 私人</h2>
            {[...(data.journals || [])]
              .sort((a, b) => b.date.localeCompare(a.date))
              .filter((j) => match(j.date, j.mood, j.text))
              .map((j) => (
                <article className="panel" key={j.date}>
                  <h3>
                    {j.date} · {j.mood}
                  </h3>
                  <p className="reader-text">{j.text}</p>
                </article>
              ))}
            <h2>制作工时</h2>
            {[...(data.timer?.entries || [])]
              .reverse()
              .filter((t) => match(t.title, t.date, t.category, t.notes))
              .map((t) => (
                <article className="panel" key={t.id}>
                  <h3>
                    {t.title} · {timeText(t.durationMs)}
                  </h3>
                  <p>
                    {t.date} · {t.category}
                  </p>
                  <p>{t.notes}</p>
                </article>
              ))}
          </>
        )}
        {tab === "剧本" && (
          <>
            {data.script?.title && (
              <section className="panel">
                <h2>{data.script.title}</h2>
                <p>{data.script.synopsis}</p>
              </section>
            )}
            {data.script?.revisionInstructions && (
              <details className="panel">
                <summary>统一修改要求（手动工作流）</summary>
                <p className="reader-text">
                  {data.script.revisionInstructions}
                </p>
              </details>
            )}
            {!data.script && (
              <p className="empty">
                快照尚未包含剧本，请先在 Mac 创作并重新导出。
              </p>
            )}
            {data.script?.scenes
              .filter((s) =>
                match(
                  s.heading,
                  s.original,
                  s.final?.text,
                  s.draft,
                  ...(s.manualComparisons?.map((c) => c.text) || []),
                ),
              )
              .map((s) => (
                <article className="panel" key={s.id}>
                  <span className="tag">{s.status}</span>
                  <p className="help">
                    {data.script?.chapters?.find((c) =>
                      c.sceneIds.includes(s.id),
                    )?.name || "未分组场景"}
                  </p>
                  <h2>{s.heading}</h2>
                  <h3>人工确认剧本</h3>
                  <pre className="reader-text">
                    {s.final?.text || "本场尚未人工定稿"}
                  </pre>
                  <details>
                    <summary>原始剧本</summary>
                    <pre className="reader-text">{s.original}</pre>
                  </details>
                  <details>
                    <summary>修改稿与 AI 结果</summary>
                    <pre className="reader-text">{s.draft}</pre>
                    {s.manualComparisons?.map((c, i) => (
                      <div key={i}>
                        <h3>{c.model}</h3>
                        <pre className="reader-text">
                          {c.text || "尚未粘贴"}
                        </pre>
                      </div>
                    ))}
                  </details>
                </article>
              ))}
          </>
        )}
        {tab === "资产" && (
          <>
            {data.assets
              .filter((a) => match(a.id, a.name, a.type, a.description, a.tags))
              .map((a) => (
                <article className="panel reader-asset" key={a.id}>
                  {preview(a.image) ? (
                    <img src={preview(a.image)} alt={a.name} />
                  ) : (
                    <div className="reader-placeholder">
                      图片未随快照携带 · 素材未连接
                    </div>
                  )}
                  <div>
                    <span className="tag">
                      {a.type} · {a.status}
                    </span>
                    <h2>{a.name}</h2>
                    <code>{a.id}</code>
                    <p>{a.description}</p>
                    <p>{a.tags}</p>
                    <details>
                      <summary>版本与素材索引</summary>
                      <p>
                        当前模型：{a.model || "未填写"} · 历史{" "}
                        {a.versions.length} 版
                      </p>
                      {data.files
                        ?.filter((f) => f.assetId === a.id)
                        .map((f) => (
                          <p key={f.id}>
                            <code>{f.relativePath}</code> · v{f.version}
                          </p>
                        ))}
                      {a.versions.map((v, i) => (
                        <p key={i}>
                          v{a.versions.length - i} · {v.description} ·{" "}
                          {timestamp(v.at)}
                        </p>
                      ))}
                    </details>
                  </div>
                </article>
              ))}
          </>
        )}
        {tab === "分镜" && (
          <>
            {data.shots
              .filter((s) =>
                match(s.number, s.title, s.description, s.dialogue, s.sound),
              )
              .map((s) => (
                <article className="panel" key={s.id}>
                  {preview(s.image) && (
                    <img
                      className="reader-shot"
                      src={preview(s.image)}
                      alt={s.title}
                    />
                  )}
                  <span className="tag">
                    {s.number} · {s.status || "待制作"}
                  </span>
                  <h2>{s.title}</h2>
                  <p>
                    {s.size} · {s.duration}s · {s.camera} · {s.movement}
                  </p>
                  <p>构图：{s.composition || "未填写"}</p>
                  <p>{s.description}</p>
                  <p>对白：{s.dialogue || "未填写"}</p>
                  <p>声音：{s.sound || "未填写"}</p>
                  <p>
                    关联资产：
                    {s.assets
                      .map(
                        (id) =>
                          data.assets.find((a) => a.id === id)?.name || id,
                      )
                      .join(" / ") || "未关联"}
                  </p>
                </article>
              ))}
          </>
        )}
        {tab === "Prompt" && (
          <>
            {allPrompt
              .filter((p) => match(p.title, p.content, p.info))
              .map((p) => (
                <article className="panel" key={p.id}>
                  <span className="tag">{p.info}</span>
                  <h2>{p.title}</h2>
                  <pre className="reader-text">{p.content}</pre>
                  {p.job && (
                    <details>
                      <summary>首尾帧与参考素材</summary>
                      <p>首帧：{p.job.firstFrame || "未填写"}</p>
                      <p>尾帧：{p.job.lastFrame || "未填写"}</p>
                      <p>
                        分镜图：
                        {p.job.storyboardReference ||
                          "未登记，不自动使用分镜参考图"}
                      </p>
                      <p className="reader-text">
                        人物图：{p.job.characterReferences || "未登记"}
                      </p>
                      <p className="reader-text">{p.job.references}</p>
                      <p>
                        {p.job.assets
                          .map(
                            (id) =>
                              data.assets.find((a) => a.id === id)?.name || id,
                          )
                          .join(" / ")}
                      </p>
                    </details>
                  )}
                  <button
                    className="secondary"
                    onClick={() => void copy(p.content)}
                  >
                    <Copy size={15} />
                    复制 Prompt
                  </button>
                </article>
              ))}
          </>
        )}
      </div>
      <footer className="reader-footer">
        仅此设备本地内容 · 手动快照，不是实时同步
      </footer>
    </main>
  );
}
