# Project hard-delete cascade, logo upload (all formats), branding endpoint - iteration 314
import os
import uuid
import pytest
import requests
from PIL import Image

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')
API = f"{BASE_URL}/api"
IMG_DIR = "/tmp/img_t314"


@pytest.fixture(scope="module", autouse=True)
def images():
    os.makedirs(IMG_DIR, exist_ok=True)
    Image.new('RGB', (100, 100), (200, 30, 30)).save(f"{IMG_DIR}/a.png")
    Image.new('RGB', (100, 100), (30, 30, 200)).save(f"{IMG_DIR}/b.jpg")
    Image.new('RGB', (100, 100), (30, 200, 30)).save(f"{IMG_DIR}/c.webp")
    open(f"{IMG_DIR}/d.svg", "w").write('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>')
    open(f"{IMG_DIR}/e.txt", "w").write("not an image")


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    r = sess.post(f"{API}/auth/login", json={"email": "admin@maestroegp.com", "password": "admin123"})
    if r.status_code != 200:
        pytest.skip(f"login failed {r.status_code}")
    tok = r.json().get("token") or r.json().get("access_token")
    if tok:
        sess.headers.update({"Authorization": f"Bearer {tok}"})
    return sess


@pytest.fixture(scope="module")
def project(s):
    r = s.post(f"{API}/projects", json={"name": f"TEST_proj_{uuid.uuid4().hex[:6]}", "activity_type": "restaurant",
                                        "currency": "IQD", "timezone": "Asia/Baghdad", "exchange_rate": 1.0})
    assert r.status_code == 200, r.text
    p = r.json()["project"]
    yield p
    s.delete(f"{API}/projects/{p['id']}")


class TestLogo:
    @pytest.mark.parametrize("fname,ctype", [("a.png", "image/png"), ("b.jpg", "image/jpeg"),
                                             ("c.webp", "image/webp"), ("d.svg", "image/svg+xml")])
    def test_upload_image_formats(self, s, project, fname, ctype):
        with open(f"{IMG_DIR}/{fname}", "rb") as f:
            r = s.post(f"{API}/projects/{project['id']}/logo", files={"file": (fname, f, ctype)})
        assert r.status_code == 200, r.text
        url = r.json()["logo_url"]
        assert url.startswith("/api/uploads/logos/")
        g = s.get(f"{API}/projects/{project['id']}")
        assert g.json()["logo_url"] == url
        img = requests.get(f"{BASE_URL}{url}")
        assert img.status_code == 200

    def test_heic_by_extension_accepted_or_handled(self, s, project):
        # real HEIC not available; send a PNG renamed .heic with heic content-type
        with open(f"{IMG_DIR}/a.png", "rb") as f:
            r = s.post(f"{API}/projects/{project['id']}/logo", files={"file": ("x.heic", f, "image/heic")})
        assert r.status_code == 200, r.text

    def test_reject_non_image(self, s, project):
        with open(f"{IMG_DIR}/e.txt", "rb") as f:
            r = s.post(f"{API}/projects/{project['id']}/logo", files={"file": ("e.txt", f, "text/plain")})
        assert r.status_code == 400

    def test_logo_404_unknown_project(self, s):
        with open(f"{IMG_DIR}/a.png", "rb") as f:
            r = s.post(f"{API}/projects/nope-{uuid.uuid4()}/logo", files={"file": ("a.png", f, "image/png")})
        assert r.status_code == 404


class TestUpdateAndBranding:
    def test_update_all_fields(self, s, project):
        payload = {"name": project["name"] + "_E", "name_en": "TEST Edited", "activity_type": "cafe",
                   "currency": "IQD", "timezone": "Asia/Dubai", "description": "desc edited"}
        r = s.put(f"{API}/projects/{project['id']}", json=payload)
        assert r.status_code == 200, r.text
        g = s.get(f"{API}/projects/{project['id']}").json()
        for k, v in payload.items():
            assert g[k] == v, k
        project["name"] = payload["name"]

    def test_branding_by_project_and_branch(self, s, project):
        r = s.get(f"{API}/projects/branding/current", params={"project_id": project["id"]})
        assert r.status_code == 200
        d = r.json()
        assert d["id"] == project["id"] and d["name"] == project["name"]
        assert set(d.keys()) == {"id", "name", "name_en", "logo_url", "activity_type"}
        # create a branch in that project and resolve via branch_id
        br = s.post(f"{API}/branches", json={"name": "TEST_br_proj", "project_id": project["id"],
                                              "address": "x", "phone": "07700000000"},
                    headers={"X-Project-Id": project["id"]})
        if br.status_code not in (200, 201):
            pytest.skip(f"branch create failed {br.status_code} {br.text[:200]}")
        bid = (br.json().get("branch") or br.json()).get("id")
        project["branch_id"] = bid
        r2 = s.get(f"{API}/projects/branding/current", params={"branch_id": bid})
        assert r2.json().get("id") == project["id"], r2.text


class TestHardDelete:
    def test_delete_cascades_and_hard(self, s, project):
        pid = project["id"]
        r = s.delete(f"{API}/projects/{pid}")
        assert r.status_code == 200, r.text
        assert "deleted_counts" in r.json()
        # not in list
        lst = s.get(f"{API}/projects").json()
        assert pid not in [p["id"] for p in lst]
        # hard deleted -> 404
        assert s.get(f"{API}/projects/{pid}").status_code == 404
        assert s.delete(f"{API}/projects/{pid}").status_code == 404
        if project.get("branch_id"):
            branches = s.get(f"{API}/branches").json()
            branches = branches if isinstance(branches, list) else branches.get("branches", [])
            assert project["branch_id"] not in [b.get("id") for b in branches]

    def test_delete_unauthenticated(self):
        r = requests.delete(f"{API}/projects/{uuid.uuid4()}")
        assert r.status_code in (401, 403)
