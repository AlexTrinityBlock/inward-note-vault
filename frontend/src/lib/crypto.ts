/**
 * Encrypted-notebook crypto, entirely in the browser.
 *
 * The password never leaves this module's call stack, and the derived key lives
 * in memory only: it is not written to `localStorage`, `sessionStorage`, or a
 * cookie. The server stores the salt, the iteration count and a verifier blob so
 * another browser can derive the same key again (`src/api` -> `/crypto/profile`).
 */

const KDF = "PBKDF2-SHA256" as const;
const PBKDF2_ITERATIONS = 600_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const KEY_BITS = 256;

/** Known plaintext, encrypted once so a later unlock can prove the password. */
const VERIFIER_PLAINTEXT = "inward-note-vault.verifier.v1";

export type EncryptedPayload = {
  ciphertext: string;
  iv: string;
};

export type NotebookKey = CryptoKey;

export type CryptoProfilePayload = {
  kdf: typeof KDF;
  salt: string;
  iterations: number;
  verifier_iv: string;
  verifier_ciphertext: string;
};

export type NoteSecret = {
  title: string;
  body: string;
};

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function deriveKey(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<NotebookKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: KEY_BITS },
    false,
    ["encrypt", "decrypt"],
  );
}

async function encrypt(key: NotebookKey, plaintext: string): Promise<EncryptedPayload> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    new TextEncoder().encode(plaintext),
  );
  return { ciphertext: toBase64(new Uint8Array(ciphertext)), iv: toBase64(iv) };
}

async function decrypt(
  key: NotebookKey,
  payload: EncryptedPayload,
): Promise<string> {
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(payload.iv) as BufferSource },
    key,
    fromBase64(payload.ciphertext) as BufferSource,
  );
  return new TextDecoder().decode(plaintext);
}

/**
 * Create the parameters for a brand-new encrypted notebook.
 *
 * The returned profile is public; the key stays here.
 */
export async function createNotebook(
  password: string,
): Promise<{ key: NotebookKey; profile: CryptoProfilePayload }> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const key = await deriveKey(password, salt, PBKDF2_ITERATIONS);
  const verifier = await encrypt(key, VERIFIER_PLAINTEXT);

  return {
    key,
    profile: {
      kdf: KDF,
      salt: toBase64(salt),
      iterations: PBKDF2_ITERATIONS,
      verifier_iv: verifier.iv,
      verifier_ciphertext: verifier.ciphertext,
    },
  };
}

/**
 * Derive the key for an existing notebook and check it against the verifier.
 *
 * Returns `null` when the password is wrong, so callers can show one message
 * without leaking why it failed.
 */
export async function unlockNotebook(
  password: string,
  profile: CryptoProfilePayload,
): Promise<NotebookKey | null> {
  if (profile.kdf !== KDF) {
    throw new Error(`Unsupported key-derivation function: ${profile.kdf}`);
  }

  const key = await deriveKey(password, fromBase64(profile.salt), profile.iterations);

  try {
    const verifier = await decrypt(key, {
      ciphertext: profile.verifier_ciphertext,
      iv: profile.verifier_iv,
    });
    return verifier === VERIFIER_PLAINTEXT ? key : null;
  } catch {
    // AES-GCM authentication fails when the key is wrong.
    return null;
  }
}

/** Encrypt one note's title and body into a single opaque payload. */
export async function sealNote(key: NotebookKey, secret: NoteSecret): Promise<EncryptedPayload> {
  return encrypt(key, JSON.stringify(secret));
}

/** Decrypt a note payload. Throws when the key does not match. */
export async function openNote(
  key: NotebookKey,
  payload: EncryptedPayload,
): Promise<NoteSecret> {
  const parsed: unknown = JSON.parse(await decrypt(key, payload));
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Encrypted note payload is not an object");
  }
  const { title, body } = parsed as Partial<NoteSecret>;
  return { title: title ?? "", body: body ?? "" };
}
