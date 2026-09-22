import { useI18n } from "../i18n";
import { Icon } from "./Icon";

type LockedNotebookProps = {
  /** Whether the notebook exists yet, or still needs a password created. */
  hasProfile: boolean;
  onUnlock: () => void;
};

/**
 * What the encrypted notebook shows while it is locked.
 *
 * Nothing else is rendered next to it — no folders, no file list, no editor —
 * and the notes are not even requested from the server until the browser holds
 * the key and can read them.
 */
export function LockedNotebook({ hasProfile, onUnlock }: LockedNotebookProps) {
  const { t } = useI18n();

  return (
    <div className="drive-empty-state locked-notebook">
      <div className="drive-empty-icon">
        <Icon name="lock" size={48} />
      </div>
      <h4>{t("crypto.notebookTitle")}</h4>
      <p>{hasProfile ? t("crypto.unlockBody") : t("crypto.createBody")}</p>
      <p className="hint">{t("crypto.lockedHint")}</p>
      <div className="drive-empty-actions">
        <button type="button" className="primary" onClick={onUnlock}>
          <Icon name={hasProfile ? "unlock" : "plus"} size={14} />
          <span>{hasProfile ? t("crypto.unlock") : t("crypto.create")}</span>
        </button>
      </div>
    </div>
  );
}
