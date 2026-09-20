import type { NoteRead } from "../client/generated/models";
import { useI18n } from "../i18n";
import type { NoteSecret } from "../lib/crypto";

type NoteListProps = {
  notes: NoteRead[];
  decrypted: Record<number, NoteSecret>;
  selectedId: number | null;
  onSelect: (noteId: number) => void;
  onCreate: () => void;
  search: string;
  onSearchChange: (value: string) => void;
  /** Set by the Tags panel, which owns filtering. */
  tagFilter: string | null;
  creating: boolean;
};

function preview(note: NoteRead, secret: NoteSecret | undefined): string {
  const body = secret ? secret.body : note.body;
  if (!body) {
    return "";
  }
  return body.replace(/\s+/g, " ").slice(0, 120);
}

/** The middle column: filters, tag chips, and the note list. */
export function NoteList({
  notes,
  decrypted,
  selectedId,
  onSelect,
  onCreate,
  search,
  onSearchChange,
  tagFilter,
  creating,
}: NoteListProps) {
  const { t } = useI18n();

  return (
    <section className="panel note-list">
      <div className="panel-header">
        <h2>{t("notes.allNotes")}</h2>
        <button type="button" className="primary" onClick={onCreate} disabled={creating}>
          + {t("notes.newNote")}
        </button>
      </div>

      <input
        type="search"
        value={search}
        placeholder={t("notes.search")}
        onChange={(event) => onSearchChange(event.target.value)}
      />
      <p className="hint">{t("notes.searchHint")}</p>

      {tagFilter ? (
        <p className="muted small">
          {t("notes.filterByTag")}: <strong>{tagFilter}</strong>
        </p>
      ) : null}

      {notes.length === 0 ? (
        <p className="muted small">{t("notes.empty")}</p>
      ) : (
        <ul className="notes">
          {notes.map((note) => {
            const secret = decrypted[note.id];
            const title = secret
              ? secret.title
              : note.notebook === "encrypted"
                ? t("notes.lockedNote")
                : (note.title ?? t("notes.untitled"));

            return (
              <li key={note.id}>
                <button
                  type="button"
                  className={`note-item${selectedId === note.id ? " selected" : ""}`}
                  onClick={() => onSelect(note.id)}
                >
                  <span className="note-title">
                    {note.notebook === "encrypted" ? "🔒 " : ""}
                    {title || t("notes.untitled")}
                  </span>
                  <span className="note-preview">{preview(note, secret)}</span>
                  <span className="note-meta">
                    {(note.tags ?? []).map((tag) => (
                      <span key={tag} className="chip small">
                        {tag}
                      </span>
                    ))}
                    <time dateTime={note.updated_at}>
                      {new Date(note.updated_at).toLocaleDateString()}
                    </time>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
