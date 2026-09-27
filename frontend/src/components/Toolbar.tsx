/**
 * The Markdown toolbar: eleven insertions that act on the textarea's selection.
 *
 * Each button is a plain string transformation (`lib/markdownEdit.ts`); the work
 * here is reading the selection, handing back the rewrite, and putting the caret
 * somewhere useful afterwards so the reader can keep typing without reaching for
 * the mouse.
 */
import { useCallback, useRef, type RefObject } from "react";

import { useI18n } from "../i18n";
import { applyMarkdownAction, type MarkdownAction } from "../lib/markdownEdit";
import { Icon, type IconName } from "./Icon";

type ToolbarProps = {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (next: string) => void;
};

type ToolbarButton = {
  action: MarkdownAction;
  labelKey: Parameters<ReturnType<typeof useI18n>["t"]>[0];
  icon?: IconName;
  text?: string;
  dividerBefore?: boolean;
};

const BUTTONS: ToolbarButton[] = [
  { action: "bold", labelKey: "editor.bold", icon: "bold" },
  { action: "italic", labelKey: "editor.italic", icon: "italic" },
  { action: "h1", labelKey: "editor.h1", text: "H1", dividerBefore: true },
  { action: "h2", labelKey: "editor.h2", text: "H2" },
  { action: "h3", labelKey: "editor.h3", text: "H3" },
  { action: "quote", labelKey: "editor.quote", icon: "quote", dividerBefore: true },
  { action: "code", labelKey: "editor.code", icon: "code" },
  { action: "list", labelKey: "editor.bulletList", icon: "list" },
  { action: "task", labelKey: "editor.taskList", icon: "check-square" },
  { action: "link", labelKey: "editor.link", icon: "link" },
  { action: "table", labelKey: "editor.table", icon: "table" },
];

export function Toolbar({ textareaRef, value, onChange }: ToolbarProps) {
  const { t } = useI18n();
  // Remember the selection: clicking a button blurs the textarea, and by the
  // time the click handler runs `selectionStart` may already have collapsed.
  const selection = useRef<{ start: number; end: number }>({ start: 0, end: 0 });

  const remember = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      selection.current = { start: textarea.selectionStart, end: textarea.selectionEnd };
    }
  }, [textareaRef]);

  const run = useCallback(
    (action: MarkdownAction) => {
      const { start, end } = selection.current;
      const edit = applyMarkdownAction(action, value, start, end);

      // The edit may insert somewhere other than the selection — a line prefix
      // lands at the start of the line — so it carries its own range rather
      // than assuming the selection is what gets replaced.
      onChange(value.slice(0, edit.from) + edit.text + value.slice(edit.to));

      // The caret can only move once React has committed the new value.
      requestAnimationFrame(() => {
        const target = textareaRef.current;
        if (!target) {
          return;
        }
        target.focus();
        target.setSelectionRange(edit.selection.start, edit.selection.end);
      });
    },
    [onChange, textareaRef, value],
  );

  return (
    <div className="markdown-toolbar" role="toolbar" aria-label={t("editor.toolbarLabel")}>
      <div className="toolbar-group">
        {BUTTONS.map((button) => (
          <span key={button.action} className="toolbar-slot">
            {button.dividerBefore ? <span className="toolbar-divider" aria-hidden="true" /> : null}
            <button
              type="button"
              className="toolbar-btn"
              title={t(button.labelKey)}
              aria-label={t(button.labelKey)}
              // Keep focus in the textarea so the selection is still readable.
              onMouseDown={(event) => {
                event.preventDefault();
                remember();
              }}
              onClick={() => run(button.action)}
            >
              {button.icon ? <Icon name={button.icon} size={14} /> : null}
              {button.text ? <span className="toolbar-btn-text">{button.text}</span> : null}
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}
