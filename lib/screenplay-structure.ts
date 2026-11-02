import {
  type Screenplay,
  type ScriptScene,
  type ScriptLanguage,
} from "./screenplay";
export type ScriptChapter = {
  id: string;
  name: string;
  sceneIds: string[];
  collapsed?: boolean;
  originalText?: string;
};
export type ImportBoundary = {
  id: string;
  line: number;
  kind: "chapter" | "scene";
  name: string;
};
const id = () => crypto.randomUUID();
function nameOf(name: string) {
  if (!name.trim() || name.trim().length > 200)
    throw Error("名称需为1～200个字符，可自由命名");
  return name.trim();
}
export function chaptersOf(script: Screenplay): ScriptChapter[] {
  return (
    script.chapters || [
      {
        id: "legacy-unfiled",
        name: "未分组场景",
        sceneIds: script.scenes.map((s) => s.id),
      },
    ]
  );
}
function arranged(
  script: Screenplay,
  chapters: ScriptChapter[],
  scenes = script.scenes,
): Screenplay {
  const byId = new Map(scenes.map((s) => [s.id, s]));
  return {
    ...script,
    chapters,
    scenes: chapters.flatMap((c) =>
      c.sceneIds.map((i) => {
        const s = byId.get(i);
        if (!s) throw Error("场景关联无效");
        return s;
      }),
    ),
  };
}
export function newBlankScreenplay(
  title: string,
  synopsis: string,
  language: ScriptLanguage,
): Screenplay {
  if (synopsis.length > 5000) throw Error("简介超过5000字");
  return {
    title: nameOf(title),
    synopsis,
    sourceMode: "blank",
    original: { text: "", language, at: new Date().toISOString() },
    scenes: [],
    chapters: [],
  };
}
export function addChapter(script: Screenplay, name: string) {
  if (chaptersOf(script).length >= 500)
    throw Error("章节达到500个，请先导出并拆分项目");
  const chapter: ScriptChapter = { id: id(), name: nameOf(name), sceneIds: [] };
  return {
    script: arranged(script, [...chaptersOf(script), chapter]),
    chapter,
  };
}
export function renameChapter(
  script: Screenplay,
  chapterId: string,
  name: string,
) {
  return arranged(
    script,
    chaptersOf(script).map((c) =>
      c.id === chapterId ? { ...c, name: nameOf(name) } : c,
    ),
  );
}
export function collapseChapter(script: Screenplay, chapterId: string) {
  return arranged(
    script,
    chaptersOf(script).map((c) =>
      c.id === chapterId ? { ...c, collapsed: !c.collapsed } : c,
    ),
  );
}
export function reorderChapter(
  script: Screenplay,
  chapterId: string,
  beforeId: string | null,
) {
  const list = chaptersOf(script),
    source = list.find((c) => c.id === chapterId);
  if (!source || chapterId === beforeId) return script;
  const rest = list.filter((c) => c.id !== chapterId),
    n =
      beforeId === null
        ? rest.length
        : rest.findIndex((c) => c.id === beforeId);
  if (n < 0) return script;
  return arranged(script, [...rest.slice(0, n), source, ...rest.slice(n)]);
}
export function removeChapter(
  script: Screenplay,
  chapterId: string,
  targetId?: string,
) {
  const chapters = chaptersOf(script),
    source = chapters.find((c) => c.id === chapterId);
  if (!source) throw Error("章节不存在");
  if (
    source.sceneIds.length &&
    (!targetId ||
      targetId === chapterId ||
      !chapters.some((c) => c.id === targetId))
  )
    throw Error("有场景的章节必须先将场景移到其他章节，或取消删除");
  return arranged(
    script,
    chapters
      .filter((c) => c.id !== chapterId)
      .map((c) =>
        c.id === targetId
          ? { ...c, sceneIds: [...c.sceneIds, ...source.sceneIds] }
          : c,
      ),
  );
}
export type ArchivedChapter = {
  chapter: ScriptChapter;
  scenes: ScriptScene[];
  index: number;
  beforeId?: string;
  afterId?: string;
  at: string;
};
export function archiveChapter(
  script: Screenplay,
  chapterId: string,
): Screenplay {
  const chapters = chaptersOf(script),
    index = chapters.findIndex((c) => c.id === chapterId),
    chapter = chapters[index];
  if (!chapter) throw Error("章节不存在");
  const scenes = chapter.sceneIds.map((id) =>
    script.scenes.find((s) => s.id === id)!,
  );
  if (
    (script.archivedChapters?.length || 0) >= 500 ||
    (script.archivedChapters || []).reduce((n, c) => n + c.scenes.length, 0) +
      scenes.length >
      500
  )
    throw Error("章节回收站已达上限，请先导出备份");
  return {
    ...arranged(
      script,
      chapters.filter((c) => c.id !== chapterId),
      script.scenes.filter((s) => !chapter.sceneIds.includes(s.id)),
    ),
    archivedChapters: [
      ...(script.archivedChapters || []),
      {
        chapter: structuredClone(chapter),
        scenes: structuredClone(scenes),
        index,
        ...(chapters[index + 1] ? { beforeId: chapters[index + 1].id } : {}),
        ...(chapters[index - 1] ? { afterId: chapters[index - 1].id } : {}),
        at: new Date().toISOString(),
      },
    ],
  };
}
export function restoreChapter(
  script: Screenplay,
  chapterId: string,
): Screenplay {
  const entry = script.archivedChapters?.find(
    (c) => c.chapter.id === chapterId,
  );
  if (!entry) throw Error("回收章节不存在");
  const chapters = chaptersOf(script);
  if (
    chapters.some((c) => c.id === chapterId) ||
    entry.scenes.some(
      (s) =>
        script.scenes.some((v) => v.id === s.id) ||
        (script.archivedScenes || []).some((v) => v.id === s.id),
    )
  )
    throw Error("存在相同 ID，已阻止覆盖");
  if (
    chapters.length >= 500 ||
    script.scenes.length + entry.scenes.length > 500
  )
    throw Error("活动章节或场景已达上限，请先导出备份");
  const before = chapters.findIndex((c) => c.id === entry.beforeId),
    after = chapters.findIndex((c) => c.id === entry.afterId);
  const index =
    before >= 0
      ? before
      : after >= 0
        ? after + 1
        : Math.min(entry.index, chapters.length);
  return {
    ...arranged(
      script,
      [...chapters.slice(0, index), entry.chapter, ...chapters.slice(index)],
      [...script.scenes, ...entry.scenes],
    ),
    archivedChapters: script.archivedChapters!.filter((c) => c !== entry),
  };
}
export function duplicateChapter(script: Screenplay, chapterId: string) {
  const chapters = chaptersOf(script),
    source = chapters.find((c) => c.id === chapterId);
  if (!source) throw Error("章节不存在");
  if (
    chapters.length >= 500 ||
    script.scenes.length + source.sceneIds.length > 500
  )
    throw Error("章节或场景达到500个，请先导出并拆分项目");
  const copies = source.sceneIds.map((sceneId) => {
    const original = script.scenes.find((s) => s.id === sceneId)!;
    const copy = structuredClone(original);
    copy.id = id();
    copy.versions = copy.versions.map((v) => ({ ...v, id: id() }));
    return copy;
  });
  const chapter = {
    ...structuredClone(source),
    id: id(),
    name: source.name.slice(0, 194) + "（副本）",
    sceneIds: copies.map((s) => s.id),
    collapsed: false,
  };
  const n = chapters.indexOf(source);
  return {
    script: arranged(
      script,
      [...chapters.slice(0, n + 1), chapter, ...chapters.slice(n + 1)],
      [...script.scenes, ...copies],
    ),
    chapter,
  };
}
export function addScene(script: Screenplay, chapterId: string, name: string) {
  const chapters = chaptersOf(script);
  if (!chapters.some((c) => c.id === chapterId))
    throw Error("请先创建或选择章节");
  if (script.scenes.length >= 500)
    throw Error("场景达到500个，请先导出并拆分项目");
  const scene: ScriptScene = {
    id: id(),
    heading: nameOf(name),
    original: "",
    draft: "",
    draftRevision: 1,
    status: "待修改",
    assetIds: [],
    versions: [
      {
        id: id(),
        text: "",
        model: "空白原稿",
        kind: "draft",
        at: new Date().toISOString(),
      },
    ],
    finalHistory: [],
  };
  return {
    script: arranged(
      script,
      chapters.map((c) =>
        c.id === chapterId
          ? { ...c, collapsed: false, sceneIds: [...c.sceneIds, scene.id] }
          : c,
      ),
      [...script.scenes, scene],
    ),
    scene,
  };
}
export function renameScene(script: Screenplay, sceneId: string, name: string) {
  return {
    ...script,
    scenes: script.scenes.map((s) =>
      s.id === sceneId ? { ...s, heading: nameOf(name) } : s,
    ),
  };
}
export function moveScene(
  script: Screenplay,
  sceneId: string,
  chapterId: string,
  beforeId?: string,
) {
  if (sceneId === beforeId) return script;
  const chapters = chaptersOf(script);
  if (
    !script.scenes.some((s) => s.id === sceneId) ||
    !chapters.some((c) => c.id === chapterId)
  )
    throw Error("请选择有效的场景和章节");
  return arranged(
    script,
    chapters.map((c) => {
      const ids = c.sceneIds.filter((i) => i !== sceneId);
      if (c.id !== chapterId) return { ...c, sceneIds: ids };
      const n = beforeId ? ids.indexOf(beforeId) : ids.length;
      if (n < 0) throw Error("目标场景不在此章节");
      return {
        ...c,
        collapsed: false,
        sceneIds: [...ids.slice(0, n), sceneId, ...ids.slice(n)],
      };
    }),
  );
}
export function archiveScene(script: Screenplay, sceneId: string) {
  const scene = script.scenes.find((s) => s.id === sceneId);
  if (!scene) throw Error("场景不存在");
  if ((script.archivedScenes?.length || 0) >= 500)
    throw Error("回收站已达上限，请先导出备份");
  return {
    ...arranged(
      script,
      chaptersOf(script).map((c) => ({
        ...c,
        sceneIds: c.sceneIds.filter((i) => i !== sceneId),
      })),
      script.scenes.filter((s) => s.id !== sceneId),
    ),
    archivedScenes: [...(script.archivedScenes || []), scene],
  };
}
export function restoreScene(
  script: Screenplay,
  sceneId: string,
  chapterId: string,
) {
  const scene = script.archivedScenes?.find((s) => s.id === sceneId);
  if (!scene || !chaptersOf(script).some((c) => c.id === chapterId))
    throw Error("请选择有效的回收场景和接收章节");
  return {
    ...arranged(
      script,
      chaptersOf(script).map((c) =>
        c.id === chapterId
          ? { ...c, sceneIds: [...c.sceneIds, sceneId], collapsed: false }
          : c,
      ),
      [...script.scenes, scene],
    ),
    archivedScenes: script.archivedScenes!.filter((s) => s.id !== sceneId),
  };
}
export function sourceLines(text: string) {
  return (text.match(/[^\r\n]*(?:\r\n|\r|\n|$)/g) || []).filter(
    (line) => line !== "",
  );
}
export function sceneMetadata(heading: string) {
  return {
    sceneNumber:
      heading.match(
        /^(?:第\s*)?([\d一二三四五六七八九十百]+)(?:\s*[场場.]|[、)）])/i,
      )?.[1] ||
      heading.match(
        /(?:SCENE|シーン|场次|場次)\s*([\d一二三四五六七八九十]+)/i,
      )?.[1] ||
      "",
    interiorExterior:
      heading.match(
        /INT\.?\s*\/\s*EXT\.?|INT\.?\b|EXT\.?\b|内景|內景|外景|内外景/i,
      )?.[0] || "",
    timeOfDay:
      heading
        .match(
          /深夜|清晨|凌晨|黄昏|傍晚|午后|黎明|白天|夜晚|早晨|日中|夕方|夜明け|昼|夜|日/g,
        )
        ?.at(-1) || "",
  };
}
export function suggestBoundaries(text: string): ImportBoundary[] {
  if (!text.trim() || text.length > 200000)
    throw Error("请输入20万字以内的剧本");
  const result: ImportBoundary[] = [];
  sourceLines(text).forEach((line, i) => {
    const heading = line.replace(/^[\uFEFF\s]*#{1,6}\s*/, "").trim();
    const isScene =
      /^(?:\d+[.、)）]\s*)?(?:INT\.?\b|EXT\.?\b|INT\.?\/EXT\.?|内景|內景|外景|内外景|第[一二三四五六七八九十百\d]+[场場]|场次|場次|场景\s*\d|SCENE\s*\d|[○〇◯●]|シーン\s*\d)/i.test(
        heading,
      );
    const isChapter =
      /^\s*#{1,6}\s+/.test(line) ||
      /^(?:第[一二三四五六七八九十百\d]+[章幕部篇]|序章|終章|终章|プロローグ|エピローグ|CHAPTER\b|ACT\b|PART\b)/i.test(
        heading,
      );
    if (i === 0 || isScene || isChapter)
      result.push({
        id: id(),
        line: i + 1,
        kind: isScene ? "scene" : isChapter ? "chapter" : "scene",
        name: heading.slice(0, 200) || "未分场原文",
      });
  });
  return result;
}
export function importRegions(text: string, boundaries: ImportBoundary[]) {
  const lines = sourceLines(text);
  if (
    !text.trim() ||
    text.length > 200000 ||
    !boundaries.length ||
    boundaries.length > 1000
  )
    throw Error("请先建立有效拆分预览（最多1000个边界）");
  const list = [...boundaries].sort((a, b) => a.line - b.line);
  if (
    list[0].line !== 1 ||
    new Set(list.map((b) => b.line)).size !== list.length
  )
    throw Error("第一个边界必须为第1行，边界不能重复");
  return list.map((b, i) => {
    if (
      !Number.isInteger(b.line) ||
      b.line < 1 ||
      b.line > lines.length ||
      !["chapter", "scene"].includes(b.kind)
    )
      throw Error("边界行号无效");
    nameOf(b.name);
    return {
      ...b,
      text: lines
        .slice(b.line - 1, (list[i + 1]?.line || lines.length + 1) - 1)
        .join(""),
      endLine: (list[i + 1]?.line || lines.length + 1) - 1,
    };
  });
}
export function confirmImport(
  text: string,
  language: ScriptLanguage,
  title: string,
  synopsis: string,
  boundaries: ImportBoundary[],
): Screenplay {
  const regions = importRegions(text, boundaries),
    script = newBlankScreenplay(title, synopsis, language);
  script.original.text = text;
  script.sourceMode = "imported";
  let chapter: ScriptChapter | undefined;
  const addRaw = (raw: string, name: string) => {
    if (raw.length > 50000) throw Error("单场超过5万字，请先在预览中拆分");
    if (!chapter) {
      chapter = { id: id(), name: "未分组场景", sceneIds: [] };
      script.chapters!.push(chapter);
    }
    const created = addScene(script, chapter.id, name);
    const scene = {
      ...created.scene,
      original: raw,
      draft: raw,
      versions: [
        { id: id(), text: raw, model: "原始剧本", at: script.original.at },
      ],
      ...sceneMetadata(name),
    };
    script.scenes.push(scene);
    chapter.sceneIds.push(scene.id);
  };
  for (const r of regions) {
    if (r.kind === "chapter") {
      chapter = {
        id: id(),
        name: nameOf(r.name),
        sceneIds: [],
        originalText: r.text,
      };
      script.chapters!.push(chapter);
      const lines = sourceLines(r.text),
        rest = lines.slice(1).join("");
      if (rest.trim()) {
        chapter.originalText = lines[0] || "";
        addRaw(rest, `${r.name.slice(0, 190)} · 开篇`);
      }
    } else addRaw(r.text, r.name);
  }
  if (script.scenes.length > 500 || script.chapters!.length > 500)
    throw Error("章节或场景超过500，请拆分导入");
  return script;
}
