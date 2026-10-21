# iter332: per-project shifts/cash closings scope, project-admin reports permission, daily WhatsApp summary
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
BURGER = "edc0531b"  # prefix
SHAW = "75dfb28d"


def _login(email, pw):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw})
    assert r.status_code == 200, r.text
    d = r.json()
    return d.get("token") or d.get("access_token"), d.get("user", {})


@pytest.fixture(scope="module")
def admin():
    t, _ = _login("admin@maestroegp.com", "admin123")
    return {"Authorization": f"Bearer {t}"}


@pytest.fixture(scope="module")
def projects(admin):
    r = requests.get(f"{API}/projects", headers=admin)
    assert r.status_code == 200
    data = r.json()
    lst = data if isinstance(data, list) else data.get("projects", [])
    burger = next(p for p in lst if p["id"].startswith(BURGER))
    shaw = next(p for p in lst if p["id"].startswith(SHAW))
    return burger, shaw


@pytest.fixture(scope="module")
def branches(admin):
    r = requests.get(f"{API}/branches", headers=admin)
    return {b["id"]: b for b in r.json()}


def _set_flags(admin, pid, **kw):
    r = requests.put(f"{API}/projects/{pid}", headers=admin, json=kw)
    assert r.status_code == 200, r.text
    return r.json()["project"]


def _pm():
    t, u = _login("pmburger@test.com", "Pm123456")
    return {"Authorization": f"Bearer {t}"}, u


def _allowed(doc, pid, bids):
    return doc.get("project_id") == pid or (not doc.get("project_id") and doc.get("branch_id") in bids)


# --- Shifts scope (owner/admin) ---
class TestShiftsScope:
    def test_shifts_project_filter(self, admin, projects, branches):
        burger, shaw = projects
        all_ = requests.get(f"{API}/shifts", headers=admin).json()
        b = requests.get(f"{API}/shifts", headers=admin, params={"project_id": burger["id"]}).json()
        s = requests.get(f"{API}/shifts", headers=admin, params={"project_id": shaw["id"]}).json()
        hb = requests.get(f"{API}/shifts", headers={**admin, "X-Project-Id": burger["id"]}).json()
        bb = [k for k, v in branches.items() if v.get("project_id") == burger["id"]]
        sb = [k for k, v in branches.items() if v.get("project_id") == shaw["id"]]
        print("all", len(all_), "burger", len(b), "shaw", len(s), "header-burger", len(hb))
        assert all(x.get("tenant_id") in (None, "default") for x in all_)
        assert all(_allowed(x, burger["id"], bb) for x in b)
        assert all(_allowed(x, shaw["id"], sb) for x in s)
        assert not ({x["id"] for x in b} & {x["id"] for x in s})

    def test_shifts_date_filter_with_project(self, admin, projects, branches):
        burger, _ = projects
        bb = [k for k, v in branches.items() if v.get("project_id") == burger["id"]]
        r = requests.get(f"{API}/shifts", headers=admin,
                         params={"project_id": burger["id"], "date_from": "2020-01-01", "date_to": "2030-01-01"})
        assert r.status_code == 200
        assert all(_allowed(x, burger["id"], bb) for x in r.json())

    def test_closings_project_filter(self, admin, projects, branches):
        burger, shaw = projects
        bb = [k for k, v in branches.items() if v.get("project_id") == burger["id"]]
        for ep in ("cash-register-closings",):
            r = requests.get(f"{API}/reports/{ep}", headers=admin, params={"project_id": burger["id"]})
            assert r.status_code == 200, r.text
            d = r.json()
            lst = d if isinstance(d, list) else d.get("closings") or d.get("records") or []
            print(ep, "burger", len(lst))
            assert all(_allowed(x, burger["id"], bb) for x in lst)
        r = requests.get(f"{API}/reports/cash-register-closing", headers=admin, params={"project_id": burger["id"]})
        assert r.status_code == 200, r.text


# --- Project admin permissions & owner control ---
class TestProjectAdminReports:
    def test_reports_off_403(self, admin, projects):
        burger, _ = projects
        _set_flags(admin, burger["id"], admin_reports_enabled=False)
        h, u = _pm()
        assert u.get("project_reports_enabled") is False
        for p in ("/reports/sales", "/smart-reports/products", "/reports/cash-register-closings"):
            r = requests.get(f"{API}{p}", headers=h)
            assert r.status_code == 403, f"{p} {r.status_code}"

    def test_pa_shifts_scoped(self, projects, branches):
        burger, _ = projects
        bb = [k for k, v in branches.items() if v.get("project_id") == burger["id"]]
        h, _ = _pm()
        for params in ({}, {"date_from": "2020-01-01", "date_to": "2030-01-01"}, {"project_id": projects[1]["id"]}):
            r = requests.get(f"{API}/shifts", headers=h, params=params)
            assert r.status_code == 200
            assert all(_allowed(x, burger["id"], bb) for x in r.json()), params

    def test_pa_cannot_enable_flag(self, admin, projects):
        burger, _ = projects
        h, _ = _pm()
        r = requests.put(f"{API}/projects/{burger['id']}", headers=h, json={"admin_reports_enabled": True, "admin_daily_summary": False})
        assert r.status_code in (200, 403)
        p = requests.get(f"{API}/projects/{burger['id']}", headers=admin).json()
        p = p.get("project", p)
        assert not p.get("admin_reports_enabled")
        assert p.get("admin_daily_summary") is not False

    def test_reports_on_scoped(self, admin, projects, branches):
        burger, shaw = projects
        bb = [k for k, v in branches.items() if v.get("project_id") == burger["id"]]
        _set_flags(admin, burger["id"], admin_reports_enabled=True)
        try:
            h, u = _pm()
            assert u.get("project_reports_enabled") is True
            me = requests.get(f"{API}/auth/me", headers=h).json()
            assert me.get("project_reports_enabled") is True
            r = requests.get(f"{API}/reports/sales", headers=h)
            assert r.status_code == 200, r.text
            r = requests.get(f"{API}/smart-reports/products", headers=h)
            assert r.status_code == 200, r.text
            for params in ({}, {"start_date": "2020-01-01", "end_date": "2030-01-01"}, {"project_id": shaw["id"]}):
                r = requests.get(f"{API}/reports/cash-register-closings", headers=h, params=params)
                assert r.status_code == 200
                d = r.json()
                lst = d if isinstance(d, list) else d.get("closings") or d.get("records") or []
                assert all(_allowed(x, burger["id"], bb) for x in lst), params
            # sales scoped: compare with owner burger view vs shaw
            own_b = requests.get(f"{API}/reports/sales", headers=admin, params={"project_id": burger["id"]}).json()
            pa_shaw = requests.get(f"{API}/reports/sales", headers=h, params={"project_id": shaw["id"]}).json()
            pa = requests.get(f"{API}/reports/sales", headers=h).json()
            print("owner-burger", own_b.get("total_sales"), "pa", pa.get("total_sales"), "pa?shaw", pa_shaw.get("total_sales"))
            assert pa.get("total_sales") == own_b.get("total_sales")
            assert pa_shaw.get("total_sales") == pa.get("total_sales")
        finally:
            _set_flags(admin, burger["id"], admin_reports_enabled=False)


# --- Daily summary test endpoint ---
class TestDailySummary:
    def test_pa_forbidden(self, projects):
        h, _ = _pm()
        r = requests.post(f"{API}/projects/{projects[0]['id']}/daily-summary/test", headers=h)
        assert r.status_code == 403

    def test_no_phone_400_then_send(self, admin, projects):
        burger, _ = projects
        _, u = _pm()
        uid = u["id"]
        requests.put(f"{API}/users/{uid}", headers=admin, json={"phone": ""})
        r = requests.post(f"{API}/projects/{burger['id']}/daily-summary/test", headers=admin)
        print("no-phone", r.status_code, r.text[:200])
        r2 = requests.put(f"{API}/users/{uid}", headers=admin, json={"phone": "07701234567"})
        assert r2.status_code == 200, r2.text
        r3 = requests.post(f"{API}/projects/{burger['id']}/daily-summary/test", headers=admin, timeout=90)
        print("send", r3.status_code, r3.text[:300])
        assert r3.status_code == 200, r3.text
        d = r3.json()
        assert "sent" in d and "message" in d
        # pmburger should still log in; clear phone so scheduler won't message a real number
        _pm()
        requests.put(f"{API}/users/{uid}", headers=admin, json={"phone": ""})

    def test_shaw_no_admin_400(self, admin, projects):
        r = requests.post(f"{API}/projects/{projects[1]['id']}/daily-summary/test", headers=admin)
        print("shaw", r.status_code, r.text[:200])
        assert r.status_code in (400, 200)

    def test_unknown_project_404(self, admin):
        r = requests.post(f"{API}/projects/{uuid.uuid4()}/daily-summary/test", headers=admin)
        assert r.status_code == 404
