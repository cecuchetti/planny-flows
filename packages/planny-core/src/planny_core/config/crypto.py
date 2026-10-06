"""Encryption for secrets stored in the settings store.

AES-256-GCM, with the key derived from the master key rather than used directly.
The master key is an operator-supplied string of arbitrary length; HKDF turns it
into a uniform 32-byte key, and the fixed salt and info string make the derivation
reproducible across processes and versions.

Every ciphertext carries the identifier of the key that produced it
(``key_id``). That is what lets the store detect a master key that no longer
matches its data and say so, rather than failing later with a decryption error
that says nothing.

Stored format::

    v1:<key_id>:<base64(nonce || ciphertext)>

The version prefix exists so the format can change without guessing at what is
already on disk.
"""

from __future__ import annotations

import base64
import hashlib
import os

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

from planny_core.errors import InsecureConfigurationError

__all__ = [
    "TOKEN_VERSION",
    "MasterKeyMismatchError",
    "decrypt",
    "derive_key",
    "encrypt",
    "key_id",
]

#: Prefix on every stored ciphertext.
TOKEN_VERSION = "v1"

#: Length of the AES-GCM nonce, in bytes. 96 bits is the recommended size.
_NONCE_BYTES = 12

#: Length of the key fingerprint exposed as ``key_id``, in hex characters.
_KEY_ID_CHARS = 12

#: Fixed derivation inputs. Changing either makes every stored secret
#: undecryptable, so they are constants rather than configuration.
_HKDF_SALT = b"planny-flows/settings-store"
_HKDF_INFO = b"aes-256-gcm"


class MasterKeyMismatchError(InsecureConfigurationError):
    """A stored secret was encrypted with a different master key.

    Subclasses :class:`InsecureConfigurationError` because it aborts startup:
    continuing would mean silently ignoring stored credentials, and the operator
    would have no way to tell that their configuration is not in effect.
    """


def derive_key(master_key: str) -> bytes:
    """Derive the 32-byte AES key from the operator's master key."""
    return HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=_HKDF_SALT,
        info=_HKDF_INFO,
    ).derive(master_key.encode("utf-8"))


def key_id(master_key: str) -> str:
    """Return a short, non-reversible fingerprint of the master key.

    Stored alongside each ciphertext so a mismatch is detected and reported.
    Being a hash of the key rather than of the derived bytes is deliberate: it is
    an identifier, never used as key material.
    """
    digest = hashlib.sha256(master_key.encode("utf-8")).hexdigest()
    return digest[:_KEY_ID_CHARS]


def encrypt(plaintext: str, master_key: str) -> str:
    """Encrypt *plaintext*, returning a self-describing token."""
    nonce = os.urandom(_NONCE_BYTES)
    ciphertext = AESGCM(derive_key(master_key)).encrypt(
        nonce, plaintext.encode("utf-8"), None
    )
    payload = base64.b64encode(nonce + ciphertext).decode("ascii")
    return f"{TOKEN_VERSION}:{key_id(master_key)}:{payload}"


def decrypt(token: str, master_key: str) -> str:
    """Decrypt a token produced by :func:`encrypt`.

    Raises:
        MasterKeyMismatchError: the token names a different master key, or the
            ciphertext failed authentication — which means it was altered or
            corrupted.
        ValueError: the token is malformed.
    """
    parts = token.split(":", 2)
    if len(parts) != 3:
        raise ValueError("Malformed encrypted value.")

    version, token_key_id, payload = parts
    if version != TOKEN_VERSION:
        raise ValueError(f"Unsupported encrypted value version: {version!r}")

    if token_key_id != key_id(master_key):
        raise MasterKeyMismatchError(
            "A stored secret was encrypted with a different MASTER_KEY "
            f"(stored {token_key_id}, current {key_id(master_key)}). "
            "Restore the original key, or clear the stored secrets and set them again."
        )

    try:
        raw = base64.b64decode(payload, validate=True)
    except Exception as exc:  # noqa: BLE001 - any decode failure means corrupt
        raise ValueError("Malformed encrypted value.") from exc

    if len(raw) <= _NONCE_BYTES:
        raise ValueError("Malformed encrypted value.")

    nonce, ciphertext = raw[:_NONCE_BYTES], raw[_NONCE_BYTES:]
    try:
        return AESGCM(derive_key(master_key)).decrypt(nonce, ciphertext, None).decode("utf-8")
    except InvalidTag as exc:
        # The key_id matched, so this is tampering or corruption rather than a
        # wrong key. Reported as a mismatch because the operator action is the
        # same: the stored value cannot be trusted.
        raise MasterKeyMismatchError(
            "A stored secret failed authentication; it was altered or the "
            "master key is not the one that produced it."
        ) from exc
