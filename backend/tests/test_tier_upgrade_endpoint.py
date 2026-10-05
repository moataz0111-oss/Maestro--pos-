"""🧪 Regression: tier upgrade endpoint + Project visibility rules.

يتحقق من:
 1. PUT /super-admin/tenants/{id} ينجح لتحويل customer→enterprise مع Authorization مُرسل بوضوح.
 2. بعد التحويل: tenant.enterprise_enabled=True + account_tier=enterprise + max_projects محدّث.
 3. العودة إلى customer: enterprise_enabled=False (إخفاء إدارة المشاريع).
"""
import os
import uuid
import requests

API_URL = os.environ.get("REACT_APP_BACKEND_URL") or "https://multi-cashier-vault.preview.emergentagent.com"
API = f"{API_URL}/api"


def _super_tok():
    r = requests.post(f"{API}/auth/login",
                      json={"email": "owner@maestroegp.com", "password": "owner123", "secret_key": "271018"},
                      timeout=20)
    r.raise_for_status()
    d = r.json()
    return d.get("token") or d.get("access_token")


def _pick_customer_tenant(tok):
    r = requests.get(f"{API}/super-admin/tenants", headers={"Authorization": f"Bearer {tok}"}, timeout=20)
    r.raise_for_status()
    ts = r.json()
    # نختار أول تينانت account_tier=customer
    cust = [t for t in ts if t.get("account_tier") == "customer"]
    assert cust, "لا يوجد عميل من نوع customer"
    return cust[0]


def test_tier_upgrade_from_customer_to_enterprise_and_back():
    tok = _super_tok()
    hdr = {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}
    tenant = _pick_customer_tenant(tok)
    tid = tenant["id"]

    # upgrade → enterprise
    r = requests.put(f"{API}/super-admin/tenants/{tid}",
                     json={"account_tier": "enterprise", "max_projects": 7,
                           "max_branches_per_project": 10, "max_users_per_branch": 20,
                           "max_admins_per_project": 3},
                     headers=hdr, timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("account_tier") == "enterprise"
    assert data.get("enterprise_enabled") is True
    assert data.get("max_projects") == 7

    # downgrade → customer (إخفاء إدارة المشاريع)
    r2 = requests.put(f"{API}/super-admin/tenants/{tid}",
                      json={"account_tier": "customer"}, headers=hdr, timeout=20)
    assert r2.status_code == 200, r2.text
    data2 = r2.json()
    assert data2.get("account_tier") == "customer"
    assert data2.get("enterprise_enabled") is False


def test_super_admin_endpoint_rejects_missing_auth():
    """بدون Authorization — الحماية سليمة."""
    r = requests.put(f"{API}/super-admin/tenants/some-id",
                     json={"account_tier": "customer"}, timeout=20)
    assert r.status_code in (401, 403), (r.status_code, r.text)
