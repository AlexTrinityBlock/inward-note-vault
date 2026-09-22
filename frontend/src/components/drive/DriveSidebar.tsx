import { useMemo, useState } from "react";

import type { CategoryRead, FolderRead } from "../../client/generated/models";
import { useI18n } from "../../i18n";
import { buildFolderTree, type FolderNode } from "../../lib/folders";
import { Icon } from "../Icon";

type DriveSidebarProps = {
  folders: FolderRead[];
  categories: CategoryRead[];
  /** Which directory the main canvas is showing. */
  activeSection: "folders" | "categories";
  activeFolderId: number | null;
  activeCategory: string | null;
  /** Drives the slide-over drawer on a phone. */
  open: boolean;
  onSelectFolder: (folderId: number | null) => void;
  onOpenCategories: () => void;
  onSelectCategory: (name: string | null) => void;
  onCreateFolder: (name: string, parentId: number | null) => Promise<void>;
  onNewNote: () => void;
};

/**
 * The directory column: two entries with their counts, the folder tree, and the
 * category list.
 *
 * The design puts the counts on the directory entries, so "Folders 4 / Category
 * 7" answers "how much is in here" before anything is opened. The tree below is
 * the same `parent_id` structure the old sidebar rendered — only its styling
 * and its home changed.
 */
export function DriveSidebar({
  folders,
  categories,
  activeSection,
  activeFolderId,
  activeCategory,
  open,
  onSelectFolder,
  onOpenCategories,
  onSelectCategory,
  onCreateFolder,
  onNewNote,
}: DriveSidebarProps) {
  const { t } = useI18n();
  const tree = useMemo(() => buildFolderTree(folders), [folders]);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");

  async function commit() {
    const name = draft.trim();
    setDraft("");
    setAdding(false);
    if (name !== "") {
      await onCreateFolder(name, activeFolderId);
    }
  }

  function branch(nodes: FolderNode[], depth: number) {
    return (
      <ul className="folder-tree" style={{ paddingLeft: depth === 0 ? 0 : "0.7rem" }}>
        {nodes.map((node) => {
          const selected = activeFolderId === node.id;
          return (
            <li key={node.id}>
              <div
                className={`sidebar-directory-item folder-item${selected ? " active" : ""}`}
                role="button"
                tabIndex={0}
                title={node.name}
                onClick={() => onSelectFolder(node.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelectFolder(node.id);
                  }
                }}
              >
                <span className="sidebar-directory-left">
                  <Icon name="folder" size={16} className="sidebar-directory-icon" />
                  <span className="folder-label">{node.name}</span>
                </span>
                {node.children.length > 0 ? (
                  <span className="folder-count">{node.children.length}</span>
                ) : null}
              </div>
              {node.children.length > 0 ? branch(node.children, depth + 1) : null}
            </li>
          );
        })}
      </ul>
    );
  }

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
        <div
          className={`sidebar-directory-item${activeSection === "folders" ? " active" : ""}`}
          role="button"
          tabIndex={0}
          title={t("drive.folders")}
          onClick={() => onSelectFolder(null)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onSelectFolder(null);
            }
          }}
        >
          <span className="sidebar-directory-left">
            <Icon name="folder" size={18} className="sidebar-directory-icon" />
            <span className="sidebar-directory-label">{t("drive.folders")}</span>
          </span>
          <span className="sidebar-directory-badge">{folders.length}</span>
        </div>

        <div
          className={`sidebar-directory-item${activeSection === "categories" ? " active" : ""}`}
          role="button"
          tabIndex={0}
          title={t("categories.title")}
          onClick={onOpenCategories}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onOpenCategories();
            }
          }}
        >
          <span className="sidebar-directory-left">
            <Icon name="tag" size={18} className="sidebar-directory-icon" />
            <span className="sidebar-directory-label">{t("notes.categories")}</span>
          </span>
          <span className="sidebar-directory-badge">{categories.length}</span>
        </div>
      </nav>

      <div className="sidebar-scrollable">
        <section className="sidebar-section">
          <div className="section-header">
            <h2 className="sidebar-section-title">{t("folders.title")}</h2>
            <button
              type="button"
              className="ghost icon-btn"
              title={t("drive.newFolder")}
              aria-label={t("drive.newFolder")}
              onClick={() => {
                setDraft("");
                setAdding(true);
              }}
            >
              <Icon name="plus" size={14} />
            </button>
          </div>

          <div
            className={`sidebar-directory-item folder-item${activeFolderId === null ? " active" : ""}`}
            role="button"
            tabIndex={0}
            onClick={() => onSelectFolder(null)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelectFolder(null);
              }
            }}
          >
            <span className="sidebar-directory-left">
              <Icon name="file" size={16} className="sidebar-directory-icon" />
              <span className="folder-label">{t("drive.allNotes")}</span>
            </span>
          </div>

          {tree.length === 0 ? <p className="muted small">{t("folders.empty")}</p> : branch(tree, 0)}

          {adding ? (
            <div className="inline-field">
              <input
                autoFocus
                value={draft}
                placeholder={t("folders.namePlaceholder")}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    void commit();
                  }
                  if (event.key === "Escape") {
                    setAdding(false);
                  }
                }}
              />
              <button type="button" className="primary" onClick={() => void commit()}>
                {t("common.add")}
              </button>
            </div>
          ) : null}
        </section>

        <section className="sidebar-section">
          <div className="section-header">
            <h2 className="sidebar-section-title">{t("notes.categories")}</h2>
          </div>

          {categories.length === 0 ? (
            <p className="muted small">{t("categories.empty")}</p>
          ) : (
            <ul className="category-list">
              {categories.map((category) => (
                <li key={category.id}>
                  <button
                    type="button"
                    className={`category-item${activeCategory === category.name ? " active" : ""}`}
                    title={category.name}
                    onClick={() =>
                      onSelectCategory(activeCategory === category.name ? null : category.name)
                    }
                  >
                    <Icon name="tag" size={14} />
                    <span className="category-item-name">{category.name}</span>
                    <span className="category-item-count">{category.note_count}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="drive-sidebar-footer">
          <button type="button" className="ghost" onClick={onOpenCategories}>
            <Icon name="sparkles" size={14} />
            <span>{t("categories.title")}</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
