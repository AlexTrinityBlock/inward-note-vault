import type { NoteRead } from "../../client/generated/models";
import { useI18n } from "../../i18n";
import type { NoteSecret } from "../../lib/crypto";
import { modKey } from "../../lib/platform";
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
  onSelect?: (noteId: number) => void;
  selectedNoteId?: number | null;
  cutNoteId?: number | null;
  /** Omitted where acting on a single note makes no sense, such as a drill-down. */
  onRename?: (view: NoteView) => void;
  onMove?: (view: NoteView) => void;
  onMakeCopy?: (view: NoteView) => void;
  onCopy?: (view: NoteView) => void;
  onCut?: (view: NoteView) => void;
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
export function FileGrid({
  notes,
  selectedNoteId,
  cutNoteId,
  onSelect,
  ...actions
}: { notes: NoteView[] } & FileActions) {
  const { t, locale } = useI18n();

  return (
    <div className="drive-files-grid">
      {notes.map((view) => {
        const isSelected = selectedNoteId === view.note.id;
        const isCut = cutNoteId === view.note.id;

        return (
          <div
            key={view.note.id}
            className={`note-card${isSelected ? " selected" : ""}${isCut ? " cut" : ""}`}
            role="button"
            tabIndex={0}
            onClick={() => {
              if (onSelect) {
                onSelect(view.note.id);
              } else {
                actions.onOpen(view.note.id);
              }
            }}
            onDoubleClick={() => actions.onOpen(view.note.id)}
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
              {actions.onRename || actions.onMove || actions.onMakeCopy || actions.onCopy || actions.onCut || actions.onDelete ? (
                <DropdownMenu
                  label={t("drive.openMenu")}
                  onOpenMenu={() => onSelect?.(view.note.id)}
                  items={[
                    ...(actions.onRename
                      ? [
                          {
                            label: t("drive.rename"),
                            icon: <Icon name="edit" size={14} />,
                            onSelect: () => actions.onRename?.(view),
                          },
                        ]
                      : []),
                    ...(actions.onMove
                      ? [
                          {
                            label: t("drive.move"),
                            icon: <Icon name="move" size={14} />,
                            onSelect: () => actions.onMove?.(view),
                          },
                        ]
                      : []),
                    ...(actions.onMakeCopy
                      ? [
                          {
                            label: t("drive.makeCopy"),
                            icon: <Icon name="copy" size={14} />,
                            onSelect: () => actions.onMakeCopy?.(view),
                          },
                        ]
                      : []),
                    ...(actions.onCopy
                      ? [
                          {
                            label: t("drive.copy"),
                            icon: <Icon name="copy" size={14} />,
                            shortcut: `${modKey}C`,
                            onSelect: () => actions.onCopy?.(view),
                          },
                        ]
                      : []),
                    ...(actions.onCut
                      ? [
                          {
                            label: t("drive.cut"),
                            icon: <Icon name="scissors" size={14} />,
                            shortcut: `${modKey}X`,
                            onSelect: () => actions.onCut?.(view),
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
              <div className="note-card-title" title={noteTitle(view, t)}>
                {noteTitle(view, t)}
              </div>
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
