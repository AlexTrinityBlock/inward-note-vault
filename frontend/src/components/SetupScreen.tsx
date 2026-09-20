import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { useCreateSetup, useLogin } from "../client/generated";
import { useI18n } from "../i18n";
import { LocaleSwitcher } from "./LocaleSwitcher";

/** First run: create the owner account, and optionally store a TypeSafe key. */
export function SetupScreen() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const createSetup = useCreateSetup();
  const login = useLogin();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [autoClassify, setAutoClassify] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const pending = createSetup.isPending || login.isPending;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password !== confirmation) {
      setError(t("setup.mismatch"));
      return;
    }

    setError(null);
    try {
      await createSetup.mutateAsync({
        data: {
          username,
          password,
          typesafe_api_key: apiKey.trim() === "" ? null : apiKey.trim(),
          auto_classify_enabled: autoClassify,
        },
      });
      // Setup only creates the account; sign in with it straight away.
      await login.mutateAsync({ data: { username, password } });
      await queryClient.invalidateQueries();
    } catch {
      setError(t("setup.failed"));
    }
  }

  return (
    <div className="centered">
      <form className="card" onSubmit={submit}>
        <div className="card-header">
          <h1>{t("setup.title")}</h1>
          <LocaleSwitcher />
        </div>
        <p className="muted">{t("setup.subtitle")}</p>

        <label>
          {t("setup.username")}
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            required
            minLength={1}
            maxLength={64}
          />
        </label>

        <label>
          {t("setup.password")}
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            required
            minLength={8}
          />
          <span className="hint">{t("setup.passwordHint")}</span>
        </label>

        <label>
          {t("setup.confirmPassword")}
          <input
            type="password"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            autoComplete="new-password"
            required
            minLength={8}
          />
        </label>

        <label>
          {t("setup.typesafeKey")}
          <input
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="ts_…"
            autoComplete="off"
          />
          <span className="hint">{t("setup.typesafeKeyHint")}</span>
        </label>

        <label className="checkbox">
          <input
            type="checkbox"
            checked={autoClassify}
            onChange={(event) => setAutoClassify(event.target.checked)}
          />
          {t("setup.autoClassify")}
        </label>

        {error ? <p className="error">{error}</p> : null}

        <button type="submit" className="primary" disabled={pending}>
          {pending ? t("common.loading") : t("setup.submit")}
        </button>
      </form>
    </div>
  );
}
