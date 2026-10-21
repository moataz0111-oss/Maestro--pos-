# Iter325 helper: create/remove a temp non-enterprise tenant + admin (test_ui325_admin@x.com / test1234)
import sys, uuid, bcrypt
from datetime import datetime, timezone
from pymongo import MongoClient
m = MongoClient("mongodb://localhost:27017")["maestro_pos"]
TID = "test-ui325-ne"
if sys.argv[1] == "up":
    now = datetime.now(timezone.utc).isoformat()
    m.tenants.update_one({"id": TID}, {"$set": {"id": TID, "name": "TEST UI325 NE", "is_active": True, "enterprise_enabled": False, "created_at": now, "max_users": 50, "max_branches": 10}}, upsert=True)
    m.users.update_one({"email": "test_ui325_admin@x.com"}, {"$set": {"id": "test-ui325-admin", "username": "test_ui325_admin", "email": "test_ui325_admin@x.com", "full_name": "TEST UI325 admin",
        "password": bcrypt.hashpw(b"test1234", bcrypt.gensalt()).decode(), "role": "admin", "tenant_id": TID, "permissions": ["all"], "is_active": True, "created_at": now, "branch_id": None}}, upsert=True)
    print("up")
else:
    for c in ["users", "payment_settings", "callcenter_config", "tenant_invoice_settings", "delivery_app_settings", "branches", "customers", "projects"]:
        m[c].delete_many({"tenant_id": TID})
    m.tenants.delete_one({"id": TID})
    print("down")
