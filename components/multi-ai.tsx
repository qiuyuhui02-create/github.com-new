"use client";
import { useEffect, useRef, useState } from "react";
import type {
  ProviderInfo,
  ProviderId,
  ComparisonResult,
} from "@/lib/ai/types";
import type { ScriptScene, ScriptVersion } from "@/lib/screenplay";
export default function MultiAI({
  scene,
  onSave,
  onAdopt,
  tell,
}: {
  scene: ScriptScene;
  onSave: (v: ScriptVersion[]) => void;
  onAdopt: (
    text: string,
    target: "draft" | "candidate-replace" | "candidate-append",
  ) => void;
  tell: (s: string) => void;
}) {
  const [providers, setProviders] = useState<ProviderInfo[]>([]),
    [selected, setSelected] = useState<ProviderId[]>([]),
    [instructions, setInstructions] = useState(
      "保持原语言和情节，优化人物对白、动作描述与节奏。",
    ),
    [busy, setBusy] = useState(false),
    [errors, setErrors] = useState<ComparisonResult[]>([]),
    [loadError, setLoadError] = useState("");
  const controller = useRef<AbortController | null>(null);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    const ac = new AbortController();
    fetch("/api/script/compare", { signal: ac.signal, cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw Error();
        return r.json();
      })
      .then((json) => {
        if (live.current) setProviders(json.providers);
      })
      .catch(() => {
        if (!ac.signal.aborted)
          setLoadError("模型状态读取失败，请稍后重新打开此面板。");
      });
    return () => {
      live.current = false;
      ac.abort();
      controller.current?.abort();
    };
  }, []);
  async function compare() {
    if (!selected.length) return tell("请选择已连接并获准使用的模型");
    if ((scene.variants?.length || 0) + selected.length > 30)
      return tell("模型版本达到 30 个上限，请导出并拆分项目");
    if (
      !confirm(
        "将当前场景修改稿和同一份修改要求发送给所选服务商。免费余额/试用资格由服务商账户决定，程序不能核验。仅在你确认免费/试用配置后继续；无付费回退或自动充值。",
      )
    )
      return;
    const ac = new AbortController();
    controller.current = ac;
    setBusy(true);
    setErrors([]);
    const sourceRevision = scene.draftRevision;
    try {
      const response = await fetch("/api/script/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: scene.draft,
          instructions,
          providers: selected,
        }),
        signal: ac.signal,
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error);
      if (!live.current) return;
      const results = result.results as ComparisonResult[];
      setErrors(results.filter((r) => r.error));
      const requestId = crypto.randomUUID();
      const versions: ScriptVersion[] = results
        .filter((r) => r.text)
        .map((r) => ({
          id: crypto.randomUUID(),
          text: r.text!,
          model: `${r.provider} / ${r.model}`,
          at: new Date().toISOString(),
          inputHash: result.inputHash,
          sourceRevision,
          requestId,
        }));
      if (versions.length) {
        onSave(versions);
        tell(
          `已保存 ${versions.length} 个真实模型版本；本日剩余 ${result.remaining} 次对比。正式定稿未改变。`,
        );
      }
    } catch (e) {
      if (live.current && !ac.signal.aborted) tell((e as Error).message);
    } finally {
      if (live.current) setBusy(false);
    }
  }
  const groups = new Map<string, ScriptVersion[]>();
  for (const v of scene.variants || []) {
    const key = v.requestId || v.id;
    groups.set(key, [...(groups.get(key) || []), v]);
  }
  return (
    <section className="multi-ai">
      <p className="help">
        多个模型接收完全相同的场景修改稿与要求。输出是修改建议，不能自动修改正式定稿。未连接时不生成任何模拟回复。
      </p>
      {loadError && <p className="shot-warning">{loadError}</p>}
      <div className="provider-grid">
        {providers.map((p) => (
          <label className="provider-card" key={p.id}>
            <input
              type="checkbox"
              disabled={!p.ready || busy}
              checked={selected.includes(p.id)}
              onChange={(e) =>
                setSelected((v) =>
                  e.target.checked
                    ? [...v, p.id]
                    : v.filter((id) => id !== p.id),
                )
              }
            />
            <div>
              <strong>{p.name}</strong>
              <small>{p.model || "未设置模型"}</small>
              <span>
                {p.status} · {p.tier}
              </span>
            </div>
          </label>
        ))}
      </div>
      <p className="help">
        Gemini 免费层 / 豆包试用由管理员确认资格；OpenRouter 仅允许
        :free。程序不检查剩余免费余额，不提供付费模型开关。每日最多 5
        次对比（上海时间）。
      </p>
      <label className="script-label">
        统一修改要求
        <textarea
          aria-label="统一修改要求"
          maxLength={2000}
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          rows={3}
        />
      </label>
      <button
        className="primary"
        disabled={busy || !selected.length}
        onClick={compare}
      >
        {busy ? "正在请求真实模型…" : "发送同稿进行多模型对比"}
      </button>
      {errors.map((r, i) => (
        <p key={i} className="shot-warning">
          {r.provider}：{r.error}
        </p>
      ))}
      {[...groups.entries()].reverse().map(([id, versions]) => (
        <section className="comparison-group" key={id}>
          <div className="section-intro">
            <h4>同稿对比 · r{versions[0].sourceRevision}</h4>
            <span>{new Date(versions[0].at).toLocaleString("zh-CN")}</span>
          </div>
          <p className="help">
            相同输入 SHA-256：{versions[0].inputHash}
            {versions[0].sourceRevision !== scene.draftRevision
              ? " · 注意：当前工作稿已变化"
              : ""}
          </p>
          <div className="comparison-grid">
            {versions.map((v) => (
              <article className="panel" key={v.id}>
                <h4>{v.model}</h4>
                <pre className="screenplay-text">{v.text}</pre>
                <div className="button-row">
                  <button
                    className="secondary"
                    onClick={() => {
                      if (
                        confirm(
                          "将此模型版本载入工作稿？现稿将进入历史，正式定稿不变。",
                        )
                      )
                        onAdopt(v.text, "draft");
                    }}
                  >
                    整版载入工作稿
                  </button>
                  <button
                    className="secondary"
                    onClick={() => {
                      if (confirm("用此模型版本替换人工候选？正式定稿不变。"))
                        onAdopt(v.text, "candidate-replace");
                    }}
                  >
                    加入人工候选
                  </button>
                </div>
                <details>
                  <summary>局部采用（按换行拆分）</summary>
                  {v.text
                    .split("\n")
                    .filter(Boolean)
                    .map((line, i) => (
                      <div className="ai-fragment" key={i}>
                        <span>{line}</span>
                        <button
                          className="text-button"
                          onClick={() => onAdopt(line, "candidate-append")}
                        >
                          采用此段到候选
                        </button>
                      </div>
                    ))}
                </details>
              </article>
            ))}
          </div>
        </section>
      ))}
      {!scene.variants?.length && (
        <p className="empty">
          尚无模型修改版本。未配置 API Key 时，这里保持为空。
        </p>
      )}
    </section>
  );
}
