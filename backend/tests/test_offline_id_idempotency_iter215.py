"""
اختبار انحدار (iter215): منع تكرار طلبات الأوفلاين عبر مفتاح الثبات offline_id.

الخلل المُبلَّغ: في وضع الأوفلاين يُنشأ طلب مكرر (#57 صحيح، #58 نسخة «غير مدفوع»
لا يمكن إرجاعها). السبب: الطلب يُنشأ أونلاين عبر /api/orders (دون تخزين offline_id)
ثم تُزامَن نسخته المحلية عبر /api/sync/orders فلا يجد التطابق → نسخة مكررة.

الإصلاح: /api/orders صار:
  1) يستقبل ويخزّن offline_id.
  2) يُعيد الطلب الموجود إن وصل نفس offline_id (idempotent، بلا نافذة زمنية).
ومنه تتطابق مزامنة /api/sync/orders مع الطلب الأونلاين فلا تُنشئ تكراراً.
"""
import os
import time
import requests
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
with open("/app/frontend/.env") as f:
    for line in f:
        if line.startswith("REACT_APP_BACKEND_URL"):
            API = line.strip().split("=", 1)[1].strip() + "/api"

EMAIL, PASSWORD = "admin@maestroegp.com", "admin123"


def _login():
    r = requests.post(f"{API}/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    r.raise_for_status()
    return r.json().get("token") or r.json().get("access_token")


def _ctx(db):
    shift = db.shifts.find_one({"status": "open"})
    assert shift, "يلزم وجود وردية مفتوحة لإجراء الاختبار"
    branch = shift.get("branch_id")
    prod = db.products.find_one({}, {"_id": 0, "id": 1})
    assert prod, "يلزم وجود منتج"
    return branch, prod["id"]


def test_offline_id_prevents_duplicate_orders():
    db = MongoClient(MONGO_URL)[DB_NAME]
    branch, pid = _ctx(db)
    token = _login()
    H = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    oid = f"OFF-pytest-{int(time.time()*1000)}"
    body = {
        "order_type": "takeaway", "branch_id": branch, "payment_method": "cash",
        "buzzer_number": "1", "offline_id": oid,
        "items": [{"product_id": pid, "product_name": "x", "price": 5000, "quantity": 1}],
    }
    try:
        # 1) إنشاء أونلاين
        r1 = requests.post(f"{API}/orders", json=body, headers=H, timeout=30)
        assert r1.status_code == 200, r1.text
        n1 = r1.json().get("order_number")

        # 2) إعادة الإرسال بنفس offline_id (ضغط مزدوج/إعادة محاولة) → نفس الطلب
        r2 = requests.post(f"{API}/orders", json=body, headers=H, timeout=30)
        assert r2.status_code == 200, r2.text
        n2 = r2.json().get("order_number")
        assert n1 == n2, f"تكرار! الإنشاء الثاني أعطى رقماً مختلفاً {n2} بدل {n1}"

        # 3) مزامنة النسخة المحلية (سيناريو ضياع الرد) → يجب أن تجد الموجود
        sync_body = {
            "branch_id": branch, "offline_id": oid, "order_type": "takeaway",
            "payment_method": "cash", "total": 5000,
            "items": [{"product_id": pid, "product_name": "x", "price": 5000, "quantity": 1}],
        }
        r3 = requests.post(f"{API}/sync/orders", json=sync_body, headers=H, timeout=30)
        assert r3.status_code == 200, r3.text
        assert r3.json().get("order_number") == n1, "المزامنة أنشأت طلباً مكرراً!"

        # 4) التأكيد النهائي: طلب واحد فقط بهذا المفتاح
        cnt = db.orders.count_documents({"offline_id": oid})
        assert cnt == 1, f"المتوقع طلب واحد لكن وُجد {cnt} (تكرار)"
        print(f"PASS: لا تكرار — طلب واحد #{n1} لمفتاح الثبات ✅")
    finally:
        db.orders.delete_many({"offline_id": oid})


if __name__ == "__main__":
    test_offline_id_prevents_duplicate_orders()
