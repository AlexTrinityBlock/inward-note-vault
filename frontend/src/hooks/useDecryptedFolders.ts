import { useEffect, useMemo, useState } from "react";

import type { FolderRead } from "../client/generated/models";
import { openFolderName } from "../lib/crypto";

/**
 * Decrypt the encrypted folders of the current list in the browser.
 *
 * Plain folders are skipped: their text is already in `folder.name`.
 * Returns a list of FolderRead where `name` is decrypted if encrypted.
 */
export function useDecryptedFolders(
  folders: FolderRead[],
  key: CryptoKey | null,
): FolderRead[] {
  const [decryptedNames, setDecryptedNames] = useState<Record<number, string>>({});

  const signature = useMemo(
    () =>
      folders
        .filter((folder) => folder.notebook === "encrypted")
        .map((folder) => `${folder.id}:${folder.ciphertext}`)
        .join("|"),
    [folders],
  );

  useEffect(() => {
    if (!key || signature === "") {
      setDecryptedNames({});
      return;
    }

    let cancelled = false;
    const encrypted = folders.filter(
      (folder) => folder.notebook === "encrypted" && folder.ciphertext && folder.iv,
    );

    void (async () => {
      const next: Record<number, string> = {};
      for (const folder of encrypted) {
        try {
          next[folder.id] = await openFolderName(key, {
            ciphertext: folder.ciphertext ?? "",
            iv: folder.iv ?? "",
          });
        } catch {
          // If decryption fails, keep fallback
        }
      }
      if (!cancelled) {
        setDecryptedNames(next);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [key, signature, folders]);

  return useMemo(
    () =>
      folders.map((folder) => {
        if (folder.notebook === "encrypted") {
          return {
            ...folder,
            name: decryptedNames[folder.id] ?? folder.name ?? "",
          };
        }
        return {
          ...folder,
          name: folder.name ?? "",
        };
      }),
    [folders, decryptedNames],
  );
}
