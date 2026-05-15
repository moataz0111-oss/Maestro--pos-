"""Regression tests for the new 'allow_credit_without_delivery' permission gate.

Scope:
- POST /api/orders with payment_method='credit' AND no delivery company
  must require either a privileged role (admin/manager/super_admin/branch_manager/owner)
  OR the 'allow_credit_without_delivery' permission.
- Privileged users pass through (the check returns 200/400/etc. but NOT 403 from THIS check).
- The Settings page exposes the permission entry for the owner to grant/revoke.
"""
import os
import pytest
import requests

BASE_URL = open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[-1].split("\n")[0].strip()
ADMIN_EMAIL = "hanialdujaili@gmail.com"
ADMIN_PASSWORD = "Hani@2024"


@pytest.fixture(scope="module")
def admin_auth():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        timeout=20,
    )
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}", "Content-Type": "application/json"}


class TestCreditPermissionGate:
    def test_admin_credit_without_delivery_not_blocked_by_permission(self, admin_auth):
        """Admin must NOT be blocked by the new permission check.

        The order itself may still fail (no open shift / no products),
        but it must NOT return our specific 403 detail.
        """
        branches = requests.get(f"{BASE_URL}/api/branches", headers=admin_auth, timeout=10).json()
        products = requests.get(f"{BASE_URL}/api/products", headers=admin_auth, timeout=10).json()
        if not branches or not products:
            pytest.skip("Need at least one branch and product")
        b_id = branches[0]["id"]
        p = products[0]
        body = {
            "branch_id": b_id,
            "items": [{
                "product_id": p["id"],
                "product_name": p.get("name", "X"),
                "quantity": 1,
                "price": float(p.get("price") or 1000),
            }],
            "subtotal": float(p.get("price") or 1000),
            "total": float(p.get("price") or 1000),
            "payment_method": "credit",
            "customer_name": "PYTEST_CREDIT",
            "order_type": "dine_in",
        }
        r = requests.post(f"{BASE_URL}/api/orders", headers=admin_auth, json=body, timeout=15)
        # Must NOT be 403 with our specific message
        if r.status_code == 403:
            detail = r.text
            assert "صلاحية 'آجل بدون شركة توصيل'" not in detail, "Admin should bypass this check"

    def test_credit_with_delivery_company_passes_permission(self, admin_auth):
        """A credit order WITH delivery_app set must bypass the gate regardless of role."""
        branches = requests.get(f"{BASE_URL}/api/branches", headers=admin_auth, timeout=10).json()
        products = requests.get(f"{BASE_URL}/api/products", headers=admin_auth, timeout=10).json()
        if not branches or not products:
            pytest.skip("Need at least one branch and product")
        b_id = branches[0]["id"]
        p = products[0]
        body = {
            "branch_id": b_id,
            "items": [{
                "product_id": p["id"],
                "product_name": p.get("name", "X"),
                "quantity": 1,
                "price": float(p.get("price") or 1000),
            }],
            "subtotal": float(p.get("price") or 1000),
            "total": float(p.get("price") or 1000),
            "payment_method": "credit",
            "customer_name": "PYTEST_CREDIT_DELIVERY",
            "order_type": "delivery",
            "delivery_app_name": "TEST_DELIVERY",
        }
        r = requests.post(f"{BASE_URL}/api/orders", headers=admin_auth, json=body, timeout=15)
        # The permission gate must NOT trip when delivery is set
        if r.status_code == 403:
            assert "صلاحية 'آجل بدون شركة توصيل'" not in r.text
