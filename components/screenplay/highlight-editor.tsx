"use client";
import {
  useLayoutEffect,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import type { ScriptScene } from "@/lib/screenplay";
import { editDraft } from "@/lib/screenplay";
import {
  addHighlight,
  highlightColors,
  highlightSegments,
  reanchorHighlight,
  type HighlightColor,
} from "@/lib/highlights";
import {
  selectionForSource,
  restoreTextSelection,
  editorText,
  type TextSelection,
} from "@/lib/text-selection";
import TextEditor from "./text-editor";
import styles from "./highlight-editor.module.css";
const names: Record<HighlightColor, string> = {
  yellow: "黄色",
  green: "绿色",
  pink: "粉色",
  blue: "蓝色",
};
export default function HighlightEditor({
  scene,
  patch,
  tell,
  selection,
}: {
  scene: ScriptScene;
  patch: (s: ScriptScene) => void;
  tell: (s: string) => void;
  selection: MutableRefObject<TextSelection | null>;
}) {
  const editor = useRef<HTMLTextAreaElement>(null),
    viewport = useRef<HTMLDivElement>(null),
    layer = useRef<HTMLDivElement>(null),
    [palette, setPalette] = useState(false),
    [note, setNote] = useState(""),
    [composing, setComposing] = useState(false);
  const marks = scene.highlights || [],
    review = marks.filter((m) => m.status === "review").length;
  function syncScroll() {
    const el = editor.current;
    if (el && layer.current)
      layer.current.style.transform = `translate(${-el.scrollLeft}px, ${-el.scrollTop}px)`;
  }
  useLayoutEffect(() => {
    const el = editor.current,
      box = viewport.current,
      ink = layer.current;
    if (!el || !box || !ink) return;
    const measure = () => {
      const css = getComputedStyle(el);
      box.style.left = `${el.offsetLeft + el.clientLeft}px`;
      box.style.top = `${el.offsetTop + el.clientTop}px`;
      box.style.width = `${el.clientWidth}px`;
      box.style.height = `${el.clientHeight}px`;
      for (const property of [
        "font-family",
        "font-size",
        "font-weight",
        "font-style",
        "line-height",
        "letter-spacing",
        "word-spacing",
        "text-indent",
        "text-align",
        "tab-size",
        "word-break",
        "padding-top",
        "padding-right",
        "padding-bottom",
        "padding-left",
        "direction",
      ])
        ink.style.setProperty(property, css.getPropertyValue(property));
      ink.style.width = `${el.clientWidth}px`;
      syncScroll();
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    window.addEventListener("resize", measure);
    void document.fonts?.ready.then(measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);
  useLayoutEffect(() => {
    syncScroll();
  }, [scene.draft, scene.highlightsHidden, scene.highlights]);
  const keep = (e: React.MouseEvent) => {
    if (e.button === 0) e.preventDefault();
  };
  function restoreSelection() {
    const el = editor.current,
      s = selection.current;
    if (el) restoreTextSelection(el, s);
  }
  function act(fn: () => void) {
    try {
      fn();
    } catch (e) {
      tell((e as Error).message);
    }
  }
  return (
    <div className={styles.studio}>
      <div className={styles.toolbar}>
        <button
          className="secondary"
          aria-expanded={palette}
          onMouseDown={keep}
          onClick={() => {
            if (document.activeElement === editor.current)
              selection.current = selectionForSource(
                editor.current!,
                scene.draft,
              );
            setPalette(!palette);
          }}
        >
          荧光笔
        </button>
        {marks.length > 0 && (
          <button
            className="text-button"
            aria-pressed={!!scene.highlightsHidden}
            onMouseDown={keep}
            onClick={() =>
              patch({ ...scene, highlightsHidden: !scene.highlightsHidden })
            }
          >
            {scene.highlightsHidden ? "显示全部标注" : "隐藏全部标注"}
          </button>
        )}
        {review > 0 && (
          <span className={styles.review} role="status">
            {review} 条标注需重新确认，未在正文高亮
          </span>
        )}
      </div>
      {palette && (
        <div className={styles.palette} aria-label="荧光笔颜色">
          {highlightColors.map((color) => (
            <button
              key={color}
              className={styles.swatch}
              data-color={color}
              aria-label={`${names[color]}标注`}
              onMouseDown={keep}
              onClick={() =>
                act(() => {
                  patch({
                    ...scene,
                    highlights: addHighlight(
                      scene.highlights,
                      scene.draft,
                      selection.current,
                      color,
                      note || undefined,
                    ),
                  });
                  setPalette(false);
                  setNote("");
                  restoreSelection();
                  tell(
                    scene.highlightsHidden
                      ? "标注已保存，点击显示全部标注后查看"
                      : `已添加${names[color]}标注，取消文本选区后可查看颜色`,
                  );
                })
              }
            >
              {names[color]}
            </button>
          ))}
          <input
            aria-label="新标注备注"
            maxLength={300}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="备注（可选）"
          />
        </div>
      )}
      <label className="script-label">
        人工工作稿
        <div className={styles.editor}>
          <div className={styles.viewport} ref={viewport} aria-hidden="true">
            <div className={styles.layer} ref={layer}>
              {highlightSegments(
                scene.draft,
                marks,
                scene.highlightsHidden || composing,
              ).map((part, i) =>
                part.mark ? (
                  <mark
                    key={i}
                    className={styles.mark}
                    data-color={part.mark.color}
                    data-highlight-id={part.mark.id}
                  >
                    {editorText(part.text)}
                  </mark>
                ) : (
                  <span key={i}>{editorText(part.text)}</span>
                ),
              )}
              {"\u200b"}
            </div>
          </div>
          <TextEditor
            editorRef={editor}
            aria-label="场景修改稿"
            className={`screenplay-text wide-script-body ${styles.textarea}`}
            maxLength={200000}
            rows={16}
            value={scene.draft}
            placeholder="在这里逐场编写……"
            onScroll={syncScroll}
            onCompositionState={setComposing}
            onSelection={(s) => {
              selection.current = s;
            }}
            onChange={(text, change) =>
              act(() =>
                patch(editDraft(scene, text, false, "人工修改", change)),
              )
            }
            onBlur={() => act(() => patch(editDraft(scene, scene.draft, true)))}
          />
        </div>
      </label>
      {marks.length > 0 && (
        <details className={styles.list}>
          <summary>
            标注 {marks.length} 条{review ? ` · 待确认 ${review} 条` : ""}
          </summary>
          <p className="help">
            重叠处显示最近选用的颜色，各条标注独立保留。待确认标注不显示背景，请选中正确文字后重新确认。
          </p>
          {marks.map((mark) => (
            <article
              className={styles.row}
              key={mark.id}
              data-annotation-id={mark.id}
            >
              <div className={styles.quote}>
                <span className={styles.dot} data-color={mark.color} />
                {mark.quote.length > 120
                  ? mark.quote.slice(0, 120) + "…"
                  : mark.quote}
                <small>
                  {mark.status === "review" ? "需重新确认" : "已定位"}
                </small>
              </div>
              <div className={styles.controls}>
                <select
                  aria-label={`标注颜色：${mark.quote.slice(0, 30)}`}
                  value={mark.color}
                  onChange={(e) =>
                    patch({
                      ...scene,
                      highlights: [
                        ...marks.filter((m) => m.id !== mark.id),
                        { ...mark, color: e.target.value as HighlightColor },
                      ],
                    })
                  }
                >
                  {highlightColors.map((c) => (
                    <option value={c} key={c}>
                      {names[c]}
                    </option>
                  ))}
                </select>
                <input
                  aria-label={`标注备注：${mark.quote.slice(0, 30)}`}
                  value={mark.note}
                  placeholder="添加简短备注"
                  maxLength={300}
                  onChange={(e) =>
                    patch({
                      ...scene,
                      highlights: marks.map((m) =>
                        m.id === mark.id ? { ...m, note: e.target.value } : m,
                      ),
                    })
                  }
                />
                {mark.status === "active" ? (
                  <button
                    className="text-button"
                    onClick={() => {
                      const el = editor.current;
                      if (
                        !el ||
                        editorText(scene.draft.slice(mark.start, mark.end)) !==
                          mark.quote
                      )
                        return tell("文字已变化，请重新确认");
                      const target = {
                        text: scene.draft,
                        start: mark.start,
                        end: mark.end,
                      };
                      restoreTextSelection(el, target);
                      selection.current = target;
                    }}
                  >
                    选择此段
                  </button>
                ) : (
                  <button
                    className="text-button"
                    onMouseDown={keep}
                    onClick={() =>
                      act(() => {
                        patch({
                          ...scene,
                          highlights: marks.map((m) =>
                            m.id === mark.id
                              ? reanchorHighlight(
                                  m,
                                  scene.draft,
                                  selection.current,
                                )
                              : m,
                          ),
                        });
                        restoreSelection();
                      })
                    }
                  >
                    用当前选区重新确认
                  </button>
                )}
                <button
                  className="text-button"
                  onClick={() =>
                    patch({
                      ...scene,
                      highlights: marks.filter((m) => m.id !== mark.id),
                    })
                  }
                >
                  取消标注
                </button>
              </div>
            </article>
          ))}
        </details>
      )}
    </div>
  );
}
