import { useQueryClient } from "@tanstack/react-query";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";

import { useGetCurrentAccount, useGetSetupStatus, useLogout } from "../client/generated";
import { EncryptedNotebookProvider } from "../hooks/useEncryptedNotebook";
import { useI18n } from "../i18n";
import { LoginScreen } from "./LoginScreen";
import { SetupScreen } from "./SetupScreen";

/**
 * The gate in front of every screen: the first-run wizard, the sign-in form, or
 * the application itself.
 *
 * It deliberately renders no chrome of its own. Each tier supplies its own
 * header — the portal is a standalone page, the drive and the workspace share
 * `DriveLayout` — so this component only decides whether a screen may be seen
 * at all.
 */
export function AppGate() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const setupStatus = useGetSetupStatus({ query: { retry: false } });
  const needsSetup = setupStatus.data?.needs_setup ?? false;

  const account = useGetCurrentAccount({
    query: { enabled: !needsSetup && setupStatus.isSuccess, retry: false },
  });
  const logout = useLogout();

  // The notebook used to be a query parameter on this route. Bookmarks and
  // links made before the move to `/n/:notebook` should still land somewhere
  // sensible rather than on the portal.
  const legacyNotebook = new URLSearchParams(location.search).get("notebook");
  useEffect(() => {
    if (legacyNotebook === "encrypted" || legacyNotebook === "plain") {
      navigate(`/n/${legacyNotebook}`, { replace: true });
    }
  }, [legacyNotebook, navigate]);

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

  return (
    // The unlocked notebook key is held here, above every signed-in screen.
    // `AppHeader` renders on all of them and shows the lock control, so the
    // provider has to sit above the router's children rather than on the
    // notebook route alone — otherwise `/settings` throws. The key is still
    // memory-only, so a reload locks the notebook again.
    <EncryptedNotebookProvider>
      <div className="app">
        <main className="app-main">
          <Outlet
            context={{
              username: account.data.username,
              signOut: async () => {
                await logout.mutateAsync();
                await queryClient.invalidateQueries();
              },
              signingOut: logout.isPending,
            }}
          />
        </main>
      </div>
    </EncryptedNotebookProvider>
  );
}

/** What `AppGate` hands to every screen through `<Outlet context>`. */
export type AppShellContext = {
  username: string;
  signOut: () => Promise<void>;
  signingOut: boolean;
};
