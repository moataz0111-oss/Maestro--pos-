# Iter319: retest of iter318 fixes - warehouse-purchase-requests / packaging-requests / branch-packaging-inventory isolation,
# tenant-global sequence numbers, scoped cross-project writes, same-project regression flow
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
REST = "52aee398-394c-4d65-8eaa-59bab5ece916"
SALON = "f7a383ad-0e51-4c11-b20b-390f93a341bb"
REST_BRANCH = "76f56acc-6948-4a2f-bbf4-feccbddea88f"
TAG = f"TEST_i319{uuid.uuid4().hex[:4]}"
CREATED = {"raw": [], "pack": [], "mfg": []}


@pytest.fixture(scope="module")
def s():
    r = requests.post(f"{API}/auth/login", json={"email": "admin@maestroegp.com", "password": "admin123"})
    if r.status_code != 200:
        pytest.skip("login failed")
    ses = requests.Session()
    ses.headers.update({"Authorization": f"Bearer {r.json()['token']}", "Content-Type": "application/json"})
    yield ses
    for i in CREATED["raw"]:
        ses.delete(f"{API}/raw-materials-new/{i}")
    for i in CREATED["pack"]:
        ses.delete(f"{API}/packaging-materials/{i}")
    for i in CREATED["mfg"]:
        ses.delete(f"{API}/manufactured-products/{i}")


def H(pid):
    return {"X-Project-Id": pid}


def ids(lst):
    return {x.get("id") for x in lst}


def mk_raw(s, pid, name, qty=10, cost=1000):
    r = s.post(f"{API}/raw-materials-new", headers=H(pid),
               json={"name": name, "unit": "كغم", "quantity": qty, "cost_per_unit": cost})
    assert r.status_code == 200, r.text
    CREATED["raw"].append(r.json()["id"])
    return r.json()


def mk_pack(s, pid, name, qty=20):
    r = s.post(f"{API}/packaging-materials", headers=H(pid),
               json={"name": name, "unit": "قطعة", "quantity": qty, "cost_per_unit": 100})
    assert r.status_code == 200, r.text
    pk = r.json()["material"]
    CREATED["pack"].append(pk["id"])
    return pk


# --- warehouse purchase requests isolation + status filter
class TestWPR:
    def test_isolated_and_status(self, s):
        r = s.post(f"{API}/warehouse-purchase-requests", headers=H(REST),
                   json={"items": [{"name": f"{TAG}_wpr", "quantity": 1, "unit": "كغم"}]})
        assert r.status_code == 200, r.text
        rid = r.json()["id"]
        a = s.get(f"{API}/warehouse-purchase-requests", headers=H(REST))
        assert a.status_code == 200 and rid in ids(a.json())
        assert all(x.get("project_id") in (REST, None, "") for x in a.json())
        b = s.get(f"{API}/warehouse-purchase-requests", headers=H(SALON)).json()
        assert rid not in ids(b)
        assert rid in ids(s.get(f"{API}/warehouse-purchase-requests", headers=H("all")).json())
        st = s.get(f"{API}/warehouse-purchase-requests", params={"status": "pending_owner_approval"}, headers=H(REST)).json()
        assert rid in ids(st) and all(x["status"] == "pending_owner_approval" for x in st)
        st2 = s.get(f"{API}/warehouse-purchase-requests", params={"status": "completed"}, headers=H(REST)).json()
        assert rid not in ids(st2)

    def test_numbers_global(self, s):
        n = []
        for pid in (REST, SALON, REST):
            r = s.post(f"{API}/warehouse-purchase-requests", headers=H(pid),
                       json={"items": [{"name": f"{TAG}_wn", "quantity": 1, "unit": "كغم"}]})
            assert r.status_code == 200
            n.append(r.json()["request_number"])
        assert n[0] < n[1] < n[2], n


# --- packaging requests + branch packaging inventory isolation; approve/transfer in-project
class TestPackaging:
    def test_packaging_flow(self, s):
        h = H(REST)
        pk = mk_pack(s, REST, f"{TAG}_pk", qty=20)
        r = s.post(f"{API}/packaging-requests", headers=h, json={
            "from_branch_id": REST_BRANCH, "priority": "normal", "notes": TAG,
            "items": [{"packaging_material_id": pk["id"], "name": pk["name"], "quantity": 3, "unit": "قطعة"}]})
        assert r.status_code == 200, r.text
        body = r.json()
        req = body.get("request") or body
        rid = req["id"]
        print("pkg create:", {k: req.get(k) for k in ("request_number", "project_id", "from_branch_id")})
        g = s.get(f"{API}/packaging-requests", headers=h)
        assert g.status_code == 200, g.text
        assert rid in ids(g.json())
        sal = s.get(f"{API}/packaging-requests", headers=H(SALON))
        assert sal.status_code == 200 and rid not in ids(sal.json())
        # approve / transfer in-project
        r = s.post(f"{API}/packaging-requests/{rid}/approve", headers=h)
        assert r.status_code == 200, r.text
        r = s.post(f"{API}/packaging-requests/{rid}/transfer", headers=h)
        assert r.status_code == 200, r.text
        m = [x for x in s.get(f"{API}/packaging-materials", headers=h).json() if x["id"] == pk["id"]][0]
        assert m["quantity"] == 17, m["quantity"]
        bi = s.get(f"{API}/branch-packaging-inventory", headers=h)
        assert bi.status_code == 200, bi.text
        bij = bi.json() if isinstance(bi.json(), list) else bi.json().get("inventory", [])
        assert any(x.get("packaging_material_id") == pk["id"] for x in bij)
        bs = s.get(f"{API}/branch-packaging-inventory", headers=H(SALON)).json()
        bsj = bs if isinstance(bs, list) else bs.get("inventory", [])
        assert not any(x.get("packaging_material_id") == pk["id"] for x in bsj)

    def test_pkg_numbers_global(self, s):
        n = []
        for pid in (REST, SALON):
            r = s.post(f"{API}/packaging-requests", headers=H(pid), json={
                "priority": "normal", "notes": TAG, "items": [{"name": f"{TAG}_x", "quantity": 1}]})
            assert r.status_code == 200, r.text
            req = r.json().get("request") or r.json()
            n.append(req["request_number"])
        print("pkg numbers", n)
        assert n[0] != n[1]


# --- tenant-global sequence numbers
class TestSequences:
    def test_mfg_request_numbers(self, s):
        mr = mk_raw(s, REST, f"{TAG}_sq1")
        ms = mk_raw(s, SALON, f"{TAG}_sq2")
        n = []
        for pid, m in ((REST, mr), (SALON, ms), (REST, mr)):
            r = s.post(f"{API}/manufacturing-requests", headers=H(pid),
                       json={"items": [{"material_id": m["id"], "quantity": 1}]})
            assert r.status_code == 200, r.text
            d = r.json().get("request") or r.json()
            n.append(d["request_number"])
        assert n[0] < n[1] < n[2], n

    def test_warehouse_transfer_numbers(self, s):
        mr = mk_raw(s, REST, f"{TAG}_wt1", qty=10)
        ms = mk_raw(s, SALON, f"{TAG}_wt2", qty=10)
        n = []
        for pid, m in ((REST, mr), (SALON, ms)):
            r = s.post(f"{API}/warehouse-to-manufacturing", headers=H(pid),
                       json={"items": [{"raw_material_id": m["id"], "quantity": 1}]})
            assert r.status_code == 200, r.text
            n.append(r.json().get("transfer_number"))
        assert n[0] is not None and n[0] < n[1], n


# --- scoped writes: cross-project id must not be modified
class TestCrossProjectWrites:
    def test_update_delete_other_project(self, s):
        m = mk_raw(s, REST, f"{TAG}_cx", qty=10)
        r = s.put(f"{API}/raw-materials-new/{m['id']}", headers=H(SALON),
                  json={"name": f"{TAG}_HACK", "unit": "كغم", "quantity": 999, "cost_per_unit": 1})
        print("cross PUT", r.status_code, r.text[:150])
        r2 = s.post(f"{API}/raw-materials-new/{m['id']}/add-stock", params={"quantity": 50}, headers=H(SALON))
        print("cross add-stock", r2.status_code, r2.text[:150])
        r3 = s.delete(f"{API}/raw-materials-new/{m['id']}", headers=H(SALON))
        print("cross DELETE", r3.status_code, r3.text[:150])
        assert r.status_code < 500 and r2.status_code < 500 and r3.status_code < 500
        got = [x for x in s.get(f"{API}/raw-materials-new", headers=H(REST)).json() if x["id"] == m["id"]]
        assert got, "item deleted cross-project"
        assert got[0]["name"] == m["name"] and got[0]["quantity"] == 10, got[0]

    def test_pack_cross_project(self, s):
        pk = mk_pack(s, REST, f"{TAG}_cpk", qty=5)
        r = s.delete(f"{API}/packaging-materials/{pk['id']}", headers=H(SALON))
        print("cross pack DELETE", r.status_code, r.text[:150])
        assert r.status_code < 500
        assert pk["id"] in ids(s.get(f"{API}/packaging-materials", headers=H(REST)).json())


# --- same-project regression
class TestSameProjectFlow:
    def test_flow(self, s):
        h = H(REST)
        m = mk_raw(s, REST, f"{TAG}_fl", qty=5, cost=2000)
        assert s.post(f"{API}/raw-materials-new/{m['id']}/add-stock", params={"quantity": 5}, headers=h).status_code == 200
        r = s.put(f"{API}/raw-materials-new/{m['id']}", headers=h,
                  json={"name": f"{TAG}_fl2", "unit": "كغم", "quantity": 10, "cost_per_unit": 2000})
        assert r.status_code == 200, r.text
        got = [x for x in s.get(f"{API}/raw-materials-new", headers=h).json() if x["id"] == m["id"]][0]
        assert got["quantity"] == 10 and got["name"] == f"{TAG}_fl2"
        r = s.post(f"{API}/warehouse-to-manufacturing", headers=h, json={"items": [{"raw_material_id": m["id"], "quantity": 3}]})
        assert r.status_code == 200, r.text
        r = s.post(f"{API}/manufacturing-requests", headers=h, json={"items": [{"material_id": m["id"], "quantity": 2}]})
        assert r.status_code == 200, r.text
        mr = r.json().get("id") or r.json().get("request", {}).get("id")
        r = s.post(f"{API}/manufacturing-requests/{mr}/fulfill", headers=h, json={})
        assert r.status_code == 200, r.text
        r = s.post(f"{API}/manufactured-products", headers=h, json={
            "name": f"{TAG}_prod", "unit": "قطعة", "quantity": 0, "recipe": [
                {"raw_material_id": m["id"], "raw_material_name": m["name"], "quantity": 0.5, "unit": "كغم", "cost_per_unit": 2000}]})
        assert r.status_code == 200, r.text
        prod = r.json()
        CREATED["mfg"].append(prod["id"])
        r = s.post(f"{API}/manufactured-products/{prod['id']}/produce", params={"quantity": 2}, headers=h)
        assert r.status_code == 200, r.text
        r = s.post(f"{API}/branch-requests", headers=h, json={"to_branch_id": REST_BRANCH, "items": [{"product_id": prod["id"], "quantity": 1}]})
        assert r.status_code == 200, r.text
        br = r.json().get("id") or r.json().get("request", {}).get("id")
        r = s.post(f"{API}/branch-requests/{br}/fulfill", headers=h, json={})
        assert r.status_code == 200, r.text
        s.delete(f"{API}/branch-requests/{br}")
        assert s.delete(f"{API}/raw-materials-new/{m['id']}", headers=h).status_code in (200, 400, 409)
