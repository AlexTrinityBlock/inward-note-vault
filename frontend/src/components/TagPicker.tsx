import { useState } from "react";

import { useI18n } from "../i18n";

type TagPickerProps = {
  tags: string[];
  suggestions: string[];
  onChange: (tags: string[]) => void;
};

/** Chips for a note's tags, with an input that offers known tag names. */
export function TagPicker({ tags, suggestions, onChange }: TagPickerProps) {
  const { t } = useI18n();
  const [draft, setDraft] = useState("");

  function add(name: string) {
    const cleaned = name.trim();
    if (!cleaned || tags.some((tag) => tag.toLowerCase() === cleaned.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...tags, cleaned]);
    setDraft("");
  }

  return (
    <div className="tag-picker">
      <span className="label">{t("notes.tags")}</span>
      {tags.map((tag) => (
        <span key={tag} className="chip">
          {tag}
          <button type="button" onClick={() => onChange(tags.filter((item) => item !== tag))}>
            ×
          </button>
        </span>
      ))}
      <input
        list="tag-suggestions"
        value={draft}
        placeholder={t("notes.addTag")}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            add(draft);
          }
        }}
        onBlur={() => add(draft)}
      />
      <datalist id="tag-suggestions">
        {suggestions
          .filter((suggestion) => !tags.includes(suggestion))
          .map((suggestion) => (
            <option key={suggestion} value={suggestion} />
          ))}
      </datalist>
    </div>
  );
}
