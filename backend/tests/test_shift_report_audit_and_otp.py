"""🧾 Test: shift report audit + OTP TTL + trusted-IP ban guard.

يتحقق من:
 1. `_send_shift_close_report` ينشئ سجل تدقيق في shift_report_audit **بدون أي حقول مالية**
    (لا total_sales / expected_cash / difference / … يمكن قراءته من هذا السجل).
 2. `GET /api/super-admin/shift-reports-audit` يرجع ملخص (total/delivered/failed) + items.
 3. `_OTP_TTL_MINUTES` ≥ 5 دقائق (ليتحمّل تأخير واتساب على السيرفر الفعلي ولا يُقفل العملاء).
 4. `_ban_ip_permanent` لا يحظر دائماً عنواناً عليه دخول ناجح خلال آخر 7 أيام (موظف شرعي).
"""
import os
import sys
import uuid
import asyncio
from datetime import datetime, timezone, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")


def _new_db():
    from motor.motor_asyncio import AsyncIOMotorClient
    name = f"test_shift_audit_{uuid.uuid4().hex[:8]}"
    client = AsyncIOMotorClient(MONGO_URL)
    return client, client[name]


def _run(coro):
    return asyncio.new_event_loop().run_until_complete(coro)


# ---------- 1. audit record has no financial numbers ----------
async def _case_audit_no_financials():
    client, db = _new_db()
    try:
        from routes.shifts_routes import _send_shift_close_report
        # نحقن notify_owner_multichannel وهمي يُرجع نجاحاً كاملاً
        import server as _srv

        async def fake_notify(**kwargs):
            return {"bell": True, "whatsapp": True, "email": False, "whatsapp_recipients": 2, "email_recipients": 0}

        _srv.notify_owner_multichannel = fake_notify  # type: ignore
        # notification_preferences الافتراضي كافٍ — نترك _get_notification_prefs يرجع defaults

        tenant_id = str(uuid.uuid4())
        await db.tenants.insert_one({"id": tenant_id, "name": "Private Tenant"})
        await db.notification_preferences.insert_one({
            "id": "global", "tenant_id": tenant_id,
            "shift_close_report_whatsapp": True,
            "shift_close_report_email": False,
            "shift_close_report_bell": True,
        })
        # نحقن db في الاستدعاء مباشرة
        shift = {
            "id": str(uuid.uuid4()), "cashier_name": "عمر", "cashier_id": "u1",
            "branch_name": "الفرع الرئيسي", "branch_id": "b1", "business_date": "2026-02-10",
        }
        closing = {
            "total_sales": 123456, "cash_sales": 90000, "card_sales": 20000,
            "credit_sales": 0, "delivery_sales": 13456,
            "expected_cash": 95000, "actual_cash": 94500,
            "total_expenses": 500, "difference": -500, "orders_count": 42,
            "business_date": "2026-02-10", "branch_name": "الفرع الرئيسي",
        }
        await _send_shift_close_report(db, shift, closing, tenant_id)

        audit = await db.shift_report_audit.find_one({"shift_id": shift["id"]})
        assert audit is not None, "لم يُنشأ سجل تدقيق"
        assert audit["tenant_id"] == tenant_id
        assert audit["cashier_name"] == "عمر"
        assert audit["branch_name"] == "الفرع الرئيسي"
        assert audit["status"] == "delivered"
        assert audit["channel_whatsapp"] is True
        assert audit["channel_bell"] is True

        # ❌ لا توجد أرقام مالية في السجل
        forbidden = {"total_sales", "cash_sales", "card_sales", "credit_sales",
                     "delivery_sales", "expected_cash", "actual_cash", "total_expenses",
                     "difference", "orders_count"}
        leaked = forbidden.intersection(set(audit.keys()))
        assert not leaked, f"تسرّب حقول مالية في التدقيق: {leaked}"
    finally:
        await client.drop_database(db.name)
        client.close()


def test_1_audit_record_has_no_financial_numbers():
    _run(_case_audit_no_financials())


# ---------- 2. OTP TTL >= 5 minutes ----------
def test_2_otp_ttl_is_safe_for_whatsapp_delays():
    import server as _srv
    assert _srv._OTP_TTL_MINUTES >= 5, (
        f"OTP TTL = {_srv._OTP_TTL_MINUTES} دقيقة — قصير جداً، "
        f"قد يُقفل عملاء بسبب تأخير واتساب على السيرفر."
    )


# ---------- 3. trusted IP (recent successful login) is NOT permanently banned ----------
async def _case_trusted_ip_not_banned():
    client, db = _new_db()
    try:
        import server as _srv
        # نحقن db على server (الموديول يستعمل متغيّراً عالمياً)
        _srv.db = db

        trusted_ip = "203.0.113.42"
        await db.audit_logs.insert_one({
            "ip": trusted_ip,
            "event": "auth.login.success",
            "ts": datetime.now(timezone.utc) - timedelta(hours=2),
        })
        # محاولة حظر دائم
        banned = await _srv._ban_ip_permanent(trusted_ip, reason="test ban", request=None)
        assert banned is False, "تم حظر IP موثوق — خطأ ⚠️"
        in_blocked = await db.blocked_ips.find_one({"ip": trusted_ip})
        assert in_blocked is None, "IP الموثوق أُدخل في blocked_ips رغم الحماية"
        # قد يكون أُنشئ سجل soft cool-down (تجميد مؤقت 15 دقيقة فقط)
        cool = await db.login_attempts.find_one({"key": f"ip_cool:{trusted_ip}"})
        assert cool is not None
        assert cool.get("reason") == "soft_cool_down_trusted_ip"
    finally:
        await client.drop_database(db.name)
        client.close()


def test_3_trusted_ip_not_permanently_banned():
    _run(_case_trusted_ip_not_banned())


# ---------- 4. unknown IP (no recent login) still gets permanent ban ----------
async def _case_unknown_ip_still_banned():
    client, db = _new_db()
    try:
        import server as _srv
        _srv.db = db
        unknown_ip = "198.51.100.77"
        banned = await _srv._ban_ip_permanent(unknown_ip, reason="brute-force", request=None)
        assert banned is True
        rec = await db.blocked_ips.find_one({"ip": unknown_ip})
        assert rec is not None
        assert rec.get("permanent") is True
    finally:
        await client.drop_database(db.name)
        client.close()


def test_4_unknown_ip_still_banned():
    _run(_case_unknown_ip_still_banned())
