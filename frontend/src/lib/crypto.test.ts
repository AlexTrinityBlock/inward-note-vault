import { describe, expect, test } from "bun:test";

import { createNotebook, openNote, sealNote, unlockNotebook } from "./crypto";

const PASSWORD = "correct-horse-battery";

describe("encrypted notebook", () => {
  test("stores derivation parameters that are useless without the password", async () => {
    const { profile } = await createNotebook(PASSWORD);

    expect(profile.kdf).toBe("PBKDF2-SHA256");
    expect(profile.iterations).toBeGreaterThanOrEqual(600_000);
    expect(atob(profile.salt)).toHaveLength(16);
    expect(atob(profile.verifier_iv)).toHaveLength(12);
    // The verifier is ciphertext, so the password never appears in it.
    expect(profile.verifier_ciphertext).not.toContain(PASSWORD);
  });

  test("unlocks with the right password and reseals the same content", async () => {
    const { key, profile } = await createNotebook(PASSWORD);
    const unlocked = await unlockNotebook(PASSWORD, profile);

    expect(unlocked).not.toBeNull();

    const sealed = await sealNote(key, { title: "Shopping list", body: "- milk\n- 雞蛋" });
    const reopened = await openNote(unlocked as CryptoKey, sealed);

    expect(reopened).toEqual({ title: "Shopping list", body: "- milk\n- 雞蛋" });
  });

  test("rejects a wrong password without revealing why", async () => {
    const { profile } = await createNotebook(PASSWORD);

    expect(await unlockNotebook("not-the-password", profile)).toBeNull();
  });

  test("produces a different ciphertext every time", async () => {
    const { key } = await createNotebook(PASSWORD);

    const first = await sealNote(key, { title: "Same", body: "Same" });
    const second = await sealNote(key, { title: "Same", body: "Same" });

    expect(first.iv).not.toBe(second.iv);
    expect(first.ciphertext).not.toBe(second.ciphertext);
  });

  test("cannot open a note with another notebook's key", async () => {
    const first = await createNotebook(PASSWORD);
    const second = await createNotebook("a-different-password");

    const sealed = await sealNote(first.key, { title: "Private", body: "Secret" });

    await expect(openNote(second.key, sealed)).rejects.toThrow();
  });

  test("rejects an unsupported key-derivation function", async () => {
    const { profile } = await createNotebook(PASSWORD);

    await expect(unlockNotebook(PASSWORD, { ...profile, kdf: "md5" as never })).rejects.toThrow(
      /Unsupported/,
    );
  });
});
