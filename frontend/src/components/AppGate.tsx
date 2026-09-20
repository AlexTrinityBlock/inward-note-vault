import { useQueryClient } from "@tanstack/react-query";
import { Link, Outlet } from "react-router-dom";

import { useGetCurrentAccount, useGetSetupStatus, useLogout } from "../client/generated";
import { useI18n } from "../i18n";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { LoginScreen } from "./LoginScreen";
import { SetupScreen } from "./SetupScreen";

/**
 * Decides what the browser sees: the first-run wizard, the sign-in form, or the
 * application shell.
 */
export function AppGate() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const setupStatus = useGetSetupStatus({ query: { retry: false } });
  const needsSetup = setupStatus.data?.needs_setup ?? false;

  const account = useGetCurrentAccount({
    query: { enabled: !needsSetup && setupStatus.isSuccess, retry: false },
  });
  const logout = useLogout();

  if (setupStatus.isPending) {
    return <p className="centered muted">{t("common.loading")}</p>;
  }

  if (needsSetup) {
    return <SetupScreen />;
  }

  if (account.isPending) {
    return <p className="centered muted">{t("common.loading")}</p>;
  }

  if (account.isError || !account.data) {
    return <LoginScreen />;
  }

  async function signOut() {
    await logout.mutateAsync();
    await queryClient.invalidateQueries();
  }

  return (
    <div className="app">
      <header className="app-header">
        <Link to="/" className="app-title">
          {t("app.name")}
        </Link>
        <nav className="app-nav">
          <Link to="/settings">{t("common.settings")}</Link>
          <span className="muted small">{account.data.username}</span>
          <LocaleSwitcher />
          <button type="button" onClick={signOut} disabled={logout.isPending}>
            {t("common.signOut")}
          </button>
        </nav>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
