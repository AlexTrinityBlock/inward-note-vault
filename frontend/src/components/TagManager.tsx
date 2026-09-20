import { useState } from "react";

import type { TagRead } from "../client/generated/models";
import { useI18n } from "../i18n";
import { TAG_COUNT_MAX, TAG_NAME_MAX_CHARS } from "../lib/limits";

type TagManagerProps = {
  tags: TagRead[];
  active: string | null;
  onFilter: (tag: string | null) => void;
  onCreate: (name: string) => void;
  onDelete: (tagId: number) => void;
};

/**
 * The tag vocabulary, which is also what Jev chooses from.
 *
 * Clicking a tag filters the note list; the field adds a new tag so there is
 * something for the classifier to select.
 */
export function TagManager({ tags, active, onFilter, onCreate, onDelete }: TagManagerProps) {
  const { t } = useI18n();
  const [draft, setDraft] = useState("");

  function commit() {
    const name = draft.trim();
    if (name) {
      onCreate(name);
    }
    setDraft("");
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>{t("tags.title")}</h2>
        {active ? (
          <button type="button" className="ghost" onClick={() => onFilter(null)}>
            {t("notes.clearFilter")}
          </button>
        ) : null}
      </div>

      {tags.length === 0 ? (
        <p className="muted small">{t("tags.manageHint")}</p>
      ) : (
        <ul className="tag-list">
          {tags.map((tag) => (
            <li key={tag.id}>
              <button
                type="button"
                className={`chip${active === tag.name ? " active" : ""}`}
                onClick={() => onFilter(active === tag.name ? null : tag.name)}
              >
                {tag.name}
                <span className="count">{tag.note_count}</span>
              </button>
              <button
                type="button"
                className="ghost"
                title={t("common.delete")}
                onClick={() => {
                  if (confirm(t("tags.deleteConfirm"))) {
                    onDelete(tag.id);
                  }
                }}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {tags.length >= TAG_COUNT_MAX ? (
        <p className="hint">{t("tags.atLimit")}</p>
      ) : (
        <div className="inline-field">
          <input
            value={draft}
            placeholder={t("notes.addTag")}
            maxLength={TAG_NAME_MAX_CHARS}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commit();
              }
            }}
          />
          <button type="button" onClick={commit}>
            {t("common.add")}
          </button>
        </div>
      )}
    </section>
  );
}
