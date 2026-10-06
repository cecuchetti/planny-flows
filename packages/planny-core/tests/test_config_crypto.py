"""Tests for the secret encryption layer."""

from __future__ import annotations

import base64
import uuid

import pytest

from planny_core.config.crypto import (
    TOKEN_VERSION,
    MasterKeyMismatchError,
    decrypt,
    derive_key,
    encrypt,
    key_id,
)

MASTER_KEY = "a-master-key"


class TestDeriveKey:
    """The operator's string becomes a uniform AES key."""

    def test_produces_a_32_byte_key(self) -> None:
        assert len(derive_key(MASTER_KEY)) == 32

    def test_is_deterministic(self) -> None:
        """It must be, or nothing could be decrypted after a restart."""
        assert derive_key(MASTER_KEY) == derive_key(MASTER_KEY)

    def test_differs_per_master_key(self) -> None:
        assert derive_key("a") != derive_key("b")

    def test_accepts_keys_of_any_length(self) -> None:
        """HKDF is what makes a short operator string usable as an AES key."""
        short, long = derive_key("x"), derive_key("x" * 4096)
        assert len(short) == len(long) == 32
        assert short != long


class TestKeyId:
    """A fingerprint that identifies the key without revealing it."""

    def test_is_stable_and_short(self) -> None:
        assert key_id(MASTER_KEY) == key_id(MASTER_KEY)
        assert len(key_id(MASTER_KEY)) == 12

    def test_differs_per_key(self) -> None:
        assert key_id("a") != key_id("b")

    def test_does_not_contain_the_key(self) -> None:
        assert MASTER_KEY not in key_id(MASTER_KEY)


class TestEncryptDecrypt:
    """Round trips, and the shapes that must be rejected."""

    def test_round_trip(self) -> None:
        assert decrypt(encrypt("secret", MASTER_KEY), MASTER_KEY) == "secret"

    @pytest.mark.parametrize(
        "plaintext",
        ["", "a", "hunter2", "with spaces and 'quotes'", "ñandú-ünïcode", "x" * 10_000],
    )
    def test_round_trips_awkward_values(self, plaintext: str) -> None:
        assert decrypt(encrypt(plaintext, MASTER_KEY), MASTER_KEY) == plaintext

    def test_ciphertext_does_not_contain_the_plaintext(self) -> None:
        assert "hunter2" not in encrypt("hunter2", MASTER_KEY)

    def test_two_encryptions_differ(self) -> None:
        """A fresh nonce per call, so equal secrets are not visibly equal."""
        assert encrypt("same", MASTER_KEY) != encrypt("same", MASTER_KEY)

    def test_token_declares_its_version_and_key(self) -> None:
        version, token_key_id, payload = encrypt("x", MASTER_KEY).split(":", 2)
        assert version == TOKEN_VERSION
        assert token_key_id == key_id(MASTER_KEY)
        assert payload


class TestRejectsBadInput:
    """Every failure mode is reported precisely."""

    def test_a_different_master_key_is_named(self) -> None:
        token = encrypt("secret", "original")
        with pytest.raises(MasterKeyMismatchError) as excinfo:
            decrypt(token, "another")

        message = str(excinfo.value)
        assert "different MASTER_KEY" in message
        # Both identifiers appear, so the operator can tell which is which.
        assert key_id("original") in message
        assert key_id("another") in message

    def test_tampering_is_detected(self) -> None:
        """GCM authenticates as well as encrypts, so a flipped bit fails."""
        version, token_key_id, payload = encrypt("secret", MASTER_KEY).split(":", 2)
        raw = bytearray(base64.b64decode(payload))
        raw[-1] ^= 0x01
        tampered = f"{version}:{token_key_id}:{base64.b64encode(bytes(raw)).decode()}"

        with pytest.raises(MasterKeyMismatchError):
            decrypt(tampered, MASTER_KEY)

    @pytest.mark.parametrize(
        "token",
        [
            "",
            "no-colons",
            "v1:only-two",
            "v1:abc:!!!not-base64!!!",
            "v1:abc:",
            "v2:abc:AAAA",
        ],
    )
    def test_malformed_tokens_are_rejected(self, token: str) -> None:
        with pytest.raises((ValueError, MasterKeyMismatchError)):
            decrypt(token, MASTER_KEY)

    def test_a_truncated_payload_is_rejected(self) -> None:
        """Fewer bytes than a nonce cannot be a valid token."""
        token = f"v1:{key_id(MASTER_KEY)}:{base64.b64encode(b'short').decode()}"
        with pytest.raises(ValueError):
            decrypt(token, MASTER_KEY)

    def test_an_unknown_version_is_rejected(self) -> None:
        """Guards the format against a future version being read as this one."""
        _, token_key_id, payload = encrypt("x", MASTER_KEY).split(":", 2)
        with pytest.raises(ValueError) as excinfo:
            decrypt(f"v9:{token_key_id}:{payload}", MASTER_KEY)
        assert "version" in str(excinfo.value).lower()


class TestNoKeyLeakage:
    """The failure messages must not become an oracle for the key."""

    def test_the_key_never_appears_in_a_token(self) -> None:
        assert MASTER_KEY not in encrypt("x", MASTER_KEY)

    def test_the_error_does_not_echo_the_key(self) -> None:
        token = encrypt("secret", "the-original-key")
        with pytest.raises(MasterKeyMismatchError) as excinfo:
            decrypt(token, "the-wrong-key")

        assert "the-wrong-key" not in str(excinfo.value)
        assert "the-original-key" not in str(excinfo.value)

    def test_nonces_are_unique_across_many_calls(self) -> None:
        """A repeated nonce under one key is the classic GCM failure."""
        nonces = {
            base64.b64decode(encrypt("x", MASTER_KEY).split(":", 2)[2])[:12]
            for _ in range(200)
        }
        assert len(nonces) == 200

    def test_the_same_value_under_two_keys_differs(self) -> None:
        assert encrypt("x", "key-a") != encrypt("x", "key-b")


class TestUniqueKeysBehave:
    """A broad sweep: many random keys and values all round trip."""

    def test_many_random_round_trips(self) -> None:
        for _ in range(50):
            key = uuid.uuid4().hex
            value = uuid.uuid4().hex
            assert decrypt(encrypt(value, key), key) == value
