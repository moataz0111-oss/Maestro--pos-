# Iter316: Settings full project isolation (categories/products/inventory pickers/printers/delivery/invoice/limits/copy-catalog)
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
REST = "52aee398-394c-4d65-8eaa-59bab5ece916"   # مطعم الاختبار
SALON = "f7a383ad-0e51-4c11-b20b-390f93a341bb"  # صالون الأناقة
FOURTH = "3128cfc4-b3ed-488a-b318-eebbd21d696b"  # مشروع رابع تجريبي


@pytest.fixture(scope="module")
def s():
    r = requests.post(f"{API}/auth/login", json={"email": "admin@maestroegp.com", "password": "admin123"})
    if r.status_code != 200:
        pytest.skip("login failed")
    ses = requests.Session()
    ses.headers.update({"Authorization": f"Bearer {r.json()['token']}", "Content-Type": "application/json"})
    return ses


def hp(pid):
    return {"X-Project-Id": pid}


# --- categories / products filtered by project
class TestCatalogFilter:
    def test_categories_rest(self, s):
        d = s.get(f"{API}/categories", params={"project_id": REST}).json()
        assert len(d) >= 5 and all(c["project_id"] == REST for c in d)

    def test_categories_salon(self, s):
        d = s.get(f"{API}/categories", params={"project_id": SALON}).json()
        names = [c["name"] for c in d]
        assert all(c["project_id"] == SALON for c in d)
        assert "قهوة تست" in names

    def test_products_rest_and_salon(self, s):
        a = s.get(f"{API}/products", params={"project_id": REST}).json()
        b = s.get(f"{API}/products", params={"project_id": SALON}).json()
        assert len(a) == 8 and all(p["project_id"] == REST for p in a)
        assert len(b) == 8 and all(p["project_id"] == SALON for p in b)
        assert not ({p["id"] for p in a} & {p["id"] for p in b})

    def test_all_returns_union(self, s):
        allc = s.get(f"{API}/categories").json()
        pids = {c.get("project_id") for c in allc}
        assert REST in pids and SALON in pids


# --- inventory pickers / printers by X-Project-Id
class TestInventoryFilter:
    @pytest.mark.parametrize("ep", ["manufactured-products", "raw-materials-new", "packaging-materials"])
    def test_salon_empty_rest_scoped(self, s, ep):
        r = s.get(f"{API}/{ep}", headers=hp(SALON))
        assert r.status_code == 200 and r.json() == []
        rr = s.get(f"{API}/{ep}", headers=hp(REST)).json()
        assert len(rr) >= 1 and all(x.get("project_id") == REST for x in rr)

    def test_mfg_tenant_filtered(self, s):
        d = s.get(f"{API}/manufactured-products").json()
        assert all(x.get("tenant_id") == "default" for x in d)

    def test_printers_scoped(self, s):
        r = s.get(f"{API}/printers", headers=hp(SALON))
        assert r.status_code == 200


# --- create / update validation
class TestCategoryCrud:
    def test_create_bogus_project_400(self, s):
        r = s.post(f"{API}/categories", json={"name": "TEST_bogus", "project_id": str(uuid.uuid4())})
        assert r.status_code == 400

    def test_create_move_delete(self, s):
        r = s.post(f"{API}/categories", json={"name": "TEST_iso_cat", "project_id": SALON})
        assert r.status_code == 200, r.text
        cid = r.json()["id"]
        assert r.json()["project_id"] == SALON
        assert cid in [c["id"] for c in s.get(f"{API}/categories", params={"project_id": SALON}).json()]
        assert cid not in [c["id"] for c in s.get(f"{API}/categories", params={"project_id": REST}).json()]
        u = s.put(f"{API}/categories/{cid}", json={"name": "TEST_iso_cat", "project_id": REST})
        assert u.status_code == 200 and u.json()["project_id"] == REST
        bad = s.put(f"{API}/categories/{cid}", json={"name": "TEST_iso_cat", "project_id": "bogus"})
        assert bad.status_code == 400
        assert s.delete(f"{API}/categories/{cid}").status_code == 200

    def test_product_bogus_project_400(self, s):
        r = s.post(f"{API}/products", json={"name": "TEST_p", "category_id": "x", "price": 1, "cost": 0,
                                           "operating_cost": 0, "project_id": "bogus-proj"})
        assert r.status_code in (400, 422)


# --- copy catalog
class TestCopyCatalog:
    def test_copy_idempotent(self, s):
        r1 = s.post(f"{API}/projects/{FOURTH}/copy-catalog", json={"source_project_id": REST})
        assert r1.status_code == 200, r1.text
        r2 = s.post(f"{API}/projects/{FOURTH}/copy-catalog", json={"source_project_id": REST})
        assert r2.status_code == 200
        assert r2.json()["categories_added"] == 0 and r2.json()["products_added"] == 0
        cats = s.get(f"{API}/categories", params={"project_id": FOURTH}).json()
        prods = s.get(f"{API}/products", params={"project_id": FOURTH}).json()
        assert len(cats) >= 5 and len(prods) >= 8
        assert all(not p.get("manufactured_product_id") for p in prods)

    def test_copy_same_project_400(self, s):
        assert s.post(f"{API}/projects/{REST}/copy-catalog", json={"source_project_id": REST}).status_code == 400

    def test_copy_bogus_404(self, s):
        assert s.post(f"{API}/projects/{REST}/copy-catalog", json={"source_project_id": "nope"}).status_code == 404


# --- delivery commission / invoice / limits per project
class TestProjectSettings:
    def _toters(self, s, headers=None):
        apps = s.get(f"{API}/delivery-apps", headers=headers or {}).json()
        return next(a for a in apps if a["id"] == "toters")

    def test_commission(self, s):
        assert float(self._toters(s, hp(SALON)).get("commission_rate")) == 17
        assert float(self._toters(s, hp(REST)).get("commission_rate")) == 15
        assert float(self._toters(s).get("commission_rate")) == 15

    def test_invoice_settings(self, s):
        assert s.get(f"{API}/tenant/invoice-settings", headers=hp(SALON)).json().get("phone") == "0770-SALON"
        assert s.get(f"{API}/tenant/invoice-settings", headers=hp(REST)).json().get("phone") != "0770-SALON"
        assert s.get(f"{API}/tenant/invoice-settings").json().get("phone") != "0770-SALON"

    def test_limits_per_project(self, s):
        d = s.get(f"{API}/tenant/limits").json()
        assert d.get("per_project") is True and d["branches_remaining"] > 0
        d2 = s.get(f"{API}/tenant/limits", headers=hp(SALON)).json()
        assert d2["max_branches"] == d2["max_branches_per_project"]


# --- new project doesn't seed template categories
class TestNewProjectNoSeed:
    def test_new_project_empty(self, s):
        r = s.post(f"{API}/projects", json={"name": f"TEST_proj_{uuid.uuid4().hex[:5]}", "activity_type": "restaurant"})
        if r.status_code not in (200, 201):
            pytest.skip(f"project create not allowed: {r.status_code} {r.text[:120]}")
        pid = (r.json().get("project") or r.json())["id"]
        cats = s.get(f"{API}/categories", params={"project_id": pid}).json()
        s.delete(f"{API}/projects/{pid}")
        assert cats == []
