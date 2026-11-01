export const categories = [
  "剧本创作",
  "图片与资产",
  "分镜规划",
  "视频制作",
  "剪辑与超分",
  "学习",
  "其他",
];
export const moods = [
  "🥰 很开心",
  "😊 状态不错",
  "😐 一般",
  "😴 有点累",
  "😔 低落",
];
export type Journal = { date: string; mood: string; text: string };
export type TimeEntry = {
  id: string;
  title: string;
  date: string;
  category: string;
  notes: string;
  durationMs: number;
};
export type ActiveTimer = Omit<TimeEntry, "durationMs"> & {
  elapsedMs: number;
  runningSince: number | null;
};
export type TimerLedger = { active?: ActiveTimer; entries: TimeEntry[] };
export type VideoVersion = {
  id: string;
  model: string;
  prompt: string;
  status: string;
  filename: string;
  relativePath: string;
  notes: string;
  at: string;
};
export type VideoJob = {
  id: string;
  shotId: string;
  prompt: string;
  assets: string[];
  firstFrame: string;
  lastFrame: string;
  references: string;
  duration: number;
  ratio: string;
  movement: string;
  model: string;
  status: string;
  notes: string;
  versions: VideoVersion[];
};
export const localDate = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export function elapsed(timer: ActiveTimer, now = Date.now()) {
  return (
    timer.elapsedMs +
    (timer.runningSince === null ? 0 : Math.max(0, now - timer.runningSince))
  );
}
export function timerAction(
  ledger: TimerLedger,
  action: "start" | "pause" | "resume" | "finish",
  entry?: Omit<TimeEntry, "durationMs">,
  now = Date.now(),
): TimerLedger {
  const next = structuredClone(ledger),
    t = next.active;
  if (action === "start") {
    if (t) throw Error("已有未结束计时，请先结束或继续该记录");
    if (!entry?.title.trim()) throw Error("请输入计时任务名称");
    next.active = { ...entry, elapsedMs: 0, runningSince: now };
  } else {
    if (!t) throw Error("没有正在进行的计时");
    if (action === "pause") {
      t.elapsedMs = elapsed(t, now);
      t.runningSince = null;
    }
    if (action === "resume" && t.runningSince === null) t.runningSince = now;
    if (action === "finish") {
      const { elapsedMs: _a, runningSince: _b, ...info } = t;
      next.entries.push({ ...info, durationMs: elapsed(t, now) });
      delete next.active;
    }
  }
  return next;
}
export function timeText(ms: number) {
  const sec = Math.floor(ms / 1000);
  return `${String(Math.floor(sec / 3600)).padStart(2, "0")}:${String(Math.floor(sec / 60) % 60).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
}
export function dateValid(s: unknown): s is string {
  return (
    typeof s === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    Number.isFinite(Date.parse(s)) &&
    new Date(s).toISOString().slice(0, 10) === s
  );
}
export function validLedger(x: unknown): x is TimerLedger {
  if (!x || typeof x !== "object") return false;
  const l = x as TimerLedger;
  const info = (e: TimeEntry | ActiveTimer) =>
    e &&
    [e.id, e.title, e.category, e.notes].every((s) => typeof s === "string") &&
    dateValid(e.date);
  return (
    Array.isArray(l.entries) &&
    l.entries.length <= 10000 &&
    new Set(l.entries.map((e) => e.id)).size === l.entries.length &&
    l.entries.every(
      (e) =>
        info(e) &&
        Number.isFinite(e.durationMs) &&
        e.durationMs >= 0 &&
        e.durationMs <= 31536000000,
    ) &&
    (!l.active ||
      (info(l.active) &&
        Number.isFinite(l.active.elapsedMs) &&
        l.active.elapsedMs >= 0 &&
        (l.active.runningSince === null ||
          (Number.isFinite(l.active.runningSince) &&
            l.active.runningSince > 0))))
  );
}
export function validateWorkflow(x: Record<string, unknown>) {
  if (x.deadline !== undefined && !(x.deadline === "" || dateValid(x.deadline)))
    return false;
  if (x.projectName !== undefined && typeof x.projectName !== "string")
    return false;
  if (x.timer !== undefined && !validLedger(x.timer)) return false;
  if (
    x.journals !== undefined &&
    (!Array.isArray(x.journals) ||
      x.journals.length > 10000 ||
      new Set(x.journals.map((j) => j?.date)).size !== x.journals.length ||
      !x.journals.every(
        (j) =>
          j &&
          dateValid(j.date) &&
          moods.includes(j.mood) &&
          typeof j.text === "string",
      ))
  )
    return false;
  if (
    x.previews !== undefined &&
    (!x.previews ||
      typeof x.previews !== "object" ||
      Array.isArray(x.previews) ||
      !Object.values(x.previews).every(
        (v) =>
          typeof v === "string" &&
          v.length <= 350000 &&
          /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v),
      ))
  )
    return false;
  if (
    x.videoJobs !== undefined &&
    (!Array.isArray(x.videoJobs) ||
      x.videoJobs.length > 5000 ||
      new Set(x.videoJobs.map((j) => j?.id)).size !== x.videoJobs.length ||
      !x.videoJobs.every(
        (j) =>
          j &&
          [
            "id",
            "shotId",
            "prompt",
            "firstFrame",
            "lastFrame",
            "references",
            "ratio",
            "movement",
            "model",
            "status",
            "notes",
          ].every((k) => typeof j[k] === "string") &&
          Array.isArray(j.assets) &&
          j.assets.every((a: unknown) => typeof a === "string") &&
          Number.isFinite(j.duration) &&
          j.duration > 0 &&
          j.duration <= 600 &&
          Array.isArray(j.versions) &&
          j.versions.length <= 100 &&
          j.versions.every(
            (v: VideoVersion) =>
              v &&
              [
                v.id,
                v.model,
                v.prompt,
                v.status,
                v.filename,
                v.relativePath,
                v.notes,
                v.at,
              ].every((s) => typeof s === "string") &&
              (!v.relativePath || safeVideoPath(v.relativePath)),
          ),
      ))
  )
    return false;
  return true;
}
export function safeVideoPath(path: string) {
  return (
    !!path &&
    !/^(\/|\\|[A-Za-z]:|~|file:)/i.test(path) &&
    !/[\\\x00-\x1f:]/.test(path) &&
    path.split("/").every((p) => p && p !== "." && p !== "..")
  );
}
