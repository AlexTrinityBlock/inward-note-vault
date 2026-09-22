import type { NoteRead } from "../../client/generated/models";
import { useI18n } from "../../i18n";
import type { NoteSecret } from "../../lib/crypto";
import { markdownSnippet } from "../../lib/markdown";
import { formatAbsolute, formatRelativeTime } from "../../lib/time";
import { Icon } from "../Icon";
import { DropdownMenu } from "./DropdownMenu";

/** What a card needs to know about a note, decrypted or not. */
export type NoteView = {
  note: NoteRead;
  /** Absent while the note is still ciphertext. */
  secret: NoteSecret | null;
};

type FileActions = {
  onOpen: (noteId: number) => void;
  /** Omitted where acting on a single note makes no sense, such as a drill-down. */
  onRename?: (view: NoteView) => void;
  onDelete?: (view: NoteView) => void;
};

/**
 * The title to show for a note.
 *
 * An encrypted note's title lives inside its ciphertext, so before the notebook
 * is unlocked there is nothing readable to display. It says so rather than
 * decrypting the whole notebook to make the grid look tidier — that would undo
 * the point of locking it.
 */
export function noteTitle(view: NoteView, t: ReturnType<typeof useI18n>["t"]): string {
  if (view.secret) {
    return view.secret.title.trim() === "" ? t("notes.untitled") : view.secret.title;
  }
  if (view.note.notebook === "encrypted") {
    return t("notes.lockedNote");
  }
  return (view.note.title ?? "").trim() === "" ? t("notes.untitled") : (view.note.title ?? "");
}

/** The file section as preview cards. */
export function FileGrid({ notes, ...actions }: { notes: NoteView[] } & FileActions) {
  const { t, locale } = useI18n();

  return (
    <div className="drive-files-grid">
      {notes.map((view) => {
        const snippet = view.secret
          ? markdownSnippet(view.secret.body)
          : view.note.notebook === "plain"
            ? markdownSnippet(view.note.body ?? "")
            : "";

        return (
          <div
            key={view.note.id}
            className="note-card"
            role="button"
            tabIndex={0}
            onClick={() => actions.onOpen(view.note.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                actions.onOpen(view.note.id);
              }
            }}
          >
            <div className="note-card-top">
              <div className="drive-file-card-icon">
                <Icon name={view.note.notebook === "encrypted" ? "lock" : "file"} size={16} />
              </div>
              {actions.onRename || actions.onDelete ? (
                <DropdownMenu
                  label={t("drive.openMenu")}
                  items={[
                    ...(actions.onRename
                      ? [
                          {
                            label: t("drive.renameNote"),
                            icon: <Icon name="edit" size={14} />,
                            onSelect: () => actions.onRename?.(view),
                          },
                        ]
                      : []),
                    ...(actions.onDelete
                      ? [
                          {
                            label: t("drive.deleteNote"),
                            icon: <Icon name="trash" size={14} />,
                            danger: true,
                            onSelect: () => actions.onDelete?.(view),
                          },
                        ]
                      : []),
                  ]}
                />
              ) : null}
            </div>

            <div className="note-card-main">
              <div className="note-card-title">{noteTitle(view, t)}</div>
              {snippet ? <p className="note-card-snippet">{snippet}</p> : null}
            </div>

            <div className="note-card-footer">
              <span className="note-card-categories">
                {(view.note.categories ?? []).map((category) => (
                  <span key={category} className="category-chip">
                    {category}
                  </span>
                ))}
              </span>
              <time
                className="note-card-time"
                dateTime={view.note.updated_at}
                title={formatAbsolute(view.note.updated_at, locale)}
              >
                {formatRelativeTime(view.note.updated_at, locale)}
              </time>
            </div>
          </div>
        );
      })}
    </div>
  );
}
