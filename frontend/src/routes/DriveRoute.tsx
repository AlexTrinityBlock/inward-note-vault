import { useMemo } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";

import { useDeleteFolder, useDeleteNote, useUpdateFolder, useUpdateNote } from "../client/generated";
import type { FolderRead } from "../client/generated/models";
import { FolderGrid } from "../components/drive/FolderGrid";
import { Breadcrumbs } from "../components/drive/Breadcrumbs";
import { EmptyState } from "../components/drive/EmptyState";
import { FileGrid } from "../components/drive/FileGrid";
import { FileTable } from "../components/drive/FileTable";
import { ViewControls } from "../components/drive/ViewControls";
import { DropdownMenu } from "../components/drive/DropdownMenu";
import { useDialog } from "../components/Dialog";
import { Icon } from "../components/Icon";
import { MobileFAB } from "../components/MobileFAB";
import { useToast } from "../components/Toast";
import { sortNotes, useDriveParams } from "../hooks/useDriveParams";
import { useI18n } from "../i18n";
import { folderSubtreeIds, folderTrail } from "../lib/folders";
import { matchesQuery } from "../lib/markdown";
import type { DriveOutletContext } from "./DriveLayout";

/**
 * Tier two: browsing a notebook.
 *
 * One screen answers two questions the old three-column layout kept apart — what
 * is in this folder, and which folder do I want. Folders are cards on the
 * canvas, the directory is in the sidebar, and the notes are either preview
 * cards or a table.
 */
export function DriveRoute() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const dialog = useDialog();
  const toast = useToast();
  const drive = useDriveParams();
  const {
    notebook,
    folders,
    notes,
    decrypted,
    loading,
    search,
    searchInBrowser,
    folderId,
    setFolder,
    category,
    setCategory,
    createNote,
    creating,
    refresh,
  } = useOutletContext<DriveOutletContext>();

  const renameFolder = useUpdateFolder();
  const removeFolder = useDeleteFolder();
  const updateNote = useUpdateNote();
  const removeNote = useDeleteNote();

  /** The folder chain from the root down, for the breadcrumbs. */
  const trail = useMemo(
    () => (folderId === null ? [] : folderTrail(folders, folderId)),
    [folders, folderId],
  );

  const currentFolder = folderId === null ? null : (folders.find((f) => f.id === folderId) ?? null);

  /**
   * Which folders appear on the canvas: the children of the current folder, or
   * the roots when the drive is at the top level.
   */
  const visibleFolders = useMemo(
    () => folders.filter((folder) => folder.parent_id === folderId),
    [folders, folderId],
  );

  /**
   * Which notes appear: everything in the current folder's subtree, or the
   * notes with no folder when at the root.
   *
   * The encrypted notebook is searched here rather than by the server, which
   * only ever holds ciphertext. A note that has not been decrypted cannot match
   * anything, which is the honest answer — nothing about its text is known.
   */
  const visibleNotes = useMemo(() => {
    const inFolder =
      folderId === null
        ? notes.filter((note) => note.folder_id === null)
        : (() => {
            const subtree = new Set(folderSubtreeIds(folders, folderId));
            return notes.filter((note) => note.folder_id !== null && subtree.has(note.folder_id));
          })();

    if (!searchInBrowser || search.trim() === "") {
      return inFolder;
    }
    return inFolder.filter((note) => {
      const secret = decrypted[note.id];
      return secret ? matchesQuery(search, secret) : false;
    });
  }, [notes, folderId, folders, searchInBrowser, search, decrypted]);

  const orderedNotes = useMemo(() => sortNotes(visibleNotes, drive.sort), [visibleNotes, drive.sort]);

  const views = useMemo(
    () => orderedNotes.map((note) => ({ note, secret: decrypted[note.id] ?? null })),
    [orderedNotes, decrypted],
  );

  const searched = search.trim() !== "";
  const isEmpty = visibleFolders.length === 0 && views.length === 0;

  async function renameFolderTo(folder: FolderRead) {
    const name = await dialog.prompt({
      title: t("drive.renameFolder"),
      defaultValue: folder.name,
      confirmLabel: t("common.rename"),
      validate: (value) => (value === "" ? t("folders.namePlaceholder") : null),
    });
    if (name === null) {
      return;
    }
    await renameFolder.mutateAsync({ folderId: folder.id, data: { name } });
    toast.success(t("toast.renamed"));
    await refresh();
  }

  async function renameNoteTo(noteId: number, suggestion: string) {
    const title = await dialog.prompt({
      title: t("drive.renameNote"),
      defaultValue: suggestion,
      confirmLabel: t("common.rename"),
    });
    if (title === null || title === "") {
      return;
    }
    await updateNote.mutateAsync({ noteId, data: { title } });
    toast.success(t("toast.renamed"));
    await refresh();
  }

  async function deleteFolder(folder: FolderRead) {
    const ok = await dialog.confirm({
      message: t("drive.deleteFolderConfirm"),
      confirmLabel: t("common.delete"),
      danger: true,
    });
    if (!ok) {
      return;
    }
    await removeFolder.mutateAsync({ folderId: folder.id });
    if (folderId === folder.id) {
      setFolder(null);
    }
    toast.success(t("toast.deleted"));
    await refresh();
  }

  async function deleteNote(noteId: number) {
    const ok = await dialog.confirm({
      message: t("notes.deleteConfirm"),
      confirmLabel: t("common.delete"),
      danger: true,
    });
    if (!ok) {
      return;
    }
    await removeNote.mutateAsync({ noteId });
    toast.success(t("toast.deleted"));
    await refresh();
  }

  async function renameNoteFrom(view: { note: { id: number }; secret: { title: string } | null }) {
    const suggestion = view.secret?.title ?? t("notes.untitled");
    await renameNoteTo(view.note.id, suggestion);
  }

  async function newNote() {
    const id = await createNote(folderId);
    if (id !== null) {
      navigate(`/n/${notebook}/notes/${id}`);
    }
  }

  const crumbs = [
    { label: t("drive.rootCrumb"), onClick: () => setFolder(null) },
    ...(category !== null
      ? [{ label: `${t("drive.categoryCrumb")}: ${category}`, onClick: () => setCategory(null) }]
      : []),
    ...trail.map((folder) => ({
      label: folder.name,
      onClick: () => setFolder(folder.id),
    })),
  ];
  // A trailing "/ Folders" would read oddly on its own, so the root crumb alone
  // stands in for the top level.
  if (trail.length === 0 && category === null) {
    crumbs.push({ label: t("drive.foldersCrumb"), onClick: () => setFolder(null) });
  }

  return (
    <div className="drive-content">
      <div className="drive-canvas-header">
        <div className="drive-breadcrumb-row">
          <Breadcrumbs trail={crumbs} />

          {currentFolder ? (
            <DropdownMenu
              label={t("drive.openMenu")}
              items={[
                {
                  label: t("drive.renameFolder"),
                  icon: <Icon name="edit" size={14} />,
                  onSelect: () => void renameFolderTo(currentFolder),
                },
                {
                  label: t("drive.deleteFolder"),
                  icon: <Icon name="trash" size={14} />,
                  danger: true,
                  onSelect: () => void deleteFolder(currentFolder),
                },
              ]}
            />
          ) : null}
        </div>

        <div className="drive-canvas-header-right">
          <span className="drive-canvas-stats">
            {visibleFolders.length} {t("drive.statFolders")} • {views.length} {t("drive.statFiles")}
          </span>
          <ViewControls
            sort={drive.sort}
            view={drive.view}
            onSortChange={drive.setSort}
            onViewChange={drive.setView}
          />
        </div>
      </div>

      {category !== null ? (
        <p className="drive-filter-note">
          {t("notes.filterByCategory")}: <strong>{category}</strong>{" "}
          <button type="button" className="link" onClick={() => setCategory(null)}>
            {t("notes.clearFilter")}
          </button>
        </p>
      ) : null}

      {loading ? (
        <p className="muted">{t("common.loading")}</p>
      ) : isEmpty ? (
        <EmptyState
          icon={searched ? "search" : "folder"}
          title={searched ? t("drive.noResults") : t("drive.emptyTitle")}
          body={
            searched
              ? searchInBrowser
                ? t("drive.searchEncryptedHint")
                : t("drive.searchPlainHint")
              : t("drive.emptyBody")
          }
        >
          {searched ? null : (
            <>
              <button type="button" className="primary" onClick={() => void newNote()} disabled={creating}>
                <Icon name="plus" size={14} />
                <span>{t("notes.newNote")}</span>
              </button>
            </>
          )}
        </EmptyState>
      ) : (
        <div className="drive-sections-container">
          {visibleFolders.length > 0 ? (
            <section className="drive-section">
              <div className="drive-section-header">
                <h3 className="drive-section-title">{t("drive.folders")}</h3>
              </div>
              <FolderGrid
                folders={visibleFolders}
                notes={notes}
                onOpen={setFolder}
                onRename={(folder) => void renameFolderTo(folder)}
                onDelete={(folder) => void deleteFolder(folder)}
              />
            </section>
          ) : null}

          {views.length > 0 ? (
            <section className="drive-section">
              <div className="drive-section-header">
                <h3 className="drive-section-title">{t("drive.sectionFiles")}</h3>
              </div>
              {drive.view === "grid" ? (
                <FileGrid
                  notes={views}
                  onOpen={(id) => navigate(`/n/${notebook}/notes/${id}`)}
                  onRename={(view) => void renameNoteFrom(view)}
                  onDelete={(view) => void deleteNote(view.note.id)}
                />
              ) : (
                <FileTable
                  notes={views}
                  folders={folders}
                  onOpen={(id) => navigate(`/n/${notebook}/notes/${id}`)}
                  onRename={(view) => void renameNoteFrom(view)}
                  onDelete={(view) => void deleteNote(view.note.id)}
                />
              )}
            </section>
          ) : null}
        </div>
      )}

      <MobileFAB onClick={() => void newNote()} disabled={creating} />
    </div>
  );
}
