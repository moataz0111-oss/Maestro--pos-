# Reports project isolation tests (iter315): projects-activity + per-project scoping of all report endpoints
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')
REST = "52aee398-394c-4d65-8eaa-59bab5ece916"      # مطعم الاختبار (has orders)
EMPTY = "f7a383ad-0e51-4c11-b20b-390f93a341bb"     # صالون الأناقة (no data)
MAIN_BRANCH = "76f56acc-6948-4a2f-bbf4-feccbddea88f"  # belongs to REST
DATES = {"start_date": "2026-06-01", "end_date": "2026-07-31"}


@pytest.fixture(scope="module")
def s():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": "admin@maestroegp.com", "password": "admin123"})
    if r.status_code != 200:
        pytest.skip("login failed")
    d = r.json()
    tok = d.get("token") or d.get("access_token")
    ss = requests.Session()
    ss.headers.update({"Authorization": f"Bearer {tok}"})
    return ss


def _sales(s, params=None, headers=None):
    r = s.get(f"{BASE_URL}/api/reports/sales", params={**DATES, **(params or {})}, headers=headers or {})
    assert r.status_code == 200, r.text
    return r.json()


# --- projects-activity endpoint
class TestProjectsActivity:
    def test_shape_and_values(self, s):
        r = s.get(f"{BASE_URL}/api/reports/projects-activity", params=DATES)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list) and len(data) >= 2
        for p in data:
            assert set(["id", "name", "logo_url", "orders", "sales", "has_data"]) <= set(p.keys())
        m = {p["id"]: p for p in data}
        assert m[REST]["has_data"] is True and m[REST]["orders"] > 0 and m[REST]["sales"] > 0
        assert m[EMPTY]["has_data"] is False and m[EMPTY]["orders"] == 0

    def test_ignores_x_project_header(self, s):
        r = s.get(f"{BASE_URL}/api/reports/projects-activity", params=DATES, headers={"X-Project-Id": EMPTY})
        m = {p["id"]: p for p in r.json()}
        assert m[REST]["orders"] > 0

    def test_empty_range(self, s):
        r = s.get(f"{BASE_URL}/api/reports/projects-activity", params={"start_date": "2020-01-01", "end_date": "2020-01-02"})
        assert all(p["has_data"] is False for p in r.json())


# --- sales report scoping
class TestSalesScope:
    def test_all_projects_nonzero(self, s):
        d = _sales(s)
        assert d["total_sales"] > 0 and d["total_orders"] > 0

    def test_empty_project_query(self, s):
        d = _sales(s, {"project_id": EMPTY})
        assert d["total_sales"] == 0 and d["total_orders"] == 0

    def test_empty_project_header(self, s):
        d = _sales(s, headers={"X-Project-Id": EMPTY})
        assert d["total_sales"] == 0 and d["total_orders"] == 0

    def test_rest_project_matches_all(self, s):
        a = _sales(s)
        r = _sales(s, {"project_id": REST})
        assert r["total_orders"] > 0
        assert r["total_sales"] == a["total_sales"]  # only REST has data

    def test_branch_of_other_project(self, s):
        d = _sales(s, {"project_id": EMPTY, "branch_id": MAIN_BRANCH})
        assert d["total_sales"] == 0 and d["total_orders"] == 0

    def test_branch_of_same_project(self, s):
        d = _sales(s, {"project_id": REST, "branch_id": MAIN_BRANCH})
        assert d["total_orders"] > 0

    def test_project_all_value(self, s):
        d = _sales(s, headers={"X-Project-Id": "all"})
        assert d["total_orders"] > 0


def _num_values(obj, depth=0):
    """collect numeric leaves for 'totals' sanity"""
    out = []
    if depth > 2:
        return out
    if isinstance(obj, dict):
        for k, v in obj.items():
            if isinstance(v, (int, float)) and not isinstance(v, bool):
                out.append((k, v))
            elif isinstance(v, (dict, list)):
                out += _num_values(v, depth + 1)
    elif isinstance(obj, list):
        for v in obj:
            out += _num_values(v, depth + 1)
    return out


ENDPOINTS = ["expenses", "profit-loss", "products", "products-by-channel", "delivery-credits", "cancellations",
             "discounts", "credit", "card", "purchases", "inventory"]


# --- other report tabs return empty for empty project
@pytest.mark.parametrize("ep", ENDPOINTS)
def test_tab_empty_project(s, ep):
    r = s.get(f"{BASE_URL}/api/reports/{ep}", params=DATES, headers={"X-Project-Id": EMPTY})
    assert r.status_code == 200, f"{ep}: {r.status_code} {r.text[:200]}"
    catalog_keys = ("price", "cost", "profit_per_unit", "operating_cost", "total_products")  # catalog attrs, not sales
    nonzero = [(k, v) for k, v in _num_values(r.json()) if v not in (0, 0.0) and "percent" not in k and "rate" not in k
               and "days" not in k and "ratio" not in k and not (ep == "products" and k in catalog_keys)]
    print(ep, nonzero[:10])
    assert not nonzero, f"{ep} returned non-zero for empty project: {nonzero[:10]}"


def test_refunds_empty_project(s):
    r = s.get(f"{BASE_URL}/api/refunds", params={"date_from": "2026-06-01", "date_to": "2026-07-31"},
              headers={"X-Project-Id": EMPTY})
    assert r.status_code == 200
    assert r.json() == []


def test_smart_reports_empty_project(s):
    r = s.get(f"{BASE_URL}/api/smart-reports/sales", params=DATES, headers={"X-Project-Id": EMPTY})
    assert r.status_code == 200, r.text[:200]
    nonzero = [(k, v) for k, v in _num_values(r.json()) if v not in (0, 0.0)]
    print("smart", nonzero[:10])


# --- products tab catalog should only list the selected project's products (known issue iter315)
def test_products_catalog_scoped_to_project(s):
    r = s.get(f"{BASE_URL}/api/reports/products", params=DATES, headers={"X-Project-Id": EMPTY})
    assert r.status_code == 200
    assert r.json()["total_products"] == 0, f"empty project lists {r.json()['total_products']} products of other projects"
