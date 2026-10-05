"""🧪 Regression: project_id isolation on Drivers / Customers / Printers (Enterprise pattern)
يتحقق أن إنشاء السائق/العميل عبر API يُخزّن `project_id` المقروء من رأس X-Project-Id.
"""
import os
import uuid
import requests

API_URL = os.environ.get("REACT_APP_BACKEND_URL") or "https://multi-cashier-vault.preview.emergentagent.com"
API = f"{API_URL}/api"
ADMIN = {"email": "admin@maestroegp.com", "password": "admin123"}


def _token():
    r = requests.post(f"{API}/auth/login", json=ADMIN, timeout=20)
    r.raise_for_status()
    d = r.json()
    return d.get("token") or d.get("access_token")


def _hdrs(tok, project_id=None):
    h = {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}
    if project_id:
        h["X-Project-Id"] = project_id
    return h


def test_drivers_create_captures_project_id_from_header():
    tok = _token()
    # اختر مشروعاً حقيقياً من قائمة المشاريع
    projects = requests.get(f"{API}/projects", headers=_hdrs(tok), timeout=20).json()
    assert isinstance(projects, list) and projects, "لا توجد مشاريع في البيئة"
    pid = projects[0]["id"]

    # أنشئ فرعاً أولاً مربوطاً بالمشروع (مطلوب في DriverCreate)
    branches = requests.get(f"{API}/branches", headers=_hdrs(tok, pid), timeout=20).json()
    assert branches, "لا توجد فروع"
    bid = branches[0]["id"]

    phone = f"0790{uuid.uuid4().int % 10_000_000:07d}"
    payload = {"name": f"سائق اختبار {uuid.uuid4().hex[:4]}", "phone": phone,
               "branch_id": bid, "pin": "1234"}
    r = requests.post(f"{API}/drivers", json=payload, headers=_hdrs(tok, pid), timeout=20)
    assert r.status_code == 200, (r.status_code, r.text)
    d = r.json()
    assert d.get("id")
    # اقرأ القائمة وتأكد أن السائق موجود مع project_id صحيح
    all_drivers = requests.get(f"{API}/drivers", headers=_hdrs(tok, pid), timeout=20).json()
    mine = next((x for x in all_drivers if x.get("id") == d["id"]), None)
    assert mine is not None, "السائق المُنشأ لم يظهر في القائمة"
    # project_id قد يُحجب في Response — نتحقق مباشرة من mongo
    from pymongo import MongoClient
    mc = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
    db = mc[os.environ.get("DB_NAME", "maestro_pos")]
    doc = db.drivers.find_one({"id": d["id"]})
    assert doc is not None
    assert doc.get("project_id") == pid, f"project_id خطأ: {doc.get('project_id')} ≠ {pid}"
    # نظّف
    db.drivers.delete_one({"id": d["id"]})
    mc.close()


def test_customers_create_captures_project_id_from_header():
    tok = _token()
    projects = requests.get(f"{API}/projects", headers=_hdrs(tok), timeout=20).json()
    assert projects
    pid = projects[0]["id"]
    phone = f"078{uuid.uuid4().int % 100_000_000:08d}"
    payload = {"name": "عميل اختبار", "phone": phone}
    r = requests.post(f"{API}/customers", json=payload, headers=_hdrs(tok, pid), timeout=20)
    assert r.status_code == 200, (r.status_code, r.text)
    cid = r.json()["id"]

    from pymongo import MongoClient
    mc = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
    db = mc[os.environ.get("DB_NAME", "maestro_pos")]
    doc = db.customers.find_one({"id": cid})
    assert doc is not None
    assert doc.get("project_id") == pid, f"project_id خطأ: {doc.get('project_id')} ≠ {pid}"
    db.customers.delete_one({"id": cid})
    mc.close()


def test_shift_reports_audit_filters_and_csv():
    """GET /super-admin/shift-reports-audit مع فلتر + CSV."""
    r = requests.post(f"{API}/auth/login",
                      json={"email": "owner@maestroegp.com", "password": "owner123", "secret_key": "271018"},
                      timeout=20)
    assert r.status_code == 200, r.text
    tok = r.json().get("token") or r.json().get("access_token")

    # JSON مع فلاتر فارغة
    r = requests.get(f"{API}/super-admin/shift-reports-audit?limit=10",
                     headers={"Authorization": f"Bearer {tok}"}, timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "summary" in data and "items" in data and "tenants" in data
    assert set(data["summary"].keys()) == {"total", "delivered", "failed"}

    # JSON مع date_from/date_to
    r2 = requests.get(f"{API}/super-admin/shift-reports-audit?date_from=2020-01-01&date_to=2050-12-31",
                      headers={"Authorization": f"Bearer {tok}"}, timeout=20)
    assert r2.status_code == 200

    # CSV
    r3 = requests.get(f"{API}/super-admin/shift-reports-audit.csv",
                      headers={"Authorization": f"Bearer {tok}"}, timeout=20)
    assert r3.status_code == 200
    assert "text/csv" in r3.headers.get("content-type", "").lower()
    body = r3.text
    assert "sent_at" in body and "tenant_name" in body and "status" in body


def test_enterprise_dashboard_endpoint_exists():
    tok = _token()
    r = requests.get(f"{API}/enterprise/dashboard?period_days=7", headers=_hdrs(tok), timeout=20)
    # قد يرجع 403 لو المستخدم ليس enterprise_owner — المهم أنه ليس 404
    assert r.status_code in (200, 403), (r.status_code, r.text)
