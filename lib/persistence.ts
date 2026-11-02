// IndexedDB mirrors full local projects, including small previews. Never deletes legacy caches.
const database = "framework-studio-local";
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(database, 1);
    r.onupgradeneeded = () => r.result.createObjectStore("projects");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
type StoredProject = { raw: string; mirror: string | null; restoreId?: string };
async function readStoredProject(
  key: string,
): Promise<StoredProject | undefined> {
  const db = await openDB();
  try {
    return await new Promise<StoredProject | undefined>((resolve, reject) => {
      const tx = db.transaction("projects", "readonly"),
        r = tx.objectStore("projects").get(key);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  } finally {
    db.close();
  }
}
export async function readWorkspace(key: string): Promise<string | null> {
  const legacy = localStorage.getItem(key);
  try {
    let row = await readStoredProject(key);
    if (localStorage.getItem(key + ":restore-journal")) {
      const reconcile = async () => {
        // A different tab may still be restoring. Wait for its timer lock, then re-read.
        row = await readStoredProject(key);
        const journalRaw = localStorage.getItem(key + ":restore-journal");
        if (!journalRaw) return;
        const j = JSON.parse(journalRaw);
        if (
          typeof j.id !== "string" ||
          (j.before !== null && typeof j.before !== "string") ||
          typeof j.after !== "string" ||
          !validLedger(JSON.parse(j.after)) ||
          (j.before !== null && !validLedger(JSON.parse(j.before)))
        )
          throw Error("恢复日志无效");
        const timer = row?.restoreId === j.id ? j.after : j.before;
        if (timer === null) localStorage.removeItem(key + ":timer");
        else localStorage.setItem(key + ":timer", timer);
        localStorage.removeItem(key + ":restore-journal");
      };
      if (navigator.locks)
        await navigator.locks.request(key + ":timer", reconcile);
      else await reconcile();
    }
    const current = localStorage.getItem(key);
    return row && row.mirror === current ? row.raw : current;
  } catch {
    if (localStorage.getItem(key + ":restore-journal"))
      throw Error(
        "检测到尚未完成的本地恢复，请保留页面和备份，不要清理浏览器数据",
      );
    return legacy;
  }
}
let queue = Promise.resolve();
export function writeWorkspace(
  key: string,
  raw: string,
  expectedMirror?: string | null,
): Promise<void> {
  if (expectedMirror !== undefined) {
    try {
      const current = localStorage.getItem(key);
      if (current !== expectedMirror && current !== raw)
        return Promise.reject(
          Error(
            "另一个标签页已更新此项目，已停止本页保存以防覆盖。请先导出本页备份，再刷新或恢复。",
          ),
        );
    } catch {
      return Promise.reject(Error("无法访问本地缓存，请导出备份"));
    }
  }
  let mirrored = false,
    mirror: string | null = null;
  try {
    localStorage.setItem(key, raw);
    mirrored = true;
  } catch {
    /* IndexedDB remains available for larger projects. */
  }
  try {
    mirror = localStorage.getItem(key);
  } catch {
    /* private mode */
  }
  const operation = queue
    .catch(() => {})
    .then(async () => {
      try {
        const db = await openDB();
        await new Promise<void>((res, rej) => {
          const t = db.transaction("projects", "readwrite");
          t.objectStore("projects").put({ raw, mirror }, key);
          t.oncomplete = () => res();
          t.onerror = () => rej(t.error);
          t.onabort = () => rej(t.error);
        });
        db.close();
      } catch {
        if (!mirrored)
          throw Error("本地保存失败，请立即导出 JSON 备份并释放浏览器空间");
      }
    });
  queue = operation;
  return operation;
}
export function readTimer(
  key: string,
  fallback: import("./workflow").TimerLedger,
): import("./workflow").TimerLedger {
  const raw = localStorage.getItem(key + ":timer");
  if (!raw) return fallback;
  const result = JSON.parse(raw);
  if (!validLedger(result)) throw Error("计时数据无法读取，请先导出备份");
  return result;
}
import { validLedger } from "./workflow";
export async function changeTimer(
  key: string,
  fallback: import("./workflow").TimerLedger,
  change: (
    l: import("./workflow").TimerLedger,
  ) => import("./workflow").TimerLedger,
) {
  if (!navigator.locks)
    throw Error(
      "此浏览器不支持安全的多标签页计时，请使用新版 Safari / Chrome / Edge，或手动补录",
    );
  return navigator.locks.request(key + ":timer", () => {
    const next = change(readTimer(key, fallback));
    if (!validLedger(next)) throw Error("计时数据无效");
    localStorage.setItem(key + ":timer", JSON.stringify(next));
    window.dispatchEvent(new Event("framework-timer"));
    return next;
  });
}
export async function restoreTimer(
  key: string,
  ledger: import("./workflow").TimerLedger,
) {
  if (!validLedger(ledger)) throw Error("备份中的计时数据无效");
  const write = () => {
    localStorage.setItem(key + ":timer", JSON.stringify(ledger));
    window.dispatchEvent(new Event("framework-timer"));
  };
  if (navigator.locks) await navigator.locks.request(key + ":timer", write);
  else write();
}

/** Local-only restore: the project and recovery copy commit in one IDB transaction.
 * Mirror/timer writes are rolled back if any stage fails. Never deletes old records. */
export function replaceWorkspace(options: {
  key: string;
  raw: string;
  recoveryRaw: string;
  timer: import("./workflow").TimerLedger;
  expectedMirror: string | null;
  guard: () => boolean;
}): Promise<void> {
  const operation = queue
    .catch(() => {})
    .then(async () => {
      const run = async () => {
        if (!validLedger(options.timer))
          throw Error("备份计时数据无效，原项目未修改");
        const db = await openDB().catch(() => {
            throw Error(
              "无法打开 IndexedDB，原项目未修改，请检查浏览器存储权限后重试",
            );
          }),
          timerKey = options.key + ":timer",
          journalKey = options.key + ":restore-journal";
        const beforeTimer = localStorage.getItem(timerKey),
          afterTimer = JSON.stringify(options.timer),
          restoreId = crypto.randomUUID();
        let staged = false;
        try {
          if (!options.guard()) throw Error("工作空间已变化，请重新选择备份");
          const mirror = localStorage.getItem(options.key),
            recoveryMirror = localStorage.getItem(options.key + ":recovery");
          if (mirror !== options.expectedMirror)
            throw Error(
              "另一个标签页已更新项目，已停止恢复，请先导出当前内容并刷新",
            );
          // Journal only the synchronous timer. Project/recovery remain untouched until IDB commit.
          localStorage.setItem(
            journalKey,
            JSON.stringify({
              id: restoreId,
              before: beforeTimer,
              after: afterTimer,
            }),
          );
          staged = true;
          localStorage.setItem(timerKey, afterTimer);
          await new Promise<void>((resolve, reject) => {
            const t = db.transaction("projects", "readwrite"),
              store = t.objectStore("projects");
            t.oncomplete = () => resolve();
            t.onabort = () => reject(Error("本地事务已取消"));
            t.onerror = () => reject(t.error || Error("IndexedDB 写入失败"));
            try {
              store.put(
                { raw: options.recoveryRaw, mirror: recoveryMirror },
                options.key + ":recovery",
              );
              const request = store.put(
                { raw: options.raw, mirror, restoreId },
                options.key,
              );
              request.onsuccess = () => {
                if (
                  !options.guard() ||
                  localStorage.getItem(options.key) !== mirror
                )
                  t.abort();
              };
            } catch (e) {
              t.abort();
              reject(e);
            }
          });
        } catch (e) {
          try {
            if (staged) {
              if (localStorage.getItem(timerKey) !== beforeTimer) {
                localStorage.removeItem(timerKey);
                if (beforeTimer !== null)
                  localStorage.setItem(timerKey, beforeTimer);
              }
              localStorage.removeItem(journalKey);
            }
          } catch {
            throw Error(
              "恢复未完成，恢复日志已保留。请勿清理数据，先导出当前项目，再重新打开页面检查。",
            );
          }
          throw Error(
            `恢复失败，原项目未修改：${e instanceof Error ? e.message : "本地存储不可用"}`,
          );
        } finally {
          db.close();
        }
        // A crash here is reconciled by readWorkspace using the committed restoreId.
        try {
          localStorage.removeItem(journalKey);
        } catch {
          /* Keep the journal for next open. */
        }
        window.dispatchEvent(new Event("framework-timer"));
      };
      if (navigator.locks)
        await navigator.locks.request(options.key + ":timer", run);
      else await run();
    });
  queue = operation;
  return operation;
}
