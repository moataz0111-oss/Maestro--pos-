# Test Credentials

> NOTE: This is a FORKED environment that started with a FRESH/EMPTY database.
> The previous tenant account (hanialdujaili@gmail.com) does NOT exist here.
> The backend auto-seeds the accounts below on startup.

## Admin (Tenant: default)
- Email: admin@maestroegp.com
- Password: admin123

## Super Admin (System Owner, tenant: system)
- Email: owner@maestroegp.com
- Password: owner123
- Secret Key: 271018

## Seeded Test Data (Delivery Report)
- Branch: "الفرع الرئيسي" (id: 76f56acc-6948-4a2f-bbf4-feccbddea88f), tenant=default
- delivery_app_settings: توترز (15%), طلبات (18%)
- 3 delivery orders (#1001, #1002 توترز; #1003 طلبات) with items
- Re-seed with: `cd /app/backend && python3 seed_delivery_test_data.py`

## Seeded Test Data (Branch Orders / Manufacturing)
- Manufactured products: "لحم برغر" (unit حبة, piece_weight 250غ, unit_cost_after_waste 6411.68, qty 100), "كراة مشروم" (unit حبة, unit_cost 3403.19, qty 100)
- Re-seed with: `cd /app/backend && python3 seed_mfg_test_product.py`
- Packaging material "علبة برغر" (unit قطعة, 250 IQD, qty 500) — insert manually if missing:
  ```python
  db.packaging_materials.insert_one({'id':<uuid>,'tenant_id':'default','name':'علبة برغر','unit':'قطعة','quantity':500,'min_quantity':50,'cost_per_unit':250,'category':'علب','created_at':<iso>})
  ```

## Seeded Test Data (Branch Order Reduced Fulfillment - iter191)
- Re-seed with: `cd /app/backend && python3 seed_branch_fulfill_test.py`
- Creates 3 limited-stock manufactured products (لحم برغر qty=30, كراة مشروم qty=5, ارز ريزو qty=12)
- Creates pending branch_request #9001 to "الفرع الرئيسي" asking MORE than available (100/20/30)
- Use to test: factory adjust/reduce dialog (WarehouseManufacturing > طلبات الفروع) + kitchen reduction banner (BranchOrders)

## Seeded Test Data (Branch Packaging Count - iter212)
- Branch 'الفرع الرئيسي' (76f56acc-...) has packaging item 'علبة برغر اختبار'
  (packaging_material_id=mfg-inventory-sync, unit قطعة, cost 250, quantity 100, used_quantity varies after counts).
- Endpoints: GET /api/branch-stock-count/packaging-today?branch_id= ; POST /api/branch-stock-count/submit-packaging
- Re-seed snippet: insert branch_packaging_inventory {tenant_id:'default', branch_id, packaging_material_id, name, unit, quantity, used_quantity, cost_per_unit}

## Notes
- Backend runs WITHOUT --reload; restart with `sudo supervisorctl restart backend` after backend code changes.
- MongoDB (mongod) is started manually: `mongod --dbpath /data/db --bind_ip 0.0.0.0 --port 27017 --fork --logpath /var/log/mongod.log`
- Local Print Agent (http://localhost:9999) is NOT available in the test environment. Biometric/print should show "Not Connected" — expected.

## Central Role Test Users (iter — dashboard restriction)
- Warehouse keeper: wkeeper@maestroegp.com / wkeeper123 (role warehouse_keeper)
- Purchasing: buyer@maestroegp.com / buyer123 (role purchasing)
- These verify the simplified dashboard (only their module tile, no stats/close-register/customer-menu/branch-selector).

## Central Role + Extra Permission (iter215 — bug fix)
- abdwk@maestroegp.com / abd123 (role warehouse_keeper, permissions ['inventory','purchasing'], name عبد الرحمن)
- Verifies: a central-role user granted an EXTRA permission (المشتريات) now sees BOTH tiles (warehouse-manufacturing + purchasing) on the dashboard. Before the fix, central roles ignored extra permissions and showed only their single default tile.
