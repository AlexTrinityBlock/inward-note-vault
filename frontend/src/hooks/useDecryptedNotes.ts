import { useEffect, useMemo, useRef, useState } from "react";

import type { NoteRead } from "../client/generated/models";
import { openNote, type NoteSecret } from "../lib/crypto";

/**
 * Decrypt the encrypted notes of the current list in the browser.
 *
 * Plain notes are skipped: their text is already in the response. The cache is
 * keyed by note id and `updated_at`, so it refreshes when a note changes and
 * clears when the notebook is locked.
 */
export function useDecryptedNotes(
  notes: NoteRead[],
  key: CryptoKey | null,
): Record<number, NoteSecret> {
  const [secrets, setSecrets] = useState<Record<number, NoteSecret>>({});
  const cacheRef = useRef<Map<string, NoteSecret>>(new Map());

  const signature = useMemo(
    () =>
      notes
        .filter((note) => note.notebook === "encrypted")
        .map((note) => `${note.id}:${note.updated_at}`)
        .join("|"),
    [notes],
  );

  useEffect(() => {
    if (!key || signature === "") {
      setSecrets({});
      cacheRef.current.clear();
      return;
    }

    let cancelled = false;
    const encrypted = notes.filter(
      (note) => note.notebook === "encrypted" && note.ciphertext && note.iv,
    );

    void (async () => {
      const next: Record<number, NoteSecret> = {};
      const toDecrypt: { note: NoteRead; versionKey: string }[] = [];

      for (const note of encrypted) {
        const versionKey = `${note.id}:${note.updated_at}`;
        const cached = cacheRef.current.get(versionKey);
        if (cached) {
          next[note.id] = cached;
        } else {
          toDecrypt.push({ note, versionKey });
        }
      }

      if (toDecrypt.length > 0) {
        await Promise.all(
          toDecrypt.map(async ({ note, versionKey }) => {
            try {
              const opened = await openNote(key, {
                ciphertext: note.ciphertext ?? "",
                iv: note.iv ?? "",
              });
              next[note.id] = opened;
              cacheRef.current.set(versionKey, opened);
            } catch (err) {
              console.error("Failed to decrypt note:", note.id, err);
              // A note that cannot be opened stays locked in the list.
            }
          }),
        );
      }

      if (!cancelled) {
        setSecrets(next);
      }
    })();

    return () => {
      cancelled = true;
    };
    // `signature` captures the ids and versions of the encrypted notes.
  }, [key, signature, notes]);

  return secrets;
}
