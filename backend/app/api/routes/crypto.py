"""Encrypted-notebook parameters.

The API stores only what a browser needs to derive the key again. It never
receives the notebook password or the derived key, and it cannot decrypt any
note: `POST /notes` keeps the payload opaque.
"""

import base64
import binascii

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field, field_validator

from app import crud
from app.api.deps import CurrentUser, SessionDep

router = APIRouter(prefix="/crypto", tags=["crypto"])

KDF_PBKDF2_SHA256 = "PBKDF2-SHA256"
MIN_ITERATIONS = 100_000
MAX_ITERATIONS = 10_000_000
SALT_BYTES = 16
IV_BYTES = 12


def _decode(value: str, *, expected_bytes: int | None = None) -> bytes:
    """Decode strict base64, raising a 422 for bad input."""
    try:
        raw = base64.b64decode(value, validate=True)
    except (binascii.Error, ValueError) as error:
        raise ValueError("must be base64") from error
    if expected_bytes is not None and len(raw) != expected_bytes:
        raise ValueError(f"must decode to {expected_bytes} bytes")
    return raw


class CryptoProfileRead(BaseModel):
    """Key-derivation parameters, or `initialized: false` before first use."""

    initialized: bool
    kdf: str | None = None
    salt: str | None = None
    iterations: int | None = None
    verifier_iv: str | None = None
    verifier_ciphertext: str | None = None


class CryptoProfileCreate(BaseModel):
    """Parameters produced by the browser when the notebook is first unlocked."""

    kdf: str = Field(default=KDF_PBKDF2_SHA256)
    salt: str = Field(description=f"Base64, {SALT_BYTES} bytes")
    iterations: int = Field(ge=MIN_ITERATIONS, le=MAX_ITERATIONS)
    verifier_iv: str = Field(description=f"Base64, {IV_BYTES} bytes")
    verifier_ciphertext: str = Field(description="Base64 AES-GCM blob of a known constant")

    @field_validator("kdf")
    @classmethod
    def _known_kdf(cls, value: str) -> str:
        if value != KDF_PBKDF2_SHA256:
            raise ValueError(f"only {KDF_PBKDF2_SHA256} is supported")
        return value

    @field_validator("salt")
    @classmethod
    def _salt(cls, value: str) -> str:
        _decode(value, expected_bytes=SALT_BYTES)
        return value

    @field_validator("verifier_iv")
    @classmethod
    def _iv(cls, value: str) -> str:
        _decode(value, expected_bytes=IV_BYTES)
        return value

    @field_validator("verifier_ciphertext")
    @classmethod
    def _ciphertext(cls, value: str) -> str:
        _decode(value)
        return value


@router.get("/profile", operation_id="getCryptoProfile")
def read_profile(session: SessionDep, _user: CurrentUser) -> CryptoProfileRead:
    """Read the encrypted notebook's key-derivation parameters."""
    profile = crud.get_crypto_profile(session)
    if profile is None:
        return CryptoProfileRead(initialized=False)
    return CryptoProfileRead(
        initialized=True,
        kdf=profile.kdf,
        salt=profile.salt,
        iterations=profile.iterations,
        verifier_iv=profile.verifier_iv,
        verifier_ciphertext=profile.verifier_ciphertext,
    )


@router.post("/profile", status_code=status.HTTP_201_CREATED, operation_id="createCryptoProfile")
def create_profile(
    payload: CryptoProfileCreate, session: SessionDep, _user: CurrentUser
) -> CryptoProfileRead:
    """Store the parameters once, the first time the notebook is unlocked."""
    if crud.get_crypto_profile(session) is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The encrypted notebook is already initialized",
        )
    profile = crud.create_crypto_profile(
        session,
        kdf=payload.kdf,
        salt=payload.salt,
        iterations=payload.iterations,
        verifier_iv=payload.verifier_iv,
        verifier_ciphertext=payload.verifier_ciphertext,
    )
    return CryptoProfileRead(
        initialized=True,
        kdf=profile.kdf,
        salt=profile.salt,
        iterations=profile.iterations,
        verifier_iv=profile.verifier_iv,
        verifier_ciphertext=profile.verifier_ciphertext,
    )
