"use client";
import { useEffect, useRef, useState, type MutableRefObject } from "react";
import {
  editDraft,
  externalRevisionPrompt,
  undoWorkingDraft,
} from "@/lib/screenplay";
import type { ScriptScene } from "@/lib/screenplay";
import {
  insertSelection,
  selectedText,
  validSelection,
  type TextSelection,
} from "@/lib/text-selection";
import TextEditor from "./screenplay/text-editor";
export default function ManualScriptCompare({
  scene,
  patch,
  tell,
  instructions,
  onInstructionsChange,
  draftSelection,
}: {
  scene: ScriptScene;
  patch: (s: ScriptScene) => void;
  tell: (s: string) => void;
  instructions: string;
  onInstructionsChange: (s: string) => void;
  draftSelection: MutableRefObject<TextSelection | null>;
}) {
  const [active, setActive] = useState(0),
    [dual, setDual] = useState(false),
    [source, setSource] = useState<"original" | "draft">(
      scene.original.trim() ? "original" : "draft",
    ),
    [focus, setFocus] = useState(false),
    [replace, setReplace] = useState(false),
    [targetHint, setTargetHint] = useState("");
  const selections = useRef<(TextSelection | null)[]>([null, null, null]),
    editors = useRef<(HTMLTextAreaElement | null)[]>([]);
  const slots = Array.from(
    { length: 3 },
    (_, i) =>
      scene.manualComparisons?.[i] || {
        model: ["ChatGPT", "Gemini", "Claude"][i],
        text: "",
      },
  );
  const current = slots[active];
  useEffect(() => {
    if (!focus) return;
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFocus(false);
    };
    window.addEventListener("keydown", esc);
    return () => {
      document.body.style.overflow = old;
      window.removeEventListener("keydown", esc);
    };
  }, [focus]);
  function edit(i: number, text: string) {
    patch({
      ...scene,
      manualComparisons: slots.map((v, n) => (n === i ? { ...v, text } : v)),
    });
  }
  function rememberTarget(s: TextSelection) {
    draftSelection.current = s;
    setTargetHint(
      s.start === s.end
        ? `插入位置：第 ${s.start + 1} 个字符前`
        : `已选工作稿 ${s.end - s.start} 个字符`,
    );
  }
  function restoreCandidate() {
    const el = editors.current[active],
      s = selections.current[active];
    if (el && validSelection(s, el.value)) {
      el.focus({ preventScroll: true });
      el.setSelectionRange(s.start, s.end, s.direction);
    }
  }
  function apply(all = false) {
    try {
      const text = all
        ? current.text
        : selectedText(selections.current[active], current.text);
      if (!text.trim()) throw Error("请先粘贴候选内容");
      if (
        all &&
        !confirm(
          "将当前 AI 全文作为新的工作稿？现有工作稿保留撤销记录，原稿和定稿不变。",
        )
      )
        return;
      const result = all
        ? { text, cursor: text.length }
        : insertSelection(scene.draft, text, draftSelection.current, replace);
      patch(
        editDraft(
          editDraft(scene, scene.draft, true),
          result.text,
          true,
          `${current.model} · 人工采用`,
        ),
      );
      draftSelection.current = {
        text: result.text,
        start: result.cursor,
        end: result.cursor,
      };
      setTargetHint("已采用，可撤销");
      tell(all ? "全文已成为工作稿，可撤销" : "选中文字已采用到工作稿，可撤销");
      restoreCandidate();
    } catch (e) {
      tell((e as Error).message);
    }
  }
  async function copy() {
    try {
      const text = selectedText(selections.current[active], current.text);
      await navigator.clipboard.writeText(text);
      restoreCandidate();
      tell("选中文字已复制");
    } catch (e) {
      restoreCandidate();
      tell(
        e instanceof Error && e.message.includes("先")
          ? e.message
          : "剪贴板不可用，选区已保留，请按 Command / Ctrl + C",
      );
    }
  }
  // Only toolbar mouse-down is prevented, so Safari does not collapse the native selection.
  const keepSelection = (e: React.MouseEvent) => {
    if (e.button === 0) e.preventDefault();
  };
  return (
    <section
      className={`manual-compare ai-writing-studio ${focus ? "focus-mode" : ""}`}
      aria-label="手动 AI 版本对比"
    >
      <div className="ai-topbar">
        <div className="tabs platform-tabs" role="tablist" aria-label="AI 平台">
          {["ChatGPT", "Gemini", "Claude"].map((name, i) => (
            <button
              key={name}
              role="tab"
              aria-selected={i === active}
              className={i === active ? "selected" : ""}
              onClick={() => setActive(i)}
            >
              {name}
            </button>
          ))}
        </div>
        <div className="button-row">
          <button
            className="text-button"
            aria-pressed={dual}
            onClick={() => setDual(!dual)}
          >
            {dual ? "切换单栏" : "切换双栏"}
          </button>
          <button
            className="text-button"
            aria-pressed={focus}
            onClick={() => setFocus(!focus)}
          >
            {focus ? "退出专注" : "专注编辑"}
          </button>
        </div>
      </div>
      <div className="ai-actions">
        <button
          className="secondary"
          onMouseDown={keepSelection}
          onClick={copy}
        >
          复制选中文字
        </button>
        <button
          className="primary"
          onMouseDown={keepSelection}
          onClick={() => apply()}
        >
          采用选中文字
        </button>
        <select
          aria-label="采用方式"
          value={replace ? "replace" : "insert"}
          onChange={(e) => setReplace(e.target.value === "replace")}
        >
          <option value="insert">插入工作稿光标处／末尾</option>
          <option value="replace">替换工作稿选区</option>
        </select>
        <button
          className="secondary"
          onMouseDown={keepSelection}
          onClick={() => apply(true)}
        >
          采用全文
        </button>
        <button
          className="text-button"
          onMouseDown={keepSelection}
          onClick={() => {
            try {
              patch(undoWorkingDraft(scene));
              draftSelection.current = null;
              setTargetHint("");
              tell("已撤销工作稿修改");
            } catch (e) {
              tell((e as Error).message);
            }
          }}
        >
          撤销采用
        </button>
      </div>
      <div className={`ai-editor-layout ${dual ? "dual" : ""}`}>
        {dual && (
          <section className="ai-source-column">
            <label className="editor-source-label">
              对照来源
              <select
                aria-label="对照来源"
                value={source}
                onChange={(e) =>
                  setSource(e.target.value as "original" | "draft")
                }
              >
                <option value="original">原稿（只读）</option>
                <option value="draft">工作稿（可编辑与选择位置）</option>
              </select>
            </label>
            <TextEditor
              key={source}
              aria-label="对照正文"
              className="ai-large-editor"
              value={source === "original" ? scene.original : scene.draft}
              readOnly={source === "original"}
              maxLength={200000}
              onSelection={source === "draft" ? rememberTarget : undefined}
              onChange={
                source === "draft"
                  ? (text) => {
                      try {
                        patch(editDraft(scene, text));
                      } catch (e) {
                        tell((e as Error).message);
                      }
                    }
                  : undefined
              }
              onBlur={() => {
                if (source === "draft")
                  try {
                    patch(editDraft(scene, scene.draft, true));
                  } catch (e) {
                    tell((e as Error).message);
                  }
              }}
            />
            <small className="selection-hint">
              {source === "draft"
                ? targetHint ||
                  "点击工作稿确定插入位置；先选段，再选择替换方式。"
                : "切换到工作稿可指定采用位置。"}
            </small>
          </section>
        )}
        <section className="ai-candidate-column">
          <div className="editor-source-label">
            <span>{["ChatGPT", "Gemini", "Claude"][active]} 候选</span>
            <small>手动粘贴 · 自动保存</small>
          </div>
          {slots.map((s, i) => (
            <div key={i} hidden={active !== i}>
              <TextEditor
                editorRef={(el) => {
                  editors.current[i] = el;
                }}
                aria-label={`AI 修改结果 ${i + 1}`}
                className="ai-large-editor"
                value={s.text}
                maxLength={200000}
                placeholder="粘贴外部 AI 修改稿……"
                onChange={(text) => edit(i, text)}
                onSelection={(selection) => {
                  selections.current[i] = selection;
                }}
              />
            </div>
          ))}
        </section>
      </div>
      <details className="ai-more">
        <summary>更多：修改要求与版本</summary>
        <label>
          统一修改要求
          <TextEditor
            aria-label="统一修改要求"
            value={instructions}
            maxLength={5000}
            rows={4}
            onChange={onInstructionsChange}
          />
        </label>
        <div className="button-row">
          <select
            aria-label="外部修改来源"
            value={source}
            onChange={(e) => setSource(e.target.value as "original" | "draft")}
          >
            <option value="original">本场原始剧本</option>
            <option value="draft">本场人工工作稿</option>
          </select>
          <button
            className="secondary"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(
                  externalRevisionPrompt(scene, instructions, source),
                );
                tell("统一修改提示已复制");
              } catch {
                tell("请展开完整修改提示后手动复制");
              }
            }}
          >
            复制统一修改提示
          </button>
        </div>
        <details>
          <summary>查看完整修改提示（可手动复制）</summary>
          <pre className="screenplay-text">
            {externalRevisionPrompt(scene, instructions, source)}
          </pre>
        </details>
        <label>
          候选来源名称
          <input
            value={current.model}
            maxLength={100}
            onChange={(e) =>
              patch({
                ...scene,
                manualComparisons: slots.map((v, i) =>
                  i === active ? { ...v, model: e.target.value } : v,
                ),
              })
            }
          />
        </label>
        <button
          className="secondary"
          onClick={() => {
            if (scene.versions.length >= 100)
              return tell("版本已达100份，请先导出备份");
            patch({
              ...scene,
              versions: [
                ...scene.versions,
                {
                  id: crypto.randomUUID(),
                  text: current.text,
                  model: current.model,
                  kind: "candidate",
                  at: new Date().toISOString(),
                },
              ],
            });
            tell("当前候选已保存到版本历史");
          }}
        >
          保存当前候选版本
        </button>
        <button
          className="secondary"
          onClick={() => {
            if (current.text.length > 200000) return;
            patch({ ...scene, mergeCandidate: current.text });
            tell("已送入确认定稿标签的人工候选，尚未定稿");
          }}
        >
          送入定稿候选
        </button>
      </details>
    </section>
  );
}
