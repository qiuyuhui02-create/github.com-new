import { uid, type Studio, type Shot } from "./model";
import { safeVideoPath, type VideoJob, type VideoVersion } from "./workflow";
export function nextShotNumber(shots: Shot[]) {
  const used = new Set(shots.map((s) => s.number));
  let n = 1;
  while (used.has(`SH-${String(n).padStart(3, "0")}`)) n++;
  return `SH-${String(n).padStart(3, "0")}`;
}
export function manualSceneShot(data: Studio, sceneId: string): Shot {
  const scene = data.script?.scenes.find((s) => s.id === sceneId);
  if (!scene?.final || scene.status !== "已定稿")
    throw Error("请先人工确认本场定稿，再创建镜头");
  return {
    id: uid(),
    number: nextShotNumber(data.shots),
    title: scene.heading,
    size: "中景",
    composition: "",
    camera: "平视",
    movement: "待确认",
    duration: 4,
    description: scene.final.text,
    sound: "",
    dialogue: "",
    status: "待制作",
    assets: scene.assetIds.filter((id) => data.assets.some((a) => a.id === id)),
    sourceSceneId: scene.id,
    sourceFinalRevision: scene.final.revision,
  };
}
export function moveShot(shots: Shot[], id: string, delta: -1 | 1) {
  const i = shots.findIndex((s) => s.id === id),
    j = i + delta;
  if (i < 0 || j < 0 || j >= shots.length) return shots;
  const next = [...shots];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}
export function newVideoJob(data: Studio, shotId: string): VideoJob {
  const shot = data.shots.find((s) => s.id === shotId);
  if (!shot) throw Error("请先选择存在的分镜");
  return {
    id: uid(),
    shotId,
    prompt: shot.description || shot.title,
    assets: [...shot.assets],
    firstFrame: "",
    lastFrame: "",
    storyboardReference: "",
    characterReferences: "",
    references: "",
    duration: shot.duration,
    ratio: "16:9",
    movement: shot.movement,
    model: "",
    status: "待生成",
    notes: "",
    versions: [],
  };
}
export function recordVideoVersion(
  job: VideoJob,
  filename: string,
  relativePath: string,
): VideoVersion {
  if (relativePath && !safeVideoPath(relativePath))
    throw Error("只登记真实相对路径，不接受盘符、绝对路径或上级目录");
  if (!job.prompt.trim()) throw Error("请先填写视频 Prompt");
  if (job.versions.length >= 100)
    throw Error("版本达到100份，请先导出备份并拆分任务");
  return {
    id: uid(),
    model: job.model,
    prompt: job.prompt,
    status: job.status,
    filename,
    relativePath,
    notes: job.notes,
    at: new Date().toISOString(),
    firstFrame: job.firstFrame,
    lastFrame: job.lastFrame,
    storyboardReference: job.storyboardReference || "",
    characterReferences: job.characterReferences || "",
    references: job.references,
    assets: [...job.assets],
    duration: job.duration,
    ratio: job.ratio,
    movement: job.movement,
  };
}
