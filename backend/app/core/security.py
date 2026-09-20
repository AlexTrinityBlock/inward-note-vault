"""Password hashing and token helpers.

Hashing uses scrypt from the standard library, so the API has no binary
dependency for credential storage.
"""

import hmac
import secrets
from hashlib import scrypt

_SCRYPT_N = 2**14
_SCRYPT_R = 8
_SCRYPT_P = 1
_SALT_BYTES = 16
_KEY_BYTES = 32


def hash_password(password: str) -> str:
    """Hash a password, returning `scrypt$n$r$p$salt$hash`."""
    salt = secrets.token_bytes(_SALT_BYTES)
    digest = scrypt(
        password.encode(),
        salt=salt,
        n=_SCRYPT_N,
        r=_SCRYPT_R,
        p=_SCRYPT_P,
        dklen=_KEY_BYTES,
    )
    return f"scrypt${_SCRYPT_N}${_SCRYPT_R}${_SCRYPT_P}${salt.hex()}${digest.hex()}"


def verify_password(password: str, hashed: str) -> bool:
    """Check a password against a value produced by `hash_password`."""
    try:
        scheme, n, r, p, salt_hex, digest_hex = hashed.split("$")
        if scheme != "scrypt":
            return False
        candidate = scrypt(
            password.encode(),
            salt=bytes.fromhex(salt_hex),
            n=int(n),
            r=int(r),
            p=int(p),
            dklen=len(digest_hex) // 2,
        )
    except ValueError, TypeError:
        return False
    return hmac.compare_digest(candidate.hex(), digest_hex)


def new_api_token() -> str:
    """Return a URL-safe token suitable for API keys and session secrets."""
    return secrets.token_urlsafe(32)
