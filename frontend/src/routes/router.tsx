import { Navigate, createBrowserRouter, useParams } from "react-router-dom";

import { AppGate } from "../components/AppGate";
import { CategoryRoute } from "./CategoryRoute";
import { DriveLayout } from "./DriveLayout";
import { DriveRoute } from "./DriveRoute";
import { NoteRoute } from "./NoteRoute";
import { PortalRoute } from "./PortalRoute";
import { SettingsRoute } from "./SettingsRoute";

/** Guards `/n/:notebook` so a typo in the URL does not render an empty drive. */
function NotebookRoute() {
  const { notebook } = useParams<{ notebook: string }>();
  if (notebook !== "plain" && notebook !== "encrypted") {
    return <Navigate to="/" replace />;
  }
  return <DriveLayout notebook={notebook} />;
}

/**
 * Three tiers, three levels of URL.
 *
 * `/` answers which notebook, `/n/:notebook` is the browser you work in, and
 * `/n/:notebook/notes/:noteId` is one note on its own page. Everything the drive
 * screen is looking at — folder, category, search, sort, view — lives in the
 * query string rather than in component state, so a refresh lands where the
 * reader was and the back button walks back through what they actually opened.
 *
 * Each screen owns its own header, which is why `DriveLayout` wraps only the
 * notebook tiers. The unlocked notebook key lives above all of them, in
 * `AppGate`, because every header shows the lock control.
 */
export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppGate />,
    children: [
      { index: true, element: <PortalRoute /> },
      {
        path: "n/:notebook",
        element: <NotebookRoute />,
        children: [
          { index: true, element: <DriveRoute /> },
          { path: "categories", element: <CategoryRoute /> },
          { path: "notes/:noteId", element: <NoteRoute /> },
        ],
      },
      { path: "settings", element: <SettingsRoute /> },
    ],
  },
]);
