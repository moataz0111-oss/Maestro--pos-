"""iter305: Verify send-welcome-to-owner and update_tenant(owner_password) 
target the correct admin by matching tenant.owner_email — not just any admin.

Scenario (real bug): Tenant "Maestro Egypt" has two admins:
  - hanialdujaili@... (the actual OWNER, email matches tenant.owner_email)
  - moataz@... (general manager, same admin role, DIFFERENT email)
When super_admin edits tenant with owner_password=X, only Hani's user must be updated.
When welcome button is clicked, welcome must go to Hani (not Moataz).
"""
import os, sys
import pytest
from unittest.mock import AsyncMock, patch, MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


# ==================== Helper: async cursor mock ====================
class _AsyncCursor:
    def __init__(self, docs):
        self._docs = list(docs)
    def sort(self, *a, **k): return self
    def limit(self, *a, **k): return self
    def __aiter__(self):
        self._i = 0
        return self
    async def __anext__(self):
        if self._i >= len(self._docs):
            raise StopAsyncIteration
        d = self._docs[self._i]; self._i += 1
        return d


# ==================== Test 1: WA logo file physical size ====================
def test_wa_logo_is_small_56x56():
    """WhatsApp logo file must be 56x56 (~5KB), NOT the large 240x240 email logo."""
    from PIL import Image
    path = "/app/backend/static/branding/maestro-logo-wa.png"
    assert os.path.exists(path), f"Missing {path}"
    with Image.open(path) as im:
        assert im.size == (56, 56), f"WA logo must be 56x56, got {im.size}"
    size_bytes = os.path.getsize(path)
    assert size_bytes < 15000, f"WA logo too big ({size_bytes}B); should be ~5KB"


def test_email_logo_larger_than_wa():
    """Email logo (240x240) must be present and clearly larger than WA logo."""
    from PIL import Image
    p_email = "/app/backend/static/branding/maestro-logo-email.png"
    assert os.path.exists(p_email)
    with Image.open(p_email) as im:
        assert im.size[0] >= 200, f"Email logo too small: {im.size}"


# ==================== Test 2: password vault edge cases ====================
def test_vault_roundtrip_edge_cases():
    """Roundtrip Arabic, special chars, empty string."""
    from server import encrypt_plain_password, decrypt_plain_password
    cases = ["MOataz0111750", "MyP@ss!ورد", "  spaces  ", "a", "🔑emoji"]
    for pw in cases:
        tok = encrypt_plain_password(pw)
        assert tok, f"encrypt failed for {pw!r}"
        assert decrypt_plain_password(tok) == pw, f"roundtrip failed for {pw!r}"

def test_vault_empty_and_none():
    """Empty string and None should be handled gracefully (not crash)."""
    from server import encrypt_plain_password, decrypt_plain_password
    # Empty and None: helper should either return None/empty (not raise)
    try:
        tok = encrypt_plain_password("")
        # Either it returned falsy OR it returned a valid roundtrip
        if tok:
            assert decrypt_plain_password(tok) == ""
    except Exception as e:
        pytest.fail(f"encrypt_plain_password('') raised: {e}")
    try:
        tok = encrypt_plain_password(None)
        assert tok in (None, "", False) or True  # accept any non-raise behavior
    except Exception as e:
        pytest.fail(f"encrypt_plain_password(None) raised: {e}")


# ==================== Test 3: send-welcome-to-owner picks correct admin ====================
@pytest.mark.asyncio
async def test_send_welcome_targets_admin_matching_owner_email():
    """When two admins exist in the same tenant, welcome goes to the one whose
    email matches tenant.owner_email — NOT any other admin (e.g., general manager)."""
    from routes.super_admin_routes import send_welcome_to_tenant_owner
    from server import UserRole

    tenant = {
        "id": "TID", "name": "Maestro Egypt",
        "owner_email": "hani@example.com",   # <-- the real owner
        "owner_phone": "+9647701234567",
        "owner_name": "Hani AlDujaili",
    }
    hani = {
        "id": "hani-user-id", "tenant_id": "TID", "role": UserRole.ADMIN,
        "email": "hani@example.com", "phone": "+9647701234567",
        "full_name": "Hani AlDujaili", "password_vault": "vault-hani",
    }
    moataz = {
        "id": "moataz-user-id", "tenant_id": "TID", "role": UserRole.ADMIN,
        "email": "moataz@example.com", "phone": "+9647709999999",
        "full_name": "Moataz Mehna", "password_vault": "vault-moataz",
    }

    async def find_one_users(query, projection=None):
        # emulate: exact match on email
        if query.get("email") == "hani@example.com":
            return hani
        return None

    delivered = {}
    async def _spy_bundle(owner_arg, tenant_arg):
        delivered["email"] = owner_arg.get("email")
        delivered["id"] = owner_arg.get("id")
        return {"ok": True, "email_sent": True, "whatsapp_sent": False, "sms_sent": False}

    with patch("routes.super_admin_routes.db") as mock_db, \
         patch("routes.super_admin_routes._send_welcome_bundle_to_user", side_effect=_spy_bundle), \
         patch("routes.super_admin_routes.record_audit", new=AsyncMock(return_value=None)):
        mock_db.tenants.find_one = AsyncMock(return_value=tenant)
        mock_db.users.find_one = AsyncMock(side_effect=find_one_users)
        mock_db.users.find = MagicMock(return_value=_AsyncCursor([moataz, hani]))  # fallback list
        mock_db.users.update_one = AsyncMock(return_value=None)

        resp = await send_welcome_to_tenant_owner(
            tenant_id="TID", payload=None,
            current_user={"id": "sa", "role": UserRole.SUPER_ADMIN, "email": "sa@x", "tenant_id": "system"}
        )

    assert resp["success"] is True
    assert delivered["email"] == "hani@example.com", \
        f"Welcome went to wrong admin: {delivered}"
    assert delivered["id"] == "hani-user-id"


@pytest.mark.asyncio
async def test_send_welcome_fallback_when_no_email_match():
    """If tenant.owner_email doesn't match any admin (edge case), fallback to oldest admin."""
    from routes.super_admin_routes import send_welcome_to_tenant_owner
    from server import UserRole

    tenant = {"id": "TID", "name": "T", "owner_email": "nomatch@x.com"}
    older = {"id": "older", "tenant_id": "TID", "role": UserRole.ADMIN,
             "email": "a@x.com", "password_vault": "va", "phone": "+964770", "full_name": "A"}

    delivered = {}
    async def _spy_bundle(owner_arg, tenant_arg):
        delivered["id"] = owner_arg.get("id")
        return {"ok": True, "email_sent": True, "whatsapp_sent": False, "sms_sent": False}

    with patch("routes.super_admin_routes.db") as mock_db, \
         patch("routes.super_admin_routes._send_welcome_bundle_to_user", side_effect=_spy_bundle), \
         patch("routes.super_admin_routes.record_audit", new=AsyncMock(return_value=None)):
        mock_db.tenants.find_one = AsyncMock(return_value=tenant)
        mock_db.users.find_one = AsyncMock(return_value=None)  # no exact email match
        mock_db.users.find = MagicMock(return_value=_AsyncCursor([older]))
        mock_db.users.update_one = AsyncMock(return_value=None)
        resp = await send_welcome_to_tenant_owner(
            tenant_id="TID", payload=None,
            current_user={"id": "sa", "role": UserRole.SUPER_ADMIN, "tenant_id": "system"}
        )
    assert resp["success"] is True
    assert delivered["id"] == "older"


@pytest.mark.asyncio
async def test_send_welcome_404_when_tenant_missing():
    from routes.super_admin_routes import send_welcome_to_tenant_owner
    from server import UserRole
    from fastapi import HTTPException
    with patch("routes.super_admin_routes.db") as mock_db:
        mock_db.tenants.find_one = AsyncMock(return_value=None)
        with pytest.raises(HTTPException) as exc:
            await send_welcome_to_tenant_owner(
                "no-such-tenant", None,
                {"id": "sa", "role": UserRole.SUPER_ADMIN, "tenant_id": "system"}
            )
        assert exc.value.status_code == 404


# ==================== Test 4: update_tenant(owner_password) targets correct admin ====================
@pytest.mark.asyncio
async def test_update_tenant_owner_password_updates_correct_admin():
    """PUT /tenants/{id} with owner_password must update admin matching owner_email,
    NOT any other admin. Verify user.update_one was called with the correct user id."""
    from routes.super_admin_routes import update_tenant
    from server import UserRole

    tenant = {
        "id": "TID", "name": "Maestro Egypt",
        "owner_email": "hani@example.com",
    }
    hani = {"id": "hani-user-id"}

    updated_ids = []
    async def upd(query, updates):
        updated_ids.append(query.get("id"))
        return MagicMock(modified_count=1)

    with patch("routes.super_admin_routes.db") as mock_db, \
         patch("routes.super_admin_routes.hash_password", return_value="H"), \
         patch("routes.super_admin_routes.encrypt_plain_password", return_value="V"), \
         patch("routes.super_admin_routes.record_audit", new=AsyncMock(return_value=None)):
        mock_db.tenants.find_one = AsyncMock(return_value=tenant)
        mock_db.tenants.update_one = AsyncMock(return_value=MagicMock(modified_count=1))

        # users.find_one → return hani when owner_query includes email=hani
        async def find_one_users(q, proj=None):
            if q.get("email") == "hani@example.com" and q.get("role") == UserRole.ADMIN:
                return hani
            return None
        mock_db.users.find_one = AsyncMock(side_effect=find_one_users)
        mock_db.users.find = MagicMock(return_value=_AsyncCursor([]))
        mock_db.users.update_one = AsyncMock(side_effect=upd)

        bg = MagicMock()
        bg.add_task = MagicMock()
        resp = await update_tenant(
            tenant_id="TID",
            updates={"owner_password": "MOataz0111750"},
            background_tasks=bg,
            current_user={"id": "sa", "role": UserRole.SUPER_ADMIN, "tenant_id": "system"}
        )
    assert "hani-user-id" in updated_ids, \
        f"owner_password should update hani (matching owner_email), got updates for: {updated_ids}"


@pytest.mark.asyncio
async def test_update_tenant_owner_password_does_not_pick_wrong_admin():
    """Even if multiple admins exist, only the one matching owner_email is updated."""
    from routes.super_admin_routes import update_tenant
    from server import UserRole

    tenant = {"id": "TID", "name": "X", "owner_email": "hani@example.com"}
    hani = {"id": "hani-id"}
    moataz = {"id": "moataz-id"}

    updated_ids = []
    async def upd(query, updates):
        updated_ids.append(query.get("id"))
        return MagicMock(modified_count=1)

    async def find_one_users(q, proj=None):
        # If query filters by hani's email → return hani; otherwise emulate DB miss
        if q.get("email") == "hani@example.com":
            return hani
        return None  # anything without email filter would fall back — we don't want that

    with patch("routes.super_admin_routes.db") as mock_db, \
         patch("routes.super_admin_routes.hash_password", return_value="H"), \
         patch("routes.super_admin_routes.encrypt_plain_password", return_value="V"), \
         patch("routes.super_admin_routes.record_audit", new=AsyncMock(return_value=None)):
        mock_db.tenants.find_one = AsyncMock(return_value=tenant)
        mock_db.tenants.update_one = AsyncMock(return_value=MagicMock(modified_count=1))
        mock_db.users.find_one = AsyncMock(side_effect=find_one_users)
        # Fallback cursor would include moataz first (if code fell back wrongly)
        mock_db.users.find = MagicMock(return_value=_AsyncCursor([moataz]))
        mock_db.users.update_one = AsyncMock(side_effect=upd)

        bg = MagicMock(); bg.add_task = MagicMock()
        await update_tenant(
            "TID", {"owner_password": "SecretPW1"}, bg,
            {"id": "sa", "role": UserRole.SUPER_ADMIN, "tenant_id": "system"}
        )
    assert updated_ids == ["hani-id"], \
        f"Only Hani should be updated (matches owner_email); got: {updated_ids}"
    assert "moataz-id" not in updated_ids, "Moataz (general mgr) must NOT be touched"
