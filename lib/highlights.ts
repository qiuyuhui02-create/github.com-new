import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import {
  validSelection,
  editorText,
  editorOffset,
  sourceOffset,
  type TextSelection,
} from "./text-selection";
export const highlightColors = ["yellow", "green", "pink", "blue"] as const;
export type HighlightColor = (typeof highlightColors)[number];
export type HighlightAnchor = { hash: string; start: number; end: number };
export type Highlight = {
  id: string;
  bindingId: string;
  start: number;
  end: number;
  quote: string;
  color: HighlightColor;
  note: string;
  status: "active" | "review";
  anchors: HighlightAnchor[];
};
/** Ephemeral, exact native/AI edit. Never persisted with project data. */
export type TextChange = {
  before: string;
  from: number;
  to: number;
  insert: string;
};
export function textHash(text: string) {
  const bytes = new Uint8Array(text.length * 2);
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    bytes[i * 2] = code & 255;
    bytes[i * 2 + 1] = code >>> 8;
  }
  return bytesToHex(sha256(bytes));
}
const boundary = (text: string, n: number) =>
  !(n > 0 && text[n - 1] === "\r" && text[n] === "\n") &&
  !(
    n > 0 &&
    n < text.length &&
    /[\uD800-\uDBFF]/.test(text[n - 1]) &&
    /[\uDC00-\uDFFF]/.test(text[n])
  );
function range(text: string, start: number, end: number, quote: string) {
  return (
    Number.isSafeInteger(start) &&
    Number.isSafeInteger(end) &&
    start >= 0 &&
    end > start &&
    end <= text.length &&
    boundary(text, start) &&
    boundary(text, end) &&
    editorText(text.slice(start, end)) === quote
  );
}
function keepAnchor(mark: Highlight, anchor: HighlightAnchor): Highlight {
  const existing = mark.anchors.findIndex((a) => a.hash === anchor.hash);
  if (existing >= 0)
    return {
      ...mark,
      anchors: mark.anchors.map((a, i) => (i === existing ? anchor : a)),
    };
  const anchors = [...mark.anchors, anchor];
  return {
    ...mark,
    anchors:
      anchors.length > 32 ? [anchors[0], ...anchors.slice(-31)] : anchors,
  };
}
export function addHighlight(
  marks: Highlight[] | undefined,
  text: string,
  selection: TextSelection | null,
  color: HighlightColor,
  note?: string,
): Highlight[] {
  if (!validSelection(selection, text) || selection.start === selection.end)
    throw Error("请先选中工作稿中的文字，再选择荧光笔颜色");
  if (!boundary(text, selection.start) || !boundary(text, selection.end))
    throw Error("选区位于复合字符内部，请重新选择");
  if (!highlightColors.includes(color)) throw Error("标注颜色无效");
  if ((note?.length || 0) > 300) throw Error("备注最多300字");
  const list = marks || [],
    same = list.find(
      (m) =>
        m.status === "active" &&
        m.start === selection.start &&
        m.end === selection.end &&
        m.quote === editorText(text.slice(selection.start, selection.end)),
    );
  if (!same && list.length >= 200)
    throw Error("每场最多200条标注，请先整理或导出备份");
  const quote = editorText(text.slice(selection.start, selection.end));
  if (
    list
      .filter((m) => m.id !== same?.id)
      .reduce((n, m) => n + m.quote.length, 0) +
      quote.length >
    1000000
  )
    throw Error("本场标注文本总量达到100万字符，请先整理标注或拆分场景");
  const markId = same?.id || crypto.randomUUID();
  const mark: Highlight = {
    id: markId,
    bindingId: same?.bindingId || markId,
    start: selection.start,
    end: selection.end,
    quote: editorText(text.slice(selection.start, selection.end)),
    color,
    note: note ?? same?.note ?? "",
    status: "active",
    anchors: same
      ? keepAnchor(same, {
          hash: textHash(text),
          start: selection.start,
          end: selection.end,
        }).anchors
      : [{ hash: textHash(text), start: selection.start, end: selection.end }],
  };
  return [...list.filter((m) => m.id !== same?.id), mark];
}
export function reanchorHighlight(
  mark: Highlight,
  text: string,
  selection: TextSelection | null,
): Highlight {
  return {
    ...addHighlight([], text, selection, mark.color, mark.note)[0],
    id: mark.id,
  };
}
export function nativeTextChange(
  before: TextSelection,
  next: string,
  inputType: string,
): TextChange | undefined {
  if (inputType.startsWith("history")) return;
  let from = before.start,
    to = before.end;
  if (from === to && inputType.startsWith("delete")) {
    const removed = before.text.length - next.length;
    if (removed <= 0) return;
    if (inputType.endsWith("Backward")) from -= removed;
    else if (inputType.endsWith("Forward")) to += removed;
    else return;
  }
  const size = next.length - (before.text.length - (to - from));
  if (from < 0 || to < from || size < 0) return;
  const insert = next.slice(from, from + size),
    hint = { before: before.text, from, to, insert };
  return validChange(hint, before.text, next) ? hint : undefined;
}
function validChange(
  c: TextChange | undefined,
  before: string,
  after: string,
): c is TextChange {
  return (
    !!c &&
    c.before === before &&
    Number.isSafeInteger(c.from) &&
    Number.isSafeInteger(c.to) &&
    c.from >= 0 &&
    c.to >= c.from &&
    c.to <= before.length &&
    before.slice(0, c.from) + c.insert + before.slice(c.to) === after
  );
}
function minimalChange(before: string, after: string): TextChange {
  let from = 0,
    end = 0;
  while (
    from < before.length &&
    from < after.length &&
    before[from] === after[from]
  )
    from++;
  while (
    end < before.length - from &&
    end < after.length - from &&
    before[before.length - 1 - end] === after[after.length - 1 - end]
  )
    end++;
  return {
    before,
    from,
    to: before.length - end,
    insert: after.slice(from, after.length - end),
  };
}
const unique = (text: string, quote: string) => {
  const n = text.indexOf(quote);
  return n >= 0 && text.indexOf(quote, n + 1) === -1;
};
export function mapHighlights(
  marks: Highlight[] | undefined,
  before: string,
  after: string,
  options: {
    change?: TextChange;
    checkpoint?: boolean;
    rememberBefore?: boolean;
    historical?: Highlight[];
  } = {},
): Highlight[] | undefined {
  if (!marks?.length) return marks;
  if (before === after && !options.checkpoint) return marks;
  const beforeHash = textHash(before),
    afterHash = before === after ? beforeHash : textHash(after),
    logicalBefore = editorText(before),
    logicalAfter = editorText(after);
  const nativeBefore = before === logicalBefore,
    nativeAfter = after === logicalAfter;
  let hint = options.change;
  if (validChange(hint, before, after))
    hint = {
      before: logicalBefore,
      from: nativeBefore ? hint.from : editorOffset(before, hint.from),
      to: nativeBefore ? hint.to : editorOffset(before, hint.to),
      insert: editorText(hint.insert),
    };
  const precise = validChange(hint, logicalBefore, logicalAfter),
    change = precise ? hint! : minimalChange(logicalBefore, logicalAfter);
  return marks.map((original) => {
    let m = original;
    if (m.status === "active" && (options.rememberBefore || options.checkpoint))
      m = keepAnchor(m, { hash: beforeHash, start: m.start, end: m.end });
    const historic = options.historical?.find(
      (h) =>
        h.id === m.id &&
        h.bindingId === m.bindingId &&
        h.status === "active" &&
        h.quote === m.quote &&
        range(after, h.start, h.end, h.quote),
    );
    const anchor = m.anchors.find(
      (a) => a.hash === afterHash && range(after, a.start, a.end, m.quote),
    );
    if (anchor || historic) {
      const p = anchor || historic!;
      m = { ...m, start: p.start, end: p.end, status: "active" };
    } else if (before !== after && m.status === "active") {
      let start = nativeBefore ? m.start : editorOffset(before, m.start),
        end = nativeBefore ? m.end : editorOffset(before, m.end);
      const delta = change.insert.length - (change.to - change.from),
        untouched = change.to <= start || change.from >= end;
      if (change.to <= start) {
        start += delta;
        end += delta;
      }
      start = nativeAfter ? start : sourceOffset(after, start);
      end = nativeAfter ? end : sourceOffset(after, end);
      if (
        untouched &&
        range(after, start, end, m.quote) &&
        (precise ||
          logicalBefore === logicalAfter ||
          (unique(logicalBefore, m.quote) && unique(logicalAfter, m.quote)))
      )
        m = { ...m, start, end };
      else {
        m = keepAnchor(m, {
          hash: beforeHash,
          start: original.start,
          end: original.end,
        });
        m = { ...m, status: "review" };
      }
    }
    if (m.status === "active" && options.checkpoint)
      m = keepAnchor(m, { hash: afterHash, start: m.start, end: m.end });
    return m;
  });
}

export function validHighlights(
  value: unknown,
  text: string,
): value is Highlight[] {
  if (!Array.isArray(value) || value.length > 200) return false;
  const ids = new Set<string>();
  if (
    value.reduce(
      (n, m) => n + (typeof m?.quote === "string" ? m.quote.length : 0),
      0,
    ) > 1000000
  )
    return false;
  return value.every((m: Highlight) => {
    if (
      !m ||
      typeof m.id !== "string" ||
      typeof m.bindingId !== "string" ||
      !m.bindingId ||
      !m.id ||
      ids.has(m.id) ||
      !highlightColors.includes(m.color) ||
      typeof m.quote !== "string" ||
      !m.quote ||
      m.quote.length > 200000 ||
      typeof m.note !== "string" ||
      m.note.length > 300 ||
      !["active", "review"].includes(m.status) ||
      !Number.isSafeInteger(m.start) ||
      !Number.isSafeInteger(m.end) ||
      m.start < 0 ||
      m.end <= m.start ||
      m.end > 200000 ||
      !Array.isArray(m.anchors) ||
      !m.anchors.length ||
      m.anchors.length > 32
    )
      return false;
    ids.add(m.id);
    return (
      (m.status === "review" || range(text, m.start, m.end, m.quote)) &&
      m.anchors.every(
        (a) =>
          a &&
          typeof a.hash === "string" &&
          /^[a-f0-9]{64}$/.test(a.hash) &&
          Number.isSafeInteger(a.start) &&
          Number.isSafeInteger(a.end) &&
          a.start >= 0 &&
          a.end > a.start &&
          a.end <= 200000,
      )
    );
  });
}
export function highlightSegments(
  text: string,
  marks: Highlight[] | undefined,
  hidden = false,
) {
  const active = hidden
    ? []
    : (marks || []).filter(
        (m) => m.status === "active" && range(text, m.start, m.end, m.quote),
      );
  const points = [
    ...new Set([0, text.length, ...active.flatMap((m) => [m.start, m.end])]),
  ].sort((a, b) => a - b);
  const parts: {
    text: string;
    start: number;
    end: number;
    mark: Highlight | undefined;
  }[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i],
      end = points[i + 1],
      mark = [...active]
        .reverse()
        .find((m) => m.start <= start && m.end >= end),
      last = parts.at(-1);
    if (last && last.mark?.id === mark?.id) {
      last.text += text.slice(start, end);
      last.end = end;
    } else parts.push({ text: text.slice(start, end), start, end, mark });
  }
  return parts;
}

export function copyHighlights(marks: Highlight[]) {
  return marks.map((m) => ({
    id: m.id,
    bindingId: m.bindingId,
    start: m.start,
    end: m.end,
    quote: m.quote,
    color: m.color,
    note: m.note,
    status: m.status,
    anchors: m.anchors.map((a) => ({
      hash: a.hash,
      start: a.start,
      end: a.end,
    })),
  }));
}

export function highlightSignature(marks: Highlight[] | undefined) {
  return JSON.stringify(marks?.map(({ anchors, ...mark }) => mark));
}
