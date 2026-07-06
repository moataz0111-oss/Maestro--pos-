"""Twilio Verify wrapper for sending/checking OTP codes via SMS and WhatsApp.

Twilio manages the code lifecycle (generation, expiry, rate limiting). We only
trigger a verification and later check the code the user entered. If Twilio is not
configured (keys missing) the functions report ``configured=False`` so the caller
can gracefully fall back (e.g. email, or a pending-delivery mode).
"""
import os
import asyncio
import logging

logger = logging.getLogger("twilio_verify")


def _creds():
    return (
        os.environ.get("TWILIO_ACCOUNT_SID") or "",
        os.environ.get("TWILIO_AUTH_TOKEN") or "",
        os.environ.get("TWILIO_VERIFY_SERVICE_SID") or "",
    )


def is_configured() -> bool:
    sid, token, service = _creds()
    return bool(sid and token and service)


def _client():
    from twilio.rest import Client
    sid, token, _ = _creds()
    return Client(sid, token)


def _start_sync(to_phone: str, channel: str):
    sid, token, service = _creds()
    client = _client()
    verification = client.verify.v2.services(service).verifications.create(
        to=to_phone, channel=channel
    )
    return verification.status


def _check_sync(to_phone: str, code: str) -> bool:
    sid, token, service = _creds()
    client = _client()
    check = client.verify.v2.services(service).verification_checks.create(
        to=to_phone, code=code
    )
    return check.status == "approved"


async def start_verification(to_phone: str, channel: str = "sms"):
    """Send an OTP through Twilio Verify. channel: 'sms' | 'whatsapp'.
    Returns (ok: bool, status_or_error: str)."""
    if not is_configured():
        return False, "twilio_not_configured"
    try:
        status = await asyncio.to_thread(_start_sync, to_phone, channel)
        return True, status
    except Exception as e:
        logger.error(f"Twilio start_verification failed ({channel}) to {to_phone}: {e}")
        return False, str(e)


async def check_verification(to_phone: str, code: str):
    """Check a code the user entered. Returns (ok: bool, approved: bool, error: str|None)."""
    if not is_configured():
        return False, False, "twilio_not_configured"
    try:
        approved = await asyncio.to_thread(_check_sync, to_phone, code)
        return True, approved, None
    except Exception as e:
        logger.error(f"Twilio check_verification failed to {to_phone}: {e}")
        return False, False, str(e)
