# iter324 helper: create/delete temp non-enterprise tenant for UI test. usage: python iter323_temp_tenant.py up|down
import sys, uuid, datetime, bcrypt, os
from pymongo import MongoClient
mdb = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))[os.environ.get("DB_NAME", "maestro_pos")]
TID = "TEST_iter324_ui"
if sys.argv[1] == "up":
    now = datetime.datetime.utcnow().isoformat()
    mdb.tenants.delete_many({"id": TID}); mdb.users.delete_many({"tenant_id": TID})
    mdb.tenants.insert_one({"id": TID, "name": "TEST iter323 UI", "enterprise_enabled": False, "is_active": True, "created_at": now})
    h = bcrypt.hashpw(b"test1234", bcrypt.gensalt()).decode()
    for role in ["admin", "general_manager", "enterprise_owner"]:
        e = f"test_ui324_{role}@x.com"
        mdb.users.insert_one({"id": str(uuid.uuid4()), "username": e, "email": e, "password": h, "password_hash": h,
                              "full_name": f"TEST {role}", "role": role, "tenant_id": TID, "permissions": ["all"],
                              "is_active": True, "created_at": now})
    print("up")
else:
    print(mdb.users.delete_many({"tenant_id": TID}).deleted_count, mdb.tenants.delete_many({"id": TID}).deleted_count)
