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
