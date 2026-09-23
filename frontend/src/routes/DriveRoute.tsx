import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";

import {
  useCreateFolder,
  useCreateNote,
  useDeleteFolder,
  useDeleteNote,
  useUpdateFolder,
  useUpdateNote,
} from "../client/generated";
import type { FolderRead } from "../client/generated/models";
import { FolderGrid } from "../components/drive/FolderGrid";
import { Breadcrumbs } from "../components/drive/Breadcrumbs";
import { EmptyState } from "../components/drive/EmptyState";
import { FileGrid } from "../components/drive/FileGrid";
import { FileTable } from "../components/drive/FileTable";
import { MoveDialog } from "../components/drive/MoveDialog";
import { ViewControls } from "../components/drive/ViewControls";
import { DropdownMenu } from "../components/drive/DropdownMenu";
import { useDialog } from "../components/Dialog";
import { Icon } from "../components/Icon";
import { MobileFAB } from "../components/MobileFAB";
import { useToast } from "../components/Toast";
import { useDriveClipboard } from "../hooks/useDriveClipboard";
import { useEncryptedNotebook } from "../hooks/useEncryptedNotebook";
import { sortNotes, useDriveParams } from "../hooks/useDriveParams";
import { useI18n } from "../i18n";
import { sealFolderName, sealNote } from "../lib/crypto";
import { folderSubtreeIds, folderTrail } from "../lib/folders";
import { matchesQuery } from "../lib/markdown";
import { modKey } from "../lib/platform";
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
  const createFolder = useCreateFolder();
  const updateNote = useUpdateNote();
  const removeNote = useDeleteNote();
  const creatingFolder = createFolder.isPending;

  const [selectedNoteId, setSelectedNoteId] = useState<number | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null);
  const [moveDialog, setMoveDialog] = useState<{
    isOpen: boolean;
    itemTitle: string;
    itemType: "note" | "folder";
    currentFolderId: number | null;
    itemId: number;
    disabledFolderIds?: number[];
  }>({
    isOpen: false,
    itemTitle: "",
    itemType: "note",
    currentFolderId: null,
    itemId: 0,
  });

  const { clipboard, copy, cut, clear: clearClipboard } = useDriveClipboard();
  const createNoteMutation = useCreateNote();
  const encryptedNotebook = useEncryptedNotebook();

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
      defaultValue: folder.name ?? "",
      confirmLabel: t("common.rename"),
      validate: (value) => (value === "" ? t("folders.namePlaceholder") : null),
    });
    if (name === null) {
      return;
    }
    try {
      if (notebook === "encrypted") {
        const key = encryptedNotebook.key;
        if (!key) {
          toast.error(t("toast.failed"));
          return;
        }
        const sealed = await sealFolderName(key, name);
        await renameFolder.mutateAsync({
          folderId: folder.id,
          data: { ciphertext: sealed.ciphertext, iv: sealed.iv },
        });
      } else {
        await renameFolder.mutateAsync({ folderId: folder.id, data: { name } });
      }
      toast.success(t("toast.renamed"));
      await refresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t("toast.failed");
      toast.error(message);
    }
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
    try {
      if (notebook === "encrypted") {
        const key = encryptedNotebook.key;
        if (!key) {
          toast.error(t("toast.failed"));
          return;
        }
        const secret = decrypted[noteId];
        const sealed = await sealNote(key, { title, body: secret?.body ?? "" });
        await updateNote.mutateAsync({
          noteId,
          data: { ciphertext: sealed.ciphertext, iv: sealed.iv },
        });
      } else {
        await updateNote.mutateAsync({ noteId, data: { title } });
      }
      toast.success(t("toast.renamed"));
      await refresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t("toast.failed");
      toast.error(message);
    }
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
      navigate(`/n/${notebook}/notes/${id}?mode=edit`);
    }
  }

  /** Create a subfolder of wherever we are, inside the current folder. */
  async function newFolder() {
    const name = await dialog.prompt({
      title: t("drive.newFolder"),
      label: t("folders.namePlaceholder"),
      confirmLabel: t("common.create"),
      validate: (value) => (value === "" ? t("folders.namePlaceholder") : null),
    });
    if (name === null) {
      return;
    }
    try {
      if (notebook === "encrypted") {
        const key = encryptedNotebook.key;
        if (!key) {
          toast.error(t("toast.failed"));
          return;
        }
        const sealed = await sealFolderName(key, name);
        await createFolder.mutateAsync({
          data: {
            notebook: "encrypted",
            ciphertext: sealed.ciphertext,
            iv: sealed.iv,
            parent_id: folderId,
          },
        });
      } else {
        await createFolder.mutateAsync({
          data: {
            notebook: "plain",
            name,
            parent_id: folderId,
          },
        });
      }
      toast.success(t("toast.folderCreated"));
      // Stay on the folder grid so the new card is visible where it was made.
      await refresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t("toast.failed");
      toast.error(message);
    }
  }

  function openMoveNote(view: { note: { id: number; folder_id: number | null }; secret: { title: string } | null }) {
    const title = view.secret ? view.secret.title : (notes.find((n) => n.id === view.note.id)?.title ?? t("notes.untitled"));
    setMoveDialog({
      isOpen: true,
      itemTitle: title || t("notes.untitled"),
      itemType: "note",
      currentFolderId: view.note.folder_id,
      itemId: view.note.id,
      disabledFolderIds: [],
    });
  }

  function openMoveFolder(folder: FolderRead) {
    const subtree = folderSubtreeIds(folders, folder.id);
    setMoveDialog({
      isOpen: true,
      itemTitle: folder.name ?? t("notes.untitled"),
      itemType: "folder",
      currentFolderId: folder.parent_id ?? null,
      itemId: folder.id,
      disabledFolderIds: subtree,
    });
  }

  async function handleMoveConfirm(targetFolderId: number | null) {
    if (moveDialog.itemType === "note") {
      await updateNote.mutateAsync({
        noteId: moveDialog.itemId,
        data: { folder_id: targetFolderId, move: true },
      });
      toast.success(t("toast.moved"));
      await refresh();
    } else if (moveDialog.itemType === "folder") {
      await renameFolder.mutateAsync({
        folderId: moveDialog.itemId,
        data: { move: true, parent_id: targetFolderId },
      });
      toast.success(t("toast.moved"));
      await refresh();
    }
  }

  const duplicateNote = useCallback(
    async (noteId: number, targetFolderId?: number | null) => {
      const noteToCopy = notes.find((n) => n.id === noteId);
      if (!noteToCopy) {
        toast.error(t("toast.failed"));
        return;
      }
      const destinationFolderId = targetFolderId !== undefined ? targetFolderId : noteToCopy.folder_id;

      if (notebook === "encrypted") {
        const secret = decrypted[noteToCopy.id];
        if (secret && encryptedNotebook.key) {
          const sealed = await sealNote(encryptedNotebook.key, {
            title: `${secret.title} (${t("common.copy")})`,
            body: secret.body,
          });
          await createNoteMutation.mutateAsync({
            data: {
              notebook: "encrypted",
              ciphertext: sealed.ciphertext,
              iv: sealed.iv,
              folder_id: destinationFolderId,
              categories: noteToCopy.categories,
            },
          });
        } else {
          await createNoteMutation.mutateAsync({
            data: {
              notebook: "encrypted",
              ciphertext: noteToCopy.ciphertext,
              iv: noteToCopy.iv,
              folder_id: destinationFolderId,
              categories: noteToCopy.categories,
            },
          });
        }
      } else {
        await createNoteMutation.mutateAsync({
          data: {
            notebook: "plain",
            title: `${noteToCopy.title ?? t("notes.untitled")} (${t("common.copy")})`,
            body: noteToCopy.body ?? "",
            folder_id: destinationFolderId,
            categories: noteToCopy.categories,
          },
        });
      }
      toast.success(t("toast.copiedFile"));
      await refresh();
    },
    [
      notes,
      t,
      notebook,
      decrypted,
      encryptedNotebook.key,
      createNoteMutation,
      refresh,
      toast,
    ],
  );

  const handlePaste = useCallback(
    async (targetId: number | null = selectedFolderId ?? folderId) => {
      if (!clipboard) {
        toast.info(t("toast.clipboardEmpty"));
        return;
      }

      if (clipboard.type === "note") {
        if (clipboard.operation === "cut") {
          const noteToPaste = notes.find((n) => n.id === clipboard.noteId);
          if (!noteToPaste) {
            toast.error(t("toast.failed"));
            clearClipboard();
            return;
          }
          if (noteToPaste.folder_id === targetId) {
            toast.info(t("toast.alreadyInFolder"));
            return;
          }
          await updateNote.mutateAsync({
            noteId: noteToPaste.id,
            data: { folder_id: targetId, move: true },
          });
          clearClipboard();
          toast.success(t("toast.moved"));
          await refresh();
        } else {
          // Copy operation
          await duplicateNote(clipboard.noteId, targetId);
        }
      } else if (clipboard.type === "folder") {
        const folderToMove = folders.find((f) => f.id === clipboard.folderId);
        if (!folderToMove) {
          toast.error(t("toast.failed"));
          clearClipboard();
          return;
        }

        const subtree = folderSubtreeIds(folders, folderToMove.id);
        if (targetId !== null && subtree.includes(targetId)) {
          toast.error(t("folders.cannotMoveInsideSelf"));
          return;
        }

        if (folderToMove.parent_id === targetId) {
          toast.info(t("toast.alreadyInFolder"));
          return;
        }

        await renameFolder.mutateAsync({
          folderId: folderToMove.id,
          data: { move: true, parent_id: targetId },
        });
        clearClipboard();
        toast.success(t("toast.moved"));
        await refresh();
      }
    },
    [
      clipboard,
      selectedFolderId,
      folderId,
      notes,
      folders,
      toast,
      t,
      clearClipboard,
      updateNote,
      renameFolder,
      refresh,
      duplicateNote,
    ],
  );

function isInputOrModalActive(event: KeyboardEvent, isMoveDialogOpen: boolean): boolean {
  try {
    if (isMoveDialogOpen) {
      return true;
    }

    const target = event.target as HTMLElement | null;
    const active = typeof document !== "undefined" ? (document.activeElement as HTMLElement | null) : null;

    for (const el of [target, active]) {
      if (!el || typeof el.closest !== "function") continue;

      const tag = el.tagName?.toUpperCase();
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
        return true;
      }

      if (el.isContentEditable || el.getAttribute("contenteditable") === "true") {
        return true;
      }

      if (
        el.closest(
          "input, textarea, select, [contenteditable='true'], [role='textbox'], [role='searchbox'], .drive-search-box, .modal-overlay, .move-dialog-backdrop, .dialog-input-wrapper, .header-title-wrapper",
        )
      ) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

  useEffect(() => {
    setSelectedNoteId(null);
    setSelectedFolderId(null);
  }, [folderId]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isInputOrModalActive(event, moveDialog.isOpen)) {
        return;
      }

      const isMod = event.ctrlKey || event.metaKey;
      const key = event.key ? event.key.toLowerCase() : "";
      const code = event.code;

      const isX = isMod && (key === "x" || code === "KeyX");
      const isC = isMod && (key === "c" || code === "KeyC");
      const isV = isMod && (key === "v" || code === "KeyV");

      // Ctrl + C: Copy
      if (isC) {
        event.preventDefault();
        if (selectedNoteId !== null) {
          copy(selectedNoteId);
          toast.success(t("toast.copied").replace("Ctrl+V", `${modKey}V`));
        } else if (selectedFolderId !== null) {
          toast.info(t("toast.cannotCopyFolder"));
        } else {
          toast.info(t("toast.selectItemFirst"));
        }
      }
      // Ctrl + X: Cut
      else if (isX) {
        event.preventDefault();
        if (selectedNoteId !== null) {
          cut(selectedNoteId);
          toast.success(t("toast.cut"));
        } else if (selectedFolderId !== null) {
          cut(selectedFolderId, "folder");
          toast.success(t("toast.cut"));
        } else {
          toast.info(t("toast.selectItemFirst"));
        }
      }
      // Ctrl + V: Paste
      else if (isV) {
        event.preventDefault();
        void handlePaste();
      }
      // Enter: open selected item
      else if (event.key === "Enter") {
        if (selectedNoteId !== null) {
          event.preventDefault();
          navigate(`/n/${notebook}/notes/${selectedNoteId}`);
        } else if (selectedFolderId !== null) {
          event.preventDefault();
          setFolder(selectedFolderId);
          setSelectedFolderId(null);
        }
      }
      // Escape: deselect and cancel cut/copy
      else if (event.key === "Escape") {
        if (clipboard) {
          clearClipboard();
        }
        setSelectedNoteId(null);
        setSelectedFolderId(null);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [
    selectedNoteId,
    selectedFolderId,
    clipboard,
    copy,
    cut,
    clearClipboard,
    handlePaste,
    navigate,
    notebook,
    setFolder,
    t,
    toast,
    moveDialog.isOpen,
  ]);

  const crumbs = [
    { label: t("drive.rootCrumb"), onClick: () => setFolder(null) },
    ...(category !== null
      ? [{ label: `${t("drive.categoryCrumb")}: ${category}`, onClick: () => setCategory(null) }]
      : []),
    ...trail.map((folder) => ({
      label: folder.name ?? t("notes.untitled"),
      onClick: () => setFolder(folder.id),
    })),
  ];

  return (
    <div
      className="drive-content"
      onClick={(e) => {
        if (
          e.target === e.currentTarget ||
          (e.target as HTMLElement).classList.contains("drive-sections-container")
        ) {
          setSelectedNoteId(null);
          setSelectedFolderId(null);
        }
      }}
    >
      <div className="drive-canvas-header">
        <div className="drive-breadcrumb-row">
          <Breadcrumbs trail={crumbs} />

          {currentFolder ? (
            <DropdownMenu
              label={t("drive.openMenu")}
              items={[
                {
                  label: t("drive.rename"),
                  icon: <Icon name="edit" size={14} />,
                  onSelect: () => void renameFolderTo(currentFolder),
                },
                {
                  label: t("drive.move"),
                  icon: <Icon name="move" size={14} />,
                  onSelect: () => openMoveFolder(currentFolder),
                },
                {
                  label: t("drive.cut"),
                  icon: <Icon name="scissors" size={14} />,
                  shortcut: `${modKey}X`,
                  onSelect: () => {
                    cut(currentFolder.id, "folder");
                    toast.success(t("toast.cut"));
                  },
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
          {clipboard ? (
            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              <button
                type="button"
                className="ghost compact-btn"
                title={`${t("drive.paste")} (${modKey}V)`}
                onClick={() => void handlePaste()}
              >
                <Icon name="clipboard" size={14} />
                <span>{t("drive.paste")}</span>
              </button>
              <button
                type="button"
                className="ghost compact-btn"
                title={`${t("common.cancel")} (Esc)`}
                onClick={() => clearClipboard()}
              >
                <Icon name="close" size={14} />
                <span>{t("common.cancel")}</span>
              </button>
            </div>
          ) : null}
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
          body={searched ? t("drive.noResults") : t("drive.emptyBody")}
        >
          {searched ? null : (
            <div style={{ display: "flex", gap: "8px" }}>
              <button type="button" className="primary" onClick={() => void newNote()} disabled={creating}>
                <Icon name="plus" size={14} />
                <span>{t("notes.newNote")}</span>
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => void newFolder()}
                disabled={creatingFolder}
              >
                <Icon name="folder" size={14} />
                <span>{t("drive.newFolder")}</span>
              </button>
            </div>
          )}
        </EmptyState>
      ) : (
        <div className="drive-sections-container">
          {visibleFolders.length > 0 ? (
            <section className="drive-section">
              <div className="drive-section-header">
                <h3 className="drive-section-title">{t("drive.folders")}</h3>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => void newFolder()}
                  disabled={creatingFolder}
                >
                  <Icon name="plus" size={14} />
                  <span>{t("drive.newFolder")}</span>
                </button>
              </div>
              <FolderGrid
                folders={visibleFolders}
                notes={notes}
                selectedFolderId={selectedFolderId}
                cutFolderId={
                  clipboard?.type === "folder" && clipboard.operation === "cut"
                    ? clipboard.folderId
                    : null
                }
                onSelect={(id) => {
                  setSelectedFolderId(id);
                  setSelectedNoteId(null);
                }}
                onOpen={(id) => {
                  setFolder(id);
                  setSelectedFolderId(null);
                }}
                onMove={(folder) => openMoveFolder(folder)}
                onCut={(folder) => {
                  cut(folder.id, "folder");
                  toast.success(t("toast.cut"));
                }}
                onRename={(folder) => void renameFolderTo(folder)}
                onDelete={(folder) => void deleteFolder(folder)}
              />
            </section>
          ) : null}

          {views.length > 0 ? (
            <section className="drive-section">
              <div className="drive-section-header">
                <h3 className="drive-section-title">{t("drive.sectionFiles")}</h3>
                {visibleFolders.length === 0 ? (
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => void newFolder()}
                    disabled={creatingFolder}
                  >
                    <Icon name="plus" size={14} />
                    <span>{t("drive.newFolder")}</span>
                  </button>
                ) : null}
              </div>
              {drive.view === "grid" ? (
                <FileGrid
                  notes={views}
                  selectedNoteId={selectedNoteId}
                  cutNoteId={
                    clipboard?.type === "note" && clipboard.operation === "cut"
                      ? clipboard.noteId
                      : null
                  }
                  onSelect={(id) => {
                    setSelectedNoteId(id);
                    setSelectedFolderId(null);
                  }}
                  onOpen={(id) => navigate(`/n/${notebook}/notes/${id}`)}
                  onRename={(view) => void renameNoteFrom(view)}
                  onMove={(view) => openMoveNote(view)}
                  onMakeCopy={(view) => void duplicateNote(view.note.id)}
                  onCopy={(view) => {
                    copy(view.note.id);
                    toast.success(t("toast.copied"));
                  }}
                  onCut={(view) => {
                    cut(view.note.id);
                    toast.success(t("toast.cut"));
                  }}
                  onDelete={(view) => void deleteNote(view.note.id)}
                />
              ) : (
                <FileTable
                  notes={views}
                  folders={folders}
                  selectedNoteId={selectedNoteId}
                  cutNoteId={
                    clipboard?.type === "note" && clipboard.operation === "cut"
                      ? clipboard.noteId
                      : null
                  }
                  onSelect={(id) => {
                    setSelectedNoteId(id);
                    setSelectedFolderId(null);
                  }}
                  onOpen={(id) => navigate(`/n/${notebook}/notes/${id}`)}
                  onRename={(view) => void renameNoteFrom(view)}
                  onMove={(view) => openMoveNote(view)}
                  onMakeCopy={(view) => void duplicateNote(view.note.id)}
                  onCopy={(view) => {
                    copy(view.note.id);
                    toast.success(t("toast.copied"));
                  }}
                  onCut={(view) => {
                    cut(view.note.id);
                    toast.success(t("toast.cut"));
                  }}
                  onDelete={(view) => void deleteNote(view.note.id)}
                />
              )}
            </section>
          ) : null}
        </div>
      )}

      <MoveDialog
        isOpen={moveDialog.isOpen}
        itemTitle={moveDialog.itemTitle}
        itemType={moveDialog.itemType}
        currentFolderId={moveDialog.currentFolderId}
        folders={folders}
        disabledFolderIds={moveDialog.disabledFolderIds}
        onClose={() => setMoveDialog((prev) => ({ ...prev, isOpen: false }))}
        onMove={(targetFolderId) => void handleMoveConfirm(targetFolderId)}
      />

      <MobileFAB onClick={() => void newNote()} disabled={creating} />
    </div>
  );
}
