import { useI18n } from "../i18n";

type LockedNotebookProps = {
  /** Whether the notebook exists yet, or still needs a password created. */
  hasProfile: boolean;
  onUnlock: () => void;
};

/**
 * What the encrypted notebook shows while it is locked.
 *
 * Nothing else is rendered next to it — no folders, no note list, no editor —
 * and the notes are not even requested from the server until the browser holds
 * the key and can read them.
 */
export function LockedNotebook({ hasProfile, onUnlock }: LockedNotebookProps) {
  const { t } = useI18n();

  return (
    <div className="locked">
      <div className="card locked-card">
        <div className="locked-mark" aria-hidden="true">
          🔒
        </div>
        <h1>{t("crypto.notebookTitle")}</h1>
        <p className="muted">{hasProfile ? t("crypto.unlockBody") : t("crypto.createBody")}</p>
        <p className="hint">{t("crypto.lockedHint")}</p>
        <button type="button" className="primary" onClick={onUnlock}>
          {hasProfile ? t("crypto.unlock") : t("crypto.create")}
        </button>
      </div>
    </div>
  );
}
