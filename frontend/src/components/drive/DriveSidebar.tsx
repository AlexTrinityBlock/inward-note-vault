import type { CategoryRead, FolderRead } from "../../client/generated/models";
import { useI18n } from "../../i18n";
import { Icon } from "../Icon";

type DriveSidebarProps = {
  folders: FolderRead[];
  categories: CategoryRead[];
  /** Which directory the main canvas is showing. */
  activeSection: "folders" | "categories";
  /** Drives the slide-over drawer on a phone. */
  open: boolean;
  onOpenFolders: () => void;
  onOpenCategories: () => void;
  onNewNote: () => void;
};

/**
 * The directory column: two entries and their counts, nothing more.
 *
 * It deliberately does not list the folders or the categories themselves. With
 * a real vault those lists grow without bound, and a sidebar that has to hold
 * both a deep folder tree and every category turns into a scrollable mess with
 * two competing navigation models. Browsing happens on the canvas, one level at
 * a time, and this column only answers "which of the two am I in".
 */
export function DriveSidebar({
  folders,
  categories,
  activeSection,
  open,
  onOpenFolders,
  onOpenCategories,
  onNewNote,
}: DriveSidebarProps) {
  const { t } = useI18n();

  const entries = [
    {
      key: "folders" as const,
      icon: "folder" as const,
      label: t("drive.folders"),
      count: folders.length,
      onSelect: onOpenFolders,
    },
    {
      key: "categories" as const,
      icon: "tag" as const,
      label: t("notes.categories"),
      count: categories.length,
      onSelect: onOpenCategories,
    },
  ];

  return (
    <aside className={`drive-sidebar${open ? " open drawer-open" : ""}`}>
      <div className="sidebar-action-header">
        <button
          type="button"
          className="sidebar-new-note-action"
          title={t("drive.newNote")}
          onClick={onNewNote}
        >
          <Icon name="plus" size={15} />
          <span>{t("drive.newNote")}</span>
        </button>
      </div>

      <nav className="sidebar-directory" aria-label={t("drive.title")}>
        {entries.map((entry) => (
          <div
            key={entry.key}
            className={`sidebar-directory-item${activeSection === entry.key ? " active" : ""}`}
            role="button"
            tabIndex={0}
            title={entry.label}
            onClick={entry.onSelect}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                entry.onSelect();
              }
            }}
          >
            <span className="sidebar-directory-left">
              <Icon name={entry.icon} size={18} className="sidebar-directory-icon" />
              <span className="sidebar-directory-label">{entry.label}</span>
            </span>
            <span className="sidebar-directory-badge">{entry.count}</span>
          </div>
        ))}
      </nav>
    </aside>
  );
}
