import type { ScriptChapter, ArchivedChapter } from "./screenplay-structure";
import type { Studio, Shot } from "./model";
export type ScriptLanguage = "中文" | "日本語";
export type ScriptVersion = {
  id: string;
  text: string;
  model: string;
  kind?: "draft" | "candidate";
  at: string;
};
export type FinalScene = { text: string; revision: number; at: string };
export type ScriptScene = {
  id: string;
  manualComparisons?: { model: string; text: string }[];
  heading: string;
  sceneNumber?: string;
  interiorExterior?: string;
  timeOfDay?: string;
  original: string;
  draft: string;
  draftRevision: number;
  draftUndo?: string[];
  draftEditBase?: string;
  mergeCandidate?: string;
  status: "待修改" | "待确认" | "已定稿";
  assetIds: string[];
  versions: ScriptVersion[];
  final?: FinalScene;
  finalHistory: FinalScene[];
  undoTargetRevision?: number;
};
export type Screenplay = {
  title?: string;
  synopsis?: string;
  sourceMode?: "blank" | "imported";
  chapters?: ScriptChapter[];
  archivedScenes?: ScriptScene[];
  archivedChapters?: ArchivedChapter[];
  revisionInstructions?: string;
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
  if (scenes.some((s) => s.text.length > 200000))
    throw Error("单场超过 20 万字，请用场景标题拆分");
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
  if (text.length > 200000) throw Error("单场剧本超过 20 万字");
  const versions =
    checkpoint && scene.versions.at(-1)?.text !== scene.draft
      ? [
          ...scene.versions,
          {
            id: crypto.randomUUID(),
            text: scene.draft,
            model,
            kind: "draft" as const,
            at: new Date().toISOString(),
          },
        ]
      : scene.versions;
  if (versions.length > 100)
    throw Error("版本达到 100 个，请先导出备份并拆分项目");
  const next: ScriptScene = {
    ...scene,
    draft: text,
    draftRevision: scene.draftRevision + (text === scene.draft ? 0 : 1),
    versions,
    status:
      text === scene.draft
        ? scene.status
        : scene.final?.text === text
          ? "已定稿"
          : "待确认",
  };
  if (checkpoint) {
    const undo = [...(scene.draftUndo || [])];
    if (
      scene.draftEditBase !== undefined &&
      scene.draftEditBase !== scene.draft
    )
      undo.push(scene.draftEditBase);
    if (text !== scene.draft) undo.push(scene.draft);
    if (undo.length > 100)
      throw Error("撤销记录达到上限，请先导出备份并拆分项目");
    if (undo.length || scene.draftUndo) next.draftUndo = undo;
    delete next.draftEditBase;
  } else if (text !== scene.draft)
    next.draftEditBase = scene.draftEditBase ?? scene.draft;
  return next;
}
export function appendCandidateToDraft(scene: ScriptScene, text: string) {
  if (!text.trim()) throw Error("请先选择候选中的文字或段落");
  const current = editDraft(scene, scene.draft, true);
  return editDraft(
    current,
    current.draft + (current.draft ? "\n\n" : "") + text,
    true,
  );
}
export function undoWorkingDraft(scene: ScriptScene) {
  const current = editDraft(scene, scene.draft, true),
    undo = current.draftUndo;
  const previous = undo?.length
    ? undo.at(-1)
    : [...current.versions]
        .reverse()
        .find(
          (v) =>
            v.text !== current.draft &&
            (v.kind === "draft" ||
              (!v.kind && ["人工修改", "原始剧本"].includes(v.model))),
        )?.text;
  if (previous === undefined) throw Error("没有可撤销的人工工作稿修改");
  const restored = editDraft(current, previous, true);
  restored.draftUndo = undo?.length ? undo.slice(0, -1) : [];
  delete restored.draftEditBase;
  return restored;
}
export function externalRevisionPrompt(
  scene: ScriptScene,
  instructions: string,
  source: "original" | "draft" = "original",
) {
  return `请修改以下电影剧本的一个场景。保持原语言、场景和人物身份；候选仅供人工评审，不代表最终定稿。\n\n【统一修改要求】\n${instructions.trim() || "使对白自然、人物动机清晰、叙事节奏流畅，避免解释性台词。"}\n\n【场景】\n${scene.heading}\n\n【${source === "original" ? "原始剧本" : "人工工作稿"}】\n${source === "original" ? scene.original : scene.draft}\n\n请分别提供：1. 修改后的本场剧本；2. 简短修改说明。不要扩写其他场景。`;
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
  if (!text.trim() || text.length > 200000)
    throw Error("定稿内容不能为空或超过 20 万字");
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
    typeof v.model === "string" &&
    (v.kind === undefined || ["draft", "candidate"].includes(v.kind)) &&
    Number.isFinite(Date.parse(v.at));
  const final = (v: FinalScene) =>
    v &&
    typeof v.text === "string" &&
    Number.isSafeInteger(v.revision) &&
    v.revision > 0 &&
    Number.isFinite(Date.parse(v.at));
  const validScene = (v: ScriptScene) =>
    v &&
    (v.undoTargetRevision === undefined ||
      (Number.isSafeInteger(v.undoTargetRevision) &&
        v.undoTargetRevision > 0)) &&
    typeof v.id === "string" &&
    typeof v.heading === "string" &&
    [v.sceneNumber, v.interiorExterior, v.timeOfDay].every(
      (t) => t === undefined || (typeof t === "string" && t.length <= 200),
    ) &&
    (v.manualComparisons === undefined ||
      (Array.isArray(v.manualComparisons) &&
        v.manualComparisons.length === 3 &&
        v.manualComparisons.every(
          (c) =>
            typeof c.model === "string" &&
            c.model.length <= 100 &&
            typeof c.text === "string" &&
            c.text.length <= 200000,
        ))) &&
    typeof v.original === "string" &&
    (v.mergeCandidate === undefined ||
      (typeof v.mergeCandidate === "string" &&
        v.mergeCandidate.length <= 200000)) &&
    (v.draftUndo === undefined ||
      (Array.isArray(v.draftUndo) &&
        v.draftUndo.length <= 100 &&
        v.draftUndo.every(
          (t) => typeof t === "string" && t.length <= 200000,
        ))) &&
    (v.draftEditBase === undefined ||
      (typeof v.draftEditBase === "string" &&
        v.draftEditBase.length <= 200000)) &&
    typeof v.draft === "string" &&
    v.draft.length <= 200000 &&
    Number.isSafeInteger(v.draftRevision) &&
    v.draftRevision > 0 &&
    ["待修改", "待确认", "已定稿"].includes(v.status) &&
    Array.isArray(v.assetIds) &&
    v.assetIds.every((id) => typeof id === "string") &&
    Array.isArray(v.versions) &&
    v.versions.length <= 100 &&
    v.versions.every(version) &&
    (!v.final || final(v.final)) &&
    Array.isArray(v.finalHistory) &&
    v.finalHistory.length <= 100 &&
    v.finalHistory.every(final);
  return (
    (s.title === undefined ||
      (typeof s.title === "string" && s.title.length <= 200)) &&
    (s.synopsis === undefined ||
      (typeof s.synopsis === "string" && s.synopsis.length <= 5000)) &&
    (s.sourceMode === undefined ||
      ["blank", "imported"].includes(s.sourceMode)) &&
    (s.revisionInstructions === undefined ||
      (typeof s.revisionInstructions === "string" &&
        s.revisionInstructions.length <= 5000)) &&
    !!s.original &&
    typeof s.original.text === "string" &&
    s.original.text.length <= 200000 &&
    ["中文", "日本語"].includes(s.original.language) &&
    Number.isFinite(Date.parse(s.original.at)) &&
    Array.isArray(s.scenes) &&
    s.scenes.length <= 500 &&
    new Set(s.scenes.map((v) => v?.id)).size === s.scenes.length &&
    s.scenes.every(validScene) &&
    (s.archivedScenes === undefined ||
      (Array.isArray(s.archivedScenes) &&
        s.archivedScenes.length <= 500 &&
        s.archivedScenes.every(validScene) &&
        new Set([...s.scenes, ...s.archivedScenes].map((v) => v.id)).size ===
          s.scenes.length + s.archivedScenes.length)) &&
    validChapters(s) &&
    validArchivedChapters(s, validScene)
  );
}

function validChapters(s: Screenplay) {
  if (s.chapters === undefined) return true;
  if (!Array.isArray(s.chapters) || s.chapters.length > 500) return false;
  const chapterIds = new Set<string>(),
    sceneIds = new Set<string>(),
    active = new Set(s.scenes.map((v) => v.id));
  for (const c of s.chapters) {
    if (
      !c ||
      typeof c.id !== "string" ||
      !c.id ||
      chapterIds.has(c.id) ||
      typeof c.name !== "string" ||
      !c.name.trim() ||
      c.name.length > 200 ||
      !Array.isArray(c.sceneIds) ||
      (c.collapsed !== undefined && typeof c.collapsed !== "boolean") ||
      (c.originalText !== undefined &&
        (typeof c.originalText !== "string" || c.originalText.length > 200000))
    )
      return false;
    chapterIds.add(c.id);
    for (const id of c.sceneIds) {
      if (typeof id !== "string" || !active.has(id) || sceneIds.has(id))
        return false;
      sceneIds.add(id);
    }
  }
  return sceneIds.size === s.scenes.length;
}

function validArchivedChapters(
  s: Screenplay,
  validScene: (v: ScriptScene) => unknown,
) {
  if (s.archivedChapters === undefined) return true;
  if (!Array.isArray(s.archivedChapters) || s.archivedChapters.length > 500)
    return false;
  const chapterIds = new Set(
      s.chapters?.map((c) => c.id) || ["legacy-unfiled"],
    ),
    sceneIds = new Set(
      [...s.scenes, ...(s.archivedScenes || [])].map((v) => v.id),
    );
  let count = 0;
  for (const e of s.archivedChapters) {
    if (
      !e ||
      !e.chapter ||
      !Array.isArray(e.scenes) ||
      (count += e.scenes.length) > 500 ||
      !e.scenes.every(validScene) ||
      !Number.isSafeInteger(e.index) ||
      e.index < 0 ||
      !Number.isFinite(Date.parse(e.at)) ||
      (e.beforeId !== undefined && typeof e.beforeId !== "string") ||
      (e.afterId !== undefined && typeof e.afterId !== "string") ||
      chapterIds.has(e.chapter.id) ||
      !validChapters({ ...s, chapters: [e.chapter], scenes: e.scenes })
    )
      return false;
    chapterIds.add(e.chapter.id);
    for (const v of e.scenes) {
      if (sceneIds.has(v.id)) return false;
      sceneIds.add(v.id);
    }
  }
  return true;
}
