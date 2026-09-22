import { useOutletContext } from "react-router-dom";

import type { AppShellContext } from "../components/AppGate";

/** Read the signed-in account and the sign-out action from `AppGate`. */
export function useAppShell(): AppShellContext {
  return useOutletContext<AppShellContext>();
}
