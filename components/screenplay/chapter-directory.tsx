"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Screenplay } from "@/lib/screenplay";
import {
  chaptersOf,
  addChapter,
  renameChapter,
  collapseChapter,
  reorderChapter,
  removeChapter,
  duplicateChapter,
  addScene,
  renameScene,
  moveScene,
} from "@/lib/screenplay-structure";
export function ScriptDialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("input,select,button")?.focus();
    return () => previous?.focus();
  }, []);
  return (
    <div
      className="script-dialog-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        className="panel script-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          if (e.key === "Tab") {
            const nodes = Array.from(
              ref.current!.querySelectorAll<HTMLElement>(
                "input:not(:disabled),select:not(:disabled),button:not(:disabled)",
              ),
            );
            if (e.shiftKey && document.activeElement === nodes[0]) {
              e.preventDefault();
              nodes.at(-1)?.focus();
            } else if (!e.shiftKey && document.activeElement === nodes.at(-1)) {
              e.preventDefault();
              nodes[0]?.focus();
            }
          }
        }}
      >
        <div className="section-intro">
          <h2>{title}</h2>
          <button
            className="text-button"
            aria-label="关闭目录对话框"
            onClick={onClose}
          >
            关闭
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
export default function ChapterDirectory({
  script,
  selected,
  activeChapter,
  onSelect,
  onChange,
  tell,
}: {
  script: Screenplay;
  selected: string;
  activeChapter: string;
  onSelect: (sceneId: string, chapterId: string) => void;
  onChange: (s: Screenplay) => void;
  tell: (s: string) => void;
}) {
  const chapters = chaptersOf(script),
    [rename, setRename] = useState<{ id: string; name: string } | null>(null),
    [form, setForm] = useState<{
      kind: "chapter" | "scene" | "rename-scene";
      chapterId?: string;
      sceneId?: string;
      name: string;
    } | null>(null),
    [deleting, setDeleting] = useState<{
      id: string;
      step: 1 | 2;
      target: string;
    } | null>(null),
    [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(
      null,
    ),
    menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(null);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null);
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", esc);
    menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [menu]);
  const action = (fn: () => void) => {
    try {
      fn();
    } catch (e) {
      tell((e as Error).message);
    }
  };
  function shiftChapter(id: string, delta: -1 | 1) {
    const n = chapters.findIndex((c) => c.id === id),
      target = n + delta;
    if (target < 0 || target >= chapters.length) return;
    onChange(
      reorderChapter(
        script,
        id,
        delta === -1 ? chapters[target].id : chapters[target + 1]?.id || null,
      ),
    );
  }
  function drop(e: React.DragEvent, chapterId: string, beforeScene?: string) {
    e.preventDefault();
    e.stopPropagation();
    const sceneId = e.dataTransfer.getData("application/x-framework-scene"),
      chapter = e.dataTransfer.getData("application/x-framework-chapter");
    action(() => {
      if (sceneId) onChange(moveScene(script, sceneId, chapterId, beforeScene));
      else if (chapter) onChange(reorderChapter(script, chapter, chapterId));
    });
  }
  function saveRename() {
    if (!rename) return;
    action(() => {
      onChange(renameChapter(script, rename.id, rename.name));
      setRename(null);
    });
  }
  const menuChapter = chapters.find((c) => c.id === menu?.id),
    deleteChapter = chapters.find((c) => c.id === deleting?.id);
  return (
    <>
      <nav className="panel chapter-directory" aria-label="章节与场景目录">
        <div className="section-intro">
          <h3>故事目录</h3>
          <button
            className="text-button"
            onClick={() => setForm({ kind: "chapter", name: "" })}
          >
            新增章节
          </button>
        </div>
        <p className="help">章节可拖动排序；双击名称或右键重命名。</p>
        {chapters.length === 0 && (
          <p className="empty">先自由命名一个章节，再添加场景。</p>
        )}
        {chapters.map((c, index) => (
          <section
            className={`chapter-node ${activeChapter === c.id ? "active" : ""}`}
            key={c.id}
            draggable={!rename}
            onDragStart={(e) => {
              if ((e.target as HTMLElement).closest("input")) {
                e.preventDefault();
                return;
              }
              e.dataTransfer.setData("application/x-framework-chapter", c.id);
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => drop(e, c.id)}
          >
            <div
              className="chapter-heading"
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu({
                  id: c.id,
                  x: Math.min(e.clientX, window.innerWidth - 210),
                  y: Math.min(e.clientY, window.innerHeight - 260),
                });
              }}
            >
              <button
                className="text-button chapter-fold"
                aria-label={`${c.collapsed ? "展开" : "折叠"}章节 ${c.name}`}
                onClick={() => onChange(collapseChapter(script, c.id))}
              >
                {c.collapsed ? "▸" : "▾"}
              </button>
              {rename?.id === c.id ? (
                <input
                  aria-label="重命名章节"
                  autoFocus
                  onFocus={(e) => e.currentTarget.select()}
                  maxLength={200}
                  value={rename.name}
                  onChange={(e) =>
                    setRename({ ...rename, name: e.target.value })
                  }
                  onBlur={saveRename}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      saveRename();
                    }
                    if (e.key === "Escape") {
                      e.preventDefault();
                      setRename(null);
                    }
                  }}
                />
              ) : (
                <button
                  className="chapter-name"
                  onClick={() => onSelect(c.sceneIds[0] || "", c.id)}
                  onDoubleClick={() => setRename({ id: c.id, name: c.name })}
                >
                  {c.name}
                </button>
              )}
              <span>{c.sceneIds.length}</span>
              <button
                className="text-button"
                aria-label={`章节菜单 ${c.name}`}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setMenu({
                    id: c.id,
                    x: Math.min(rect.left, window.innerWidth - 210),
                    y: Math.min(rect.bottom, window.innerHeight - 260),
                  });
                }}
              >
                ⋯
              </button>
            </div>
            <div className="chapter-order-actions">
              <button
                className="text-button"
                disabled={index === 0}
                aria-label={`上移章节 ${c.name}`}
                onClick={() => shiftChapter(c.id, -1)}
              >
                上移
              </button>
              <button
                className="text-button"
                disabled={index === chapters.length - 1}
                aria-label={`下移章节 ${c.name}`}
                onClick={() => shiftChapter(c.id, 1)}
              >
                下移
              </button>
              <button
                className="text-button"
                aria-label={`新增场景到 ${c.name}`}
                onClick={() =>
                  setForm({ kind: "scene", chapterId: c.id, name: "" })
                }
              >
                ＋场景
              </button>
            </div>
            {!c.collapsed && (
              <div className="chapter-scenes">
                {c.sceneIds.map((sceneId, i) => {
                  const s = script.scenes.find((v) => v.id === sceneId)!;
                  return (
                    <div
                      className={`scene-node ${selected === s.id ? "selected" : ""}`}
                      key={s.id}
                      draggable
                      onDragStart={(e) => {
                        e.stopPropagation();
                        e.dataTransfer.setData(
                          "application/x-framework-scene",
                          s.id,
                        );
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => drop(e, c.id, s.id)}
                    >
                      <button
                        className="scene-select"
                        onClick={() => onSelect(s.id, c.id)}
                      >
                        <strong>{s.heading}</strong>
                        <small>{s.status}</small>
                      </button>
                      <div className="scene-row-actions">
                        <button
                          className="text-button"
                          aria-label={`重命名场景 ${s.heading}`}
                          onClick={() =>
                            setForm({
                              kind: "rename-scene",
                              sceneId: s.id,
                              name: s.heading,
                            })
                          }
                        >
                          改名
                        </button>
                        <button
                          className="text-button"
                          disabled={i === 0}
                          aria-label={`上移场景 ${s.heading}`}
                          onClick={() =>
                            onChange(
                              moveScene(script, s.id, c.id, c.sceneIds[i - 1]),
                            )
                          }
                        >
                          ↑
                        </button>
                        <button
                          className="text-button"
                          disabled={i === c.sceneIds.length - 1}
                          aria-label={`下移场景 ${s.heading}`}
                          onClick={() =>
                            onChange(
                              moveScene(script, s.id, c.id, c.sceneIds[i + 2]),
                            )
                          }
                        >
                          ↓
                        </button>
                      </div>
                    </div>
                  );
                })}
                {c.sceneIds.length === 0 && (
                  <p className="help">此章节尚无场景</p>
                )}
              </div>
            )}
          </section>
        ))}
      </nav>
      {menu && menuChapter && (
        <div
          className="chapter-context-menu panel"
          role="menu"
          ref={menuRef}
          style={{ left: Math.max(8, menu.x), top: Math.max(8, menu.y) }}
        >
          {[
            {
              label: "重命名",
              run: () =>
                setRename({ id: menuChapter.id, name: menuChapter.name }),
            },
            {
              label: "新增场景",
              run: () =>
                setForm({ kind: "scene", chapterId: menuChapter.id, name: "" }),
            },
            {
              label: "复制章节",
              run: () =>
                action(() => {
                  const r = duplicateChapter(script, menuChapter.id);
                  onChange(r.script);
                  onSelect(r.chapter.sceneIds[0] || "", r.chapter.id);
                }),
            },
            {
              label: menuChapter.collapsed ? "展开章节" : "折叠章节",
              run: () => onChange(collapseChapter(script, menuChapter.id)),
            },
            {
              label: "删除章节",
              run: () =>
                setDeleting({ id: menuChapter.id, step: 1, target: "" }),
            },
          ].map((item) => (
            <button
              role="menuitem"
              key={item.label}
              onClick={() => {
                item.run();
                setMenu(null);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
      {form && (
        <ScriptDialog
          title={
            form.kind === "chapter"
              ? "新增章节"
              : form.kind === "scene"
                ? "新增场景"
                : "重命名场景"
          }
          onClose={() => setForm(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              action(() => {
                if (form.kind === "chapter") {
                  const r = addChapter(script, form.name);
                  onChange(r.script);
                  onSelect("", r.chapter.id);
                } else if (form.kind === "scene") {
                  const r = addScene(script, form.chapterId!, form.name);
                  onChange(r.script);
                  onSelect(r.scene.id, form.chapterId!);
                } else onChange(renameScene(script, form.sceneId!, form.name));
                setForm(null);
              });
            }}
          >
            <label>
              {form.kind === "chapter" ? "章节名称" : "场景名称"}
              <input
                required
                maxLength={200}
                aria-label={form.kind === "chapter" ? "章节名称" : "场景名称"}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="自由命名，不会随排序自动改变"
              />
            </label>
            <div className="button-row">
              <button className="primary" type="submit">
                保存名称
              </button>
              <button
                className="secondary"
                type="button"
                onClick={() => setForm(null)}
              >
                取消
              </button>
            </div>
          </form>
        </ScriptDialog>
      )}
      {deleting && deleteChapter && (
        <ScriptDialog
          title={
            deleting.step === 1
              ? "删除章节 · 第一次确认"
              : "删除章节 · 最终确认"
          }
          onClose={() => setDeleting(null)}
        >
          {deleting.step === 1 ? (
            <>
              <p>
                准备删除“{deleteChapter.name}
                ”。本操作只移除章节容器，不删除场景正文。
              </p>
              {deleteChapter.sceneIds.length > 0 ? (
                <>
                  <p className="auth-error">
                    本章含 {deleteChapter.sceneIds.length}{" "}
                    个场景，必须移到其他章节；也可以取消。
                  </p>
                  <label>
                    接收场景的章节
                    <select
                      aria-label="接收场景的章节"
                      value={deleting.target}
                      onChange={(e) =>
                        setDeleting({ ...deleting, target: e.target.value })
                      }
                    >
                      <option value="">请选择其他章节</option>
                      {chapters
                        .filter((c) => c.id !== deleteChapter.id)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  {chapters.length === 1 && (
                    <p className="help">请先取消，并新建一个接收章节。</p>
                  )}
                </>
              ) : (
                <p>当前章节没有场景。</p>
              )}
              <button
                className="secondary"
                disabled={deleteChapter.sceneIds.length > 0 && !deleting.target}
                onClick={() => setDeleting({ ...deleting, step: 2 })}
              >
                继续检查
              </button>
            </>
          ) : (
            <>
              <p>
                确认移除“{deleteChapter.name}”？
                {deleteChapter.sceneIds.length > 0
                  ? `全部 ${deleteChapter.sceneIds.length} 个场景将移到“${chapters.find((c) => c.id === deleting.target)?.name}”，ID与分镜关联不变。`
                  : "这是一个空章节。"}
              </p>
              <button
                className="danger secondary"
                onClick={() =>
                  action(() => {
                    onChange(
                      removeChapter(script, deleting.id, deleting.target),
                    );
                    setDeleting(null);
                  })
                }
              >
                确认删除章节
              </button>
            </>
          )}
          <button className="text-button" onClick={() => setDeleting(null)}>
            取消删除
          </button>
        </ScriptDialog>
      )}
    </>
  );
}
