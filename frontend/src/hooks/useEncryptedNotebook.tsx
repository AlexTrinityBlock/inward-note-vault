/**
 * The encrypted notebook's unlocked key, held in React state for the tab's
 * lifetime. It is never persisted, so a reload locks the notebook again.
 */
import { createContext, use, useCallback, useMemo, useState, type ReactNode } from "react";

import { useCreateCryptoProfile, useGetCryptoProfile } from "../client/generated";
import type { CryptoProfileRead } from "../client/generated/models";
import { createNotebook, unlockNotebook, type NotebookKey } from "../lib/crypto";

type EncryptedNotebookValue = {
  /** Key-derivation parameters, or `null` while the notebook is uninitialized. */
  profile: CryptoProfileRead | null;
  /** `null` until the notebook is unlocked for this tab. */
  key: NotebookKey | null;
  unlocked: boolean;
  loading: boolean;
  /** Derive the key from an existing notebook password. `false` means wrong password. */
  unlock: (password: string) => Promise<boolean>;
  /** Create the notebook: store new parameters and unlock with them. */
  create: (password: string) => Promise<void>;
  lock: () => void;
};

const EncryptedNotebookContext = createContext<EncryptedNotebookValue | null>(null);

export function EncryptedNotebookProvider({ children }: { children: ReactNode }) {
  const profileQuery = useGetCryptoProfile();
  const createProfile = useCreateCryptoProfile();
  const [key, setKey] = useState<NotebookKey | null>(null);

  const profile =
    profileQuery.data?.initialized && profileQuery.data.salt ? profileQuery.data : null;

  const unlock = useCallback(
    async (password: string): Promise<boolean> => {
      if (!profile?.salt || !profile.kdf || !profile.iterations) {
        return false;
      }
      const derived = await unlockNotebook(password, {
        kdf: "PBKDF2-SHA256",
        salt: profile.salt,
        iterations: profile.iterations,
        verifier_iv: profile.verifier_iv ?? "",
        verifier_ciphertext: profile.verifier_ciphertext ?? "",
      });
      if (!derived) {
        return false;
      }
      setKey(derived);
      return true;
    },
    [profile],
  );

  const create = useCallback(
    async (password: string): Promise<void> => {
      const { key: derived, profile: parameters } = await createNotebook(password);
      await createProfile.mutateAsync({ data: parameters });
      setKey(derived);
    },
    [createProfile],
  );

  const lock = useCallback(() => setKey(null), []);

  const value = useMemo<EncryptedNotebookValue>(
    () => ({
      profile,
      key,
      unlocked: key !== null,
      loading: profileQuery.isPending,
      unlock,
      create,
      lock,
    }),
    [profile, key, profileQuery.isPending, unlock, create, lock],
  );

  return <EncryptedNotebookContext value={value}>{children}</EncryptedNotebookContext>;
}

export function useEncryptedNotebook(): EncryptedNotebookValue {
  const value = use(EncryptedNotebookContext);
  if (!value) {
    throw new Error("useEncryptedNotebook must be used inside <EncryptedNotebookProvider>");
  }
  return value;
}
