import { useEffect, useState, type FormEvent } from "react";

import { useI18n } from "../i18n";
import { Icon } from "./Icon";

type UnlockDialogProps = {
  /** `create` initializes a new notebook password, `unlock` opens an existing one. */
  mode: "create" | "unlock";
  onSubmit: (password: string) => Promise<boolean>;
  onCancel: () => void;
};

/**
 * The encrypted notebook's password gate.
 *
 * The password is passed straight into WebCrypto and never leaves the browser:
 * nothing here talks to the API except the KDF parameters the provider reads.
 */
export function UnlockDialog({ mode, onSubmit, onCancel }: UnlockDialogProps) {
  const { t } = useI18n();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCancel();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (mode === "create" && password !== confirmation) {
      setError(t("crypto.mismatch"));
      return;
    }
    if (password.length < 8) {
      setError(t("crypto.tooShort"));
      return;
    }

    setPending(true);
    try {
      const ok = await onSubmit(password);
      if (!ok) {
        setError(t("crypto.wrongPassword"));
      }
    } finally {
      setPending(false);
      setPassword("");
      setConfirmation("");
    }
  }

  const title = mode === "create" ? t("crypto.createTitle") : t("crypto.unlockTitle");

  return (
    <div
      className="modal-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onCancel();
        }
      }}
    >
      <form
        className="modal-card unlock-modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="unlock-title"
        onSubmit={submit}
      >
        <div className="modal-header">
          <div className="modal-title" id="unlock-title">
            <Icon name={mode === "create" ? "lock" : "unlock"} size={15} />
            <span>{title}</span>
          </div>
          <button
            type="button"
            className="icon-btn ghost"
            title={t("common.close")}
            aria-label={t("common.close")}
            onClick={onCancel}
          >
            <Icon name="close" size={14} />
          </button>
        </div>

        <div className="modal-body">
          <p className="muted">
            {mode === "create" ? t("crypto.createBody") : t("crypto.unlockBody")}
          </p>

          <label>
            {t("crypto.password")}
            <span className="password-field">
              <input
                type={visible ? "text" : "password"}
                autoFocus
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={mode === "create" ? "new-password" : "current-password"}
                required
              />
              <button
                type="button"
                className="ghost password-toggle"
                aria-label={t("crypto.revealPassword")}
                title={t("crypto.revealPassword")}
                aria-pressed={visible}
                onClick={() => setVisible((current) => !current)}
              >
                <Icon name="eye" size={14} />
              </button>
            </span>
          </label>

          {mode === "create" ? (
            <label>
              {t("crypto.confirmPassword")}
              <input
                type="password"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                autoComplete="new-password"
                required
              />
            </label>
          ) : null}

          <p className="hint">{t("crypto.note")}</p>
          {error ? <p className="error">{error}</p> : null}
        </div>

        <div className="modal-footer">
          <button type="button" className="ghost" onClick={onCancel}>
            {t("common.cancel")}
          </button>
          <button type="submit" className="primary" disabled={pending}>
            {mode === "create" ? t("crypto.create") : t("crypto.unlock")}
          </button>
        </div>
      </form>
    </div>
  );
}
