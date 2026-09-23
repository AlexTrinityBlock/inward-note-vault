import { useState, useCallback, useEffect } from "react";

export type ClipboardItem =
  | { type: "note"; operation: "cut" | "copy"; noteId: number }
  | { type: "folder"; operation: "cut"; folderId: number };

const STORAGE_KEY = "inward.drive.clipboard";

function getStoredClipboard(): ClipboardItem | null {
  try {
    if (typeof sessionStorage !== "undefined") {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    }
  } catch {}
  return null;
}

let globalClipboard: ClipboardItem | null = getStoredClipboard();
const listeners = new Set<(item: ClipboardItem | null) => void>();

function setGlobalClipboard(item: ClipboardItem | null) {
  globalClipboard = item;
  try {
    if (typeof sessionStorage !== "undefined") {
      if (item) {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(item));
      } else {
        sessionStorage.removeItem(STORAGE_KEY);
      }
    }
  } catch {}
  for (const listener of listeners) {
    listener(item);
  }
}

export function useDriveClipboard() {
  const [clipboard, setClipboard] = useState<ClipboardItem | null>(globalClipboard);

  useEffect(() => {
    listeners.add(setClipboard);
    return () => {
      listeners.delete(setClipboard);
    };
  }, []);

  const copy = useCallback((noteId: number) => {
    setGlobalClipboard({ type: "note", operation: "copy", noteId });
  }, []);

  const cut = useCallback((id: number, type: "note" | "folder" = "note") => {
    if (type === "folder") {
      setGlobalClipboard({ type: "folder", operation: "cut", folderId: id });
    } else {
      setGlobalClipboard({ type: "note", operation: "cut", noteId: id });
    }
  }, []);

  const clear = useCallback(() => {
    setGlobalClipboard(null);
  }, []);

  return { clipboard, copy, cut, clear };
}

export function resetGlobalClipboard(): void {
  setGlobalClipboard(null);
}
