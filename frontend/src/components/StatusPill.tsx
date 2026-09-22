import { useI18n } from "../i18n";

export type SaveState = "saved" | "unsaved" | "saving" | "failed";

/**
 * The save indicator: a coloured dot plus a word.
 *
 * It replaces the string the editor used to keep in local state, which meant
 * the transfer's status was re-derived (and re-translated) at every call site.
 * Here the state is an enum and the wording lives in one place.
 */
export function StatusPill({ state }: { state: SaveState }) {
  const { t } = useI18n();

  const label = {
    saved: t("notes.saved"),
    unsaved: t("notes.unsaved"),
    saving: t("notes.saving"),
    failed: t("notes.saveFailed"),
  }[state];

  return (
    <div className={`save-status-pill status-${state}`} role="status" title={label}>
      <span className="status-dot" aria-hidden="true" />
      <span className="save-status-text">{label}</span>
    </div>
  );
}
