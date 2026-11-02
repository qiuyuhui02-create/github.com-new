"use client";
import {
  useLayoutEffect,
  useRef,
  type TextareaHTMLAttributes,
  type Ref,
} from "react";
import { nativeTextChange, type TextChange } from "@/lib/highlights";
import {
  captureSelection,
  selectionForSource,
  editorText,
  type TextSelection,
} from "@/lib/text-selection";
type Props = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "value" | "defaultValue" | "onChange" | "onSelect"
> & {
  value: string;
  onChange?: (text: string, change?: TextChange) => void;
  onSelection?: (selection: TextSelection) => void;
  editorRef?: Ref<HTMLTextAreaElement>;
  onCompositionState?: (active: boolean) => void;
};
/** Uncontrolled native editor: autosave does not assign .value or remount it.
 * No keyboard/context-menu interception, retaining browser undo, clipboard and IME. */
export default function TextEditor({
  value,
  onChange,
  onSelection,
  editorRef,
  onCompositionState,
  ...props
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null),
    initial = useRef(value),
    composing = useRef(false),
    beforeInput = useRef<{ selection: TextSelection; type: string } | null>(
      null,
    );
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && !composing.current && el.value !== editorText(value)) {
      const {
        selectionStart: start,
        selectionEnd: end,
        selectionDirection: direction,
        scrollTop,
      } = el;
      el.value = value;
      el.setSelectionRange(
        Math.min(start, value.length),
        Math.min(end, value.length),
        direction,
      );
      el.scrollTop = scrollTop;
    }
  }, [value]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const captureBefore = (event: Event) => {
      beforeInput.current = {
        selection: captureSelection(el),
        type: (event as InputEvent).inputType || "",
      };
    };
    el.addEventListener("beforeinput", captureBefore);
    return () => el.removeEventListener("beforeinput", captureBefore);
  }, []);
  const capture = (el: HTMLTextAreaElement) =>
    onSelection?.(selectionForSource(el, value));
  return (
    <textarea
      {...props}
      ref={(el) => {
        ref.current = el;
        if (typeof editorRef === "function") editorRef(el);
        else if (editorRef) editorRef.current = el;
      }}
      defaultValue={initial.current}
      onChange={(e) => {
        const before = beforeInput.current;
        beforeInput.current = null;
        capture(e.currentTarget);
        onChange?.(
          e.currentTarget.value,
          before
            ? nativeTextChange(
                before.selection,
                e.currentTarget.value,
                before.type,
              )
            : undefined,
        );
      }}
      onSelect={(e) => {
        if (document.activeElement === e.currentTarget)
          capture(e.currentTarget);
      }}
      onPointerUp={(e) => capture(e.currentTarget)}
      onKeyUp={(e) => capture(e.currentTarget)}
      onBlur={(e) => {
        if (e.currentTarget.selectionEnd > e.currentTarget.selectionStart)
          capture(e.currentTarget);
        props.onBlur?.(e);
      }}
      onCompositionStart={() => {
        composing.current = true;
        onCompositionState?.(true);
      }}
      onCompositionEnd={(e) => {
        composing.current = false;
        onCompositionState?.(false);
        capture(e.currentTarget);
        onChange?.(e.currentTarget.value);
      }}
    />
  );
}
