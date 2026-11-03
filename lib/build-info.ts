// Explicitly public diagnostics only: never expose the server environment wholesale.
export const BACKUP_IMPORT_FLOW = "preview-required-v2";
export const buildInfo = {
  commit: process.env.NEXT_PUBLIC_BUILD_COMMIT || "unknown",
  branch: process.env.NEXT_PUBLIC_BUILD_BRANCH || "unknown",
  backupImportFlow: BACKUP_IMPORT_FLOW,
};
export async function verifyBackupBuild(
  fetcher: typeof fetch = fetch,
): Promise<{ warning: string }> {
  const abort = new AbortController(),
    timeout = setTimeout(() => abort.abort(), 3000);
  let response: Response;
  try {
    response = await fetcher("/api/build-info", {
      cache: "no-store",
      credentials: "same-origin",
      signal: abort.signal,
    });
  } catch {
    return {
      warning:
        "当前离线或版本核验暂不可用。本页仍使用预览后确认流程；请核对下方页面版本，确认前不会写入。",
    };
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok)
    throw Error(
      "无法核对网站版本，已停止恢复。请打开 PR #11 最新 Preview 链接重试，不要清除站点数据。",
    );
  let remote: unknown;
  try {
    remote = await response.json();
  } catch {
    throw Error(
      "网站版本信息无效，已停止恢复，请重新打开最新 Preview；不要清除站点数据。",
    );
  }
  const value = remote as typeof buildInfo;
  if (
    !value ||
    value.backupImportFlow !== BACKUP_IMPORT_FLOW ||
    (buildInfo.commit !== "unknown" && value.commit !== buildInfo.commit) ||
    (buildInfo.branch !== "unknown" && value.branch !== buildInfo.branch)
  )
    throw Error(
      "页面与服务器版本不一致，已停止恢复。请保留本地数据，重新打开 PR #11 的最新 Preview 链接；不要清除站点数据。",
    );
  return { warning: "" };
}
