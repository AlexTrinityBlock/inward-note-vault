import type { FolderRead, NoteRead } from "../../client/generated/models";
import { useI18n } from "../../i18n";
import { Icon } from "../Icon";
import { DropdownMenu } from "./DropdownMenu";

type FolderGridProps = {
  /** Only the folders directly inside the current one; children are one level down. */
  folders: FolderRead[];
  notes: NoteRead[];
  onOpen: (folderId: number) => void;
  onRename: (folder: FolderRead) => void;
  onDelete: (folder: FolderRead) => void;
};

/**
 * The folder section: a horizontal grid of cards.
 *
 * Each card carries how many notes are inside it, counted across the subtree —
 * a folder whose own notes are zero but which holds three subfolders with notes
 * is not an empty folder, and saying so avoids a pointless click.
 */
export function FolderGrid({ folders, notes, onOpen, onRename, onDelete }: FolderGridProps) {
  const { t } = useI18n();

  function countIn(folderId: number): number {
    // Walk down: collect this folder and every descendant, then count notes.
    const inside = new Set([folderId]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const folder of folders) {
        if (folder.parent_id !== null && inside.has(folder.parent_id) && !inside.has(folder.id)) {
          inside.add(folder.id);
          grew = true;
        }
      }
    }
    return notes.filter((note) => note.folder_id !== null && inside.has(note.folder_id)).length;
  }

  return (
    <div className="drive-folders-grid">
      {folders.map((folder) => (
        <div
          key={folder.id}
          className="drive-folder-card"
          role="button"
          tabIndex={0}
          onClick={() => onOpen(folder.id)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onOpen(folder.id);
            }
          }}
        >
          <div className="drive-folder-card-top">
            <div className="drive-folder-card-icon">
              <Icon name="folder" size={20} />
            </div>
            <DropdownMenu
              label={t("drive.openMenu")}
              items={[
                {
                  label: t("drive.renameFolder"),
                  icon: <Icon name="edit" size={14} />,
                  onSelect: () => onRename(folder),
                },
                {
                  label: t("drive.deleteFolder"),
                  icon: <Icon name="trash" size={14} />,
                  danger: true,
                  onSelect: () => onDelete(folder),
                },
              ]}
            />
          </div>

          <div className="drive-folder-card-main">
            <div className="drive-folder-card-name" title={folder.name}>
              {folder.name}
            </div>
          </div>

          <div className="drive-folder-card-bottom">
            <span className="folder-count">{t("drive.noteCount", { count: countIn(folder.id) })}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
