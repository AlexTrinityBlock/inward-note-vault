import type { FolderRead } from "../../client/generated/models";
import { useI18n } from "../../i18n";
import { formatAbsolute, formatRelativeTime } from "../../lib/time";
import { Icon } from "../Icon";
import { DropdownMenu } from "./DropdownMenu";
import { noteTitle, type NoteView } from "./FileGrid";

type FileTableProps = {
  notes: NoteView[];
  folders: FolderRead[];
  onOpen: (noteId: number) => void;
  onRename: (view: NoteView) => void;
  onDelete: (view: NoteView) => void;
};

/**
 * The file section as a table.
 *
 * The same notes as the grid, with the folder column the grid has no room for.
 * Both views share one selection model and one set of actions, so switching
 * between them never changes what a click does.
 */
export function FileTable({ notes, folders, onOpen, onRename, onDelete }: FileTableProps) {
  const { t, locale } = useI18n();

  const folderName = (folderId: number | null): string => {
    if (folderId === null) {
      return t("notes.noFolder");
    }
    return folders.find((folder) => folder.id === folderId)?.name ?? t("notes.noFolder");
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
          {notes.map((view) => (
            <tr
              key={view.note.id}
              className="drive-table-row"
              tabIndex={0}
              onClick={() => onOpen(view.note.id)}
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
                <span className="note-card-categories">
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
                  items={[
                    {
                      label: t("drive.renameNote"),
                      icon: <Icon name="edit" size={14} />,
                      onSelect: () => onRename(view),
                    },
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
          ))}
        </tbody>
      </table>
    </div>
  );
}
