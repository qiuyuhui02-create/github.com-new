"use client";
import GeminiRevision from "./gemini-revision";
import type { ScriptScene } from "@/lib/screenplay";
export default function ManualScriptCompare({
  scene,
  patch,
  tell,
}: {
  tell: (s: string) => void;
  scene: ScriptScene;
  patch: (s: ScriptScene) => void;
}) {
  const slots = Array.from(
    { length: 3 },
    (_, i) =>
      scene.manualComparisons?.[i] || {
        model: ["Gemini（手动）", "OpenRouter（手动）", "其他模型（手动）"][i],
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
        <h3>三个 AI 修改结果 · 手动对比</h3>
        <span className="tag">手动始终可用 · 自动修改需个人访问码</span>
      </div>
      <p className="help">
        在其他工具中使用同一份原稿和修改要求，将结果粘贴到下方。采用的内容只进入人工候选，确认前不会改动最终剧本。
      </p>
      <GeminiRevision scene={scene} patch={patch} tell={tell} />
      <div className="compare-grid">
        {slots.map((s, i) => (
          <article key={i}>
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
                onChange={(e) => edit(i, { text: e.target.value })}
              />
            </label>
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
