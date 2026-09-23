import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useOutletContext, useParams, useSearchParams } from "react-router-dom";

import { useDeleteNote, useUpdateNote } from "../client/generated";
import { CategoryPicker } from "../components/CategoryPicker";
import { ClassifyPanel } from "../components/ClassifyPanel";
import { Breadcrumbs } from "../components/drive/Breadcrumbs";
import { MoveDialog } from "../components/drive/MoveDialog";
import { useDialog } from "../components/Dialog";
import { EditorHeader } from "../components/EditorHeader";
import { EditorPanes } from "../components/EditorPanes";
import type { SaveState } from "../components/StatusPill";
import { useToast } from "../components/Toast";
import { useEditMode } from "../hooks/useEditMode";
import { useClearStartInEdit, START_IN_EDIT } from "../hooks/useDriveParams";
import { useEncryptedNotebook } from "../hooks/useEncryptedNotebook";
import { useI18n } from "../i18n";
import { sealNote } from "../lib/crypto";
import { folderTrail } from "../lib/folders";
import type { DriveOutletContext } from "./DriveLayout";

/**
 * Tier three: one note, on its own page.
 *
 * The editor used to be the right-hand third of the workspace, permanently
 * split, with the note list squeezed beside it. Here the note has the canvas to
 * itself, and the one thing that still matters in the background — which folder
 * it lives in — is answered by the breadcrumb.
 *
 * Entering edit mode asks for confirmation once per note per visit; that rule
 * lives in `useEditMode`.
 */
export function NoteRoute() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const dialog = useDialog();
  const toast = useToast();
  const { noteId: rawNoteId } = useParams<{ noteId: string }>();
  const noteId = Number(rawNoteId);

  const { notebook, folders, categories, notes, decrypted, refresh, toggleSidebar } =
    useOutletContext<DriveOutletContext>();
  const encryptedNotebook = useEncryptedNotebook();

  const note = useMemo(() => notes.find((item) => item.id === noteId) ?? null, [notes, noteId]);
  const secret = decrypted[noteId] ?? null;

  const updateNote = useUpdateNote();
  const removeNote = useDeleteNote();

  // A note created from the drive arrives already in edit mode; the flag travels
  // in the URL so reloading does not silently drop the reader into read mode.
  const [searchParams] = useSearchParams();
  const startInEdit = searchParams.get("mode") === START_IN_EDIT;
  const editMode = useEditMode(noteId, startInEdit);
  useClearStartInEdit(editMode.editing);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [noteFolderId, setNoteFolderId] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [classifyOpen, setClassifyOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const loadedNoteId = useRef<number | null>(null);

  // When switching notes, reset loadedNoteId and dirty state
  useEffect(() => {
    if (loadedNoteId.current !== noteId) {
      loadedNoteId.current = null;
      setDirty(false);
      setSaveState("saved");
    }
  }, [noteId]);

  // Initial load of note content into local editor state.
  // Once loaded for a noteId, local title and body state are authoritative
  // and must never be overwritten by background syncs or save completions.
  useEffect(() => {
    if (!note || loadedNoteId.current === noteId || dirty) {
      return;
    }
    if (note.notebook === "encrypted" && !secret) {
      return;
    }
    loadedNoteId.current = noteId;
    setTitle(secret ? secret.title : (note.title ?? ""));
    setBody(secret ? secret.body : (note.body ?? ""));
    setSelected(note.categories ?? []);
    setNoteFolderId(note.folder_id);
    setSaveState("saved");
  }, [note, secret, noteId, dirty]);

  // Synchronize folder_id and categories if changed by MoveDialog or Classify
  useEffect(() => {
    if (!note || loadedNoteId.current !== noteId) {
      return;
    }
    setSelected(note.categories ?? []);
    setNoteFolderId(note.folder_id);
  }, [note?.folder_id, note?.categories, noteId]);

  const key = encryptedNotebook.key;

  const save = useCallback(async () => {
    if (!note) {
      return;
    }
    setSaveState("saving");
    try {
      if (note.notebook === "encrypted") {
        if (!key) {
          setSaveState("failed");
          toast.error(t("toast.failed"));
          return;
        }
        const sealed = await sealNote(key, { title, body });
        await updateNote.mutateAsync({
          noteId: note.id,
          data: {
            ciphertext: sealed.ciphertext,
            iv: sealed.iv,
            folder_id: noteFolderId,
            move: true,
            categories: selected,
          },
        });
      } else {
        await updateNote.mutateAsync({
          noteId: note.id,
          data: {
            title,
            body,
            folder_id: noteFolderId,
            move: true,
            categories: selected,
          },
        });
      }
      setDirty(false);
      setSaveState("saved");
      toast.success(t("toast.saved"));
      await refresh();
    } catch {
      setSaveState("failed");
      toast.error(t("toast.failed"));
    }
  }, [body, key, note, noteFolderId, refresh, selected, t, title, toast, updateNote]);

  // Shortcut: Ctrl/Cmd + S to save in editor
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const isMod = event.metaKey || event.ctrlKey;
      const key = event.key ? event.key.toLowerCase() : "";
      const code = event.code;

      if (isMod && (key === "s" || code === "KeyS")) {
        event.preventDefault();
        if (editMode.editing) {
          void save();
        }
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [editMode.editing, save]);

  function markDirty() {
    setDirty(true);
    setSaveState("unsaved");
  }

  if (!note) {
    return (
      <div className="drive-content">
        <p className="muted">{t("notes.selectPrompt")}</p>
      </div>
    );
  }

  const trail = folderTrail(folders, noteFolderId ?? -1);
  const displayTitle = title.trim() === "" ? t("notes.untitled") : title;

  return (
    <div className="workspace-container">
      <EditorHeader
        title={title}
        onTitleChange={(next) => {
          setTitle(next);
          markDirty();
        }}
        onBack={() => navigate(`/n/${notebook}`)}
        editing={editMode.editing}
        onRequestEdit={() => void editMode.requestEnterEditMode()}
        onToggleEdit={editMode.exitEditMode}
        onSave={() => void save()}
        onClassify={() => setClassifyOpen(true)}
        onMove={() => setMoveOpen(true)}
        onDelete={() => {
          void dialog
            .confirm({
              message: t("notes.deleteConfirm"),
              confirmLabel: t("common.delete"),
              danger: true,
            })
            .then(async (ok) => {
              if (!ok) {
                return;
              }
              await removeNote.mutateAsync({ noteId: note.id });
              toast.success(t("toast.deleted"));
              await refresh();
              navigate(`/n/${notebook}`);
            });
        }}
        saveState={saveState}
        saving={updateNote.isPending}
        mobileMode={editMode.mobileMode}
        onMobileModeChange={editMode.setMobileMode}
        onToggleSidebar={toggleSidebar}
        notebook={note.notebook as "plain" | "encrypted"}
      />

      <div className="drive-canvas-header note-canvas-header">
        <Breadcrumbs
          trail={[
            { label: t("drive.rootCrumb"), onClick: () => navigate(`/n/${notebook}`) },
            ...trail.map((folder) => ({
              label: folder.name ?? t("notes.untitled"),
              onClick: () => navigate(`/n/${notebook}/folders/${folder.id}`),
            })),
            { label: displayTitle },
          ]}
        />
      </div>

      <EditorPanes
        body={body}
        onBodyChange={(next) => {
          setBody(next);
          markDirty();
        }}
        editing={editMode.editing}
        mobileMode={editMode.mobileMode}
        textareaRef={textareaRef}
      />

      <div className="editor-meta-bar">
        <CategoryPicker
          categories={selected}
          suggestions={categories.map((category) => category.name)}
          onChange={(next) => {
            setSelected(next);
            markDirty();
          }}
          disabled={!editMode.editing}
        />
      </div>

      {classifyOpen ? (
        <ClassifyPanel
          note={note}
          secret={secret}
          knownCategoryCount={categories.length}
          onApply={async (choice) => {
            await updateNote.mutateAsync({
              noteId: note.id,
              data: {
                categories: choice.categories,
                folder_id: choice.folderId,
                move: choice.move,
              },
            });
            await refresh();
          }}
          onClose={() => setClassifyOpen(false)}
        />
      ) : null}

      <MoveDialog
        isOpen={moveOpen}
        itemTitle={displayTitle}
        itemType="note"
        currentFolderId={noteFolderId}
        folders={folders}
        onClose={() => setMoveOpen(false)}
        onMove={async (targetFolderId) => {
          await updateNote.mutateAsync({
            noteId: note.id,
            data: { folder_id: targetFolderId, move: true },
          });
          setNoteFolderId(targetFolderId);
          toast.success(t("toast.moved"));
          await refresh();
        }}
      />
    </div>
  );
}
