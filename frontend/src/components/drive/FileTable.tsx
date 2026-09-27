import type { FolderRead } from "../../client/generated/models";
import { useI18n } from "../../i18n";
import { modKey } from "../../lib/platform";
import { formatAbsolute, formatRelativeTime } from "../../lib/time";
import { Icon } from "../Icon";
import { DropdownMenu } from "./DropdownMenu";
import { noteTitle, type NoteView } from "./FileGrid";

type FileTableProps = {
  notes: NoteView[];
  folders: FolderRead[];
  selectedNoteId?: number | null;
  cutNoteId?: number | null;
  onOpen: (noteId: number) => void;
  onSelect?: (noteId: number) => void;
  onRename: (view: NoteView) => void;
  onMove?: (view: NoteView) => void;
  onMakeCopy?: (view: NoteView) => void;
  onCopy?: (view: NoteView) => void;
  onCut?: (view: NoteView) => void;
  onDelete: (view: NoteView) => void;
};

/**
 * The file section as a table.
 *
 * The same notes as the grid, with the folder column the grid has no room for.
 * Both views share one selection model and one set of actions, so switching
 * between them never changes what a click does.
 */
export function FileTable({
  notes,
  folders,
  selectedNoteId,
  cutNoteId,
  onOpen,
  onSelect,
  onRename,
  onMove,
  onMakeCopy,
  onCopy,
  onCut,
  onDelete,
}: FileTableProps) {
  const { t, locale } = useI18n();

  const folderName = (folderId: number | null): string => {
    if (folderId === null) {
      return t("notes.noFolder");
    }
    return folders.find((folder) => folder.id === folderId)?.name || t("notes.noFolder");
  };

  return (
    <div className="drive-files-table-container">
      <table className="drive-files-table">
        <thead>
          <tr>
            <th scope="col" className="col-name">
              {t("drive.files")}
            </th>
            <th scope="col" className="col-folder">
              {t("notes.folder")}
            </th>
            <th scope="col" className="col-modified">
              {t("drive.sortUpdated")}
            </th>
            <th scope="col" className="col-category">
              {t("notes.categories")}
            </th>
            <th scope="col" className="col-actions">
              <span className="visually-hidden">{t("drive.openMenu")}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {notes.map((view) => {
            const isSelected = selectedNoteId === view.note.id;
            const isCut = cutNoteId === view.note.id;

            return (
              <tr
                key={view.note.id}
                className={`drive-table-row${isSelected ? " selected" : ""}${isCut ? " cut" : ""}`}
                tabIndex={0}
                onClick={() => {
                  if (onSelect) {
                    onSelect(view.note.id);
                  } else {
                    onOpen(view.note.id);
                  }
                }}
                onDoubleClick={() => onOpen(view.note.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    onOpen(view.note.id);
                  }
                }}
              >
                <td className="drive-table-name">
                  <Icon name={view.note.notebook === "encrypted" ? "lock" : "file"} size={14} />
                  <span>{noteTitle(view, t)}</span>
                </td>
                <td>{folderName(view.note.folder_id)}</td>
                <td>
                  <time
                    dateTime={view.note.updated_at}
                    title={formatAbsolute(view.note.updated_at, locale)}
                  >
                    {formatRelativeTime(view.note.updated_at, locale)}
                  </time>
                </td>
                <td>
                  <span className="table-categories">
                    {(view.note.categories ?? []).map((category) => (
                      <span key={category} className="category-chip">
                        {category}
                      </span>
                    ))}
                  </span>
                </td>
                <td className="drive-table-actions">
                  <DropdownMenu
                    label={t("drive.openMenu")}
                    onOpenMenu={() => onSelect?.(view.note.id)}
                    items={[
                      {
                        label: t("drive.rename"),
                        icon: <Icon name="edit" size={14} />,
                        onSelect: () => onRename(view),
                      },
                      ...(onMove
                        ? [
                            {
                              label: t("drive.move"),
                              icon: <Icon name="move" size={14} />,
                              onSelect: () => onMove(view),
                            },
                          ]
                        : []),
                      ...(onMakeCopy
                        ? [
                            {
                              label: t("drive.makeCopy"),
                              icon: <Icon name="copy" size={14} />,
                              onSelect: () => onMakeCopy(view),
                            },
                          ]
                        : []),
                      ...(onCopy
                        ? [
                            {
                              label: t("drive.copy"),
                              icon: <Icon name="copy" size={14} />,
                              shortcut: `${modKey}C`,
                              onSelect: () => onCopy(view),
                            },
                          ]
                        : []),
                      ...(onCut
                        ? [
                            {
                              label: t("drive.cut"),
                              icon: <Icon name="scissors" size={14} />,
                              shortcut: `${modKey}X`,
                              onSelect: () => onCut(view),
                            },
                          ]
                        : []),
                      {
                        label: t("drive.deleteNote"),
                        icon: <Icon name="trash" size={14} />,
                        danger: true,
                        onSelect: () => onDelete(view),
                      },
                    ]}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
