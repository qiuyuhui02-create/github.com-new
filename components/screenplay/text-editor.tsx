"use client";
import {
  useLayoutEffect,
  useRef,
  type TextareaHTMLAttributes,
  type Ref,
} from "react";
import { captureSelection, type TextSelection } from "@/lib/text-selection";
type Props = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "value" | "defaultValue" | "onChange" | "onSelect"
> & {
  value: string;
  onChange?: (text: string) => void;
  onSelection?: (selection: TextSelection) => void;
  editorRef?: Ref<HTMLTextAreaElement>;
};
/** Uncontrolled native editor: autosave does not assign .value or remount it.
 * No keyboard/context-menu interception, retaining browser undo, clipboard and IME. */
export default function TextEditor({
  value,
  onChange,
  onSelection,
  editorRef,
  ...props
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null),
    initial = useRef(value),
    composing = useRef(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && !composing.current && el.value !== value) {
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
  const capture = (el: HTMLTextAreaElement) =>
    onSelection?.(captureSelection(el));
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
        capture(e.currentTarget);
        onChange?.(e.currentTarget.value);
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
      }}
      onCompositionEnd={(e) => {
        composing.current = false;
        capture(e.currentTarget);
        onChange?.(e.currentTarget.value);
      }}
    />
  );
}
