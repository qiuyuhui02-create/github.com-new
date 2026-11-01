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
export async function readWorkspace(key: string): Promise<string | null> {
  const legacy = localStorage.getItem(key);
  try {
    const db = await openDB();
    const row = await new Promise<
      { raw: string; mirror: string | null } | undefined
    >((res, rej) => {
      const t = db.transaction("projects", "readonly"),
        r = t.objectStore("projects").get(key);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    db.close();
    return row && row.mirror === legacy ? row.raw : legacy;
  } catch {
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
