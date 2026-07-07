"""Tests for order-chat voice message endpoint (iter245).

Covers:
- POST /api/order-chat/{order_id}/voice (multipart upload)
- The returned audio_url is publicly fetchable (200, audio/video content-type)
- GET /api/order-chat/{order_id} returns the voice + text messages
- 404 for non-existent order, 400 for empty file
"""
import io
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://whatsapp-pos-system.preview.emergentagent.com").rstrip("/")
ORDER_ID = "252ccd0a-e564-4a37-bb6c-974f8668169d"

# Minimal WebM container header (valid EBML signature for audio/webm)
# This is enough bytes (>0) to pass the "empty file" check.
WEBM_BYTES = (
    b"\x1aE\xdf\xa3\x9fB\x86\x81\x01B\xf7\x81\x01B\xf2\x81\x04B\xf3\x81\x08"
    b"B\x82\x84webmB\x87\x81\x02B\x85\x81\x02" + b"\x00" * 256
)


@pytest.fixture(scope="module")
def voice_upload():
    """Upload a voice message; reused by downstream tests."""
    files = {"file": ("note.webm", io.BytesIO(WEBM_BYTES), "audio/webm")}
    data = {"sender": "customer", "sender_name": "TEST_Customer", "duration": "3.4"}
    resp = requests.post(f"{BASE_URL}/api/order-chat/{ORDER_ID}/voice", files=files, data=data, timeout=30)
    assert resp.status_code == 200, f"Voice upload failed: {resp.status_code} {resp.text}"
    return resp.json()


# ===== Voice upload basics =====
class TestVoiceUpload:
    def test_voice_upload_returns_voice_doc(self, voice_upload):
        d = voice_upload
        assert d.get("type") == "voice"
        assert d.get("sender") == "customer"
        assert d.get("sender_name") == "TEST_Customer"
        assert isinstance(d.get("audio_url"), str)
        assert d["audio_url"].startswith("/api/uploads/voice/")
        assert d["audio_url"].endswith(".webm")
        assert d.get("duration") == 3.4
        assert "id" in d and isinstance(d["id"], str)
        assert "_id" not in d

    def test_audio_url_publicly_fetchable(self, voice_upload):
        url = BASE_URL + voice_upload["audio_url"]
        r = requests.get(url, timeout=30)
        assert r.status_code == 200, f"Audio URL not fetchable: {r.status_code}"
        ct = r.headers.get("content-type", "").lower()
        assert ("audio" in ct) or ("video" in ct) or ("webm" in ct) or ("octet-stream" in ct), \
            f"Unexpected content-type: {ct}"
        assert len(r.content) > 0


# ===== GET chat returns voice + text =====
class TestChatList:
    def test_get_chat_includes_voice(self, voice_upload):
        r = requests.get(f"{BASE_URL}/api/order-chat/{ORDER_ID}", timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        # endpoint may return {"messages": [...]} OR a bare list — handle both
        msgs = data.get("messages") if isinstance(data, dict) else data
        assert isinstance(msgs, list) and len(msgs) > 0
        target = next((m for m in msgs if m.get("id") == voice_upload["id"]), None)
        assert target is not None, "Uploaded voice message not present in GET response"
        assert target.get("type") == "voice"
        assert target.get("audio_url", "").startswith("/api/uploads/voice/")
        assert "duration" in target

    def test_text_message_still_works(self):
        payload = {"sender": "customer", "sender_name": "TEST_Customer", "text": "TEST_hello iter245"}
        r = requests.post(f"{BASE_URL}/api/order-chat/{ORDER_ID}", json=payload, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("text") == "TEST_hello iter245"
        assert d.get("sender") == "customer"
        # text message should NOT have type=voice
        assert d.get("type") != "voice" or d.get("audio_url") is None

        # confirm appears in GET
        r2 = requests.get(f"{BASE_URL}/api/order-chat/{ORDER_ID}", timeout=30)
        assert r2.status_code == 200
        data = r2.json()
        msgs = data.get("messages") if isinstance(data, dict) else data
        assert any(m.get("id") == d["id"] for m in msgs)


# ===== Error cases =====
class TestVoiceErrors:
    def test_voice_404_on_unknown_order(self):
        files = {"file": ("note.webm", io.BytesIO(WEBM_BYTES), "audio/webm")}
        data = {"sender": "customer", "duration": "1.0"}
        r = requests.post(f"{BASE_URL}/api/order-chat/__does_not_exist__/voice", files=files, data=data, timeout=30)
        assert r.status_code == 404, f"Expected 404, got {r.status_code}: {r.text}"

    def test_voice_400_on_empty_file(self):
        files = {"file": ("empty.webm", io.BytesIO(b""), "audio/webm")}
        data = {"sender": "customer", "duration": "0"}
        r = requests.post(f"{BASE_URL}/api/order-chat/{ORDER_ID}/voice", files=files, data=data, timeout=30)
        assert r.status_code == 400, f"Expected 400, got {r.status_code}: {r.text}"
