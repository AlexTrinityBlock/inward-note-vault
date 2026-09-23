import { useState } from "react";

import { useI18n } from "../i18n";
import { CATEGORY_NAME_MAX_CHARS, CATEGORY_COUNT_MAX } from "../lib/limits";
import { Icon } from "./Icon";

type CategoryPickerProps = {
  /** Categories already on the note. */
  categories: string[];
  /** Every category the vault knows, offered as autocomplete. */
  suggestions: string[];
  onChange: (categories: string[]) => void;
  disabled?: boolean;
};

/**
 * The chip row inside the editor: what this note is filed under.
 *
 * Known names are offered through a `datalist` rather than a custom dropdown, so
 * typing a new one is the same gesture as picking an existing one. A category
 * that does not exist yet is created on save — the API accepts names.
 */
export function CategoryPicker({ categories, suggestions, onChange, disabled }: CategoryPickerProps) {
  const { t } = useI18n();
  const [draft, setDraft] = useState("");

  function add(name: string) {
    if (disabled) {
      return;
    }
    const cleaned = name.trim();
    setDraft("");
    if (cleaned === "") {
      return;
    }
    // Case-insensitive, matching the backend's unique constraint.
    if (categories.some((item) => item.toLowerCase() === cleaned.toLowerCase())) {
      return;
    }
    if (categories.length >= CATEGORY_COUNT_MAX) {
      return;
    }
    onChange([...categories, cleaned]);
  }

  return (
    <div className="category-picker">
      <span className="category-picker-label">{t("notes.categories")}</span>

      {categories.length === 0 ? (
        <span className="muted small">{t("notes.noCategories")}</span>
      ) : (
        <span className="category-chips">
          {categories.map((category) => (
            <span key={category} className="category-chip">
              {category}
              {!disabled ? (
                <button
                  type="button"
                  className="category-chip-remove"
                  title={t("common.delete")}
                  aria-label={`${t("common.delete")}: ${category}`}
                  onClick={() => onChange(categories.filter((item) => item !== category))}
                >
                  <Icon name="close" size={11} />
                </button>
              ) : null}
            </span>
          ))}
        </span>
      )}

      {!disabled ? (
        <>
          <input
            className="category-picker-input"
            list="category-suggestions"
            value={draft}
            placeholder={t("notes.addCategory")}
            maxLength={CATEGORY_NAME_MAX_CHARS}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                add(draft);
              }
              // Backspace on an empty field removes the last chip, which is how
              // every other chip input behaves.
              if (event.key === "Backspace" && draft === "" && categories.length > 0) {
                onChange(categories.slice(0, -1));
              }
            }}
            onBlur={() => add(draft)}
          />
          <datalist id="category-suggestions">
            {suggestions
              .filter((suggestion) => !categories.includes(suggestion))
              .map((suggestion) => (
                <option key={suggestion} value={suggestion} />
              ))}
          </datalist>
        </>
      ) : null}
    </div>
  );
}
