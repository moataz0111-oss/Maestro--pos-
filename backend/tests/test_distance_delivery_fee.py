"""تحقق من أجور التوصيل التلقائية حسب المسافة."""
import os, uuid, requests, asyncio
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))
API = "http://localhost:8001/api"
BR = "76f56acc-6948-4a2f-bbf4-feccbddea88f"
# موقع فرع تجريبي (بغداد) وزبون على بعد ~5 كم شمالاً
BRANCH_LAT, BRANCH_LNG = 33.3152, 44.3661
CUST_LAT, CUST_LNG = 33.3602, 44.3661  # ~5.0 كم


def token():
    r = requests.post(f"{API}/auth/login", json={"email": "admin@maestroegp.com", "password": "admin123"}, timeout=30)
    return r.json()["token"]


def _db():
    return AsyncIOMotorClient(os.environ['MONGO_URL'])[os.environ['DB_NAME']]


async def _snapshot():
    db = _db()
    s = await db.payment_settings.find_one({"tenant_id": "default"}, {"_id": 0}) or {}
    b = await db.branches.find_one({"id": BR}, {"_id": 0, "latitude": 1, "longitude": 1}) or {}
    return s, b


async def _restore(s, b):
    db = _db()
    await db.payment_settings.update_one({"tenant_id": "default"}, {"$set": {
        "distance_fee_enabled": s.get("distance_fee_enabled", False),
        "fee_base": s.get("fee_base", 2000), "fee_base_km": s.get("fee_base_km", 3),
        "fee_per_km": s.get("fee_per_km", 500), "fee_max": s.get("fee_max", 0),
        "fee_round_to": s.get("fee_round_to", 250),
        "max_distance_km": s.get("max_distance_km", 0)}}, upsert=True)
    await db.branches.update_one({"id": BR}, {"$set": {
        "latitude": b.get("latitude"), "longitude": b.get("longitude")}})


def test_distance_fee_flow():
    loop = asyncio.get_event_loop()
    snap_s, snap_b = loop.run_until_complete(_snapshot())
    h = {"Authorization": f"Bearer {token()}"}
    oid = None
    try:
        # 1) تفعيل أجور المسافة: أساسي 2000 لأول 3 كم + 500/كم، تقريب 250
        r = requests.post(f"{API}/payment-settings", headers=h, json={
            "distance_fee_enabled": True, "fee_base": 2000, "fee_base_km": 3,
            "fee_per_km": 500, "fee_max": 0, "fee_round_to": 250}, timeout=30)
        assert r.status_code == 200, r.text

        # 2) تحديد موقع الفرع
        r = requests.put(f"{API}/branches/{BR}/location", headers=h,
                         json={"latitude": BRANCH_LAT, "longitude": BRANCH_LNG}, timeout=30)
        assert r.status_code == 200, r.text
        # يظهر في GET /branches
        br = [b for b in requests.get(f"{API}/branches", headers=h, timeout=30).json() if b["id"] == BR][0]
        assert abs(br["latitude"] - BRANCH_LAT) < 1e-6

        # 3) تسعير عام للزبون: ~5 كم → 2000 + 2*500 = 3000
        r = requests.get(f"{API}/customer/delivery-fee/default",
                         params={"lat": CUST_LAT, "lng": CUST_LNG, "branch_id": BR}, timeout=30)
        assert r.status_code == 200, r.text
        q = r.json()
        assert q["distance_based"] is True
        assert 4.5 <= q["distance_km"] <= 5.5, q
        import math as _m; _exp = _m.ceil((2000 + max(0, q["distance_km"] - 3) * 500) / 250) * 250
        assert abs(q["fee"] - _exp) <= 250, q

        # 4) طلب زبون مع موقع → الأجرة تُحسب وتدخل الإجمالي
        db = _db()
        oid = str(uuid.uuid4())
        # منتج حقيقي من القائمة
        prod = loop.run_until_complete(db.products.find_one(
            {"tenant_id": "default", "is_active": {"$ne": False}}, {"_id": 0, "id": 1, "name": 1, "price": 1}))
        assert prod, "لا يوجد منتج للاختبار"
        # عبر endpoint إنشاء طلب الزبون
        r = requests.post(f"{API}/customer/order/default", json={
            "customer_name": "زبون المسافة", "customer_phone": "07700000001",
            "order_type": "delivery", "branch_id": BR,
            "delivery_address": "اختبار", "payment_method": "cash",
            "delivery_location": {"lat": CUST_LAT, "lng": CUST_LNG},
            "items": [{"product_id": prod["id"], "product_name": prod["name"], "price": prod["price"], "quantity": 1}]
        }, timeout=30)
        assert r.status_code == 200, r.text
        created = r.json()
        oid = created.get("order_id") or created.get("id") or (created.get("order") or {}).get("id")
        odoc = loop.run_until_complete(db.orders.find_one(
            {"id": oid} if oid else {"customer_phone": "07700000001", "customer_name": "زبون المسافة"},
            sort=[("created_at", -1)]))
        assert odoc is not None
        oid = odoc["id"]
        fee = odoc.get("delivery_fee"); assert 3000 <= fee <= 3250, fee
        assert odoc.get("total") == (odoc.get("subtotal") or 0) + fee, (odoc.get("total"), odoc.get("subtotal"), fee)

        # 5) اقتراح الأجرة للكاشير على نفس الطلب
        r = requests.get(f"{API}/delivery-fee/suggest", headers=h, params={"order_id": oid}, timeout=30)
        assert r.status_code == 200, r.text
        sug = r.json()
        assert sug["enabled"] is True and sug["suggested_fee"] == fee, sug
        assert sug.get("out_of_range") is False

        # 6) حدود التغطية: حد أقصى 4 كم → الزبون (5 كم) خارج النطاق
        requests.post(f"{API}/payment-settings", headers=h, json={"max_distance_km": 4}, timeout=30)
        rq = requests.get(f"{API}/customer/delivery-fee/default",
                          params={"lat": CUST_LAT, "lng": CUST_LNG, "branch_id": BR}, timeout=30).json()
        assert rq.get("out_of_range") is True and rq.get("fee") is None, rq
        # إنشاء طلب زبون خارج النطاق → يرفض 400
        r = requests.post(f"{API}/customer/order/default", json={
            "customer_name": "زبون بعيد", "customer_phone": "07700000002",
            "order_type": "delivery", "branch_id": BR,
            "delivery_address": "اختبار", "payment_method": "cash",
            "delivery_location": {"lat": CUST_LAT, "lng": CUST_LNG},
            "items": [{"product_id": prod["id"], "product_name": prod["name"], "price": prod["price"], "quantity": 1}]
        }, timeout=30)
        assert r.status_code == 400, r.text
        assert "خارج نطاق التوصيل" in r.json()["detail"]
        # اقتراح الكاشير يحذر لكن يعطي الأجرة
        sug2 = requests.get(f"{API}/delivery-fee/suggest", headers=h, params={"order_id": oid}, timeout=30).json()
        assert sug2.get("out_of_range") is True and sug2.get("suggested_fee") == fee, sug2

        # 7) خدمة التوصيل الداخلية تظهر في التقارير المالية
        # نجعل الطلب مسنداً لسائق ليُحسب كتوصيل داخلي
        did = str(uuid.uuid4())
        loop.run_until_complete(_db().drivers.insert_one({
            "id": did, "tenant_id": "default", "name": "سائق تقرير", "phone": "07790000098",
            "branch_id": BR, "pin": "1234", "is_active": True, "is_available": True,
            "current_order_id": None, "created_at": datetime.now(timezone.utc).isoformat()}))
        try:
            requests.put(f"{API}/drivers/{did}/assign?order_id={oid}&delivery_fee={fee}&force=true", headers=h, timeout=30)
            # تسليم الطلب وتحصيله (يصبح مدفوعاً) ليظهر في التقارير
            loop.run_until_complete(_db().orders.update_one(
                {"id": oid}, {"$set": {"status": "delivered", "payment_status": "paid", "payment_method": "cash"}}))
            sales = requests.get(f"{API}/smart-reports/sales", headers=h, params={"period": "today", "branch_id": BR}, timeout=30).json()
            assert sales.get("internal_delivery_fees", 0) >= fee, sales.get("internal_delivery_fees")
            assert sales.get("internal_delivery_orders_count", 0) >= 1
            cb = requests.get(f"{API}/reports/cash-register-closing", headers=h, timeout=30)
            if cb.status_code == 200:
                idf = cb.json().get("by_payment_method", {}).get("internal_delivery_fees", {})
                assert idf.get("label") == "خدمة توصيل داخلية", idf
                assert idf.get("total", 0) >= fee, idf
        finally:
            loop.run_until_complete(_db().drivers.delete_one({"id": did}))
    finally:
        loop.run_until_complete(_restore(snap_s, snap_b))
        if oid:
            loop.run_until_complete(_db().orders.delete_one({"id": oid}))
