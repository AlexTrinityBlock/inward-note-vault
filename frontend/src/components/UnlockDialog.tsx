import { useState, type FormEvent } from "react";

import { useI18n } from "../i18n";

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
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

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

  return (
    <div className="modal-backdrop">
      <form className="card modal" onSubmit={submit}>
        <h2>{mode === "create" ? t("crypto.createTitle") : t("crypto.unlockTitle")}</h2>
        <p className="muted">
          {mode === "create" ? t("crypto.createBody") : t("crypto.unlockBody")}
        </p>

        <label>
          {t("crypto.password")}
          <input
            type="password"
            autoFocus
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={mode === "create" ? "new-password" : "current-password"}
            required
          />
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

        <div className="row">
          <button type="submit" className="primary" disabled={pending}>
            {mode === "create" ? t("crypto.create") : t("crypto.unlock")}
          </button>
          <button type="button" onClick={onCancel}>
            {t("common.cancel")}
          </button>
        </div>
      </form>
    </div>
  );
}
