/**
 * Platform detection helper for keyboard shortcuts and UI labels.
 */
export const isMac: boolean =
  typeof navigator !== "undefined" &&
  Boolean(
    (navigator as { userAgentData?: { platform?: string } }).userAgentData?.platform === "macOS" ||
      /Mac|iPhone|iPod|iPad/i.test(navigator.platform || navigator.userAgent),
  );

export const modKey: string = isMac ? "⌘" : "Ctrl+";
export const modKeyName: string = isMac ? "Cmd" : "Ctrl";
