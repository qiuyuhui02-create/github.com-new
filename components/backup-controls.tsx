"use client";
import { useEffect, useRef, useState } from "react";
import { readWorkspace, writeWorkspace } from "@/lib/persistence";
import {
  backupDue,
  validReceipt,
  type BackupReceipt,
  backupSummary,
} from "@/lib/backups";
import { timestamp } from "@/lib/snapshots";
import type { Studio } from "@/lib/model";
import { buildInfo } from "@/lib/build-info";
import { ScriptDialog } from "./screenplay/chapter-directory";
export function useBackupReceipt(workspace: string, enabled: boolean) {
  const [receipt, setReceipt] = useState<BackupReceipt | null>(null),
    [problem, setProblem] = useState(""),
    [now, setNow] = useState(Date.now());
  const epoch = useRef(0),
    receiptRef = useRef<BackupReceipt | null>(null);
  useEffect(() => {
    const n = ++epoch.current;
    setReceipt(null);
    receiptRef.current = null;
    setProblem("");
    if (!enabled) return;
    void (async () => {
      try {
        const raw = await readWorkspace(workspace + ":backup-receipt"),
          parsed = raw ? JSON.parse(raw) : null;
        const next = validReceipt(parsed)
          ? parsed
          : { firstSeenAt: new Date().toISOString() };
        if (epoch.current !== n) return;
        receiptRef.current = next;
        setReceipt(next);
        if (!raw)
          await writeWorkspace(
            workspace + ":backup-receipt",
            JSON.stringify(next),
          );
      } catch {
        if (epoch.current === n)
          setProblem("备份时间记录无法读取；请自行保管已下载文件。");
      }
    })();
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => {
      epoch.current++;
      clearInterval(timer);
    };
  }, [workspace, enabled]);
  async function record(change: Partial<BackupReceipt>) {
    const n = epoch.current,
      next = {
        ...(receiptRef.current || { firstSeenAt: new Date().toISOString() }),
        ...change,
      };
    receiptRef.current = next;
    setReceipt(next);
    try {
      await writeWorkspace(workspace + ":backup-receipt", JSON.stringify(next));
      if (n === epoch.current) setProblem("");
    } catch {
      if (n === epoch.current)
        setProblem("备份时间未能持久保存，请保管下载文件；项目数据不受影响。");
    }
  }
  return {
    receipt,
    problem,
    due: !!receipt && backupDue(receipt, now),
    generated: (at: string) => record({ generatedAt: at }),
    confirm: () =>
      receiptRef.current?.generatedAt
        ? record({ confirmedAt: receiptRef.current.generatedAt })
        : Promise.resolve(),
  };
}
export function BackupStatus({
  state,
  onExport,
  onRestore,
}: {
  state: ReturnType<typeof useBackupReceipt>;
  onExport: () => void;
  onRestore: () => void;
}) {
  const pending =
    state.receipt?.generatedAt &&
    state.receipt.generatedAt !== state.receipt.confirmedAt;
  return (
    <aside className="backup-status" aria-label="本地备份状态">
      <div>
        <span>
          此设备最近成功导出（已确认保存）：
          {state.receipt?.confirmedAt
            ? timestamp(state.receipt.confirmedAt)
            : "尚未确认"}
        </span>
        <small>
          仅本机下载记录，不代表云端自动备份。JSON
          含已保存缩略图，不包含外部原始高清图片和视频文件。
        </small>
      </div>
      <button className="secondary" onClick={onExport}>
        一键备份
      </button>
      <button className="secondary" onClick={onRestore}>
        恢复备份
      </button>
      <details className="backup-build-info">
        <summary>恢复流程与页面版本</summary>
        <span>恢复流程：v2 · 必须先预览再确认</span>
        <span data-testid="backup-build-commit">
          页面提交：{buildInfo.commit}
        </span>
        <span>分支：{buildInfo.branch}</span>
        <p>
          若仍出现原生“导入将替换…”确认框，则不是本页的新版恢复入口。请核对 PR
          #11 的 Preview 链接，不要清除站点数据。
        </p>
      </details>
      {pending && (
        <div className="backup-pending">
          <span>
            已生成下载：{timestamp(state.receipt?.generatedAt)}
            。浏览器无法核实文件是否已保存。
          </span>
          <button className="text-button" onClick={() => void state.confirm()}>
            文件已保存
          </button>
        </div>
      )}
      {state.due && (
        <p className="backup-reminder" role="status">
          有一段时间未确认备份了，方便时导出一份到安全的位置吧。
        </p>
      )}
      {state.problem && <small role="status">{state.problem}</small>}
    </aside>
  );
}
export default function BackupImportDialog({
  data,
  current,
  fileName,
  busy,
  error,
  warning,
  onCancel,
  onConfirm,
}: {
  data: Studio;
  current: Studio;
  fileName: string;
  busy: boolean;
  error: string;
  warning?: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const s = backupSummary(data),
    before = backupSummary(current);
  return (
    <ScriptDialog
      title="导入备份预览"
      onClose={() => {
        if (!busy) onCancel();
      }}
    >
      <div className="backup-import-summary">
        <p>
          {fileName} · {s.name}
        </p>
        <dl>
          <div>
            <dt>项目数量</dt>
            <dd>{s.projects}（单项目格式）</dd>
          </div>
          <div>
            <dt>章节数量</dt>
            <dd>{s.chapters}</dd>
          </div>
          <div>
            <dt>场景数量</dt>
            <dd>{s.scenes}</dd>
          </div>
          <div>
            <dt>分镜数量</dt>
            <dd>{s.shots}</dd>
          </div>
          <div>
            <dt>资产 / 缩略图</dt>
            <dd>
              {s.assets} / {s.previews}
            </dd>
          </div>
          <div>
            <dt>Prompt / 视频任务 / 日程任务</dt>
            <dd>
              {s.prompts} / {s.videoJobs} / {s.tasks}
            </dd>
          </div>
          <div>
            <dt>回收章节 / 回收场景</dt>
            <dd>
              {s.archivedChapters} / {s.archivedScenes}
            </dd>
          </div>
          <div>
            <dt>备份导出时间</dt>
            <dd>{timestamp(s.exportedAt)}</dd>
          </div>
          <div>
            <dt>项目最后更新</dt>
            <dd>{timestamp(s.updatedAt)}</dd>
          </div>
        </dl>
        <p className="backup-replace-warning">
          <strong>此操作将覆盖当前设备的一个本地项目，不是新增或合并。</strong>
          当前“{before.name}”的 {before.chapters} 个章节、{before.scenes}{" "}
          个场景、{before.shots}{" "}
          个分镜及资产、提示词、任务、工时、心情、历史和缩略图将整体替换为备份内容。已登录时也仅替换本机账号缓存，不会同步
          Supabase、其他设备或原始素材文件。确认后会保留一份导入前恢复副本。
        </p>
        <p>
          JSON
          不包含外部原始高清图片和视频；请单独备份素材硬盘。旧项目若已有内嵌图片，将原样保留。
        </p>
        {s.missingPreviews > 0 && (
          <p>
            有 {s.missingPreviews}{" "}
            个素材引用没有可用缩略图，恢复后将显示占位图或“素材未连接”，不会假装原件已恢复。
          </p>
        )}
        {warning && <p role="status">{warning}</p>}
        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}
        <div className="button-row">
          <button
            className="danger secondary"
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? "正在安全恢复…" : "确认覆盖当前本地项目"}
          </button>
          <button className="secondary" disabled={busy} onClick={onCancel}>
            取消导入
          </button>
        </div>
      </div>
    </ScriptDialog>
  );
}
