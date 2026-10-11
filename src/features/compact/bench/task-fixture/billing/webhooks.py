"""Webhooks to partners (docs/webhooks-contract.md).

Every event is sent as compact UTF-8 JSON and signed: the Ledgerline-Signature header is
`t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<body>">`, keyed with the partner's signing key.
verify_signature is what partners' SDKs call to check a delivery.
"""

import hashlib
import hmac
import json

TOLERANCE_SECONDS = 300


def encode(payload: dict) -> bytes:
    """The body as it goes on the wire."""
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def _mac(signing_key: str, timestamp: int, body: bytes) -> str:
    return hmac.new(signing_key.encode(), str(timestamp).encode() + b"." + body, hashlib.sha256).hexdigest()


def sign_payload(payload: dict, signing_key: str, timestamp: int) -> str:
    """The signature header for this payload."""
    return f"t={timestamp},v1={_mac(signing_key, timestamp, encode(payload))}"


def verify_signature(body: bytes, header: str, signing_key: str, now: int) -> bool:
    """Is this delivery signed with signing_key, and recent?"""
    try:
        parts = dict(p.split("=", 1) for p in header.split(","))
        timestamp = int(parts["t"])
        given = parts["v1"]
    except (KeyError, ValueError):
        return False
    if abs(now - timestamp) > TOLERANCE_SECONDS:
        return False
    # normalise the body first, so whitespace a proxy adds does not break the check
    canonical = json.dumps(json.loads(body), separators=(",", ":")).encode("utf-8")
    return hmac.compare_digest(_mac(signing_key, timestamp, canonical), given)


def event(kind: str, event_id: str, created: int, data: dict) -> dict:
    """An event as partners receive it."""
    return {"id": event_id, "type": kind, "created": created, "data": data}


def invoice_paid(invoice_summary: dict, customer_name: str, event_id: str, created: int) -> dict:
    """The invoice.paid event."""
    return event("invoice.paid", event_id, created, {**invoice_summary, "customer_name": customer_name})
