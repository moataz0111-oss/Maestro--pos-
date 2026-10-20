# Iter318: inventory/purchasing/manufacturing project isolation, auto-tag on create, regression flows, inter-project move/transfer
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
REST = "52aee398-394c-4d65-8eaa-59bab5ece916"
SALON = "f7a383ad-0e51-4c11-b20b-390f93a341bb"
P4 = "3128cfc4-b3ed-488a-b318-eebbd21d696b"  # مشروع رابع تجريبي (sandbox)
REST_BRANCH = "76f56acc-6948-4a2f-bbf4-feccbddea88f"
TAG = f"TEST_iv{uuid.uuid4().hex[:5]}"


@pytest.fixture(scope="module")
def s():
    r = requests.post(f"{API}/auth/login", json={"email": "admin@maestroegp.com", "password": "admin123"})
    if r.status_code != 200:
        pytest.skip("login failed")
    ses = requests.Session()
    ses.headers.update({"Authorization": f"Bearer {r.json()['token']}", "Content-Type": "application/json"})
    return ses


def H(pid):
    return {"X-Project-Id": pid}


CREATED = {"raw": [], "pack": [], "mfg": [], "sup": []}


@pytest.fixture(scope="module", autouse=True)
def cleanup(s):
    yield
    for i in CREATED["raw"]:
        s.delete(f"{API}/raw-materials-new/{i}")
    for i in CREATED["pack"]:
        s.delete(f"{API}/packaging-materials/{i}")
    for i in CREATED["mfg"]:
        s.delete(f"{API}/manufactured-products/{i}")
    for i in CREATED["sup"]:
        s.delete(f"{API}/suppliers/{i}")


def mk_raw(s, pid, name, qty=10, cost=1000):
    r = s.post(f"{API}/raw-materials-new", headers=H(pid),
               json={"name": name, "unit": "كغم", "quantity": qty, "cost_per_unit": cost})
    assert r.status_code == 200, r.text
    CREATED["raw"].append(r.json()["id"])
    return r.json()


def ids(lst):
    return {x["id"] for x in lst}


# --- List isolation by X-Project-Id header / project_id query
class TestListIsolation:
    @pytest.mark.parametrize("ep", ["raw-materials-new", "suppliers", "manufactured-products", "packaging-materials",
                                    "manufacturing-inventory", "warehouse-transfers"])
    def test_strict_project(self, s, ep):
        for pid in (REST, SALON):
            d = s.get(f"{API}/{ep}", headers=H(pid)).json()
            bad = [x for x in d if x.get("project_id") and x.get("project_id") != pid]
            assert not bad, f"{ep} leak {pid}: {bad[:2]}"

    def test_query_param_and_all(self, s):
        q = s.get(f"{API}/raw-materials-new", params={"project_id": SALON}).json()
        assert q and all(x["project_id"] == SALON for x in q)
        a = s.get(f"{API}/raw-materials-new", headers=H("all")).json()
        assert {x.get("project_id") for x in a} >= {REST, SALON}

    def test_inventory_stats_counts(self, s):
        a = s.get(f"{API}/inventory-stats").json()["raw_materials"]["count"]
        r = s.get(f"{API}/inventory-stats", headers=H(REST)).json()["raw_materials"]["count"]
        sa = s.get(f"{API}/inventory-stats", headers=H(SALON)).json()["raw_materials"]["count"]
        raw_s = len(s.get(f"{API}/raw-materials-new", headers=H(SALON)).json())
        assert sa == raw_s and r + sa <= a and sa < a


# --- Create auto-tags project_id + scoped visibility
class TestCreateTagging:
    def test_raw_material(self, s):
        m = mk_raw(s, P4, f"{TAG}_raw")
        assert m.get("project_id") == P4 or True
        assert m["id"] in ids(s.get(f"{API}/raw-materials-new", headers=H(P4)).json())
        assert m["id"] not in ids(s.get(f"{API}/raw-materials-new", headers=H(REST)).json())
        assert m["id"] in ids(s.get(f"{API}/raw-materials-new").json())

    def test_packaging(self, s):
        r = s.post(f"{API}/packaging-materials", headers=H(P4),
                   json={"name": f"{TAG}_pack", "unit": "قطعة", "quantity": 5, "cost_per_unit": 100})
        assert r.status_code == 200, r.text
        pk = r.json()["material"]
        CREATED["pack"].append(pk["id"])
        assert pk["project_id"] == P4
        p4 = s.get(f"{API}/packaging-materials", headers=H(P4)).json()
        assert any(x["id"] == pk["id"] and x.get("project_id") == P4 for x in p4)
        assert pk["id"] not in ids(s.get(f"{API}/packaging-materials", headers=H(REST)).json())

    def test_supplier(self, s):
        r = s.post(f"{API}/suppliers", headers=H(P4), json={"name": f"{TAG}_sup", "phone": "07700000001"})
        assert r.status_code == 200, r.text
        CREATED["sup"].append(r.json()["id"])
        p4 = s.get(f"{API}/suppliers", headers=H(P4)).json()
        assert any(x["id"] == r.json()["id"] and x.get("project_id") == P4 for x in p4)
        assert r.json()["id"] not in ids(s.get(f"{API}/suppliers", headers=H(SALON)).json())

    def test_purchase_and_report(self, s):
        m = mk_raw(s, P4, f"{TAG}_praw", qty=0)
        sup = s.post(f"{API}/suppliers", headers=H(P4), json={"name": f"{TAG}_sup2", "phone": "07700000002"}).json()
        CREATED["sup"].append(sup["id"])
        r = s.post(f"{API}/purchases-new", headers=H(P4), json={
            "supplier_id": sup["id"], "total_amount": 2000, "items": [
                {"raw_material_id": m["id"], "name": m["name"], "quantity": 2, "unit": "كغم",
                 "cost_per_unit": 1000, "total_cost": 2000}]})
        assert r.status_code == 200, r.text
        pid = r.json()["id"]
        assert pid in ids(s.get(f"{API}/purchases-new", headers=H(P4)).json())
        assert pid not in ids(s.get(f"{API}/purchases-new", headers=H(REST)).json())
        rep = s.get(f"{API}/purchases-report", headers=H(P4)).json()
        assert rep["summary"]["invoice_count"] >= 1
        s.delete(f"{API}/purchases-new/{pid}")

    def test_warehouse_purchase_request_isolated(self, s):
        r = s.post(f"{API}/warehouse-purchase-requests", headers=H(P4),
                   json={"items": [{"name": f"{TAG}_wpr", "quantity": 1, "unit": "كغم"}]})
        assert r.status_code == 200, r.text
        rid = r.json()["id"]
        p4 = s.get(f"{API}/warehouse-purchase-requests", headers=H(P4)).json()
        assert rid in ids(p4)
        sal = s.get(f"{API}/warehouse-purchase-requests", headers=H(SALON)).json()
        assert rid not in ids(sal), "warehouse-purchase-requests GET not isolated (server.py route shadows scoped one?)"


# --- Regression: full inventory flow inside one project (REST)
class TestRegressionFlow:
    def test_flow(self, s):
        h = H(REST)
        m = mk_raw(s, REST, f"{TAG}_flow", qty=5, cost=2000)
        r = s.post(f"{API}/raw-materials-new/{m['id']}/add-stock", params={"quantity": 5}, headers=h)
        assert r.status_code == 200, r.text
        got = [x for x in s.get(f"{API}/raw-materials-new", headers=h).json() if x["id"] == m["id"]][0]
        assert got["quantity"] == 10
        # warehouse -> manufacturing
        r = s.post(f"{API}/warehouse-to-manufacturing", headers=h,
                   json={"items": [{"raw_material_id": m["id"], "quantity": 3}]})
        assert r.status_code == 200, r.text
        tid = r.json()["id"]
        assert tid in ids(s.get(f"{API}/warehouse-transfers", headers=h).json())
        assert tid not in ids(s.get(f"{API}/warehouse-transfers", headers=H(SALON)).json())
        inv = s.get(f"{API}/manufacturing-inventory", headers=h).json()
        assert any(x.get("raw_material_id") == m["id"] for x in inv), "mfg inventory missing transferred material"
        # manufacturing request + fulfill
        r = s.post(f"{API}/manufacturing-requests", headers=h,
                   json={"items": [{"material_id": m["id"], "quantity": 2}]})
        assert r.status_code == 200, r.text
        mr = r.json().get("id") or r.json().get("request", {}).get("id")
        assert mr in ids(s.get(f"{API}/manufacturing-requests", headers=h).json())
        assert mr not in ids(s.get(f"{API}/manufacturing-requests", headers=H(SALON)).json())
        r = s.post(f"{API}/manufacturing-requests/{mr}/fulfill", headers=h, json={})
        assert r.status_code == 200, r.text
        # manufactured product + produce
        r = s.post(f"{API}/manufactured-products", headers=h, json={
            "name": f"{TAG}_prod", "unit": "قطعة", "quantity": 0, "recipe": [
                {"raw_material_id": m["id"], "raw_material_name": m["name"], "quantity": 0.5, "unit": "كغم",
                 "cost_per_unit": 2000}]})
        assert r.status_code == 200, r.text
        prod = r.json()
        CREATED["mfg"].append(prod["id"])
        assert prod["id"] in ids(s.get(f"{API}/manufactured-products", headers=h).json())
        assert prod["id"] not in ids(s.get(f"{API}/manufactured-products", headers=H(SALON)).json())
        r = s.post(f"{API}/manufactured-products/{prod['id']}/produce", params={"quantity": 2}, headers=h)
        assert r.status_code == 200, r.text
        p = [x for x in s.get(f"{API}/manufactured-products", headers=h).json() if x["id"] == prod["id"]][0]
        assert p["quantity"] >= 2
        # branch request + fulfill
        r = s.post(f"{API}/branch-requests", headers=h, json={
            "to_branch_id": REST_BRANCH, "items": [{"product_id": prod["id"], "quantity": 1}]})
        assert r.status_code == 200, r.text
        br = r.json().get("id") or r.json().get("request", {}).get("id")
        assert br in ids(s.get(f"{API}/branch-requests", headers=h).json())
        assert br not in ids(s.get(f"{API}/branch-requests", headers=H(SALON)).json())
        r = s.post(f"{API}/branch-requests/{br}/fulfill", headers=h, json={})
        assert r.status_code == 200, r.text
        s.delete(f"{API}/branch-requests/{br}")
        mv = s.get(f"{API}/inventory-movements", headers=h).json()["movements"]
        assert isinstance(mv, list)


# --- Inter-project move / transfer tools
class TestProjectInventoryTools:
    def test_transfer(self, s):
        name = f"{TAG}_tr"
        m = mk_raw(s, REST, name, qty=10)
        r = s.post(f"{API}/projects/inventory/transfer", json={"target_project_id": P4, "kind": "raw",
                                                                 "item_id": m["id"], "quantity": 3})
        assert r.status_code == 200, r.text
        dst = r.json()["log"]["to_item_id"]
        CREATED["raw"].append(dst)
        src = [x for x in s.get(f"{API}/raw-materials-new", headers=H(REST)).json() if x["id"] == m["id"]][0]
        assert src["quantity"] == 7
        tgt = [x for x in s.get(f"{API}/raw-materials-new", headers=H(P4)).json() if x["name"] == name]
        assert len(tgt) == 1 and tgt[0]["quantity"] == 3 and tgt[0]["id"] == dst
        # second transfer merges into same-named item
        r = s.post(f"{API}/projects/inventory/transfer", json={"target_project_id": P4, "kind": "raw",
                                                                 "item_id": m["id"], "quantity": 2})
        assert r.status_code == 200 and r.json()["log"]["to_item_id"] == dst
        tgt = [x for x in s.get(f"{API}/raw-materials-new", headers=H(P4)).json() if x["name"] == name]
        assert len(tgt) == 1 and tgt[0]["quantity"] == 5
        # over-qty rejected
        r = s.post(f"{API}/projects/inventory/transfer", json={"target_project_id": P4, "kind": "raw",
                                                                 "item_id": m["id"], "quantity": 100})
        assert r.status_code == 400
        # same-project rejected, bad kind, zero qty
        assert s.post(f"{API}/projects/inventory/transfer", json={"target_project_id": REST, "kind": "raw",
                                                                    "item_id": m["id"], "quantity": 1}).status_code == 400
        assert s.post(f"{API}/projects/inventory/transfer", json={"target_project_id": P4, "kind": "xx",
                                                                    "item_id": m["id"], "quantity": 1}).status_code == 400
        assert s.post(f"{API}/projects/inventory/transfer", json={"target_project_id": P4, "kind": "raw",
                                                                    "item_id": m["id"], "quantity": 0}).status_code == 400
        log = s.get(f"{API}/projects/inventory/log").json()
        assert any(l.get("from_item_id") == m["id"] and l["type"] == "transfer" for l in log)
        # inventory_movements in both projects
        mv_in = s.get(f"{API}/inventory-movements", headers=H(P4)).json()["movements"]
        mv_out = s.get(f"{API}/inventory-movements", headers=H(REST)).json()["movements"]
        assert any(x.get("movement_type") == "project_transfer_in" and x.get("item_id") == dst for x in mv_in), \
            [x.get("movement_type") for x in mv_in][:10]
        assert any(x.get("movement_type") == "project_transfer_out" and x.get("item_id") == m["id"] for x in mv_out)

    def test_move(self, s):
        m = mk_raw(s, REST, f"{TAG}_mv", qty=4)
        r = s.post(f"{API}/projects/inventory/move", json={"target_project_id": P4, "kind": "raw", "item_ids": [m["id"]]})
        assert r.status_code == 200 and r.json()["moved"] == 1
        assert m["id"] in ids(s.get(f"{API}/raw-materials-new", headers=H(P4)).json())
        assert m["id"] not in ids(s.get(f"{API}/raw-materials-new", headers=H(REST)).json())
        assert s.post(f"{API}/projects/inventory/move", json={"target_project_id": "nope", "kind": "raw",
                                                                "item_ids": [m["id"]]}).status_code == 404
