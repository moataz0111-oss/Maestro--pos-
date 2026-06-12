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


## Captain Feature Test Users (iter — إدارة الطلبات والكابتن)
- Captain: cap1@maestroegp.com / cap123 (role captain, name كابتن أحمد) — works under cashier shift, no own shift
- Cashier: cashier1@maestroegp.com / cash123 (role cashier) — if seeded; else existing cashier 803d (كاشير اختبار)
- Re-seed with: `cd /app/backend && python3 seed_captain_test_data.py`
- Seeds: open cashier shift + captain linked + 1 HELD captain takeaway order (12,000)
- Flow: captain creates dine_in/takeaway (delivery blocked) → counts on cashier shift as captain_cash_status='held' → cashier confirms via POST /api/captains/collect → 'collected' → close blocked 409 CAPTAIN_CASH_PENDING until settled
- Endpoints: GET /api/captain/my-shift, GET /api/shifts/available-captains, POST /api/shifts/{id}/link-captain, POST /api/shifts/{id}/unlink-captain, GET /api/captains/shift-summary, POST /api/captains/collect
- UI: Dashboard tile "إدارة الطلبات والكابتن" → /captains-management (tabs الكباتن/الطلبات), visible to owner+cashier+managers (NOT captain)

## Seeded Test Data (Advance Deduct Modal - 10 يونيو 2026)
- Employee "موظف سلفة سابقة" (main branch 76f56acc-...) with a 2026-05 advance (status approved). After a self-test deduct, remaining_amount may be 70000 (originally 100000).
- Re-seed an advance: insert into db.advances {tenant_id:'default', employee_id, employee_name, amount:100000, remaining_amount:100000, deducted_amount:0, deduction_months:1, monthly_deduction:100000, status:'approved', date:'2026-05-10'}.
- Main branch owner-safe (خزينة المالك) balance ~130000 IQD (varies). Advances now withdraw from here (owner_withdrawals category='advance'), NOT cashier cash.
- Modal test IDs: pending-advance-notice-{empId} (in 'salary-report' tab), advance-deduct-dialog, advance-deduct-select, advance-deduct-amount-input, advance-deduct-submit-btn.

## Delivery / Tracking / Chat Test Data (10 يونيو 2026)
- Drivers in main branch: "سائق 1" phone 07801111111, "سائق 2" phone 07802222222 — both PIN 1234 (driver app login at /driver-app).
- Seeded delivery order #9901 (id starts aae6db59-...) with customer "زبون تجريبي" 07701234567, address "حي الجامعة - شارع 14"; assigned to سائق 1 with a current_location set (for /track and tracking map).
- Public tracking link: /track/{order_id} (no auth, no install). Example: /track/aae6db59-d386-4cdd-82b2-3b2f244fbf63
- Incoming-call cashier notification: created in collection order_notifications (type 'new_order_cashier', is_read false, created within last 60 min). Re-seed/reset is_read=false to re-trigger. Shows for roles cashier/admin/manager/owner/super_admin.
- Order chat endpoints (public): GET/POST /api/order-chat/{order_id}. Collection 'order_chats'.
- Driver batching: PUT /api/drivers/{driver_id}/assign?order_id=...&force=false. 409 if driver departed (an order out_for_delivery) and new order >2km from existing; force=true overrides.
- Test IDs: incoming-order-call, accept-order-call, reject-order-call, assign-driver-{id}; driver-contact-btn, driver-contact-sheet, contact-opt-*, driver-chat-dialog, chat-input, chat-send-btn; driver-chat-btn-{orderId}, driver-chat-overlay, driver-chat-input, driver-chat-send-btn; public-tracking-page, track-driver-name, track-chat-btn, track-chat-overlay, track-chat-input, track-chat-send; share-tracking-link.

## Web Push + Cashier-Only Call + Management Escalation (12 يونيو 2026 — fork iter59)
- Cashier (for incoming-call test): cashier1@maestroegp.com / cash123 (role cashier, branch الفرع الرئيسي 76f56acc-...)
- Web Push: VAPID keys in backend/.env (VAPID_PUBLIC_KEY/PRIVATE_KEY/SUBJECT). Public key endpoint: GET /api/push/vapid-public-key. Subscribe: POST /api/push/subscribe {endpoint,keys,phone,user_type:'driver'|'customer'}. Driver SW: /sw-driver.js now has push+notificationclick handlers. Driver app auto-subscribes on login.
- Incoming order CALL (IncomingOrderCall) now shows ONLY for role 'cashier' (ALLOWED_ROLES=['cashier']).
- Management escalation: GET /api/order-notifications/escalations?branch_id= → creates 'order_management_alert' (alert_kind 'not_approved') when a new_order_cashier is unread >5min; reject endpoint creates alert_kind 'rejected'. Shown to admin/manager/owner/super_admin/supervisor via ManagementOrderAlerts component (bottom-left banners). Test IDs: management-order-alerts, management-alert-{order_id}, dismiss-alert-{order_id}.
- NOTE: tenants.max_users bumped to 50 to allow creating the cashier.

## fork iter61 — ترجمة AI + إشعارات الزبون + تقييم + QR
- EMERGENT_LLM_KEY مُضاف في backend/.env (OpenAI gpt-4o عبر emergentintegrations) لترجمة الأسماء.
- POST /api/admin/translate-names (admin/manager) → يملأ name_en. زر بالإعدادات: data-testid=auto-translate-btn.
- إشعار الزبون: PUT /api/orders/{id}/status?status=ready|delivered → push للزبون (user_type=customer). اشتراك الزبون يجلب المفتاح من /api/push/vapid-public-key.
- التقييم: نافذة تلقائية عند التسليم؛ POST /api/customer/rate-order {order_id,tenant_id,phone,rating,comment,food_quality,delivery_speed,service_quality}. يضبط order.is_rated=true.
- إيصال التوصيل (Delivery > reprint) يحتوي QR لرابط /track/{order_id}.
