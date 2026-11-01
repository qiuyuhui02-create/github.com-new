"use client";
import { useRef, useState } from "react";
import {
  appendCandidateToDraft,
  externalRevisionPrompt,
} from "@/lib/screenplay";
import type { ScriptScene } from "@/lib/screenplay";
export default function ManualScriptCompare({
  scene,
  patch,
  tell,
  instructions,
  onInstructionsChange,
}: {
  tell: (s: string) => void;
  instructions: string;
  onInstructionsChange: (text: string) => void;
  scene: ScriptScene;
  patch: (s: ScriptScene) => void;
}) {
  const [source, setSource] = useState<"original" | "draft">("original");
  const selection = useRef<{
    index: number;
    start: number;
    end: number;
    text: string;
  } | null>(null);
  const names = ["ChatGPT", "Gemini", "Claude"];
  function append(text: string) {
    try {
      patch(appendCandidateToDraft(scene, text));
      tell("选中内容已追加到人工工作稿，可撤销；原稿和定稿未改变");
    } catch (e) {
      tell((e as Error).message);
    }
  }
  const slots = Array.from(
    { length: 3 },
    (_, i) =>
      scene.manualComparisons?.[i] || {
        model: names[i],
        text: "",
      },
  );
  function edit(i: number, update: { model?: string; text?: string }) {
    patch({
      ...scene,
      manualComparisons: slots.map((s, n) =>
        n === i ? { ...s, ...update } : s,
      ),
    });
  }
  function adopt(text: string, replace: boolean) {
    patch({
      ...scene,
      mergeCandidate: replace
        ? text
        : (scene.mergeCandidate || "") +
          (scene.mergeCandidate ? "\n\n" : "") +
          text,
    });
  }
  return (
    <section className="manual-compare">
      <div className="section-intro">
        <h3>ChatGPT / Gemini / Claude · 手动候选</h3>
        <span className="tag">未连接 API · 零调用费用</span>
      </div>
      <p className="help">
        在其他工具中使用同一份原稿和修改要求，将结果粘贴到下方。采用的内容只进入人工候选，确认前不会改动最终剧本。
      </p>
      <div className="revision-brief">
        <label>
          统一修改要求
          <textarea
            aria-label="统一修改要求"
            rows={4}
            maxLength={5000}
            value={instructions}
            onChange={(e) => onInstructionsChange(e.target.value)}
            placeholder="三种外部 AI 使用同一要求：对白风格、情感表达、节奏、必须保留的内容……"
          />
        </label>
        <div className="button-row">
          <label>
            外部修改来源
            <select
              aria-label="外部修改来源"
              value={source}
              onChange={(e) =>
                setSource(e.target.value as "original" | "draft")
              }
            >
              <option value="original">本场原始剧本</option>
              <option value="draft">本场人工工作稿</option>
            </select>
          </label>
          <button
            className="secondary"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(
                  externalRevisionPrompt(scene, instructions, source),
                );
                tell("统一修改要求与本场剧本已复制，请自行粘贴到外部 AI");
              } catch {
                tell("剪贴板不可用，请展开完整修改提示并手动复制");
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
        <p className="help">
          修改要求全剧本共用，候选逐场保存。旧候选内容与来源名称原样保留；本网站不发送任何
          AI API 请求。
        </p>
      </div>
      <div className="compare-grid">
        {slots.map((s, i) => (
          <article key={i}>
            <h4>{names[i]} 候选</h4>
            <label>
              结果 {i + 1} 的模型
              <input
                maxLength={100}
                value={s.model}
                onChange={(e) => edit(i, { model: e.target.value })}
              />
            </label>
            <label>
              AI 修改结果 {i + 1}
              <textarea
                aria-label={`AI 修改结果 ${i + 1}`}
                rows={10}
                maxLength={50000}
                value={s.text}
                placeholder="粘贴模型返回的真实结果……"
                onChange={(e) => {
                  selection.current = null;
                  edit(i, { text: e.target.value });
                }}
                onSelect={(e) => {
                  selection.current = {
                    index: i,
                    start: e.currentTarget.selectionStart,
                    end: e.currentTarget.selectionEnd,
                    text: s.text,
                  };
                }}
              />
            </label>
            <button
              className="secondary"
              disabled={!s.text.trim()}
              onClick={() => {
                const selected = selection.current;
                if (
                  !selected ||
                  selected.index !== i ||
                  selected.text !== s.text
                )
                  return tell("请先在此候选栏选中文字");
                append(s.text.slice(selected.start, selected.end));
              }}
            >
              将结果 {i + 1} 选中文字加入工作稿
            </button>
            <button
              className="secondary"
              disabled={!s.text.trim()}
              onClick={() => adopt(s.text, true)}
            >
              将结果 {i + 1} 作为合并候选
            </button>
            <button
              className="text-button"
              disabled={!s.text.trim()}
              onClick={() => {
                if (scene.versions.length >= 100)
                  return tell("版本已达100份，请导出备份后拆分项目");
                patch({
                  ...scene,
                  versions: [
                    ...scene.versions,
                    {
                      id: crypto.randomUUID(),
                      text: s.text,
                      model: s.model,
                      kind: "candidate",
                      at: new Date().toISOString(),
                    },
                  ],
                });
                tell(`结果 ${i + 1} 已保存到版本历史`);
              }}
            >
              保存结果 {i + 1} 版本
            </button>
            <details>
              <summary>逐段采用结果 {i + 1}</summary>
              {s.text
                .split(/\n\s*\n/)
                .filter((p) => p.trim())
                .map((p, n) => (
                  <div className="adopt-paragraph" key={n}>
                    <p>{p}</p>
                    <button className="text-button" onClick={() => append(p)}>
                      加入此段到人工工作稿
                    </button>
                    <button
                      className="text-button"
                      onClick={() => adopt(p, false)}
                    >
                      加入此段到候选
                    </button>
                  </div>
                ))}
            </details>
          </article>
        ))}
      </div>
    </section>
  );
}
