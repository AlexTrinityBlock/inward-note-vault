import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";

import {
  useCreateFolder,
  useCreateNote,
  useDeleteFolder,
  useDeleteNote,
  useGetSettings,
  useListFolders,
  useListNotes,
  useListTags,
  useUpdateNote,
} from "../client/generated";
import type { NoteCreate, NoteRead } from "../client/generated/models";
import { ClassifyPanel } from "../components/ClassifyPanel";
import { FolderTree } from "../components/FolderTree";
import { NoteEditor, type NoteSavePayload } from "../components/NoteEditor";
import { NoteList } from "../components/NoteList";
import { UnlockDialog } from "../components/UnlockDialog";
import { useDecryptedNotes } from "../hooks/useDecryptedNotes";
import { useEncryptedNotebook } from "../hooks/useEncryptedNotebook";
import { useI18n } from "../i18n";
import { sealNote, type NoteSecret } from "../lib/crypto";
import { folderSubtreeIds } from "../lib/folders";

type Notebook = "plain" | "encrypted";

/** The workspace: folders on the left, the note list, and the split editor. */
export function VaultRoute() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const notebook = useEncryptedNotebook();

  const settings = useGetSettings();
  const foldersQuery = useListFolders();
  const tagsQuery = useListTags();

  const [tab, setTab] = useState<Notebook>("plain");
  const [folderId, setFolderId] = useState<number | null>(null);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [classifyId, setClassifyId] = useState<number | null>(null);
  const [unlockMode, setUnlockMode] = useState<"create" | "unlock">("unlock");
  const [showUnlock, setShowUnlock] = useState(false);
  // Notes already offered to Jev automatically, so a save never re-asks.
  const autoClassified = useRef<Set<number>>(new Set());

  const notesQuery = useListNotes({
    notebook: tab,
    tag: tagFilter ?? undefined,
    q: search.trim() === "" ? undefined : search.trim(),
  });

  const folders = foldersQuery.data ?? [];
  const tags = tagsQuery.data ?? [];

  const notes = useMemo(() => {
    const all = notesQuery.data ?? [];
    if (folderId === null) {
      return all;
    }
    const subtree = new Set(folderSubtreeIds(folders, folderId));
    return all.filter((note) => note.folder_id !== null && subtree.has(note.folder_id));
  }, [notesQuery.data, folderId, folders]);

  const decrypted = useDecryptedNotes(notes, notebook.key);
  const selected: NoteRead | null = notes.find((note) => note.id === selectedId) ?? null;
  const classifyNote = notes.find((note) => note.id === classifyId) ?? null;

  const createNote = useCreateNote();
  const updateNote = useUpdateNote();
  const removeNote = useDeleteNote();
  const createFolder = useCreateFolder();
  const removeFolder = useDeleteFolder();

  const locked = tab === "encrypted" && !notebook.unlocked;

  async function refresh() {
    await queryClient.invalidateQueries();
  }

  function askToUnlock() {
    setUnlockMode(notebook.profile ? "unlock" : "create");
    setShowUnlock(true);
  }

  async function addNote() {
    if (tab === "encrypted") {
      if (!notebook.unlocked || !notebook.key) {
        askToUnlock();
        return;
      }
      const sealed = await sealNote(notebook.key, { title: "", body: "" });
      const payload: NoteCreate = {
        notebook: "encrypted",
        ciphertext: sealed.ciphertext,
        iv: sealed.iv,
        folder_id: folderId,
      };
      const created = await createNote.mutateAsync({ data: payload });
      await refresh();
      setSelectedId(created.id);
      return;
    }

    const created = await createNote.mutateAsync({
      data: { notebook: "plain", title: t("notes.untitled"), body: "", folder_id: folderId },
    });
    await refresh();
    setSelectedId(created.id);
  }

  async function saveNote(note: NoteRead, payload: NoteSavePayload) {
    const secret: NoteSecret = { title: payload.title ?? "", body: payload.body ?? "" };

    if (note.notebook === "encrypted") {
      if (!notebook.key) {
        askToUnlock();
        return;
      }
      const sealed = await sealNote(notebook.key, secret);
      await updateNote.mutateAsync({
        noteId: note.id,
        data: {
          ciphertext: sealed.ciphertext,
          iv: sealed.iv,
          folder_id: payload.folder_id ?? null,
          move: payload.move ?? false,
          tags: payload.tags,
        },
      });
    } else {
      await updateNote.mutateAsync({
        noteId: note.id,
        data: {
          title: secret.title,
          body: secret.body,
          folder_id: payload.folder_id ?? null,
          move: payload.move ?? false,
          tags: payload.tags,
        },
      });
    }
    await refresh();

    // Auto-classify runs once per note, and only once there is something to
    // read: an empty note would spend a request on nothing.
    if (
      settings.data?.auto_classify_enabled &&
      secret.body.trim() !== "" &&
      !autoClassified.current.has(note.id)
    ) {
      autoClassified.current.add(note.id);
      setClassifyId(note.id);
    }
  }

  async function applySuggestions(
    note: NoteRead,
    choice: { folderId: number | null; move: boolean; tags: string[] },
  ) {
    await updateNote.mutateAsync({
      noteId: note.id,
      data: {
        tags: choice.tags,
        folder_id: choice.folderId,
        move: choice.move,
      },
    });
    await refresh();
  }

  return (
    <div className="workspace">
      <div className="tabs">
        <button
          type="button"
          className={tab === "plain" ? "active" : ""}
          onClick={() => {
            setTab("plain");
            setSelectedId(null);
            setClassifyId(null);
          }}
        >
          {t("notes.plainNotebook")}
        </button>
        <button
          type="button"
          className={tab === "encrypted" ? "active" : ""}
          onClick={() => {
            setTab("encrypted");
            setSelectedId(null);
            setClassifyId(null);
          }}
        >
          🔒 {t("notes.encryptedNotebook")}
        </button>
        {tab === "encrypted" && notebook.unlocked ? (
          <button
            type="button"
            className="ghost"
            onClick={() => {
              notebook.lock();
              setSelectedId(null);
              setClassifyId(null);
            }}
          >
            {t("crypto.lock")}
          </button>
        ) : null}
      </div>

      {locked ? (
        <div className="banner">
          <div>
            <strong>{t("crypto.notebookTitle")}</strong>
            <p className="muted small">{t("crypto.unlockBody")}</p>
          </div>
          <button type="button" className="primary" onClick={askToUnlock}>
            {notebook.profile ? t("crypto.unlock") : t("crypto.create")}
          </button>
        </div>
      ) : null}

      <div className="columns">
        <FolderTree
          folders={folders}
          selectedId={folderId}
          onSelect={setFolderId}
          onCreate={(name, parentId) => {
            void createFolder.mutateAsync({ data: { name, parent_id: parentId } }).then(refresh);
          }}
          onDelete={(id) => {
            void removeFolder.mutateAsync({ folderId: id }).then(() => {
              if (folderId === id) {
                setFolderId(null);
              }
              return refresh();
            });
          }}
        />

        <NoteList
          notes={notes}
          tags={tags}
          decrypted={decrypted}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onCreate={() => void addNote()}
          search={search}
          onSearchChange={setSearch}
          tagFilter={tagFilter}
          onTagFilter={setTagFilter}
          creating={createNote.isPending}
        />

        {selected ? (
          <NoteEditor
            key={selected.id}
            note={selected}
            secret={decrypted[selected.id] ?? null}
            folders={folders}
            tagSuggestions={tags.map((tag) => tag.name)}
            encrypted={selected.notebook === "encrypted"}
            saving={updateNote.isPending}
            onSave={(payload) => saveNote(selected, payload)}
            onDelete={() => {
              void removeNote.mutateAsync({ noteId: selected.id }).then(() => {
                setSelectedId(null);
                setClassifyId(null);
                return refresh();
              });
            }}
            onClassify={() => setClassifyId(selected.id)}
            onLock={notebook.lock}
          />
        ) : (
          <section className="panel editor empty">
            <p className="muted">{t("notes.selectPrompt")}</p>
          </section>
        )}
      </div>

      {classifyNote && !locked ? (
        <ClassifyPanel
          note={classifyNote}
          secret={decrypted[classifyNote.id] ?? null}
          onApply={(choice) => applySuggestions(classifyNote, choice)}
          onClose={() => setClassifyId(null)}
        />
      ) : null}

      {showUnlock ? (
        <UnlockDialog
          mode={unlockMode}
          onCancel={() => setShowUnlock(false)}
          onSubmit={async (password) => {
            if (unlockMode === "create") {
              await notebook.create(password);
              setShowUnlock(false);
              return true;
            }
            const ok = await notebook.unlock(password);
            if (ok) {
              setShowUnlock(false);
            }
            return ok;
          }}
        />
      ) : null}
    </div>
  );
}
