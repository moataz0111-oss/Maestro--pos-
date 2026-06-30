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

## fork iter64 — إنهاء خدمات الموظف
- نقاط: POST /api/employees/{id}/terminate | /terminate-payout | /reinstate (admin/super_admin). GET /api/employees?status=archived للأرشيف.
- HR > الموظفين: زر terminate-{id}، صرف terminate-payout-{id}، إرجاع reinstate-{id}، شارة terminated-badge-{id}، تبديل الأرشيف toggle-archive-btn. تقرير الرواتب: report-terminate-payout-{id} / report-reinstate-{id}.
- المستحقات تُخصم من owner_withdrawals (category end_of_service) حسب فرع الموظف. الإرجاع يحذف السحب ويعيد الرصيد. الإنهاء النهائي بعد 24س (is_active=False, pending_device_removal=True).

## fork iter65 — مكالمة WebRTC داخل التطبيق + إصلاح اختفاء طلب السائق (14 يونيو 2026)
- Drivers (preview seed): demo-drv-1 "سائق أحمد" 07801111111 / PIN 1234 ، demo-drv-2 "سائق علي" 07802222222 / PIN 1234.
- مكالمات: POST /api/calls/initiate {order_id, caller:'customer'|'driver', caller_name, offer:{type,sdp}} → {call_id}. السائق يستطلع GET /api/calls/incoming?driver_id= ، الزبون GET /api/calls/incoming?order_id=. POST /api/calls/{id}/answer|reject|end ، GET /api/calls/{id}. مجموعة call_sessions.
- Test IDs: call-ui-overlay, call-accept-btn, call-reject-btn, call-hangup-btn, call-mute-btn, call-peer-name, call-state-label, call-timer ، driver-call-btn-{orderId} ، contact-opt-inapp-call.
- إصلاح اختفاء الطلب: GET /api/driver/orders يُرجع الآن كل الحالات عدا [delivered, cancelled, canceled, refunded, rejected] (كان يحذف confirmed/completed).
- ملاحظة: WebRTC صوت حقيقي يحتاج جهازين بميكروفون؛ الـ signaling فقط قابل للاختبار آلياً. STUN عام (بلا TURN).

## Seeded Test Data (Supplier Dues / Purchases — iter for this fork)
- suppliers: "مورد تجريبي أ" (sup-a), "مورد تجريبي ب" (sup-b)
- purchases_new: p1 (TST-1, 500k unpaid, ~40d old → overdue/estimated), p2 (TST-2, 300k partial 100k paid), p3 (TST-3, 200k paid)
- Used to verify: /supplier-payment-dues (2 dues), /reports/purchases (total 1,000,000), dashboard SupplierDuesBanner

## fork iter241 — Reports + Driver fixes (15 يونيو 2026)
- Marketing PDF: Cairo font now EMBEDDED via @font-face in generate_profile.py (font kept dropping → wrong font). Logo has glow filter. Output: /app/frontend/public/Maestro-EGP-Profile.pdf (≈173KB) → public URL /Maestro-EGP-Profile.pdf.
- Task C (invoice image): upload_invoice_image now stores /api/uploads/invoices/ (was /uploads/ → routed to frontend, broke). Frontend imgUrl() in ExternalPurchasesReport.js normalizes old /uploads/ → /api/uploads/. Migration run (0 old records).
- Task D (price increase): POST /api/purchases-new now computes price_increase_log + tenant_id + created_by, enforces +10% reason (400 detail.code=PRICE_INCREASE_REASON_REQUIRED). Frontend PurchasesPage sends price_increase_reasons:{by_name|by_id}. Report /api/reports/price-increases now populated. Test data: material "مادة اختبار سعر" chain 1000→1300 (+30%, reason set).
- Task B: Dashboard quick-action external-purchases-report label is dynamic — "تقرير المشتريات الخارجية" (centralized) / "مشتريات ومخزن الفرع" (per_branch). Removed centralOnly so it shows in both modes.
- Driver app: after "بدء" tracking, start/stop button replaced by green "نشط" badge (data-testid driver-tracking-active-badge); no stop button (stop only via phone settings). Start btn data-testid driver-start-tracking-btn.
- Driver freed on reject: reject_order (server.py) + reject_customer_order both clear driver_id/driver_name/driver_phone.
- Fixed GET /api/purchases-new 500: PurchaseResponse fields made Optional with defaults (old seed docs lacked payment_method/created_by).
- ManagementOrderAlerts: capped to 3 visible + pointer-events-none container so banners don't block clicks.
- SW cache bumped: sw-offline v12, sw-customer v6, sw-driver v4.

## Security Hardening Keys (iter249)
- SUPER_ADMIN_SECRET (owner login secret_key) = 271018
- PRINT_AGENT_KEY (print agent endpoints) = maestro-print-9f3a2c7e1b  (send as ?key= or X-Print-Key header)
- CALLCENTER_WEBHOOK_SECRET (webhook) = maestro-cc-7d1e4b8a2f  (send as ?secret= or X-Webhook-Secret header)
- BIOMETRIC_AGENT_KEY (biometric device/agent endpoints) = maestro-bio-3c9f1a6d4e (send as ?key= or X-Agent-Key header)

## fork — Injection Hardening + SuperAdmin button removal (29 يونيو 2026)
- أُزيل زر "لوحة تحكم المالك" (super-admin-btn) من Dashboard.js — الدخول للوحة المالك عبر /super-admin + تسجيل الدخول فقط.
- حماية ضد الحقن على النقاط العامة (routes/rate_limit.py): enforce_rate_limit (sliding window في الذاكرة per-IP) + sanitize_text.
- نقاط صارت تتطلب مصادقة: POST /api/push/test (admin/manager/owner)، GET /api/notifications/{phone} (موظف).
- نقاط عامة محمية الآن بتحديد معدّل + تنظيف + تحقق المستأجر/الطلب: /api/customer/order/{tenant_id}، /api/customer-reviews، /api/customer/rate-order، /api/track/{order_id}/rating، /api/order-chat/* ، /api/customer/favorites/add، /api/customer/auth/register|login، /api/push/subscribe، /api/calls/* (call_routes.py).
- ملاحظة اختبار: شاشة البداية StartupSplash تستمر ~10 ثوانٍ عند فتح التطبيق (بالتصميم). انتظر >11s قبل التفاعل مع نموذج الدخول في أدوات الـ screenshot.

## fork — تصحيح صنف فاتورة مُستلمة + حارس كمية (30 يونيو 2026)
- Backend: PATCH /api/purchases-new/{id}/correct-item (admin/super_admin/manager) body {item_index,new_quantity,new_cost_per_unit?,reason?}. يعكس: إجمالي الفاتورة + raw_materials(qty+avg cost) + supplier.total_purchases + استرجاع owner_withdrawals الزائد للخزينة + audit_log(action=correct_purchase_item).
- Frontend PurchasesPage.js: زر التفاصيل view-purchase-{id} → نافذة التفاصيل بها detail-item-correct-{idx} لكل صنف (canCorrect=owner/manager/admin) → نافذة correct-item-dialog: correct-quantity-input / correct-cost-input / correct-reason-input / correct-new-line-total / correct-submit-btn / correct-cancel-btn.
- حارس إدخال: تأكيد window.confirm عند كمية > 1000 لوحدات [كغم,كجم,غرام,جرام,لتر,مل] (منع خطأ الفاصلة العشرية مثل 7999 بدل 7.999) + حارس موجود مسبقاً عند إجمالي > 10,000,000.
- اختبار e2e: seed فاتورة مُستلمة+مدفوعة بـ اورغانو 7999 كغم@9000 → correct-item new_quantity=7.999 → total 95,991, stock 7.999, supplier 95,991, treasury_refund 71,919,009.
