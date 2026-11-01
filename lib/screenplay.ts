import type { Studio, Shot } from "./model";
export type ScriptLanguage = "中文" | "日本語";
export type ScriptVersion = {
  id: string;
  text: string;
  model: string;
  inputHash?: string;
  sourceRevision?: number;
  requestId?: string;
  at: string;
};
export type FinalScene = { text: string; revision: number; at: string };
export type ScriptScene = {
  id: string;
  heading: string;
  original: string;
  draft: string;
  draftRevision: number;
  mergeCandidate?: string;
  status: "待修改" | "待确认" | "已定稿";
  assetIds: string[];
  versions: ScriptVersion[];
  variants?: ScriptVersion[];
  final?: FinalScene;
  finalHistory: FinalScene[];
  undoTargetRevision?: number;
};
export type Screenplay = {
  original: { text: string; language: ScriptLanguage; at: string };
  scenes: ScriptScene[];
};
export function splitScenes(text: string): { heading: string; text: string }[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n"),
    out: { heading: string; text: string }[] = [];
  let current: { heading: string; text: string } | null = null;
  for (const line of lines) {
    const heading =
      /^\s*(?:INT\.?\b|EXT\.?\b|INT\.?\/EXT\.?|内景|外景|內景|第[一二三四五六七八九十百\d]+[场場]|[○〇◯●]|シーン\s*\d)/i.test(
        line,
      );
    if (heading) {
      if (current) out.push(current);
      current = { heading: line.trim(), text: line };
    } else if (current) current.text += "\n" + line;
    else if (line.trim())
      current = { heading: "序章 / プロローグ", text: line };
  }
  if (current) out.push(current);
  return out;
}
export function importScreenplay(
  text: string,
  language: ScriptLanguage,
): Screenplay {
  if (!text.trim() || text.length > 200000)
    throw Error("请输入 20 万字以内的剧本");
  const at = new Date().toISOString();
  const scenes = splitScenes(text);
  if (scenes.some((s) => s.text.length > 50000))
    throw Error("单场超过 5 万字，请用场景标题拆分");
  if (scenes.length > 500) throw Error("场景数超过 500，请拆分剧本");
  return {
    original: { text, language, at },
    scenes: scenes.map((s) => ({
      id: crypto.randomUUID(),
      heading: s.heading,
      original: s.text,
      draft: s.text,
      draftRevision: 1,
      status: "待修改",
      assetIds: [],
      versions: [
        { id: crypto.randomUUID(), text: s.text, model: "原始剧本", at },
      ],
      finalHistory: [],
    })),
  };
}
export function editDraft(
  scene: ScriptScene,
  text: string,
  checkpoint = false,
  model = "人工修改",
): ScriptScene {
  if (text.length > 50000) throw Error("单场剧本超过 5 万字");
  const versions =
    checkpoint && scene.versions.at(-1)?.text !== scene.draft
      ? [
          ...scene.versions,
          {
            id: crypto.randomUUID(),
            text: scene.draft,
            model,
            at: new Date().toISOString(),
          },
        ]
      : scene.versions;
  if (versions.length > 100)
    throw Error("版本达到 100 个，请先导出备份并拆分项目");
  return {
    ...scene,
    draft: text,
    draftRevision: scene.draftRevision + (scene.draft === text ? 0 : 1),
    versions,
    status:
      scene.draft === text
        ? scene.status
        : scene.final?.text === text
          ? "已定稿"
          : "待确认",
  };
}
export function sentences(text: string) {
  return text.match(/[^。！？.!?\n]+[。！？.!?]?|\n/g) || [];
}
export function lineDiff(before: string, after: string) {
  const a = before.split("\n"),
    b = after.split("\n");
  return Array.from({ length: Math.max(a.length, b.length) }, (_, i) => ({
    before: a[i] ?? "",
    after: b[i] ?? "",
    changed: a[i] !== b[i],
  }));
}
export function confirmScene(scene: ScriptScene, text: string): ScriptScene {
  if (!text.trim() || text.length > 50000)
    throw Error("定稿内容不能为空或超过 5 万字");
  if (scene.final?.text === text) return { ...scene, status: "已定稿" };
  const history = scene.final
    ? [...scene.finalHistory, scene.final]
    : scene.finalHistory;
  if (history.length >= 100)
    throw Error("定稿历史达到上限，请先导出备份并拆分项目");
  const base = { ...scene };
  delete base.undoTargetRevision;
  return {
    ...base,
    final: {
      text,
      revision: (scene.final?.revision || 0) + 1,
      at: new Date().toISOString(),
    },
    finalHistory: history,
    status: "已定稿",
  };
}
export function undoFinal(scene: ScriptScene): ScriptScene {
  const cutoff = scene.undoTargetRevision ?? scene.final?.revision ?? 1;
  const previous = scene.finalHistory.filter((v) => v.revision < cutoff).at(-1);
  if (!previous) throw Error("没有可撤销的更早定稿");
  // Undo creates a new revision instead of rewriting the historical revision ID.
  return {
    ...confirmScene(scene, previous.text),
    undoTargetRevision: previous.revision,
  };
}
export function generateShotDrafts(data: Studio, sceneId: string): Shot[] {
  const scene = data.script?.scenes.find((s) => s.id === sceneId);
  if (!scene?.final || scene.status !== "已定稿")
    throw Error("只有已确认定稿的场景可以生成分镜草稿");
  if (
    data.shots.some(
      (s) =>
        s.sourceSceneId === scene.id &&
        s.sourceFinalRevision === scene.final!.revision,
    )
  )
    throw Error("此定稿版本已有分镜草稿，不会重复生成");
  const blocks = scene.final.text
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (blocks.length > 100) throw Error("本场段落超过 100，请先拆分场景");
  const used = new Set(data.shots.map((s) => s.number));
  let n = data.shots.length + 1;
  return blocks.map((text, i) => {
    while (used.has(`SH-${String(n).padStart(3, "0")}`)) n++;
    const number = `SH-${String(n++).padStart(3, "0")}`;
    used.add(number);
    return {
      id: crypto.randomUUID(),
      number,
      title: text.slice(0, 240),
      size: i === 0 ? "全景" : "中景",
      duration: 4,
      camera: "平视",
      movement: "待确认",
      assets: scene.assetIds.filter((id) =>
        data.assets.some((a) => a.id === id),
      ),
      sourceSceneId: scene.id,
      sourceFinalRevision: scene.final!.revision,
    };
  });
}
export function shotNeedsReview(shot: Shot, data: Studio) {
  if (!shot.sourceSceneId) return false;
  const scene = data.script?.scenes.find((s) => s.id === shot.sourceSceneId);
  return (
    !scene ||
    scene.status !== "已定稿" ||
    scene.final?.revision !== shot.sourceFinalRevision
  );
}
export function validateScreenplay(x: unknown): x is Screenplay {
  if (!x || typeof x !== "object") return false;
  const s = x as Screenplay;
  const version = (v: ScriptVersion) =>
    v &&
    typeof v.id === "string" &&
    typeof v.text === "string" &&
    v.text.length <= 50000 &&
    typeof v.model === "string" &&
    Number.isFinite(Date.parse(v.at)) &&
    (v.inputHash === undefined || /^[a-f0-9]{64}$/.test(v.inputHash)) &&
    (v.sourceRevision === undefined ||
      (Number.isSafeInteger(v.sourceRevision) && v.sourceRevision > 0)) &&
    (v.requestId === undefined || typeof v.requestId === "string");
  const final = (v: FinalScene) =>
    v &&
    typeof v.text === "string" &&
    v.text.length <= 50000 &&
    Number.isSafeInteger(v.revision) &&
    v.revision > 0 &&
    Number.isFinite(Date.parse(v.at));
  return (
    !!s.original &&
    typeof s.original.text === "string" &&
    s.original.text.length <= 200000 &&
    ["中文", "日本語"].includes(s.original.language) &&
    Number.isFinite(Date.parse(s.original.at)) &&
    Array.isArray(s.scenes) &&
    s.scenes.length <= 500 &&
    new Set(s.scenes.map((v) => v?.id)).size === s.scenes.length &&
    s.scenes.every(
      (v) =>
        v &&
        (v.undoTargetRevision === undefined ||
          (Number.isSafeInteger(v.undoTargetRevision) &&
            v.undoTargetRevision > 0)) &&
        typeof v.id === "string" &&
        typeof v.heading === "string" &&
        typeof v.original === "string" &&
        (v.mergeCandidate === undefined ||
          (typeof v.mergeCandidate === "string" &&
            v.mergeCandidate.length <= 50000)) &&
        typeof v.draft === "string" &&
        v.draft.length <= 50000 &&
        Number.isSafeInteger(v.draftRevision) &&
        v.draftRevision > 0 &&
        ["待修改", "待确认", "已定稿"].includes(v.status) &&
        Array.isArray(v.assetIds) &&
        v.assetIds.every((id) => typeof id === "string") &&
        Array.isArray(v.versions) &&
        v.versions.length <= 100 &&
        v.versions.every(version) &&
        (v.variants === undefined ||
          (Array.isArray(v.variants) &&
            v.variants.length <= 30 &&
            v.variants.every(version))) &&
        (!v.final || final(v.final)) &&
        Array.isArray(v.finalHistory) &&
        v.finalHistory.length <= 100 &&
        v.finalHistory.every(final),
    )
  );
}
