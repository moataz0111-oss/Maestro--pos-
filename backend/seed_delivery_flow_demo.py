"""Seed a full delivery-flow demo for screenshots:
 2 drivers (with GPS), orders in every status (pending+incoming-call, preparing, out_for_delivery,
 delivered, cancelled/rejected), delivery_location + driver assignment + an unread cashier call.
Run: cd /app/backend && python3 seed_delivery_flow_demo.py
"""
import os
from datetime import datetime, timezone, timedelta
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv()
client = MongoClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]

TENANT = "default"
BRANCH = "76f56acc-6948-4a2f-bbf4-feccbddea88f"
now = datetime.now(timezone.utc)
iso = lambda dt: dt.isoformat()


def items(*pairs):
    out = []
    for name, qty, price in pairs:
        out.append({"product_id": "demo", "product_name": name, "name": name,
                    "price": price, "quantity": qty, "total": price * qty})
    return out


# ---- branch location (needed for distance fee + map center) ----
db.branches.update_one({"id": BRANCH}, {"$set": {"latitude": 33.3020, "longitude": 44.4010}})

# ---- drivers ----
db.drivers.delete_many({"id": {"$in": ["demo-drv-1", "demo-drv-2"]}})
db.drivers.insert_many([
    {"id": "demo-drv-1", "name": "سائق أحمد", "phone": "07801111111", "pin": "1234",
     "branch_id": BRANCH, "tenant_id": TENANT, "is_active": True, "is_available": False,
     "current_order_id": "demo-o-5001", "total_deliveries": 8,
     "current_location": {"latitude": 33.3250, "longitude": 44.4120}, "last_location_update": iso(now),
     "created_at": iso(now)},
    {"id": "demo-drv-2", "name": "سائق علي", "phone": "07802222222", "pin": "1234",
     "branch_id": BRANCH, "tenant_id": TENANT, "is_active": True, "is_available": False,
     "current_order_id": "demo-o-5003", "total_deliveries": 12,
     "current_location": {"latitude": 33.3060, "longitude": 44.3950}, "last_location_update": iso(now),
     "created_at": iso(now)},
])

# ---- orders ----
db.orders.delete_many({"id": {"$regex": "^demo-o-"}})
orders = [
    # out_for_delivery (driver أحمد) — for tracking + driver app + cashier map
    {"id": "demo-o-5001", "order_number": 5001, "tenant_id": TENANT, "branch_id": BRANCH,
     "customer_name": "زبون أحمد", "customer_phone": "07701234567",
     "delivery_address": "حي الجامعة - شارع 14", "delivery_location": {"latitude": 33.3450, "longitude": 44.4200},
     "items": items(("برغر لحم", 2, 7000), ("بطاطا", 1, 4000), ("بيبسي", 2, 1500)),
     "subtotal": 23000, "delivery_fee": 2000, "total": 25000, "status": "out_for_delivery",
     "order_type": "delivery", "source": "customer_app", "payment_method": "cash",
     "driver_id": "demo-drv-1", "driver_name": "سائق أحمد", "driver_phone": "07801111111",
     "created_at": iso(now - timedelta(minutes=42))},
    # pending + incoming cashier call
    {"id": "demo-o-5002", "order_number": 5002, "tenant_id": TENANT, "branch_id": BRANCH,
     "customer_name": "زبون سارة", "customer_phone": "07705556666",
     "delivery_address": "المنصور - حي 601", "delivery_location": {"latitude": 33.3120, "longitude": 44.3720},
     "items": items(("شاورما دجاج", 3, 5000), ("عصير", 1, 3000)),
     "subtotal": 18000, "delivery_fee": 0, "total": 18000, "status": "pending",
     "order_type": "delivery", "source": "customer_app", "payment_method": "cash",
     "created_at": iso(now - timedelta(minutes=1))},
    # preparing (assigned علي) — accepted, taking long
    {"id": "demo-o-5003", "order_number": 5003, "tenant_id": TENANT, "branch_id": BRANCH,
     "customer_name": "زبون مازن", "customer_phone": "07707778888",
     "delivery_address": "الكرادة - قرب الجامعة", "delivery_location": {"latitude": 33.3000, "longitude": 44.4300},
     "items": items(("بيتزا خضار", 1, 12000), ("سلطة", 2, 4000)),
     "subtotal": 20000, "delivery_fee": 3000, "total": 23000, "status": "preparing",
     "order_type": "delivery", "source": "customer_app", "payment_method": "cash",
     "driver_id": "demo-drv-2", "driver_name": "سائق علي", "driver_phone": "07802222222",
     "created_at": iso(now - timedelta(minutes=55))},
    # delivered today (driver أحمد)
    {"id": "demo-o-5004", "order_number": 5004, "tenant_id": TENANT, "branch_id": BRANCH,
     "customer_name": "زبون نور", "customer_phone": "07709990000",
     "delivery_address": "زيونة", "items": items(("منسف", 1, 18000), ("لبن", 1, 1500)),
     "subtotal": 19500, "delivery_fee": 1500, "total": 21000, "status": "delivered",
     "order_type": "delivery", "source": "customer_app", "payment_method": "cash",
     "driver_id": "demo-drv-1", "driver_name": "سائق أحمد",
     "created_at": iso(now - timedelta(hours=1, minutes=20)), "delivered_at": iso(now - timedelta(minutes=12))},
    # cancelled / rejected by cashier
    {"id": "demo-o-5005", "order_number": 5005, "tenant_id": TENANT, "branch_id": BRANCH,
     "customer_name": "زبون خالد", "customer_phone": "07701112222",
     "delivery_address": "الجادرية", "items": items(("برغر دجاج", 2, 6000)),
     "subtotal": 12000, "delivery_fee": 0, "total": 12000, "status": "cancelled",
     "order_type": "delivery", "source": "customer_app", "payment_method": "cash",
     "rejection_reason": "رفض الكاشير - خارج التغطية",
     "created_at": iso(now - timedelta(hours=2)), "cancelled_at": iso(now - timedelta(hours=1, minutes=55))},
]
db.orders.insert_many(orders)

# ---- cashier incoming-call notification (only for #5002) ----
db.order_notifications.update_many({}, {"$set": {"is_read": True}})  # silence old ones
db.order_notifications.delete_many({"order_id": "demo-o-5002"})
db.order_notifications.insert_one({
    "id": "demo-notif-5002", "type": "new_order_cashier", "order_id": "demo-o-5002",
    "order_number": "5002", "branch_id": BRANCH, "order_type": "delivery",
    "customer_name": "زبون سارة", "customer_phone": "07705556666",
    "delivery_address": "المنصور - حي 601", "total_amount": 18000, "items_count": 2,
    "payment_method": "cash", "source": "customer_app", "tenant_id": TENANT,
    "is_read": False, "is_printed": False, "created_at": iso(now),
})

# ---- a couple of chat messages for the tracking demo ----
db.order_chats.delete_many({"order_id": "demo-o-5001"})
db.order_chats.insert_many([
    {"id": "c1", "order_id": "demo-o-5001", "sender": "customer", "sender_name": "الزبون",
     "text": "كم يتبقى للوصول؟", "created_at": iso(now - timedelta(minutes=4))},
    {"id": "c2", "order_id": "demo-o-5001", "sender": "driver", "sender_name": "سائق أحمد",
     "text": "خلال 5 دقائق أكون عندك 🛵", "created_at": iso(now - timedelta(minutes=3))},
])

print("✅ seeded: 2 drivers, 5 orders (all statuses), 1 unread cashier call (#5002), chat for #5001")
print("Driver login: 07801111111 / 1234  (سائق أحمد, has #5001 out_for_delivery)")
print("Tracking: /track/demo-o-5001")
