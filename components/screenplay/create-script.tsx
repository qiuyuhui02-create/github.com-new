"use client";
import { useMemo, useState } from "react";
import type { Screenplay, ScriptLanguage } from "@/lib/screenplay";
import {
  newBlankScreenplay,
  suggestBoundaries,
  importRegions,
  confirmImport,
  sourceLines,
  type ImportBoundary,
} from "@/lib/screenplay-structure";
export default function CreateScript({
  onCreate,
  tell,
}: {
  onCreate: (s: Screenplay) => void;
  tell: (s: string) => void;
}) {
  const [method, setMethod] = useState<"import" | "blank">("import"),
    [title, setTitle] = useState(""),
    [synopsis, setSynopsis] = useState(""),
    [language, setLanguage] = useState<ScriptLanguage>("中文"),
    [text, setText] = useState(""),
    [plan, setPlan] = useState<ImportBoundary[] | null>(null),
    [splitLine, setSplitLine] = useState(1);
  const preview = useMemo(() => {
    try {
      return { regions: plan ? importRegions(text, plan) : [], error: "" };
    } catch (e) {
      return { regions: [], error: (e as Error).message };
    }
  }, [text, plan]);
  const patch = (id: string, change: Partial<ImportBoundary>) =>
    setPlan(
      (p) => p?.map((b) => (b.id === id ? { ...b, ...change } : b)) || null,
    );
  return (
    <section className="panel script-create">
      <div className="eyebrow">A PLACE FOR YOUR STORY</div>
      <h2>从一份剧本，或一页空白开始</h2>
      <div className="tabs">
        <button
          className={method === "import" ? "selected" : ""}
          onClick={() => setMethod("import")}
        >
          导入完整剧本
        </button>
        <button
          className={method === "blank" ? "selected" : ""}
          onClick={() => setMethod("blank")}
        >
          从零开始创作
        </button>
      </div>
      <div className="form-grid">
        <label>
          剧本名称
          <input
            aria-label="剧本名称"
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="自由命名你的故事"
          />
        </label>
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
      </div>
      <label>
        剧本简介
        <textarea
          aria-label="剧本简介"
          rows={3}
          maxLength={5000}
          value={synopsis}
          onChange={(e) => setSynopsis(e.target.value)}
          placeholder="一句话故事、创作想法，或暂时留白……"
        />
      </label>
      {method === "blank" ? (
        <>
          <p className="help">
            创建后自由添加章节与场景；先在人工工作稿编写，原稿和正式定稿各自独立。
          </p>
          <button
            className="primary"
            onClick={() => {
              try {
                onCreate(newBlankScreenplay(title, synopsis, language));
              } catch (e) {
                tell((e as Error).message);
              }
            }}
          >
            新建空白剧本
          </button>
        </>
      ) : (
        <>
          <p className="help">
            支持 UTF-8 TXT、Markdown、Fountain
            或直接粘贴全文（20万字内）。识别仅作建议，不改写内容；先核对拆分预览，再确认导入。
          </p>
          {!plan ? (
            <>
              <label className="upload-button">
                读取本地剧本文本
                <input
                  aria-label="读取本地剧本文本"
                  type="file"
                  accept=".txt,.md,.markdown,.fountain,text/plain,text/markdown"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (f)
                      try {
                        if (f.size > 1024 * 1024)
                          throw Error("文件超过1MB，请拆分或直接粘贴文本");
                        const content = new TextDecoder("utf-8", {
                          fatal: true,
                          ignoreBOM: true,
                        }).decode(await f.arrayBuffer());
                        if (content.length > 200000)
                          throw Error("剧本超过20万字");
                        setText(content);
                        if (!title) setTitle(f.name.replace(/\.[^.]+$/, ""));
                      } catch {
                        tell(
                          "无法读取：请使用1MB以内、20万字以内的UTF-8文本；原文未导入或改写。",
                        );
                      }
                    e.target.value = "";
                  }}
                />
              </label>
              <textarea
                aria-label="原始剧本导入"
                rows={15}
                maxLength={200000}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={
                  "# 夏の記憶\n\n内景 自宅 — 日\n\n人物：今天也要继续。"
                }
              />
              <button
                className="primary"
                onClick={() => {
                  try {
                    setPlan(suggestBoundaries(text));
                  } catch (e) {
                    tell((e as Error).message);
                  }
                }}
              >
                预览拆分
              </button>
            </>
          ) : (
            <div className="import-preview">
              <div className="section-intro">
                <h3>拆分预览 · 尚未导入</h3>
                <button className="secondary" onClick={() => setPlan(null)}>
                  返回全文编辑
                </button>
              </div>
              <p className="help">
                可修改类型、名称和起始行，或合并/增加边界。章节标题行原样单独保留；章前叙述与台词会成为可编辑开篇场景。无法识别的内容按原文保留。所有区间必须从第1行连续覆盖全文。
              </p>
              <div className="button-row">
                <label>
                  新增边界行
                  <input
                    aria-label="新增边界行"
                    type="number"
                    min={1}
                    max={sourceLines(text).length}
                    value={splitLine}
                    onChange={(e) => setSplitLine(Number(e.target.value))}
                  />
                </label>
                <button
                  className="secondary"
                  onClick={() => {
                    if (
                      !Number.isInteger(splitLine) ||
                      splitLine < 1 ||
                      splitLine > sourceLines(text).length ||
                      plan.some((b) => b.line === splitLine)
                    )
                      return tell("请选择未使用的有效行号");
                    setPlan([
                      ...plan,
                      {
                        id: crypto.randomUUID(),
                        line: splitLine,
                        kind: "scene",
                        name:
                          sourceLines(text)
                            [splitLine - 1].trim()
                            .slice(0, 200) || "新场景",
                      },
                    ]);
                  }}
                >
                  在此行增加边界
                </button>
              </div>
              {preview.error && (
                <p className="auth-error" role="alert">
                  {preview.error}。请修正后再确认，原文尚未改动。
                </p>
              )}
              {[...plan]
                .sort((a, b) => a.line - b.line)
                .map((b, i) => {
                  const region = preview.regions.find((r) => r.id === b.id);
                  return (
                    <article className="import-region" key={b.id}>
                      <div className="import-boundary-fields">
                        <label>
                          起始行
                          <input
                            aria-label={`区间 ${i + 1} 起始行`}
                            type="number"
                            min="1"
                            max={sourceLines(text).length}
                            value={b.line}
                            disabled={b.id === plan[0].id}
                            onChange={(e) =>
                              patch(b.id, { line: Number(e.target.value) })
                            }
                          />
                        </label>
                        <label>
                          建议类型
                          <select
                            aria-label={`区间 ${i + 1} 类型`}
                            value={b.kind}
                            onChange={(e) =>
                              patch(b.id, {
                                kind: e.target.value as "chapter" | "scene",
                              })
                            }
                          >
                            <option value="chapter">章节</option>
                            <option value="scene">场景</option>
                          </select>
                        </label>
                        <label>
                          目录名称
                          <input
                            aria-label={`区间 ${i + 1} 名称`}
                            maxLength={200}
                            value={b.name}
                            onChange={(e) =>
                              patch(b.id, { name: e.target.value })
                            }
                          />
                        </label>
                      </div>
                      <small>
                        第 {b.line}～{region?.endLine || "?"} 行 ·
                        识别不保证准确，请人工核对
                      </small>
                      <pre>
                        {region?.text || "请先修正边界；原始全文仍完整保留"}
                      </pre>
                      <button
                        className="text-button"
                        disabled={i === 0}
                        onClick={() =>
                          setPlan(plan.filter((v) => v.id !== b.id))
                        }
                      >
                        与上段合并
                      </button>
                    </article>
                  );
                })}
              <button
                className="primary"
                disabled={!!preview.error}
                onClick={() => {
                  try {
                    onCreate(
                      confirmImport(
                        text,
                        language,
                        title || "未命名剧本",
                        synopsis,
                        plan,
                      ),
                    );
                    tell("全文原样保留，已按确认的边界建立章节与场景");
                  } catch (e) {
                    tell((e as Error).message);
                  }
                }}
              >
                保留原稿并建立场景
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
