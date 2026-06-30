"""Seed invoices to test (1) invoice image rendering fix (old /uploads/ vs new /api/uploads/)
and (2) the received-invoice item correction feature. Idempotent."""
import pymongo, uuid, shutil
from pathlib import Path
from datetime import datetime, timezone

c = pymongo.MongoClient("mongodb://localhost:27017")
db = c["maestro_pos"]
now = datetime.now(timezone.utc).isoformat()

INV_DIR = Path("/app/backend/uploads/invoices")
INV_DIR.mkdir(parents=True, exist_ok=True)
# pick an existing png to copy as a real, loadable image
existing = next((p for p in INV_DIR.glob("*.png")), None)
old_file = INV_DIR / "test_broken_old.png"
new_file = INV_DIR / "test_new.png"
if existing:
    shutil.copy(existing, old_file)
    shutil.copy(existing, new_file)
else:
    # minimal 1x1 PNG
    png = bytes.fromhex("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000154a24f5f0000000049454e44ae426082")
    old_file.write_bytes(png); new_file.write_bytes(png)

br = db.branches.find_one({"tenant_id": "default"}, {"_id": 0, "id": 1, "name": 1})
sup = db.suppliers.find_one({"name": "مورد تجريبي أ"}, {"_id": 0}) or db.suppliers.find_one({}, {"_id": 0})
sup_id = (sup or {}).get("id", "sup-a")
sup_name = (sup or {}).get("name", "مورد تجريبي أ")

# cleanup prior seed
db.purchases_new.delete_many({"invoice_number": {"$in": ["IMG-OLD", "IMG-NEW", "CORR-UI"]}})
db.owner_deposits.delete_many({"description": "إيداع اختبار صورة/تصحيح"})
db.raw_materials.delete_many({"name": "اورغانو اختبار UI"})

# big treasury so corrections can claw back
db.owner_deposits.insert_one({"id": str(uuid.uuid4()), "tenant_id": "default", "amount": 100_000_000,
    "date": now[:10], "description": "إيداع اختبار صورة/تصحيح", "source": "manual", "payment_method": "cash",
    "branch_id": (br or {}).get("id"), "branch_name": (br or {}).get("name"), "created_at": now})

def mk_invoice(num, inv_no, image_url, items):
    total = sum(i["total_cost"] for i in items)
    db.purchases_new.insert_one({
        "id": f"seed-{inv_no.lower()}", "tenant_id": "default", "purchase_number": num,
        "supplier_id": sup_id, "supplier_name": sup_name, "invoice_number": inv_no,
        "status": "sent_to_warehouse", "payment_status": "paid", "paid_amount": total, "total_amount": total,
        "items": items, "payments": [], "invoice_image_url": image_url, "created_at": now,
    })

# 1) OLD format image (previously broken) — must now render with the fix
mk_invoice(9601, "IMG-OLD", "/uploads/invoices/test_broken_old.png",
           [{"name": "ملح", "quantity": 5, "unit": "كغم", "cost_per_unit": 1000, "total_cost": 5000}])
# 2) NEW format image — should also render
mk_invoice(9602, "IMG-NEW", "/api/uploads/invoices/test_new.png",
           [{"name": "فلفل", "quantity": 3, "unit": "كغم", "cost_per_unit": 2000, "total_cost": 6000}])

# 3) Correction-UI invoice: اورغانو 7999 كغم @9000 (wrong) + with real payment+withdrawal for clawback
db.raw_materials.insert_one({"id": str(uuid.uuid4()), "name": "اورغانو اختبار UI", "unit": "كغم",
    "quantity": 7999, "cost_per_unit": 9000, "min_quantity": 0, "created_at": now, "last_updated": now})
wid = str(uuid.uuid4())
corr_total = 7999 * 9000 + 24000
db.owner_withdrawals.insert_one({"id": wid, "tenant_id": "default", "amount": corr_total, "date": now[:10],
    "actual_payment_date": now[:10], "beneficiary": f"مورد: {sup_name}",
    "description": f"تسديد فاتورة مشتريات #9603 — {sup_name}", "category": "purchase_payment",
    "payment_method": "cash", "linked_purchase_id": "seed-corr-ui", "supplier_id": sup_id, "created_at": now})
db.purchases_new.insert_one({
    "id": "seed-corr-ui", "tenant_id": "default", "purchase_number": 9603, "supplier_id": sup_id,
    "supplier_name": sup_name, "invoice_number": "CORR-UI", "status": "sent_to_warehouse",
    "payment_status": "paid", "paid_amount": corr_total, "total_amount": corr_total,
    "items": [
        {"name": "اورغانو اختبار UI", "quantity": 7999, "unit": "كغم", "cost_per_unit": 9000, "total_cost": 7999 * 9000},
        {"name": "نعناع", "quantity": 2, "unit": "كغم", "cost_per_unit": 12000, "total_cost": 24000},
    ],
    "payments": [{"id": str(uuid.uuid4()), "amount": corr_total, "payment_method": "cash", "withdrawal_id": wid, "created_at": now}],
    "invoice_image_url": "/api/uploads/invoices/test_new.png", "created_at": now,
})

print("Seeded: IMG-OLD(seed-img-old), IMG-NEW(seed-img-new), CORR-UI(seed-corr-ui)")
print("Image files:", old_file.exists(), new_file.exists())
