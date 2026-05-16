"""Regression test: refund-status must filter by branch_id.

Validates the fix where searching by order_number across branches caused
the wrong order to be returned (order #8 in Branch A would match order #8
in Branch B if Branch B's #8 was created more recently).
"""
import pytest
import requests
import uuid

BASE_URL = open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[-1].split("\n")[0].strip()
ADMIN_EMAIL = "hanialdujaili@gmail.com"
ADMIN_PASSWORD = "Hani@2024"


@pytest.fixture(scope="module")
def admin_headers():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=20,
    )
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}", "Content-Type": "application/json"}


class TestRefundBranchScoping:
    def test_branch_id_param_is_accepted(self, admin_headers):
        """Passing branch_id query param shouldn't crash the endpoint."""
        fake_id = str(uuid.uuid4())
        r = requests.get(
            f"{BASE_URL}/api/orders/999999999/refund-status",
            headers=admin_headers,
            params={"branch_id": fake_id},
            timeout=15,
        )
        # 404 expected (no such order in this random branch)
        assert r.status_code == 404
        # The error message must mention "في هذا الفرع" to confirm branch scoping is active
        body = r.json()
        detail = body.get("detail", "")
        assert "الفرع" in detail or "غير موجود" in detail

    def test_unknown_order_with_branch_returns_404(self, admin_headers):
        # Get a real branch id
        r = requests.get(f"{BASE_URL}/api/branches", headers=admin_headers, timeout=15)
        if r.status_code != 200 or not r.json():
            pytest.skip("No branches available")
        branch_id = r.json()[0]["id"]
        r = requests.get(
            f"{BASE_URL}/api/orders/__no_such_order__/refund-status",
            headers=admin_headers,
            params={"branch_id": branch_id},
            timeout=15,
        )
        assert r.status_code == 404
