import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useOutletContext, useParams, useSearchParams } from "react-router-dom";

import { useDeleteNote, useGetSettings, useUpdateNote } from "../client/generated";
import { CategoryPicker } from "../components/CategoryPicker";
import { ClassifyPanel } from "../components/ClassifyPanel";
import { Breadcrumbs } from "../components/drive/Breadcrumbs";
import { useDialog } from "../components/Dialog";
import { EditorFooter } from "../components/EditorFooter";
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

  const { notebook, folders, categories, notes, decrypted, refresh } =
    useOutletContext<DriveOutletContext>();
  const encryptedNotebook = useEncryptedNotebook();

  const note = useMemo(() => notes.find((item) => item.id === noteId) ?? null, [notes, noteId]);
  const secret = decrypted[noteId] ?? null;

  const updateNote = useUpdateNote();
  const removeNote = useDeleteNote();
  const settings = useGetSettings();

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
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  /** Notes already offered to Jev automatically, so a save never re-asks. */
  const autoClassified = useRef<Set<number>>(new Set());

  const serverVersion = note?.updated_at ?? "";
  const loadedVersion = useRef<string>("");

  // Re-sync with the server when the note changed behind our back — applying
  // Jev's suggestions, for instance. The `dirty` guard keeps an in-progress
  // draft from being overwritten underneath the reader.
  useEffect(() => {
    if (!note || dirty || loadedVersion.current === serverVersion) {
      return;
    }
    loadedVersion.current = serverVersion;
    setTitle(secret ? secret.title : (note.title ?? ""));
    setBody(secret ? secret.body : (note.body ?? ""));
    setSelected(note.categories ?? []);
    setNoteFolderId(note.folder_id);
    setSaveState("saved");
  }, [note, secret, serverVersion, dirty]);

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
      await refresh();

      // Auto-classify runs once per note, and only once there is something to
      // read: an empty note would spend a request on nothing.
      if (settings.data?.auto_classify_enabled && body.trim() !== "" && !autoClassified.current.has(note.id)) {
        autoClassified.current.add(note.id);
        setClassifyOpen(true);
      }
    } catch {
      setSaveState("failed");
    }
  }, [body, key, note, noteFolderId, refresh, selected, settings.data?.auto_classify_enabled, title, updateNote]);

  // Ctrl/Cmd + S, the shortcut the footer advertises.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
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
      />

      <div className="drive-canvas-header note-canvas-header">
        <Breadcrumbs
          trail={[
            { label: t("drive.rootCrumb"), onClick: () => navigate(`/n/${notebook}`) },
            ...trail.map((folder) => ({
              label: folder.name,
              onClick: () => navigate(`/n/${notebook}?folder=${folder.id}`),
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
        />

        <label className="editor-folder-select">
          <span>{t("editor.folderLabel")}</span>
          <select
            value={noteFolderId ?? ""}
            disabled={!editMode.editing}
            onChange={(event) => {
              setNoteFolderId(event.target.value === "" ? null : Number(event.target.value));
              markDirty();
            }}
          >
            <option value="">{t("notes.noFolder")}</option>
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.path}
              </option>
            ))}
          </select>
        </label>
      </div>

      <EditorFooter body={body} categories={selected} />

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
            loadedVersion.current = "";
            await refresh();
          }}
          onClose={() => setClassifyOpen(false)}
        />
      ) : null}
    </div>
  );
}
