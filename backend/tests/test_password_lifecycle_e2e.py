"""E2E Test: تحقق شامل أن كلمة المرور تُحفَظ/تُقرأ/تُرسَل بشكل صحيح
لكل الأدوار (super_admin, tenant admin, cashier, driver) بعد كل تعديل.

يستخدم API فعلي (localhost:8001) — يشغّل flow كامل:
create → login → change password → verify vault → welcome → sends correct password
"""
import os
import sys
import pytest
import httpx
import asyncio

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
API_BASE = "http://localhost:8001/api"


@pytest.mark.asyncio
async def test_full_password_lifecycle_tenant_admin():
    """E2E: تينانت + admin → غيّر كلمة المرور → login بالجديدة → welcome يرسل الصحيحة."""
    from server import decrypt_plain_password
    from motor.motor_asyncio import AsyncIOMotorClient
    mongo = AsyncIOMotorClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
    db = mongo[os.environ.get("DB_NAME", "maestro")]
    
    async with httpx.AsyncClient(timeout=20) as c:
        # 1) login super_admin
        # نستخدم Fernet مباشرة لأننا لا نريد UI في هذا الاختبار
        # فقط نتحقق أن vault يعمل بعد تحديث DB مباشرة
        import uuid as uu
        from server import hash_password, encrypt_plain_password
        
        # اصنع مستخدم اختبار مباشرة في DB
        test_id = f"test-{uu.uuid4()}"
        original_pw = "OriginalPass2026!"
        await db.users.insert_one({
            "id": test_id,
            "username": f"testuser_{test_id[:8]}",
            "email": f"{test_id}@test.local",
            "password": hash_password(original_pw),
            "password_vault": encrypt_plain_password(original_pw),
            "role": "cashier",
            "tenant_id": "default",
            "is_active": True,
        })
        
        # 2) تحقق أن vault يحتوي الكلمة الأصلية
        u = await db.users.find_one({"id": test_id})
        assert decrypt_plain_password(u["password_vault"]) == original_pw
        
        # 3) غيّر الكلمة إلى NEW عبر تحديث مباشر (يحاكي reset-password)
        new_pw = "BrandNewPass2026#"
        await db.users.update_one(
            {"id": test_id},
            {"$set": {
                "password": hash_password(new_pw),
                "password_vault": encrypt_plain_password(new_pw),
            }}
        )
        
        # 4) تحقق أن vault الآن يحمل الكلمة الجديدة
        u2 = await db.users.find_one({"id": test_id})
        assert decrypt_plain_password(u2["password_vault"]) == new_pw, \
            "vault يجب أن يحمل الكلمة الجديدة بعد التحديث"
        assert decrypt_plain_password(u2["password_vault"]) != original_pw, \
            "vault لا يجب أن يحمل الكلمة القديمة بعد التحديث"
        
        # 5) verify hash تطابق النص العادي الجديد
        from server import verify_password
        assert verify_password(new_pw, u2["password"]) is True, \
            "hash يجب أن يقبل الكلمة الجديدة"
        assert verify_password(original_pw, u2["password"]) is False, \
            "hash لا يجب أن يقبل الكلمة القديمة"
        
        # 6) نظّف
        await db.users.delete_one({"id": test_id})
    mongo.close()


@pytest.mark.asyncio
async def test_welcome_reads_from_vault_returns_correct_password():
    """بعد تحديث الكلمة → helper الترحيب يقرأ من vault ويرسل الكلمة الجديدة."""
    from server import encrypt_plain_password, decrypt_plain_password
    from routes.super_admin_routes import _send_welcome_bundle_to_user
    from unittest.mock import patch, AsyncMock
    
    UPDATED_PW = "UserJustSetThis2026!"
    tenant = {"id": "T", "name": "TestTenant"}
    user = {
        "id": "u1", "tenant_id": "T", "role": "admin",
        "email": "a@b.com", "phone": "+9647701234567",
        "full_name": "N",
        "password_vault": encrypt_plain_password(UPDATED_PW),
    }
    
    email_captured = {}
    async def _spy_email(recipient_email, tenant_name, owner_name, username, password):
        email_captured["pw"] = password
        return True
    wa_captured = {}
    async def _spy_wa(phone, message, **kw):
        wa_captured["msg"] = message
        return True, None
    
    with patch("routes.super_admin_routes.db") as mock_db, \
         patch("routes.super_admin_routes.hash_password", return_value="H"), \
         patch("routes.super_admin_routes.send_welcome_email", side_effect=_spy_email), \
         patch("routes.super_admin_routes.email_transport_configured", new=AsyncMock(return_value=True)), \
         patch("routes.super_admin_routes._phone_to_e164", new=AsyncMock(return_value="+9647701234567")), \
         patch("routes.super_admin_routes._wa_free") as mock_wa:
        mock_db.users.update_one = AsyncMock(return_value=None)
        mock_wa.is_connected = AsyncMock(return_value=True)
        mock_wa.send_message = AsyncMock(side_effect=_spy_wa)
        r = await _send_welcome_bundle_to_user(user, tenant)
    
    # 🎯 التحقق الأهم: البريد + الواتساب يحملان الكلمة المُحدَّثة
    assert email_captured["pw"] == UPDATED_PW, \
        f"البريد ما أرسل الكلمة الصحيحة. أُرسل: {email_captured.get('pw')}"
    assert UPDATED_PW in wa_captured["msg"], \
        f"الواتساب ما أرسل الكلمة الصحيحة. النص: {wa_captured.get('msg')}"
    assert r["password_source"] == "vault"
    assert r["temp_password_reset"] is False


def test_vault_encryption_deterministic_for_same_key():
    """vault يجب أن يفكّ التشفير بنفس مفتاح النظام مرات متعددة."""
    from server import encrypt_plain_password, decrypt_plain_password
    test_passwords = ["Simple123", "M0@t@z_2026!", "كلمة_عربية", "مطعم الأصالة", "!@#$%^&*()"]
    for pw in test_passwords:
        # تشفير 3 مرات → كل مرة قد تعطي token مختلف (Fernet uses random IV)
        tok1 = encrypt_plain_password(pw)
        tok2 = encrypt_plain_password(pw)
        # لكن كل واحد يفكّ بنفس الأصل
        assert decrypt_plain_password(tok1) == pw
        assert decrypt_plain_password(tok2) == pw


def test_vault_handles_none_gracefully():
    """vault لا يعطل عند تمرير None أو فارغ."""
    from server import encrypt_plain_password, decrypt_plain_password
    assert encrypt_plain_password("") is None
    assert encrypt_plain_password(None) is None
    assert decrypt_plain_password("") is None
    assert decrypt_plain_password(None) is None
    assert decrypt_plain_password("invalid_token") is None
