/** UTF-16 offsets match native textarea selectionStart/End (including emoji). */
export type TextSelection = {
  text: string;
  start: number;
  end: number;
  direction?: "forward" | "backward" | "none";
};
export function captureSelection(el: HTMLTextAreaElement): TextSelection {
  return {
    text: el.value,
    start: el.selectionStart,
    end: el.selectionEnd,
    direction: el.selectionDirection,
  };
}
export function validSelection(
  selection: TextSelection | null | undefined,
  text: string,
): selection is TextSelection {
  return (
    !!selection &&
    selection.text === text &&
    Number.isInteger(selection.start) &&
    Number.isInteger(selection.end) &&
    selection.start >= 0 &&
    selection.end >= selection.start &&
    selection.end <= text.length
  );
}
export function selectedText(
  selection: TextSelection | null | undefined,
  text: string,
) {
  if (!validSelection(selection, text) || selection.start === selection.end)
    throw Error("请先在当前 AI 稿中选中文字");
  return text.slice(selection.start, selection.end);
}
export function insertSelection(
  draft: string,
  text: string,
  target: TextSelection | null,
  replace: boolean,
) {
  if (!text.trim()) throw Error("采用内容不能为空");
  if (target && !validSelection(target, draft))
    throw Error("工作稿已变化，请重新选择插入或替换位置");
  if (replace && (!target || target.start === target.end))
    throw Error("请先在工作稿中选中要替换的段落");
  const start = target ? (replace ? target.start : target.end) : draft.length;
  const end = replace ? target!.end : start;
  const prefix = !target && draft ? "\n\n" : "";
  return {
    text: draft.slice(0, start) + prefix + text + draft.slice(end),
    cursor: start + prefix.length + text.length,
    change: { before: draft, from: start, to: end, insert: prefix + text },
  };
}

// Native textarea values normalize CRLF/CR. Persisted screenplay text is not rewritten.
export const editorText = (text: string) => text.replace(/\r\n?/g, "\n");
export function editorOffset(source: string, offset: number) {
  if (!source.includes("\r")) return Math.min(offset, source.length);
  return editorText(source.slice(0, offset)).length;
}
export function sourceOffset(source: string, offset: number) {
  if (!source.includes("\r")) return Math.min(offset, source.length);
  let raw = 0,
    logical = 0;
  while (raw < source.length && logical < offset) {
    raw += source[raw] === "\r" && source[raw + 1] === "\n" ? 2 : 1;
    logical++;
  }
  return raw;
}
export function selectionForSource(
  el: HTMLTextAreaElement,
  source: string,
): TextSelection {
  const native = captureSelection(el);
  return editorText(source) === native.text
    ? {
        ...native,
        text: source,
        start: sourceOffset(source, native.start),
        end: sourceOffset(source, native.end),
      }
    : native;
}
export function restoreTextSelection(
  el: HTMLTextAreaElement,
  selection: TextSelection | null | undefined,
) {
  if (
    !selection ||
    !validSelection(selection, selection.text) ||
    editorText(selection.text) !== el.value
  )
    return false;
  el.focus({ preventScroll: true });
  el.setSelectionRange(
    editorOffset(selection.text, selection.start),
    editorOffset(selection.text, selection.end),
    selection.direction,
  );
  return true;
}
