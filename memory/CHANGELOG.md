# Maestro EGP - Changelog

## Session: April 17-19, 2026

### Print Agent (v6.1.1)
- Real heartbeat mechanism (agent_version + device_id in polling URL)
- USB print fix in Start-Job (compiles JobRawPrinter + JobReceiptRenderer C#)
- Test print shows printer name, IP, connection type
- Version comparison for update notifications
- Watchdog VBScript wrapper (no blue PowerShell flash)
- Download button always visible for multi-branch

### Receipts & Printing
- Closing receipt: real restaurant logo (async loadImg), name, branch name
- Print Bill always shows "غير مدفوعة" for pending orders
- Kitchen receipt quantity font enlarged (20→28)
- Printer settings now execute: show_prices, print_all_orders, auto_print
- routeOrderToPrinters respects print_individual_items and auto_print_on_order

### Multi-Branch Support
- POS fetches printers per branch (GET /printers?branch_id=xxx)
- Branch filter tabs in Settings printer list
- Product printer linking grouped by branch name
- Print Queue sends branch_id with jobs
- Owner releases from cashier when switching branches (/shifts/current?branch_id)
- Cashier selection filtered by branch with branch name shown
- Cash register closing follows selected branch
- POST /shifts/open for owner to open shift on any branch

### Reports & Closing
- Individual shift view with toggle (individual/combined)
- Active shifts show with real-time data from /shifts/active-shift-details
- Delivery app sales separated from credit ("آجل") in shift details
- GET /reports/expenses endpoint (excludes refunds)
- Refunds excluded from expenses everywhere (API + frontend + closing report)
- Expenses filtered by date field (not created_at)
- Closing report fallback query includes branch_id

### Permissions & Security
- Cashier cannot delete items after order saved (owner only)
- pos_discount permission enforced (field hidden if disabled)
- pos_cancel permission enforced (error message if disabled)
- pos_refund uses hasPermission() consistently
- Cashier sees only own expenses for today only
- Manager/owner sees all expenses with full filters

### Orders
- "Save and Send" saves payment_method: 'pending' (not counted as sale until paid)

### Offline
- OfflineBanner: position fixed + z-index 99999 (visible on all systems)
- Connection check every 10 seconds (was 30)
- 4 states: connected/disconnected/syncing/success

### Data Fixes
- ShiftResponse model: branch_id, opening_cash, started_at made optional
- Fallback for old shifts: opening_balance→opening_cash, opened_at→started_at
- Cleaned 9 refund expenses from DB

## 2026-04-22 — business_date (اليوم التشغيلي) + Refund-exclusion fix (75K IQD discrepancy)
### Problem
- مصاريف صفحة "المصاريف اليومية" = 339,000 د.ع
- مصاريف "إغلاق الصندوق/التقارير" = 414,000 د.ع
- فرق 75,000 د.ع ناتج عن:
  1. المرتجعات (category=refund) كانت تُحسب ضمن مصاريف الوردية عند الإغلاق (لا يجب)
  2. الورديات التي تتجاوز منتصف الليل كانت تُسجَّل تحت اليوم الجديد في التقارير

### Fix
- Added `business_date` field (YYYY-MM-DD بتوقيت العراق) to:
  - `shifts` (مُحسب من started_at عند فتح الوردية)
  - `orders`, `expenses`, `advances`, `deductions`, `bonuses`, `overtime_requests` (تُرَث من الوردية المفتوحة)
- Auto-migration on backend startup (idempotent): يُضيف business_date للسجلات القديمة + يُعيد حساب total_expenses للورديات المُغلقة مع استبعاد المرتجعات
- Helper: `iraq_date_from_utc(iso_str)` و `_resolve_business_date(tenant, branch)`
- Endpoints updated to filter by business_date (مع fallback للـ created_at/date للسجلات القديمة):
  - GET /api/expenses
  - GET /api/break-even/daily, /api/break-even/daily-range
  - GET /api/reports/cash-register-closing
  - GET /api/shifts (أضيف date_from/date_to/date)
- 5 مواقع في shifts_routes.py تستبعد الآن category=refund من total_expenses
- OrderResponse + ShiftResponse models: added business_date field
- Migration endpoint: POST /api/admin/migrate-business-dates (صلاحية مالك فقط، آمن لإعادة التشغيل)
- Frontend Reports.js: filter shifts by business_date عند توفره

### Testing
- 14/15 pytest tests PASS (1 skipped — no open shift)
- 32 historical closed shifts had total_expenses recomputed on startup
- Migration verified idempotent (second run = 0 updates)

## 2026-04-22 (المتابعة) — فلاتر وتحسينات التقارير + احتساب الرواتب بالجملة

### Comprehensive Report UX Fix
- استبدال حقلي التاريخ اليدوية في "التقرير الشامل" بـ dropdown "الفترة" (مثل "التقرير الذكي"):
  - اليوم، أمس، هذا الأسبوع، هذا الشهر، الشهر السابق، 6 أشهر، سنة، مخصص
  - حساب النطاق تلقائياً عند تغيير الفترة (JavaScript client-side)
  - عند اختيار "مخصص" تظهر حقول التاريخ اليدوية

### Smart Report — New Period Options
- إضافة 3 خيارات جديدة للـ Smart Report: الشهر السابق، 6 أشهر، سنة (مضافة لليوم وأمس والأسبوع والشهر القائمة)
- Backend `/api/smart-reports/sales` & `/api/smart-reports/products`:
  - `yesterday`: يوم أمس (00:00 → 23:59 UTC)
  - `last_month`: الشهر الميلادي السابق كاملاً
  - `six_months`: 180 يوم
  - `year`: 365 يوم

### Expenses Report — Cashier Filter (P1)
- Backend `/api/reports/expenses` يقبل `cashier_id` جديد (يفلتر حسب `created_by`)
- Frontend: dropdown لاختيار الكاشير فوق تبويب المصاريف

### Bulk Payroll Calculation (P1)
- زر "احتساب الرواتب بالجملة" في تبويب الرواتب بـ HR
- يحتسب ويحفظ كشف راتب لكل موظف لا يملك واحداً في الشهر الحالي
- مع toast نتيجة (نجاح/فشل لكل موظف)

### business_date Filter Extension
- `/api/reports/sales, /purchases, /products, /expenses, /profit-loss, /delivery-credits` الآن تفلتر بـ `business_date` مع fallback لـ `created_at`/`date` للسجلات القديمة
- Helper مشترك: `_apply_business_date_filter(query, start_date, end_date)`

### Testing
- 36/36 pytest tests PASS (iteration 167)
- جميع الـ endpoints الـ 9 المحدّثة تعمل بدون أخطاء MongoDB $or/$and conflicts
- Migration تبقى idempotent


## 2026-04-22 (متابعة ثانية) — حذف المصاريف + تصحيح شامل لـ business_date

### المشاكل المبلّغ عنها من العميل:
- مصروف "صيانة قلاية بطاطا 75,000 د.ع" ظهر خطأً في يوم 21 (سجل قديم من إعادة تصفير النظام — لم يُحذف)
- طلبات ما بعد منتصف الليل (يوم 22) كانت تظهر تحت يوم 22 رغم أنها تتبع شفت 21
- إغلاق الصندوق يقرأ 414,000 د.ع بدل 339,000 د.ع الصحيحة

### الإصلاحات (8/8 اختبار نجح)
**1. إضافة حذف المصاريف**
- NEW `DELETE /api/expenses/{expense_id}` — صلاحية المالك/المدير فقط
- يحذف المصروف ثم **يُعيد احتساب `total_expenses` و `expected_cash`** لأي وردية يقع ضمن فترتها (مستثنيةً category=refund)
- زر حذف 🗑️ (يظهر عند hover) لكل مصروف في "مصاريف كل موظف" بتقرير المصاريف
- `toast` يؤكد إعادة احتساب الوردية

**2. business_date في جميع مسارات إنشاء الطلبات**
- `POST /api/customer/orders` (طلبات العميل عبر قائمة QR) — الآن تُضيف business_date من الوردية المفتوحة
- `POST /api/sync/orders` (مزامنة الطلبات Offline) — business_date مضاف
- `POST /api/customer/orders` (sandbox) — business_date مضاف

**3. Auto-migration v2 (تصحيحي)**
- عند إقلاع backend، يُشغَّل تصحيح تلقائي لـ **الطلبات التي تم ترحيلها سابقاً بـ business_date خاطئ**
- يستخدم `shift_id` أولاً، وإلا branch+time matching لإيجاد الوردية الصحيحة
- يُخزن flag في `system_flags` لمنع التكرار

**4. Force migration param**
- `POST /api/admin/migrate-business-dates?force=true` — إعادة احتساب business_date لجميع السجلات حتى الموجودة
- يُعدّ فقط التغييرات الفعلية في stats (idempotent)

**5. POST /api/expenses: live shift total update**
- عند إضافة مصروف جديد، يُحدَّث `total_expenses` و `expected_cash` للوردية المفتوحة فوراً
- متناغم مع منطق الحذف — النظام الآن متسق 100%

### النتيجة للعميل:
1. يستطيع الآن حذف أي مصروف خاطئ من الواجهة (يتم إعادة احتساب الوردية تلقائياً)
2. جميع الطلبات بعد منتصف الليل ستبقى مرتبطة بـ شفت 21 (business_date = 21)
3. إغلاق الصندوق سيُظهر القيمة الصحيحة بعد حذف المصروف اليتيم

## 2026-04-22 (متابعة) — دعم Multi-Branch للوسيط + إصلاحات Settings

### المشاكل المُبلَّغة:
- عند إضافة فرع ثالث: الوسيط يتأخر في الطباعة ويفقد الاتصال
- خطأ `TypeError: undefined.length` عند تعديل إعدادات الطابعة
- خطأ `422` عند حفظ إعدادات الطابعة
- الوسيط يسحب أوامر من كل الفروع بدون عزل (conflict)

### الإصلاحات:
**1. عزل الوسيط لكل فرع (Multi-Branch Safe)**
- `GET /api/print-queue/pending` يتطلب الآن **`branch_id`** صارماً
- كل agent يُحمَّل بـ `branch_id` محقون في ملف ps1 عبر `{{BRANCH_ID}}`
- `heartbeat` منفصل لكل `(device_id, branch_id)` — لا تتداخل حالات الفروع
- يعمل مع **100+ فرع** دون تعارض

**2. حوار اختيار الفرع قبل تحميل الوسيط**
- زر "تحميل الوسيط" يُظهر dialog لاختيار الفرع المستهدف
- `/download-print-agent?branch_id=X` — الرابط يتضمن معرّف الفرع
- لو فرع واحد فقط: تحميل مباشر بدون سؤال

**3. إصلاح TypeError في Settings**
- `listAgentPrinters()` الآن يُرجع object `{agentOffline, needsUpdate, printers: []}` (بدل مصفوفة فارغة)
- لا مزيد من crash عند قراءة `result.printers.length`

**4. إصلاح 422 على PUT /api/printers/{id}**
- حذفت تعريف `PrinterCreate` المكرر في السطر 15873 → أُعيد تسميته `InvoicePrinterCreate`
- الآن الـ endpoint يستخدم الـ model الصحيح (يشمل usb_printer_name, print_mode, show_prices, ...)

**5. إصلاح 500 على GET /api/branches**
- `BranchResponse`: الحقول `address, phone, created_at` أصبحت اختيارية (لتدعم فروع قديمة ناقصة البيانات)

**6. bump version: 6.1.2 → 6.2.0**
- الإجبار على إعادة تحميل الوسيط على جميع الفروع مع branch_id المحقون

### الاختبارات (PASS):
- ✅ `/print-agent-script?branch_id=X` يحقن الـ ID في ps1
- ✅ `/print-queue/pending` بدون branch_id يُرجع `{warning: "branch_id required"}`
- ✅ `/print-queue/pending?branch_id=X` يُرجع فقط أوامر ذلك الفرع
- ✅ الواجهة لا تعطي TypeError بعد إصلاح listAgentPrinters

### ملاحظة للنشر:
بعد تحديث production، **يجب إعادة تحميل الوسيط على كل فرع** لحقن `branch_id` الخاص به.
