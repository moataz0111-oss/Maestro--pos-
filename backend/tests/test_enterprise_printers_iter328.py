# Iter328: header-derived project validation on POST /printers (retest of iter327 minor issue)
import os
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
P_MAIN = "52aee398-394c-4d65-8eaa-59bab5ece916"
P_BURGER = "edc0531b-3fa3-4bb7-b942-d34d0ff6b745"
BR_MAIN = "76f56acc-6948-4a2f-bbf4-feccbddea88f"
BR_BURGER = "2e19e95f-9dd1-4895-becc-6abd549bb53f"

mdb = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))[os.environ.get("DB_NAME", "maestro_pos")]


@pytest.fixture(scope="module")
def H():
    r = requests.post(f"{API}/auth/login", json={"email": "admin@maestroegp.com", "password": "admin123"})
    assert r.status_code == 200
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture(scope="module", autouse=True)
def cleanup():
    yield
    mdb.printers.delete_many({"name": {"$regex": "^TEST_it328"}})


def pr(name, branch, **kw):
    return {"name": name, "ip_address": "10.0.0.9", "port": 9100, "branch_id": branch, "printer_type": "kitchen", **kw}


class TestHeaderProject:
    # header project=burger, body without project_id, branch from main -> 400
    def test_header_mismatch_400(self, H):
        r = requests.post(f"{API}/printers", headers={**H, "X-Project-Id": P_BURGER}, json=pr("TEST_it328_bad", BR_MAIN))
        assert r.status_code == 400, r.text
        assert mdb.printers.count_documents({"name": "TEST_it328_bad"}) == 0

    # header project=burger, matching branch -> 200 with project_id from header
    def test_header_match_ok(self, H):
        r = requests.post(f"{API}/printers", headers={**H, "X-Project-Id": P_BURGER}, json=pr("TEST_it328_ok", BR_BURGER))
        assert r.status_code == 200, r.text
        assert r.json()["project_id"] == P_BURGER
        assert mdb.printers.find_one({"id": r.json()["id"]})["project_id"] == P_BURGER

    # header all + body project matching -> 200 (all-projects view regression)
    def test_all_view_body_project(self, H):
        r = requests.post(f"{API}/printers", headers={**H, "X-Project-Id": "all"}, json=pr("TEST_it328_all", BR_MAIN, project_id=P_MAIN))
        assert r.status_code == 200, r.text
        assert r.json()["project_id"] == P_MAIN
        pid = r.json()["id"]
        u = requests.put(f"{API}/printers/{pid}", headers=H, json={"project_id": P_BURGER, "branch_id": BR_BURGER, "name": "TEST_it328_all2"})
        assert u.status_code == 200, u.text
        d = mdb.printers.find_one({"id": pid})
        assert d["project_id"] == P_BURGER and d["branch_id"] == BR_BURGER

    # header burger without branch -> project_id from header
    def test_header_no_branch(self, H):
        r = requests.post(f"{API}/printers", headers={**H, "X-Project-Id": P_BURGER}, json=pr("TEST_it328_nob", ""))
        assert r.status_code == 200 and r.json()["project_id"] == P_BURGER
