import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { useLogin } from "../client/generated";
import { useI18n } from "../i18n";
import { LocaleSwitcher } from "./LocaleSwitcher";

/** Sign in to an existing vault. */
export function LoginScreen() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const login = useLogin();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await login.mutateAsync({ data: { username, password } });
      await queryClient.invalidateQueries();
    } catch {
      setError(t("login.failed"));
    }
  }

  return (
    <div className="centered">
      <form className="card" onSubmit={submit}>
        <div className="card-header">
          <h1>{t("login.title")}</h1>
          <LocaleSwitcher />
        </div>
        <p className="muted">{t("login.subtitle")}</p>

        <label>
          {t("setup.username")}
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            required
          />
        </label>

        <label>
          {t("setup.password")}
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
        </label>

        {error ? <p className="error">{error}</p> : null}

        <button type="submit" className="primary" disabled={login.isPending}>
          {login.isPending ? t("common.loading") : t("login.submit")}
        </button>
      </form>
    </div>
  );
}
