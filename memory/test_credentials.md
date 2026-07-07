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

## 2FA + جهاز موثوق + حظر IP دائم (6 يوليو 2026 — fork)
- نموذج: "جهاز موثوق". أول دخول/جهاز جديد → رمز تحقق. بعد التحقق يُوثَّق الجهاز (trusted_devices) ولا يُطلب الرمز مجدداً من نفس الجهاز.
- الموظف/المالك: POST /api/auth/login {email,password,secret_key?,device_id?}. لو الجهاز غير موثوق → يرجع {requires_2fa:true, verification_id, channel, pending_delivery, dev_code?}. القناة: المالك=email، الموظف بلا هاتف=email، بهاتف+Twilio=whatsapp.
  - في المعاينة: SMTP والـTwilio غير مُهيّأين → pending_delivery=true ويُرجَع dev_code (الرمز) في الاستجابة للتشغيل/الاختبار. في الإنتاج (بريد مفعّل) لا يُرجَع.
  - التحقق: POST /api/auth/login/verify-2fa {verification_id, code} → {user, token, device_id}. أعد إرسال: POST /api/auth/2fa/resend {verification_id}.
  - تمرير device_id موثوق في /auth/login يتخطى 2FA ويُصدر التوكن مباشرة.
- المالك: POST /api/super-admin/login {email,password,secret_key:271018,device_id?} → 2fa email → verify عبر /auth/login/verify-2fa.
- السائق: POST /api/driver/login?phone=..&pin=..&device_id=.. → requires_2fa (whatsapp، pending→dev_code) → POST /api/driver/login/verify-2fa {verification_id,code}.
- **حظر IP دائم:** 5 محاولات دخول فاشلة لنفس الـIP → يُضاف إلى blocked_ips (دائم) ويمنع كل الأجهزة على الشبكة. الوسيط يرجع 403 block لكل الطلبات من ذلك الـIP. للاختبار مرّر ترويسة X-Forwarded-For بعنوان اختبار (ليس عنوان المالك!) لأن الحظر سيمنع ذلك العنوان.
- **عنوان المالك لا يُحظر أبداً:** يُحفظ في owner_trusted_ips عند نجاح دخول المالك؛ مُستثنى من الحظر التلقائي والدائم.
- نقاط المالك (توكن super_admin): GET /api/super-admin/blocked-ips، POST /api/super-admin/unblock-ip {ip}، GET /api/super-admin/trusted-devices، POST /api/super-admin/revoke-device {device_id|subject_id}، GET /api/super-admin/pending-2fa-codes، GET /api/super-admin/security-status، POST /api/super-admin/purge-dummy-data {dry_run:true|false}.
- حذف البيانات الوهمية: يطابق أنماط (تجريبي/اختبار/dummy/test/demo/probe/"سائق N") + أسماء seed المعروفة + معرّفات demo-drv. لا يمسّ الأسماء الحقيقية.

## fork — بريد لكل سائق/زبون (النظام رقم واحد للإرسال) (6 يوليو 2026)
- توضيح المستخدم: الرقم المربوط = رقم النظام (المُرسِل). كل مستأجر/مستخدم/سائق/زبون له هاتف + بريد (مستلِم).
- المستأجر: owner_phone + owner_email (موجود). المستخدم: email + phone (موجود).
- **السائق**: أُضيف حقل email — routes/drivers_routes.py (DriverCreate/Response/Update + create/update). واجهة: Delivery.js (new-driver-email / edit-driver-email).
- **الزبون**: أُضيف حقل email — server.py (CustomerCreate/Response + create/update). واجهة: Settings ← العملاء (settings-customer-email / edit-customer-email).
- مُختبَر: iteration_278 (backend 5/5، frontend 100%).
- تنبيه نشر: خدمة واتساب المجانية (wa_service على 3002) خدمة Node منفصلة — قد لا تعمل تلقائياً في نشر Emergent القياسي (backend+frontend فقط)؛ عندها يتحوّل الإرسال للبريد/SMS ولا تُرسل رسائل واتساب. تحقّق بعد النشر.

## fork — رسالة ترحيب + خصم للعملاء الجدد + حفظ تلقائي (6 يوليو 2026)
- **حفظ تلقائي للزبون** عند إتمام أي طلب (upsert حسب tenant_id+phone). كشف أول طلب (is_first_order). سجل جديد: source="auto_order", welcome_status="pending". يظهر في Settings ← العملاء.
- **إشعار أول طلب**: order_notifications يحمل is_first_order + customer_id.
- **منح خصم ترحيبي (موافقة يدوية)**: POST /api/customers/{id}/grant-welcome-discount (admin/manager/super_admin/branch_manager) → يولّد كوبون WLC****** (خصم افتراضي 10%، صالح 7 أيام، استخدام واحد، غير مقيّد باسم) + يرسل رسالة واتساب باسم المطعم للزبون لطلبه القادم + welcome_status→granted. إعادة المنح → 400. الكاشير → 403.
- **إعداد الخصم**: GET/PUT /api/welcome-discount/config {enabled, discount_type, discount_value, min_order_amount, valid_days, message_template}. مخزّن في db.app_settings key=welcome_discount.
- **واجهة المالك**: Settings ← العملاء: شارة welcome-pending-{id}/welcome-granted-{id} + زر grant-welcome-{id}.
- ملاحظة: إرسال واتساب يتطلب ربط رقم المالك (في preview whatsapp_sent=false error=not_connected — طبيعي).
- مُختبَر: iteration_277 (backend 13/13، frontend 100%).

## fork — بوابة تحقق العميل (أول طلب) + ربط واتساب برقم الهاتف (6 يوليو 2026)
- **ربط واتساب برقم الهاتف (Pairing Code) بديلاً عن QR**: POST /api/super-admin/whatsapp/pair {phone} (super_admin) → {ok, code:"XXXX-XXXX"}. المالك يُدخل رقمه في لوحة الأمان (test-ids: wa-pair-panel, wa-pair-phone-input, wa-pair-btn, wa-pair-code) ثم يُدخل الرمز في واتساب: الأجهزة المرتبطة ← ربط جهاز ← «ربط برقم الهاتف». يتطلب اتصال wa_service بشبكة واتساب (قد يفشل في preview).
- **تحقق أول طلب للعميل**: عند تفعيل الحماية العامة (2FA)، يجب توثيق رقم هاتف العميل عبر رمز واتساب قبل أول طلب.
  - POST /api/customer/order/{tenant}/request-otp {phone, name} → جلسة 2FA (بلا كشف الرمز).
  - POST /api/customer/order/{tenant}/verify-otp {verification_id, code} → يوثّق الرقم في verified_customer_phones (tenant_id+phone بصيغة E.164).
  - create_customer_order يرجع 403 code=CUSTOMER_PHONE_VERIFICATION_REQUIRED للعميل غير الموثّق (حين 2FA مفعّل). الواجهة (CustomerMenu.js) تفتح customer-otp-dialog (customer-otp-input/verify/resend) وتعيد الطلب بعد التوثيق.
- ⚠️ ملاحظة تشغيلية مهمة: تفعيل 2FA العام يُبطل كل الجلسات ويُلزم OTP للجميع. تأكد أن قناة تسليم OTP (واتساب/بريد) تعمل **قبل** التفعيل، وإلا خطر قفل الوصول (الرمز لا يُعرض إطلاقاً بطلب المستخدم).

## fork — إصلاح احتساب المصاريف لكل وردية + إلغاء الدمج + موافقة المدير (6 يوليو 2026)
- **قاعدة معتمدة واحدة لمصاريف الوردية** (routes/shared.py `shift_expense_query`): المصروف يخصّ الوردية إذا `shift_id`=معرّف الوردية، أو (سجل قديم بلا shift_id) نفس الفرع+اليوم التشغيلي+منشئ المصروف (created_by=cashier_id). مطبّقة في: cash-register/summary، cash-register/close، وتقرير الإغلاق (فلترة تفاصيل المصاريف في Reports.js). المصاريف الجديدة تُختم بـ shift_id + cashier_id عند الإنشاء (POST /api/expenses).
- **إلغاء الدمج نهائياً**: `_resolve_open_shift_for_close` لم تعد تجمع الورديات؛ كل وردية تُغلق مستقلة. أزيل وسم "merged".
- **بيانات اختبار الإسناد** (`python3 seed_expense_attribution_test.py`): فرع الفرع الرئيسي، اليوم التشغيلي = اليوم.
  - كاشير أ اختبار: expattr-cashier-a@maestroegp.com / test123 (وردية expattr-shift-a) — مصاريف 10,000+2,000 + 3,000 قديمة = **15,000**
  - كاشير ب اختبار: expattr-cashier-b@maestroegp.com / test123 (وردية expattr-shift-b) — مصاريف **5,000**
  - المتوقع: كل وردية تُظهر مصاريفها فقط (لا خلط). إجمالي الفرع اليومي = 20,000.
- **موافقة المدير على فرق نقدي كبير** (تقرير الأمان #9): عند إغلاق الكاشير بفرق >5% من المبيعات → 409 code=CASH_DISCREPANCY_APPROVAL_REQUIRED. الواجهة (Dashboard.js) تفتح نافذة manager-approval-dialog تطلب بريد+كلمة مرور مدير. الخلفية تتحقق فعلياً من صلاحية المدير (admin/manager/super_admin/branch_manager) وكلمة مروره قبل السماح. test-ids: manager-email-input, manager-password-input, manager-approval-confirm-btn, manager-approval-cancel-btn.
- **2FA معطّل افتراضياً** (owner-controlled). يُفعّله المالك من لوحته.
- تبديل: POST /api/super-admin/security-2fa-toggle {enabled:true|false} (super_admin). عند التفعيل: يحذف كل trusted_devices + driver_tokens ويضبط sessions_valid_after=now → يُبطل كل التوكنات القديمة (401) لإخراج الجميع فوراً.
- عند enabled=false: الدخول مباشر بدون 2FA. عند enabled=true: الدخول من جهاز جديد يتطلب رمز.
- جاهزية: GET /api/super-admin/2fa-readiness → users_without_phone, users_without_any_contact, drivers_without_phone.
- security-status يتضمن الآن two_fa_enabled.
- إبطال الجلسات: التوكن يحوي iat؛ get_current_user و get_current_driver يرفضان التوكنات الأقدم من sessions_valid_after (401).
- **تقنيع الوِجهة في نافذة التحقق:** البريد = ***@domain (يُخفى الاسم قبل @)؛ الهاتف = تقنيع كل الأرقام وإظهار آخر رقمين فقط (********67).
- **هاتف المستخدم:** حقل phone أُضيف لـ UserCreate/UserUpdate و /users POST/PUT. نموذج المستخدم في Settings.js فيه حقل هاتف باختيار البلد.
- **حقل اختيار البلد (PhoneCountryInput):** مُطبّق في: السائقين (Delivery إنشاء/تعديل)، العملاء (Settings customerForm، Loyalty memberForm، Orders fixForm)، الموظفين (HR employeeForm)، المستخدمين (Settings userForm/editUserForm)، المستأجرين (SuperAdmin new/edit). يُخزّن E.164 (+964..).

## 2026-07-07 — كوكيز آمنة + سياسة كلمات المرور
- تسجيل الدخول يضبط الآن كوكي HttpOnly باسم access_token (المصادقة تقبل Bearer أو الكوكي).
- كلمات مرور المستخدمين الجدد يجب أن تكون ≥8 أحرف وتحوي حرفاً ورقماً (الحسابات القديمة القصيرة مثل admin123 تعمل للدخول — السياسة على الإنشاء/التغيير فقط).
- GET /api/welcome-discount/stats (admin token) — إحصائيات كوبونات الترحيب.
- GET /api/print-queue/agent-status يقبل الآن توكن مستخدم عادي (كان يتطلب مفتاح الوكيل فقط).
