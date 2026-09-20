import { createBrowserRouter } from "react-router-dom";

import { AppGate } from "../components/AppGate";
import { EncryptedNotebookProvider } from "../hooks/useEncryptedNotebook";
import { SettingsRoute } from "./SettingsRoute";
import { VaultRoute } from "./VaultRoute";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppGate />,
    children: [
      {
        index: true,
        // The unlocked notebook key lives here, above every note view.
        element: (
          <EncryptedNotebookProvider>
            <VaultRoute />
          </EncryptedNotebookProvider>
        ),
      },
      { path: "settings", element: <SettingsRoute /> },
    ],
  },
]);
