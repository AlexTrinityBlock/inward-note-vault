import { useEffect, useState, type KeyboardEvent } from "react";

import type { FolderRead, NoteRead } from "../client/generated/models";
import { useI18n } from "../i18n";
import type { NoteSecret } from "../lib/crypto";
import { MarkdownPreview } from "./MarkdownPreview";
import { TagPicker } from "./TagPicker";

export type NoteSavePayload = {
  title?: string;
  body?: string;
  folder_id?: number | null;
  move?: boolean;
  tags?: string[];
};

type NoteEditorProps = {
  note: NoteRead;
  secret: NoteSecret | null;
  folders: FolderRead[];
  tagSuggestions: string[];
  encrypted: boolean;
  saving: boolean;
  onSave: (payload: NoteSavePayload) => Promise<void>;
  onDelete: () => void;
  onClassify: () => void;
  onLock: () => void;
};

/**
 * The editor: write Markdown on the left, read the rendered result on the right.
 *
 * Mount it with `key={note.id}` so switching notes resets the draft.
 */
export function NoteEditor({
  note,
  secret,
  folders,
  tagSuggestions,
  encrypted,
  saving,
  onSave,
  onDelete,
  onClassify,
  onLock,
}: NoteEditorProps) {
  const { t } = useI18n();
  const [title, setTitle] = useState(secret ? secret.title : (note.title ?? ""));
  const [body, setBody] = useState(secret ? secret.body : (note.body ?? ""));
  const [folderId, setFolderId] = useState<number | null>(note.folder_id);
  const [tags, setTags] = useState<string[]>(note.tags ?? []);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    setStatus(dirty ? t("notes.unsaved") : t("notes.saved"));
  }, [dirty, t]);

  async function save() {
    setStatus(t("notes.saving"));
    try {
      await onSave({
        title,
        body,
        folder_id: folderId,
        move: true,
        tags,
      });
      setDirty(false);
      setStatus(t("notes.saved"));
    } catch {
      setStatus(t("notes.saveFailed"));
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      void save();
    }
  }

  const words = body.trim() === "" ? 0 : body.trim().split(/\s+/).length;

  return (
    <section className="panel editor" onKeyDown={onKeyDown}>
      <div className="editor-toolbar">
        <input
          className="title-input"
          value={title}
          placeholder={t("editor.titlePlaceholder")}
          onChange={(event) => {
            setTitle(event.target.value);
            setDirty(true);
          }}
        />

        <select
          value={folderId ?? ""}
          onChange={(event) => {
            setFolderId(event.target.value === "" ? null : Number(event.target.value));
            setDirty(true);
          }}
          title={t("notes.folder")}
        >
          <option value="">{t("notes.noFolder")}</option>
          {folders.map((folder) => (
            <option key={folder.id} value={folder.id}>
              {folder.path}
            </option>
          ))}
        </select>

        <button type="button" className="primary" onClick={save} disabled={saving}>
          {t("common.save")}
        </button>
        <button type="button" onClick={onClassify}>
          ✨ {t("classify.button")}
        </button>
        {encrypted ? (
          <button type="button" onClick={onLock}>
            🔒 {t("crypto.lock")}
          </button>
        ) : null}
        <button
          type="button"
          className="danger"
          onClick={() => {
            if (confirm(t("notes.deleteConfirm"))) {
              onDelete();
            }
          }}
        >
          {t("common.delete")}
        </button>
      </div>

      <div className="editor-meta">
        <TagPicker tags={tags} suggestions={tagSuggestions} onChange={(next) => {
          setTags(next);
          setDirty(true);
        }} />
        <span className={`status${dirty ? " dirty" : ""}`}>{status}</span>
      </div>

      <div className="split">
        <div className="pane">
          <div className="pane-header">
            <span>{t("editor.write")}</span>
            <span className="muted small">
              {words} {t("editor.words")}
            </span>
          </div>
          <textarea
            className="editor-body"
            value={body}
            placeholder={t("editor.bodyPlaceholder")}
            onChange={(event) => {
              setBody(event.target.value);
              setDirty(true);
            }}
          />
        </div>
        <div className="pane">
          <div className="pane-header">
            <span>{t("editor.preview")}</span>
          </div>
          <div className="preview">
            <MarkdownPreview source={body} />
          </div>
        </div>
      </div>
    </section>
  );
}
