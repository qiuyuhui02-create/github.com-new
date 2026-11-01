"use client";
import ManualScriptCompare from "./manual-script-compare";
import { useState } from "react";
import type { Studio } from "@/lib/model";
import {
  confirmScene,
  editDraft,
  generateShotDrafts,
  importScreenplay,
  lineDiff,
  sentences,
  undoFinal,
  undoWorkingDraft,
  type ScriptScene,
  type ScriptLanguage,
} from "@/lib/screenplay";
import { downloadBlob } from "@/lib/media";
export default function ScriptWorkbench({
  data,
  onChange,
  tell,
  onCreateShot,
}: {
  onCreateShot: (sceneId: string) => void;
  data: Studio;
  onChange: (d: Partial<Studio>) => void;
  tell: (s: string) => void;
}) {
  const [source, setSource] = useState(""),
    [language, setLanguage] = useState<ScriptLanguage>("中文"),
    [selected, setSelected] = useState("");
  const script = data.script,
    scene = script?.scenes.find((s) => s.id === selected) || script?.scenes[0];
  const patch = (next: ScriptScene) => {
    if (script)
      onChange({
        script: {
          ...script,
          scenes: script.scenes.map((s) => (s.id === next.id ? next : s)),
        },
      });
  };
  const action = (fn: () => void) => {
    try {
      fn();
    } catch (e) {
      tell((e as Error).message);
    }
  };
  if (!script)
    return (
      <section className="panel screenplay-import">
        <h2>剧本工作台 / SCREENPLAY</h2>
        <p className="help">
          原始剧本只读保留。识别 INT./EXT.、内景/外景、第N场、日文 ○ / シーン
          场景标题。也可导入 UTF-8 .txt / .fountain 文本。
        </p>
        <label>
          剧本语言
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as ScriptLanguage)}
          >
            <option>中文</option>
            <option>日本語</option>
          </select>
        </label>
        <label className="upload-button">
          读取本地剧本文本
          <input
            type="file"
            accept=".txt,.fountain,text/plain"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) {
                if (f.size > 1024 * 1024) return tell("剧本文本超过 1MB");
                setSource(await f.text());
              }
              e.target.value = "";
            }}
          />
        </label>
        <textarea
          aria-label="原始剧本导入"
          rows={18}
          value={source}
          onChange={(e) => setSource(e.target.value)}
          placeholder={
            "内景 记忆修复室 — 夜\n\n林：这里还留着她的记忆。\n\n外景 霓虹街区 — 夜\n\n雨落在空旷的街上。"
          }
        />
        <button
          className="primary"
          onClick={() =>
            action(() => {
              onChange({ script: importScreenplay(source, language) });
              tell("原始剧本已保留，已建立场景目录");
            })
          }
        >
          保留原稿并建立场景
        </button>
      </section>
    );
  return (
    <section className="script-workbench">
      <div className="panel script-toolbar">
        <span>
          {script.original.language} · {script.scenes.length} 场 ·{" "}
          {script.scenes.filter((s) => s.status === "已定稿").length} 已定稿
        </span>
        <span className="help">
          自动保存在本地缓存 · 云端请手动推送 · 原稿不会被修改
        </span>
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
      </div>
      <div className="script-layout">
        <nav className="panel scene-directory" aria-label="场景目录">
          {script.scenes.map((s, i) => (
            <button
              className={scene?.id === s.id ? "selected" : ""}
              key={s.id}
              onClick={() => setSelected(s.id)}
            >
              <small>SCENE {String(i + 1).padStart(2, "0")}</small>
              <strong>{s.heading}</strong>
              <span className={`scene-state state-${s.status}`}>
                {s.status}
              </span>
            </button>
          ))}
        </nav>
        {scene && (
          <div>
            <SceneEditor
              key={scene.id}
              scene={scene}
              instructions={script.revisionInstructions || ""}
              onInstructionsChange={(text) =>
                onChange({ script: { ...script, revisionInstructions: text } })
              }
              assets={data.assets}
              patch={patch}
              tell={tell}
            />
            <div className="panel script-links">
              <h3>分镜联动</h3>
              <p className="help">
                基于已定稿内容按段落生成镜头草稿，景别与时长需人工审核。再次修改剧本只提示旧镜头可能过期，不覆盖已有分镜。
              </p>
              <button
                className="primary"
                disabled={scene.status !== "已定稿"}
                onClick={() => onCreateShot(scene.id)}
              >
                手动新建本场镜头
              </button>
              <button
                className="secondary"
                disabled={scene.status !== "已定稿"}
                onClick={() =>
                  action(() => {
                    const shots = generateShotDrafts(data, scene.id);
                    onChange({ shots: [...data.shots, ...shots] });
                    tell(`新增 ${shots.length} 个分镜草稿，请到分镜制作审核`);
                  })
                }
              >
                从本场定稿生成分镜草稿
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
function SceneEditor({
  scene,
  assets,
  patch,
  tell,
  instructions,
  onInstructionsChange,
}: {
  instructions: string;
  onInstructionsChange: (text: string) => void;
  scene: ScriptScene;
  assets: Studio["assets"];
  patch: (s: ScriptScene) => void;
  tell: (s: string) => void;
}) {
  const [tab, setTab] = useState("修改与确认"),
    [accepted, setAccepted] = useState<number[]>([]);
  const merge = scene.mergeCandidate ?? scene.final?.text ?? "";
  function setMerge(value: string | ((s: string) => string)) {
    patch({
      ...scene,
      mergeCandidate: typeof value === "function" ? value(merge) : value,
    });
  }
  function action(fn: () => void) {
    try {
      fn();
    } catch (e) {
      tell((e as Error).message);
    }
  }
  function finalize(text: string) {
    action(() => {
      if (
        !confirm(
          "确认将候选内容保存为本场正式定稿？原有定稿会进入历史，不会被 AI 自动修改。",
        )
      )
        return;
      const next = confirmScene(scene, text);
      patch({ ...next, mergeCandidate: text });
      tell("本场人工定稿已保存");
    });
  }
  return (
    <div className="panel scene-editor">
      <div className="section-intro">
        <h2>{scene.heading}</h2>
        <span>
          {scene.status} · 工作稿 r{scene.draftRevision}
        </span>
      </div>
      <div className="tabs script-tabs">
        {["修改与确认", "原始剧本", "修改差异", "版本历史", "最终剧本"].map(
          (t) => (
            <button
              className={tab === t ? "selected" : ""}
              key={t}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ),
        )}
      </div>
      {tab === "原始剧本" && (
        <>
          <p className="help">只读原稿 · 保留导入时内容</p>
          <pre className="screenplay-text" lang="ja">
            {scene.original}
          </pre>
        </>
      )}
      {tab === "修改与确认" && (
        <>
          <ManualScriptCompare
            scene={scene}
            patch={patch}
            tell={tell}
            instructions={instructions}
            onInstructionsChange={onInstructionsChange}
          />
          <label className="script-label">
            人工修改工作区
            <textarea
              className="screenplay-text"
              maxLength={50000}
              aria-label="场景修改稿"
              rows={14}
              value={scene.draft}
              onChange={(e) =>
                action(() => {
                  patch(editDraft(scene, e.target.value));
                  setAccepted([]);
                })
              }
              onBlur={() =>
                action(() => patch(editDraft(scene, scene.draft, true)))
              }
            />
          </label>
          <div className="button-row">
            <button
              className="secondary"
              onClick={() =>
                action(() => {
                  patch(editDraft(scene, scene.draft, true));
                  tell("已保存工作稿版本");
                })
              }
            >
              保存工作稿版本
            </button>
            <button
              className="secondary"
              onClick={() =>
                action(() => {
                  patch(undoWorkingDraft(scene));
                  setAccepted([]);
                })
              }
            >
              撤销最近修改
            </button>
            <button
              className="secondary"
              onClick={() => {
                setMerge(scene.draft);
                setAccepted([]);
                tell("整版已加入人工候选，仍需确认定稿");
              }}
            >
              整版加入确认候选
            </button>
            <button
              className="text-button"
              onClick={() => patch({ ...scene, status: "待修改" })}
            >
              标记待修改
            </button>
          </div>
          <details className="sentence-review">
            <summary>逐句采用到人工候选</summary>
            {sentences(scene.draft).map((text, i) => (
              <div key={`${scene.draftRevision}-${i}`}>
                <span>{text === "\n" ? "↵" : text}</span>
                <button
                  className="text-button"
                  disabled={accepted.includes(i)}
                  onClick={() => {
                    setMerge((v) => v + text);
                    setAccepted((v) => [...v, i]);
                  }}
                >
                  {accepted.includes(i) ? "已采用" : "采用此句"}
                </button>
              </div>
            ))}
          </details>
          <label className="script-label">
            人工合并候选（尚未定稿）
            <textarea
              maxLength={50000}
              aria-label="人工合并候选"
              rows={8}
              value={merge}
              onChange={(e) => setMerge(e.target.value)}
            />
          </label>
          <button className="primary" onClick={() => finalize(merge)}>
            人工确认并保存本场定稿
          </button>
          <p className="help">
            候选、修改稿和已确认定稿均自动保存到本地缓存；云端请手动推送。候选不会自动成为正式定稿。
          </p>
        </>
      )}
      {tab === "修改差异" && (
        <>
          <p className="help">
            逐行对照：左侧为原稿，右侧为当前修改稿；颜色标记内容不同的行。
          </p>
          <div className="diff-columns">
            <strong>原始剧本</strong>
            <strong>修改稿</strong>
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
      {tab === "版本历史" && (
        <>
          <h3>内容版本（人工工作稿与手动候选）</h3>
          {scene.versions.map((v, i) => (
            <article className="version-row" key={v.id}>
              <span>
                v{i + 1} · {v.model} · {new Date(v.at).toLocaleString("zh-CN")}
              </span>
              <button
                className="text-button"
                onClick={() =>
                  action(() => {
                    patch(editDraft(scene, v.text, true));
                    setAccepted([]);
                    tell("历史版本已载入工作区，定稿未改变");
                  })
                }
              >
                载入工作区
              </button>
            </article>
          ))}
          <h3>定稿历史</h3>
          {scene.finalHistory.map((v, i) => (
            <details key={i}>
              <summary>
                定稿 r{v.revision} · {new Date(v.at).toLocaleString("zh-CN")}
              </summary>
              <pre className="screenplay-text">{v.text}</pre>
              <button className="text-button" onClick={() => finalize(v.text)}>
                确认恢复为新定稿
              </button>
            </details>
          ))}
        </>
      )}
      {tab === "最终剧本" && (
        <>
          <p className="help">
            本场独立定稿 {scene.final ? `r${scene.final.revision}` : "尚未确认"}{" "}
            · AI 无权自动覆盖
          </p>
          <pre className="screenplay-text final-text">
            {scene.final?.text || "尚无人工确认的定稿。"}
          </pre>
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
              action(() => {
                if (confirm("将上一版定稿恢复为新修订版本？")) {
                  const next = undoFinal(scene);
                  patch({ ...next, mergeCandidate: next.final!.text });
                }
              })
            }
          >
            撤销最近定稿
          </button>
        </>
      )}
      <div className="script-asset-links">
        <h4>本场关联资产</h4>
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
      </div>
    </div>
  );
}
