# Iter317: retest backend minors - category move carries products, X-Project-Id on categories, copy-catalog skips inactive/deleted
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
REST = "52aee398-394c-4d65-8eaa-59bab5ece916"
SALON = "f7a383ad-0e51-4c11-b20b-390f93a341bb"


@pytest.fixture(scope="module")
def s():
    r = requests.post(f"{API}/auth/login", json={"email": "admin@maestroegp.com", "password": "admin123"})
    if r.status_code != 200:
        pytest.skip("login failed")
    ses = requests.Session()
    ses.headers.update({"Authorization": f"Bearer {r.json()['token']}", "Content-Type": "application/json"})
    return ses


# --- GET /categories honors X-Project-Id header
class TestCategoriesHeader:
    def test_header_only(self, s):
        r = s.get(f"{API}/categories", headers={"X-Project-Id": SALON})
        assert r.status_code == 200
        d = r.json()
        assert len(d) >= 1 and all(c["project_id"] == SALON for c in d)

    def test_header_rest(self, s):
        d = s.get(f"{API}/categories", headers={"X-Project-Id": REST}).json()
        assert len(d) >= 1 and all(c["project_id"] == REST for c in d)

    def test_header_all(self, s):
        d = s.get(f"{API}/categories", headers={"X-Project-Id": "all"}).json()
        pids = {c.get("project_id") for c in d}
        assert REST in pids and SALON in pids


# --- PUT /categories/{id} with project_id moves its products
class TestCategoryMove:
    def test_move_carries_products(self, s):
        name = f"TEST_mv_{uuid.uuid4().hex[:6]}"
        c = s.post(f"{API}/categories", json={"name": name, "project_id": REST}).json()
        cid = c["id"]
        try:
            assert c.get("project_id") == REST
            p = s.post(f"{API}/products", json={"name": f"{name}_p", "category_id": cid, "price": 1000,
                                                 "cost": 100, "project_id": REST}).json()
            assert p.get("project_id") == REST, p
            r = s.put(f"{API}/categories/{cid}", json={"name": name, "project_id": SALON})
            assert r.status_code == 200 and r.json()["project_id"] == SALON
            sal = s.get(f"{API}/products", params={"project_id": SALON, "limit": 500}).json()
            moved = [x for x in sal if x["id"] == p["id"]]
            assert moved and moved[0]["project_id"] == SALON
            rest = s.get(f"{API}/products", params={"project_id": REST, "limit": 500}).json()
            assert not any(x["id"] == p["id"] for x in rest)
        finally:
            s.delete(f"{API}/products/{p['id']}") if 'p' in dir() else None
            s.delete(f"{API}/categories/{cid}")


# --- copy-catalog skips inactive/deleted
class TestCopyCatalog:
    def test_skips_inactive(self, s):
        proj = s.post(f"{API}/projects", json={"name": f"TEST_proj_{uuid.uuid4().hex[:5]}"})
        assert proj.status_code in (200, 201), proj.text
        tpid = proj.json().get("id") or proj.json().get("project", {}).get("id")
        cname = f"TEST_cc_{uuid.uuid4().hex[:6]}"
        cid = s.post(f"{API}/categories", json={"name": cname, "project_id": REST}).json()["id"]
        a = s.post(f"{API}/products", json={"name": "TEST_active", "category_id": cid, "price": 1, "cost": 0, "project_id": REST}).json()
        b = s.post(f"{API}/products", json={"name": "TEST_inactive", "category_id": cid, "price": 1, "cost": 0,
                                             "project_id": REST, "is_active": False}).json()
        # ProductCreate has no is_active field -> flag directly in Mongo (soft-inactive + soft-deleted)
        from pymongo import MongoClient
        from dotenv import dotenv_values
        env = dotenv_values("/app/backend/.env")
        mdb = MongoClient(env["MONGO_URL"])[env["DB_NAME"]]
        mdb.products.update_one({"id": b["id"]}, {"$set": {"is_active": False}})
        d = s.post(f"{API}/products", json={"name": "TEST_deleted", "category_id": cid, "price": 1, "cost": 0, "project_id": REST}).json()
        mdb.products.update_one({"id": d["id"]}, {"$set": {"deleted_at": "2026-01-01T00:00:00"}})
        try:
            r = s.post(f"{API}/projects/{tpid}/copy-catalog", json={"source_project_id": REST, "category_ids": [cid]})
            assert r.status_code == 200, r.text
            assert r.json()["categories_added"] == 1
            assert r.json()["products_added"] == 1
            tp = s.get(f"{API}/products", params={"project_id": tpid, "limit": 500}).json()
            names = [x["name"] for x in tp]
            assert "TEST_active" in names and "TEST_inactive" not in names and "TEST_deleted" not in names
        finally:
            for pid in (a["id"], b["id"], d["id"]):
                s.delete(f"{API}/products/{pid}")
            s.delete(f"{API}/categories/{cid}")
            s.delete(f"{API}/projects/{tpid}", params={"hard": "true"})
