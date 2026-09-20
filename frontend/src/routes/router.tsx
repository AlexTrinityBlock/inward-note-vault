import { createBrowserRouter } from "react-router-dom";

import { AppGate } from "../components/AppGate";
import { SettingsRoute } from "./SettingsRoute";
import { VaultRoute } from "./VaultRoute";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppGate />,
    children: [
      { index: true, element: <VaultRoute /> },
      { path: "settings", element: <SettingsRoute /> },
    ],
  },
]);
