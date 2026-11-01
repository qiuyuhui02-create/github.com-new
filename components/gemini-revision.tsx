"use client";
import { useEffect, useRef, useState } from "react";
import { Sparkles, LockKeyhole } from "lucide-react";
import type { ScriptScene } from "@/lib/screenplay";
import {
  GEMINI_MODEL,
  revisionDirections,
  type RevisionDirection,
  validProposal,
} from "@/lib/gemini/shared";
export default function GeminiRevision({
  scene,
  patch,
  tell,
}: {
  scene: ScriptScene;
  patch: (s: ScriptScene) => void;
  tell: (s: string) => void;
}) {
  const [available, setAvailable] = useState(false),
    [status, setStatus] = useState("正在检查 Gemini 配置…"),
    [access, setAccess] = useState(""),
    [direction, setDirection] = useState<RevisionDirection>(
      revisionDirections[0],
    ),
    [instructions, setInstructions] = useState(""),
    [source, setSource] = useState<"original" | "draft">("original"),
    [busy, setBusy] = useState(false),
    [stopped, setStopped] = useState(false),
    [retryAt, setRetryAt] = useState(0),
    [now, setNow] = useState(Date.now());
  const latest = useRef({ scene, patch }),
    mounted = useRef(true),
    abort = useRef<AbortController | null>(null),
    lock = useRef(false);
  latest.current = { scene, patch };
  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    void fetch("/api/script/gemini", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((s) => {
        if (mounted.current) {
          setAvailable(s.available === true);
          setStatus(s.message || "自动修改尚未启用，手动粘贴仍可用。");
        }
      })
      .catch(() => {
        if (mounted.current)
          setStatus("无法检查自动修改配置，手动粘贴仍可用。");
      });
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      mounted.current = false;
      controller.abort();
      abort.current?.abort();
      clearInterval(timer);
    };
  }, []);
  const text = source === "original" ? scene.original : scene.draft,
    proposal = scene.geminiProposal,
    remaining = Math.max(0, Math.ceil((retryAt - now) / 1000));
  async function generate() {
    if (lock.current || !available || stopped || remaining) return;
    if (!text.trim() || text.length > 6000)
      return setStatus(
        "请将当前场景控制在 6000 字以内，长场景可继续手动粘贴。",
      );
    if (access.length < 32 || access.length > 256)
      return setStatus(
        "请输入管理员配置的个人访问码（至少32字符），不是 Gemini API Key。",
      );
    if (
      !confirm(
        `仅发送当前场景（${text.length} 字）及修改要求至 Google Gemini。免费服务内容可能用于改进 Google 产品，请勿发送完整毕业剧本或敏感内容。结果不会自动覆盖工作稿或定稿。是否继续？`,
      )
    )
      return;
    lock.current = true;
    setBusy(true);
    setStatus("正在修改本场剧本；可以继续编辑，工作稿和定稿不会被覆盖。");
    const captured = { sceneId: scene.id, text, direction, instructions },
      controller = new AbortController();
    abort.current = controller;
    try {
      const r = await fetch("/api/script/gemini", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${access}`,
        },
        body: JSON.stringify({
          text: captured.text,
          direction: captured.direction,
          instructions: captured.instructions,
          requestId: crypto.randomUUID(),
        }),
        signal: controller.signal,
      });
      const result = await r.json();
      if (!mounted.current || latest.current.scene.id !== captured.sceneId)
        return;
      if (!r.ok) {
        if (
          [
            "provider_quota",
            "daily_limit",
            "unconfigured",
            "provider_unavailable",
          ].includes(result.code)
        )
          setStopped(true);
        if (result.code === "unauthorized") setAccess("");
        const retry = Number(r.headers.get("Retry-After"));
        if (Number.isFinite(retry) && retry > 0)
          setRetryAt(Date.now() + Math.min(retry, 86400) * 1000);
        return setStatus(result.error || "自动修改失败，手动栏仍可用。");
      }
      if (
        !validProposal(result.proposal) ||
        result.proposal.source !== captured.text ||
        result.proposal.direction !== captured.direction ||
        result.proposal.instructions !== captured.instructions
      )
        throw Error("结果格式或来源不匹配");
      latest.current.patch({
        ...latest.current.scene,
        geminiProposal: result.proposal,
      });
      setRetryAt(Date.now() + 60000);
      setStatus(
        "结果已独立保存，请核对剧本和修改理由，再人工采用。工作稿、原稿和定稿均未改动。",
      );
    } catch (e) {
      if (mounted.current)
        setStatus(
          (e as Error).name === "AbortError"
            ? "请求已取消；已发送的请求可能仍消耗免费次数，不会自动重试。"
            : "自动修改暂不可用，未重试；已有结果和手动对比均保留。",
        );
    } finally {
      if (mounted.current) setBusy(false);
      lock.current = false;
    }
  }
  return (
    <div className="gemini-revision">
      <div className="section-intro">
        <strong>
          <Sparkles size={15} /> Gemini 本场修改 · 对应结果1
        </strong>
        <span className="tag">
          <LockKeyhole size={12} />
          个人保护
        </span>
      </div>
      <p className="help">
        {GEMINI_MODEL} · 仅单场文字 · 不自动重试或回退 · 手动三栏始终可用
      </p>
      <p role="status" className="gemini-status">
        {status}
      </p>
      <div className="gemini-controls">
        <label>
          Gemini 修改来源
          <select
            value={source}
            disabled={busy}
            onChange={(e) => setSource(e.target.value as "original" | "draft")}
          >
            <option value="original">本场原始剧本</option>
            <option value="draft">本场当前工作稿</option>
          </select>
        </label>
        <label>
          Gemini 修改方向
          <select
            value={direction}
            disabled={busy}
            onChange={(e) => setDirection(e.target.value as RevisionDirection)}
          >
            {revisionDirections.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </label>
        <label>
          Gemini 修改要求
          <textarea
            aria-label="Gemini 修改要求"
            maxLength={1000}
            rows={3}
            value={instructions}
            disabled={busy}
            placeholder="例如：减少解释性台词，用停顿表现人物犹豫。"
            onChange={(e) => setInstructions(e.target.value)}
          />
        </label>
        <label>
          个人访问码
          <input
            type="password"
            aria-label="Gemini 个人访问码"
            autoComplete="off"
            maxLength={256}
            value={access}
            onChange={(e) => setAccess(e.target.value)}
            placeholder="不是 API Key；不会写入项目或备份"
            disabled={busy}
          />
        </label>
        <button
          className="primary"
          disabled={busy || !available || stopped || remaining > 0}
          onClick={() => void generate()}
        >
          <Sparkles size={14} />
          {busy
            ? "正在修改本场…"
            : remaining
              ? `等待 ${remaining} 秒`
              : "AI 修改本场剧本"}
        </button>
      </div>
      {busy && (
        <button className="text-button" onClick={() => abort.current?.abort()}>
          取消等待（不自动重试）
        </button>
      )}
      {proposal && (
        <details className="gemini-proposal" open>
          <summary>Gemini 修改结果与理由 · 待人工采用</summary>
          <small>
            {new Date(proposal.at).toLocaleString("zh-CN")} ·{" "}
            {proposal.direction}
          </small>
          <pre className="screenplay-text">{proposal.script}</pre>
          <strong>修改理由</strong>
          <ol>
            {proposal.reasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ol>
          {proposal.source !== text && (
            <p className="help">
              当前选择的来源文本已变化，此结果基于此前内容，请重新核对。
            </p>
          )}
          <button
            className="secondary"
            onClick={() => {
              if (
                !confirm(
                  "确认将此结果写入 Gemini 对比栏（结果1）？已有结果1会被替换；工作稿和正式定稿不会改变。",
                )
              )
                return;
              const current = latest.current.scene,
                slots = Array.from(
                  { length: 3 },
                  (_, i) =>
                    current.manualComparisons?.[i] || {
                      model: [
                        "Gemini（手动）",
                        "OpenRouter（手动）",
                        "其他模型（手动）",
                      ][i],
                      text: "",
                    },
                );
              latest.current.patch({
                ...current,
                manualComparisons: slots.map((s, i) =>
                  i === 0 ? { model: GEMINI_MODEL, text: proposal.script } : s,
                ),
              });
              tell("Gemini 结果已人工采用到对比栏；仍需合并候选和确认定稿。");
            }}
          >
            确认采用到 Gemini 对比栏
          </button>
        </details>
      )}
    </div>
  );
}
