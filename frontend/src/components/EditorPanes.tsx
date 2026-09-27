import type { RefObject } from "react";

import { useI18n } from "../i18n";
import { MarkdownPreview } from "./MarkdownPreview";
import { Toolbar } from "./Toolbar";

type EditorPanesProps = {
  body: string;
  onBodyChange: (body: string) => void;
  editing: boolean;
  /** Drives the phone-only pane switch: read shows the preview, write the field. */
  mobileMode: "read" | "write";
  textareaRef: RefObject<HTMLTextAreaElement | null>;
};

/**
 * The panes: writing on the left, the rendered note on the right.
 *
 * Read mode collapses to the rendered side alone. The design has no
 * preview-only toggle any more — editing always shows both, because a split is
 * what makes Markdown legible while you write it.
 */
export function EditorPanes({
  body,
  onBodyChange,
  editing,
  mobileMode,
  textareaRef,
}: EditorPanesProps) {
  const { t } = useI18n();
  const modeClass = mobileMode === "write" ? "mobile-mode-write" : "mobile-mode-read";

  return (
    <main className={`editor-workspace ${editing ? "edit-mode" : "read-mode"} ${modeClass}`}>
      {editing ? <Toolbar textareaRef={textareaRef} value={body} onChange={onBodyChange} /> : null}

      <div className="editor-panes">
        {editing ? (
          <div className="editor-pane-left">
            <textarea
              ref={textareaRef}
              className="editor-textarea"
              value={body}
              placeholder={t("editor.bodyPlaceholder")}
              aria-label={t("editor.write")}
              onChange={(event) => onBodyChange(event.target.value)}
            />
          </div>
        ) : null}

        <div className="editor-pane-right">
          <MarkdownPreview source={body} />
        </div>
      </div>
    </main>
  );
}
