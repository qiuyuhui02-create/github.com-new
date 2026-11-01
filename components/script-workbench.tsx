"use client";
import { useState } from "react";
import type { Studio } from "@/lib/model";
import {
  confirmScene,
  editDraft,
  generateShotDrafts,
  lineDiff,
  sentences,
  undoFinal,
  undoWorkingDraft,
  type ScriptScene,
  type Screenplay,
} from "@/lib/screenplay";
import {
  chaptersOf,
  moveScene,
  archiveScene,
  restoreScene,
} from "@/lib/screenplay-structure";
import { downloadBlob } from "@/lib/media";
import ManualScriptCompare from "./manual-script-compare";
import CreateScript from "./screenplay/create-script";
import ChapterDirectory from "./screenplay/chapter-directory";
export default function ScriptWorkbench({
  data,
  onChange,
  tell,
  onCreateShot,
}: {
  data: Studio;
  onChange: (d: Partial<Studio>) => void;
  tell: (s: string) => void;
  onCreateShot: (sceneId: string) => void;
}) {
  const [selected, setSelected] = useState(""),
    [active, setActive] = useState("");
  const script = data.script;
  if (!script)
    return (
      <CreateScript onCreate={(s) => onChange({ script: s })} tell={tell} />
    );
  const chapters = chaptersOf(script),
    chapter =
      chapters.find((c) => c.id === active) ||
      chapters.find((c) => c.sceneIds.includes(selected)) ||
      chapters[0],
    scene =
      script.scenes.find(
        (s) => s.id === selected && chapter?.sceneIds.includes(s.id),
      ) || script.scenes.find((s) => s.id === chapter?.sceneIds[0]);
  const update = (s: Screenplay) => onChange({ script: s });
  const select = (sceneId: string, chapterId: string) => {
    setSelected(sceneId);
    setActive(chapterId);
  };
  const patch = (next: ScriptScene) =>
    update({
      ...script,
      scenes: script.scenes.map((s) => (s.id === next.id ? next : s)),
    });
  const act = (fn: () => void) => {
    try {
      fn();
    } catch (e) {
      tell((e as Error).message);
    }
  };
  return (
    <section className="script-workbench screenplay-studio">
      <div className="panel script-toolbar">
        <div>
          <h2>{script.title || "我的剧本"}</h2>
          <span className="help">
            {script.original.language} · {chapters.length} 章 ·{" "}
            {script.scenes.length} 场 · 自动保存在此浏览器
          </span>
        </div>
        <details className="script-info">
          <summary>剧本信息与原始全文</summary>
          <label>
            剧本名称
            <input
              aria-label="编辑剧本名称"
              maxLength={200}
              value={script.title || ""}
              onChange={(e) => update({ ...script, title: e.target.value })}
            />
          </label>
          <label>
            剧本简介
            <textarea
              aria-label="编辑剧本简介"
              maxLength={5000}
              rows={3}
              value={script.synopsis || ""}
              onChange={(e) => update({ ...script, synopsis: e.target.value })}
            />
          </label>
          <details>
            <summary>导入原始全文（只读）</summary>
            <pre className="screenplay-text">
              {script.original.text ||
                "此剧本从空白开始，没有导入的原始全文。各场人工工作稿与定稿单独保存。"}
            </pre>
          </details>
          <button
            className="secondary"
            onClick={() =>
              downloadBlob(
                new Blob(
                  [
                    script.scenes
                      .filter((s) => s.final)
                      .map((s) => `${s.heading}\n\n${s.final!.text}`)
                      .join("\n\n---\n\n"),
                  ],
                  { type: "text/plain;charset=utf-8" },
                ),
                `final-script-${Date.now()}.fountain`,
              )
            }
          >
            导出逐场定稿
          </button>
        </details>
      </div>
      <div className="script-layout">
        <ChapterDirectory
          script={script}
          selected={scene?.id || ""}
          activeChapter={chapter?.id || ""}
          onSelect={select}
          onChange={update}
          tell={tell}
        />
        <div className="scene-workspace">
          {scene ? (
            <SceneEditor
              key={scene.id}
              scene={scene}
              script={script}
              assets={data.assets}
              patch={patch}
              tell={tell}
              onMove={(chapterId) =>
                act(() => {
                  update(moveScene(script, scene.id, chapterId));
                  select(scene.id, chapterId);
                })
              }
              onArchive={() => {
                if (
                  confirm(
                    "将本场移入回收站？原稿、工作稿、定稿和历史均保留，已有镜头不会删除，但会提示来源需复核。",
                  )
                )
                  act(() => {
                    update(archiveScene(script, scene.id));
                    setSelected("");
                  });
              }}
              onCreateShot={() => onCreateShot(scene.id)}
              onGenerateShots={() =>
                act(() => {
                  const shots = generateShotDrafts(data, scene.id);
                  onChange({ shots: [...data.shots, ...shots] });
                  tell(`已新增 ${shots.length} 个本地文字分镜草稿`);
                })
              }
              onInstructionsChange={(text) =>
                update({ ...script, revisionInstructions: text })
              }
            />
          ) : (
            <div className="panel empty-chapter">
              <h2>{chapter?.name || "开始你的第一章"}</h2>
              <p>
                {chapter
                  ? "此章节还没有场景，请在左侧点击“＋场景”，自由命名后开始编写。"
                  : "点击左侧“新增章节”，自由命名，再逐场编写。"}
              </p>
            </div>
          )}
          {chapter?.originalText && (
            <details className="panel chapter-source">
              <summary>本章导入标题原文（只读）</summary>
              <pre className="screenplay-text">{chapter.originalText}</pre>
            </details>
          )}
          {(script.archivedScenes?.length || 0) > 0 && (
            <details className="panel scene-recycle">
              <summary>场景回收站 · {script.archivedScenes!.length} 项</summary>
              <p className="help">
                场景正文和稳定 ID 保留。恢复后原镜头关联仍可识别。
              </p>
              {script.archivedScenes!.map((s) => (
                <div key={s.id}>
                  <span>{s.heading}</span>
                  <button
                    className="secondary"
                    disabled={!chapter}
                    onClick={() =>
                      act(() => {
                        update(restoreScene(script, s.id, chapter!.id));
                        select(s.id, chapter!.id);
                      })
                    }
                  >
                    恢复到当前章节
                  </button>
                </div>
              ))}
            </details>
          )}
        </div>
      </div>
    </section>
  );
}
function SceneEditor({
  scene,
  script,
  assets,
  patch,
  tell,
  onMove,
  onArchive,
  onCreateShot,
  onGenerateShots,
  onInstructionsChange,
}: {
  scene: ScriptScene;
  script: Screenplay;
  assets: Studio["assets"];
  patch: (s: ScriptScene) => void;
  tell: (s: string) => void;
  onMove: (id: string) => void;
  onArchive: () => void;
  onCreateShot: () => void;
  onGenerateShots: () => void;
  onInstructionsChange: (text: string) => void;
}) {
  const [mode, setMode] = useState("编写剧本"),
    [tool, setTool] = useState("工作稿"),
    [accepted, setAccepted] = useState<number[]>([]);
  const merge = scene.mergeCandidate ?? scene.final?.text ?? "",
    chapters = chaptersOf(script),
    chapter = chapters.find((c) => c.sceneIds.includes(scene.id));
  const act = (fn: () => void) => {
    try {
      fn();
    } catch (e) {
      tell((e as Error).message);
    }
  };
  const setMerge = (text: string) => patch({ ...scene, mergeCandidate: text });
  const finalize = (text: string) =>
    act(() => {
      if (
        confirm(
          "确认将候选内容保存为本场正式定稿？原有定稿进入历史，原稿和工作稿均独立保留。",
        )
      ) {
        patch({ ...confirmScene(scene, text), mergeCandidate: text });
        tell("本场人工定稿已保存");
      }
    });
  return (
    <article className="panel scene-editor wide-scene-editor">
      <header className="scene-editor-heading">
        <div>
          <span className="eyebrow">{chapter?.name}</span>
          <h2>{scene.heading}</h2>
          <small>
            {scene.status} · 工作稿 r{scene.draftRevision}
          </small>
        </div>
        <button
          className="secondary"
          disabled={scene.status !== "已定稿"}
          onClick={onCreateShot}
        >
          手动新建本场镜头
        </button>
      </header>
      <div className="tabs studio-editor-tabs">
        {["编写剧本", "AI 版本对比", "确认定稿"].map((t) => (
          <button
            key={t}
            aria-pressed={mode === t}
            className={mode === t ? "selected" : ""}
            onClick={() => setMode(t)}
          >
            {t}
          </button>
        ))}
      </div>
      {mode === "编写剧本" && (
        <>
          <div className="writing-tool-tabs">
            {["工作稿", "原始剧本", "修改差异", "版本历史"].map((t) => (
              <button
                className={`text-button ${tool === t ? "selected" : ""}`}
                key={t}
                onClick={() => setTool(t)}
              >
                {t}
              </button>
            ))}
          </div>
          {tool === "工作稿" && (
            <>
              <label className="script-label">
                人工工作稿
                <textarea
                  className="screenplay-text wide-script-body"
                  aria-label="场景修改稿"
                  maxLength={50000}
                  rows={16}
                  value={scene.draft}
                  onChange={(e) =>
                    act(() => {
                      patch(editDraft(scene, e.target.value));
                      setAccepted([]);
                    })
                  }
                  onBlur={() =>
                    act(() => patch(editDraft(scene, scene.draft, true)))
                  }
                  placeholder="在这里逐场编写……"
                />
              </label>
              <div className="button-row">
                <button
                  className="secondary"
                  onClick={() =>
                    act(() => {
                      patch(editDraft(scene, scene.draft, true));
                      tell("工作稿版本已保存");
                    })
                  }
                >
                  保存工作稿版本
                </button>
                <button
                  className="secondary"
                  onClick={() => act(() => patch(undoWorkingDraft(scene)))}
                >
                  撤销最近修改
                </button>
                <button
                  className="secondary"
                  onClick={() => {
                    setMerge(scene.draft);
                    setMode("确认定稿");
                  }}
                >
                  整版加入确认候选
                </button>
              </div>
              <p className="help">
                正文自动保存。原稿与最终定稿不会随输入改变；需要时再切换 AI
                对比或确认定稿。
              </p>
            </>
          )}
          {tool === "原始剧本" && (
            <>
              <p className="help">只读场景原稿；目录重命名不改写原文。</p>
              <pre className="screenplay-text wide-script-readonly">
                {scene.original ||
                  "此场景从空白建立，没有导入原稿。请在人工工作稿中编写。"}
              </pre>
            </>
          )}
          {tool === "修改差异" && (
            <>
              <p className="help">逐行比较原稿与当前人工工作稿。</p>
              <div className="diff-columns">
                <strong>原始剧本</strong>
                <strong>人工工作稿</strong>
                {lineDiff(scene.original, scene.draft).map((row, i) => (
                  <div
                    className={`diff-row ${row.changed ? "changed" : ""}`}
                    key={i}
                  >
                    <pre>{row.before || " "}</pre>
                    <pre>{row.after || " "}</pre>
                  </div>
                ))}
              </div>
            </>
          )}
          {tool === "版本历史" && (
            <>
              <h3>内容版本（人工工作稿与手动候选）</h3>
              {scene.versions.map((v, i) => (
                <div className="version-row" key={v.id}>
                  <span>
                    v{i + 1} · {v.model} ·{" "}
                    {new Date(v.at).toLocaleString("zh-CN")}
                  </span>
                  <button
                    className="text-button"
                    onClick={() =>
                      act(() => {
                        patch(editDraft(scene, v.text, true));
                        setTool("工作稿");
                        tell("历史内容已载入工作稿，定稿未改变");
                      })
                    }
                  >
                    载入工作区
                  </button>
                </div>
              ))}
              <h3>定稿历史</h3>
              {scene.finalHistory.map((v, i) => (
                <details key={i}>
                  <summary>
                    定稿 r{v.revision} ·{" "}
                    {new Date(v.at).toLocaleString("zh-CN")}
                  </summary>
                  <pre className="screenplay-text">{v.text}</pre>
                  <button
                    className="text-button"
                    onClick={() => finalize(v.text)}
                  >
                    确认恢复为新定稿
                  </button>
                </details>
              ))}
            </>
          )}
          <details className="scene-details">
            <summary>场景信息、所属章节与关联资产</summary>
            <div className="form-grid">
              <label>
                所属章节
                <select
                  aria-label="移动当前场景到章节"
                  value={chapter?.id || ""}
                  onChange={(e) => onMove(e.target.value)}
                >
                  {chapters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              {(
                [
                  ["sceneNumber", "原场次编号"],
                  ["interiorExterior", "内外景"],
                  ["timeOfDay", "日夜 / 时间"],
                ] as const
              ).map(([key, label]) => (
                <label key={key}>
                  {label}
                  <input
                    maxLength={200}
                    value={scene[key] || ""}
                    onChange={(e) => patch({ ...scene, [key]: e.target.value })}
                  />
                </label>
              ))}
            </div>
            <small className="help">
              目录中可重命名场景；名称与排序不改正文或稳定 ID。
            </small>
            <div className="asset-checkboxes">
              {assets.map((a) => (
                <label key={a.id}>
                  <input
                    type="checkbox"
                    checked={scene.assetIds.includes(a.id)}
                    onChange={(e) =>
                      patch({
                        ...scene,
                        assetIds: e.target.checked
                          ? [...scene.assetIds, a.id]
                          : scene.assetIds.filter((id) => id !== a.id),
                      })
                    }
                  />
                  {a.name}
                  <span>{a.type}</span>
                </label>
              ))}
            </div>
            <button className="danger text-button" onClick={onArchive}>
              删除当前场景（移入回收站）
            </button>
          </details>
        </>
      )}
      {mode === "AI 版本对比" && (
        <>
          <ManualScriptCompare
            scene={scene}
            patch={patch}
            tell={tell}
            instructions={script.revisionInstructions || ""}
            onInstructionsChange={onInstructionsChange}
          />
          <details className="scene-details">
            <summary>查看当前人工工作稿</summary>
            <pre className="screenplay-text">{scene.draft}</pre>
          </details>
          <button className="secondary" onClick={() => setMode("编写剧本")}>
            返回宽幅正文编辑
          </button>
        </>
      )}
      {mode === "确认定稿" && (
        <>
          <p className="help">候选尚未定稿。确认只更新独立定稿，并保留历史。</p>
          <div className="button-row">
            <button className="secondary" onClick={() => setMerge(scene.draft)}>
              整版加入确认候选
            </button>
            <button className="secondary" onClick={() => setMode("编写剧本")}>
              返回宽幅正文编辑
            </button>
          </div>
          <div className="final-review-layout">
            <label className="script-label">
              人工合并候选（尚未定稿）
              <textarea
                aria-label="人工合并候选"
                maxLength={50000}
                rows={15}
                value={merge}
                onChange={(e) => setMerge(e.target.value)}
              />
            </label>
            <section>
              <h3>
                最终剧本 ·{" "}
                {scene.final ? `r${scene.final.revision}` : "尚未确认"}
              </h3>
              <pre className="screenplay-text final-text">
                {scene.final?.text || "尚无人工确认的定稿。"}
              </pre>
            </section>
          </div>
          <button className="primary" onClick={() => finalize(merge)}>
            人工确认并保存本场定稿
          </button>
          <button
            className="secondary"
            disabled={
              !scene.finalHistory.some(
                (v) =>
                  v.revision <
                  (scene.undoTargetRevision ?? scene.final?.revision ?? 1),
              )
            }
            onClick={() =>
              act(() => {
                if (confirm("将上一版定稿恢复为新的修订版本？")) {
                  const next = undoFinal(scene);
                  patch({ ...next, mergeCandidate: next.final!.text });
                }
              })
            }
          >
            撤销最近定稿
          </button>
          <details className="sentence-review">
            <summary>逐句采用到人工候选</summary>
            {sentences(scene.draft).map((text, i) => (
              <div key={`${scene.draftRevision}-${i}`}>
                <span>{text === "\n" ? "↵" : text}</span>
                <button
                  className="text-button"
                  disabled={accepted.includes(i)}
                  onClick={() => {
                    setMerge(merge + text);
                    setAccepted([...accepted, i]);
                  }}
                >
                  采用此句
                </button>
              </div>
            ))}
          </details>
          <details className="scene-details">
            <summary>从定稿批量建立文字分镜草稿（本地）</summary>
            <p className="help">
              按段落建立草稿，不调用 AI、不覆盖已有镜头。景别与时长需人工复核。
            </p>
            <button
              className="secondary"
              disabled={scene.status !== "已定稿"}
              onClick={onGenerateShots}
            >
              从本场定稿生成分镜草稿
            </button>
          </details>
        </>
      )}
    </article>
  );
}
