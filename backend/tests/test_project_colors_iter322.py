# Project colors feature: PUT/POST color field validation & persistence
import os, re, pytest, requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')
HEX = re.compile(r"^#[0-9a-fA-F]{6}$")


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": "admin@maestroegp.com", "password": "admin123",
                                                   "device_id": "e2e-tester-persistent"})
    assert r.status_code == 200, r.text
    tok = r.json().get("token") or r.json().get("access_token")
    if not tok:
        pytest.skip(f"no token: {r.text[:200]}")
    s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


@pytest.fixture(scope="module")
def projects(client):
    r = client.get(f"{BASE_URL}/api/projects")
    assert r.status_code == 200
    data = r.json()
    return data if isinstance(data, list) else data.get("projects", [])


def test_list_projects(projects):
    assert len(projects) >= 2


def test_put_valid_color(client, projects):
    p = projects[1]
    orig = p.get("color")
    r = client.put(f"{BASE_URL}/api/projects/{p['id']}", json={"color": "#EC4899"})
    assert r.status_code == 200, r.text
    g = client.get(f"{BASE_URL}/api/projects").json()
    g = g if isinstance(g, list) else g.get("projects", [])
    assert next(x for x in g if x["id"] == p["id"])["color"] == "#EC4899"
    if orig and orig != "#EC4899":
        client.put(f"{BASE_URL}/api/projects/{p['id']}", json={"color": orig})


@pytest.mark.parametrize("bad", ["red", "#12345", "#GGGGGG", "EC4899", "#EC48990"])
def test_put_invalid_color_422(client, projects, bad):
    r = client.put(f"{BASE_URL}/api/projects/{projects[1]['id']}", json={"color": bad})
    assert r.status_code == 422, r.text


def test_put_other_field_keeps_color(client, projects):
    p = projects[1]
    r = client.put(f"{BASE_URL}/api/projects/{p['id']}", json={"description": p.get("description") or ""})
    assert r.status_code == 200
    g = client.get(f"{BASE_URL}/api/projects").json()
    g = g if isinstance(g, list) else g.get("projects", [])
    assert HEX.match(next(x for x in g if x["id"] == p["id"]).get("color") or "")


def _delete(client, pid):
    client.delete(f"{BASE_URL}/api/projects/{pid}")
    client.delete(f"{BASE_URL}/api/projects/{pid}?hard=true")


def test_create_without_color_autoassigns(client):
    r = client.post(f"{BASE_URL}/api/projects", json={"name": "TEST_color_auto", "activity_type": "other"})
    if r.status_code in (400, 403) and "max" in r.text.lower():
        pytest.skip(f"project limit: {r.text[:200]}")
    assert r.status_code in (200, 201), r.text
    d = r.json(); d = d.get("project", d)
    try:
        assert HEX.match(d.get("color") or ""), d
    finally:
        _delete(client, d["id"])


def test_create_with_color(client):
    r = client.post(f"{BASE_URL}/api/projects", json={"name": "TEST_color_set", "activity_type": "other", "color": "#10B981"})
    if r.status_code in (400, 403) and "max" in r.text.lower():
        pytest.skip(f"project limit: {r.text[:200]}")
    assert r.status_code in (200, 201), r.text
    d = r.json(); d = d.get("project", d)
    try:
        assert d.get("color") == "#10B981"
        g = client.get(f"{BASE_URL}/api/projects").json()
        g = g if isinstance(g, list) else g.get("projects", [])
        assert next(x for x in g if x["id"] == d["id"])["color"] == "#10B981"
    finally:
        _delete(client, d["id"])


def test_create_invalid_color_422(client):
    r = client.post(f"{BASE_URL}/api/projects", json={"name": "TEST_color_bad", "color": "red"})
    assert r.status_code == 422
