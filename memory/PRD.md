# Maestro EGP - Multi-Tenant POS System PRD

## Original Problem Statement
Multi-tenant POS system with biometric integration (ZKTeco), thermal receipt printing via Local Print Agent, shift management, expense tracking, multi-branch support, and order management. Arabic (RTL) interface.

## Core Architecture
- **Frontend**: React (RTL Arabic UI)
- **Backend**: FastAPI + MongoDB
- **Local Agent**: PowerShell script (print_server.ps1 v6.1.1 - Server Polling Architecture)

## Print Architecture (v6.1.1) - Multi-Branch
- Each branch has its own printers (Cashier, Kitchen, etc.)
- POS fetches only current branch printers via `GET /printers?branch_id=xxx`
- Print jobs include `branch_id` for proper routing
- Agent polls pending jobs with heartbeat params
- Products link to printers per-branch via `printer_ids` array
- Settings shows printers grouped by branch with filter tabs
- Start-Job compiles its own C# (`JobRawPrinter`, `JobReceiptRenderer`) for USB printing
- Watchdog uses VBScript wrapper (no blue flash)

## Multi-Branch Features
- Owner can switch between branches freely
- `/shifts/current?branch_id=xxx` filters shifts by branch (owner releases from other branch cashiers)
- Cashier selection filtered by branch
- Cash register closing follows selected branch
- Reports filter by branch
- Printers filter by branch in Settings

## Movements Log & Waste Efficiency Report (May 11, 2026)
- **Enhanced حركات المخزن tab**: 4 category quick filters (📥 incoming / ➡️ to_manufacturing / 🏭 manufacturing / 🚚 to_branch), quick date chips (اليوم/أسبوع/شهر/مخصص), click any row to open a full details modal showing date+time, costs (before/after waste), consumed ingredients with waste %, references, performer.
- **New `/produce` endpoint behavior**: Now logs `product_manufactured` movement (with full cost breakdown and consumed ingredients) + per-material `manufacturing_consumption` movements.
- **New endpoint `/api/reports/waste-efficiency`**: Compares cost before/after waste, grouped by product OR raw_material. Supports date range, kitchen branch filter, and receiving branch filter.
- **New tab in `/branch-orders` page**: "كفاءة الهدر" — summary cards (total before/after, waste value, waste %), efficiency rating, drill-down table per product or per raw material.
- New component: `/app/frontend/src/components/WasteEfficiencyReport.js`.

## Manufacturing Cost Display (May 11, 2026)
- Product card now displays **4 cards** instead of 3:
  - الكلفة قبل الهدر (blue) — for invoice comparison with suppliers
  - الكلفة بعد الهدر (emerald, ⭐ approved) — the actual production cost
  - سعر البيع (green)
  - هامش الربح (purple) — calculated from selling_price - cost_after_waste
- Recipe form shows per-ingredient cost breakdown (before/after waste) + total summary cards
- Backward compatible: old products without `raw_material_cost_after_waste` fall back to `production_cost ?? raw_material_cost`


## Completed Features (This Session - April 17-20, 2026)
1. Real Heartbeat mechanism for agent status
2. USB print fix in polling job (C# compiled inside Start-Job)
3. Test print bitmap shows printer name, IP, connection type
4. Version comparison for agent update notifications
5. Closing receipt with real restaurant logo, name, branch name (async loadImg)
6. Print Bill always shows "غير مدفوعة" for pending orders
7. "Save and Send" orders save as payment_method: 'pending'
8. Individual shift view in closing report with toggle (individual/combined)
9. Multi-branch printer support (POS, Settings, product forms)
10. Branch filter in Settings printer list
11. "Download for another branch" button always visible
12. Cashier selection filtered by branch with branch name shown
13. `/shifts/open` endpoint for owner to open shift on any branch
14. Cashier delete protection (only owner can delete items after save)
15. Closing dialog follows selected branch (not active shift)
16. Printer settings now execute: show_prices, print_all_orders, auto_print
17. Kitchen receipt quantity font enlarged (20→28)
18. Refunds removed from expenses (tracked separately in refunds collection)
19. Watchdog VBScript wrapper (no PowerShell blue flash)
20. **[FIXED 2026-04-20] Auto-reload every minute bug**: Root causes were (a) duplicate SW registration in public/index.html + src/index.js, (b) ThemeContext 60s interval triggering needless state updates, (c) no controllerchange listener to block reload when SW swaps. Fixes: removed duplicate SW registration, guarded ThemeContext state, changed interval to 5min, added controllerchange listener that blocks reload, added beforeunload debug logger.
21. **[FIXED 2026-04-20] HR/BiometricDevices agent status discrepancy**: BiometricDevices.checkAgent now calls /api/print-queue/agent-status (heartbeat) first, falls back to localhost:9999. HR.js already had this logic. Both use identical logic, ensuring consistent status display.
22. **[FIXED 2026-04-20] Dialog accessibility warnings (Missing aria-describedby)**: Base `DialogContent` now includes a default sr-only `DialogPrimitive.Description` when no `aria-describedby` is provided — silences Radix UI warnings across all dialogs globally.
23. **[FIXED 2026-04-20] Face photo fetch timeout + auto-fetch**:
    - Increased face photo fetch timeouts from 20s → 60s (outer) and 15s → 45s (agent-side) to accommodate ZK devices trying multiple HTTP/UDP methods.
    - Added background auto-fetch: HR page now automatically fetches face photos for up to 10 employees without saved photos on load (silently, no error toast).
    - Improved UX: when fetch fails but employee has a saved photo, we silently display the saved one instead of the timeout error.
24. **[FIXED 2026-04-20] HR white-screen flash every 60 seconds (ROOT CAUSE)**:
    - The real root cause wasn't the service worker — HR.js `fetchData()` was calling `setLoading(true)` every 60s during auto-refresh, triggering the full-page loading spinner (line 1199) that looked like a page reload/white screen.
    - Fix: `fetchData()` now accepts a `silent` flag; the auto-refresh useEffect calls `fetchData(true)` so the spinner never shows during background updates.
    - Verified via 3-minute continuous monitor: 0 white-screen flashes, content always visible.
25. **[ENHANCEMENT 2026-04-20] Photo fetch progress indicator**: Added `photoFetchProgress` state + UI badge next to the agent status showing "جلب الصور: X/Y" during background photo auto-fetch — gives user visibility into the process.
26. **[AGENT v6.1.2 2026-04-20] Photo fetch caching + faster HTTP timeouts**:
    - `GetFacePhoto` now caches the last successful (user, pass, port, path) combo and tries it FIRST for subsequent UIDs — drastically reduces fetch time after first success.
    - Reduced per-path HTTP timeout from 3000ms → 1500ms — makes negative lookups finish much faster.
    - Agent version bumped from 6.1.1 → 6.1.2.
27. **[FIXED 2026-04-20] Break-Even Report: Salaries showing 0 + Branch name missing**:
    - ROOT CAUSE: `/break-even/daily-range` returned a FLAT structure (`salaries: number`, `fixed_costs.rent: number`, `name`, `id`) but the frontend expected nested objects (`salaries.monthly_total`, `fixed_costs.rent.daily`, `branch_name`, `branch_id`).
    - Backend fix: endpoint now returns the same rich nested structure as `/break-even/daily` (single date), with all fields the frontend expects + both old (`id`, `name`) and new (`branch_id`, `branch_name`) key aliases for safety. Includes `fixed_costs.{rent,water,electricity,generator}.{monthly,daily,covered,remaining}` and `salaries.{monthly_total,daily,covered,remaining,employees_count}`.
    - Frontend fix: branch name now appears prominently in THREE places per card: (1) small "الفرع" label + branch name in the header, (2) pill-style centered badge with Building icon, (3) large gradient-highlighted header at the top of the expanded section.
28. **[FIXED 2026-04-20] Installer version mismatch (single source of truth)**:
    - All version references now driven by `PRINT_AGENT_VERSION = "6.1.2"` constant in `server.py:8365`.
    - `print_server.ps1` uses `{{AGENT_VERSION}}` placeholder, injected at serve time via `/api/print-agent-script`.
    - Frontend `AgentUpdateChecker` fetches required version from `/api/print-agent-version` dynamically.
    - One-line upgrade for future version bumps.
29. **[FIXED 2026-04-20] Biometric operation timeouts extended**:
    - All ZK operations (zk-users, zk-sync, zk-push-user) extended from 15s → 60s (outer) and 10s → 45s (inner) across `HR.js`, `BiometricDevices.js`, `useAutoSync.js`. Fixes "timeout of 15000ms exceeded" errors.
30. **[FEATURE 2026-04-20] Reset Deductions button (owner only, monthly limit)**:
    - New endpoints: `GET /api/deductions/reset-eligibility` (check) and `POST /api/deductions/reset` (execute).
    - Restrictions enforced on backend: (a) admin/super_admin role only, (b) only after the 15th of the month, (c) only once per calendar month per tenant (tracked via `deductions_resets` audit collection).
    - Frontend: red-outlined "تصفير الخصومات" button in the deductions tab; opens confirmation dialog that explains eligibility and shows warning. Only shows the "Confirm" button when eligible.
31. **[FEATURE 2026-04-20] Attendance break times (4-punch logic)**:
    - `AttendanceCreate`/`AttendanceResponse` extended with `break_out` and `break_in` fields.
    - Auto-process attendance logic now distributes ZK punches: 1 punch=check_in, 2=check_in+check_out, 3=check_in+break_out+check_out, 4+=check_in+break_out+break_in+check_out.
    - Actual break duration (from punches) is subtracted from worked hours, falling back to scheduled `break_start`/`break_end` if no break punches exist.
    - Frontend attendance table now shows 4 time columns in order: Check-in → Break-out (amber) → Break-in (green) → Check-out.
32. **[FEATURE 2026-04-20] Face photo capture redesign — pragmatic solution**:
    - ROOT CAUSE: Most ZKTeco devices (>90%) do NOT expose face photos via HTTP. Previous HTTP probe (11 creds × 4 ports × 16 paths = 704 attempts) always failed, causing 60s timeouts.
    - DISABLED automatic HTTP photo fetch (was in background every page load). No more unnecessary retries.
    - ADDED **Webcam capture**: Live camera preview with guide circle + instant capture button in face photo dialog. Works on any device with a camera.
    - ADDED **Bulk photo upload**: User selects multiple image files at once from the employees list header; system matches files to employees by UID in filename (e.g., "1.jpg" → UID=1). Shows progress badge X/Y.
    - ADDED **Individual file upload**: Upload single photo per employee from device storage.
    - REMOVED misleading background auto-fetch errors and timeouts.
    - All saved photos update local state immediately (no full data re-fetch).
33. **[CRITICAL FIX 2026-04-20] Payroll DOUBLE-COUNTING absences (financial bug)**:
    - ROOT CAUSE: For monthly-salary employees, `earned_salary` was computed as `basic_salary - (absent_days × daily_rate)`. Then `emp_deductions` (which ALREADY contained auto-created "absence" deductions for the same absent days) was subtracted again. Net result: absences deducted TWICE.
    - Example: Basic 5,000,000, deductions 310,917 (includes 276,667 in absence deductions) → displayed net 4,412,416 (WRONG). Correct: 5,000,000 - 310,917 = 4,689,083.
    - **Fix 1**: `earned_salary` for monthly employees now equals `basic_salary`. The `deductions` collection (which already contains absence entries) is the single source of salary reduction.
    - **Fix 2**: Auto-absence deductions are now created ONLY for monthly-salary employees. For hourly/daily employees, missing a day already means no pay for that day — creating a deduction on top would be another double-penalty.
    - Formula now correctly matches user expectation: `net_payable = basic + bonuses + overtime - deductions - advances`
    - Verified mathematically: old formula produced 4,412,416 (bug), new formula produces 4,689,083 (correct). ✓

## Key API Endpoints
- GET /api/printers?branch_id=xxx
- POST /api/print-queue (with branch_id)
- GET /api/print-queue/pending, /agent-status
- POST /api/shifts/open (quick open for owner/cashier)
- GET /api/shifts/current?branch_id=xxx
- GET /api/shifts/cashiers-list?branch_id=xxx
- GET /api/shifts?status=closed
- GET /api/reports/cash-register-closing?branch_id=xxx

## Important Notes
- handleNewOrder sends payment_method: 'pending' (not counted as sale until paid)
- Refunds are NOT added to expenses collection (fixed)
- Owner is free to switch branches - releases from cashier shift automatically
- Cashier cannot delete items after order is saved (owner can)
- routeOrderToPrinters respects print_individual_items (print all) and auto_print_on_order
- Closing receipt is async (loadImg for logo)

## Backlog
- Filter expenses by cashier (click to filter)
- Refund/cancellation details in closing report
- (P2) Refactor server.py (19k+ lines) into modular routes
- (P2) Refactor Dashboard.js, POS.js, Settings.js into smaller components

## April 30, 2026 - Fixes
- **Ghost Order #11 Saidiya Purge**: Added one-shot migration `purge_ghost_order_saidiya_11_20260430_v1` in server.py that finds the duplicate ghost order (#11, 5000 IQD, dine_in, 2026-04-30) in Al-Saidiya branch, archives it to `ghost_orders_archive`, removes it from `orders` and `print_queue`. Runs once on next deploy to production VPS. No UI button added per user request.
- **Driver Collected Cash → Cash Register Fix**: `collect_driver_payment` endpoint (`POST /api/drivers/{driver_id}/collect-payment` in `backend/routes/drivers_routes.py`) now also updates `payment_status="paid"` and `payment_method="cash"` for the collected orders (skips `card`/`credit`). Previously it only set `driver_payment_status="paid"` so the cash register report kept these orders in the "معلق" bucket instead of "نقدي". Also added migration `settle_driver_collected_orders_as_cash_v1` that retroactively fixes existing orders with `driver_payment_status="paid"` but `payment_status in [None, "", "pending", "unpaid"]`.
- **Separate "نقدي السائقين" Line in Cash Register Closing**: Cash-register-closing and sales-analytics reports now split cash into two buckets: `نقدي` (direct restaurant cash, excludes delivery with driver_id) and `نقدي السائقين` (cash collected from delivery drivers after settlement). `expected_cash_in_drawer = cash + driver_cash - expenses`. Frontend Reports.js displays the new line conditionally (only if > 0) with truck icon and `data-testid="driver-cash-total"`.

## May 6, 2026 - Purchasing Workflow Restructure
- **Backend** (`/app/backend/routes/inventory_system.py`): Restructured warehouse purchase request lifecycle into 5 explicit statuses: `pending_owner_approval` → `approved_by_owner` (or `rejected_by_owner`) → `priced_by_purchasing` → `received_by_warehouse`. New endpoints:
  - `POST /api/warehouse-purchase-requests` — creates request in `pending_owner_approval` (warehouse keeper)
  - `POST /api/warehouse-purchase-requests/{id}/approve` — owner/admin only
  - `POST /api/warehouse-purchase-requests/{id}/reject` — owner/admin only, accepts `reason`
  - `POST /api/warehouse-purchase-requests/{id}/price-and-create-invoice` — purchasing dept enters supplier+invoice and atomically creates `purchases_new` doc linked via `linked_request_id`
  - `POST /api/warehouse-purchase-requests/{id}/confirm-receipt` — warehouse confirms receipt
- **Frontend** (`WarehouseManufacturing.js`): Removed `navigate('/purchasing')` button and replaced with **modal** that creates a request directly. Added two new sections:
  - For **owner/admin**: orange "طلبات شراء بانتظار موافقتك" card with approve/reject buttons (auto-refresh every 30s).
  - For **warehouse_keeper**: blue "طلبات الشراء قيد المعالجة" tracker showing each request's current state (pending owner / approved → at purchasing / priced → ready for receipt).
- **Frontend** (`Purchasing.js`): Now fetches requests with `?status=approved_by_owner` filter, so the purchasing dept only sees requests already approved by the owner.
- **Business Date Helper Endpoint**: Added `GET /api/business-date/current?branch_id=X` that returns the current business_date of the open shift (so a shift opened at 10pm and ending at 2am next day stays on the opening date). Returns `{business_date, calendar_date_iraq, has_open_shift, open_shift}`.
- **Expenses Page Now Filters by Business Day**: `frontend/src/pages/Expenses.js` fetches `/api/business-date/current` on branch change and auto-sets `startDate=endDate=business_date`. A green badge "اليوم التشغيلي: YYYY-MM-DD" appears in the header when viewing the active business day.
- **Cash Register Closing Stores business_date**: `POST /api/reports/cash-register-closing` now persists `business_date` and `shift_id` on the closing record. Migration `backfill_closing_business_date_v1` populates this field on existing records. Frontend Reports.js now shows a small green pill "📅 business_date" next to each shift header.
- **CRITICAL ROOT-CAUSE FIX — Shift Resolution Picks Cashier's Own Shift First**: Bug was `_resolve_business_date()` and `create_order` used `find_one({"status":"open", "branch_id":X})` which returned ANY stale open shift in the branch (e.g. يامن's shift from yesterday) when sorted by Mongo insertion order, instead of the user's actual current shift. Fixed both functions to:
  1. Try `cashier_id == current_user.id` shift first (sorted by `started_at` desc).
  2. Fall back to most recent open shift in branch.
  This fixes the misattribution where زهراء's 4000 IQD expense on day 3 got tagged with day 2 because يامن's day-2 shift was still technically open.
- **Continuous Auto-Heal Migration `auto_heal_shifts_and_business_dates`**: Runs on every backend startup (NOT one-shot). Performs:
  1. Auto-closes shifts open more than 30 hours (sets status=closed, ended_at=started_at+18h, auto_close_reason="stale_shift_over_30_hours").
  2. Backfills missing `business_date` on shifts using `iraq_date_from_utc(started_at)`.
  3. Re-tags every expense's business_date by finding the actual shift that was open at the expense's `created_at` (matched by cashier_id+branch_id+time-overlap). Sets `_business_date_healed` audit timestamp.
  4. Same logic for orders.
- **Stale Shift Admin Endpoints** (kept for transparency, not used in UI per user request): `GET /api/shifts/stale?hours_threshold=18` lists stuck shifts; `POST /api/shifts/{id}/force-close` allows admin override.


## Completed Features (Feb 6, 2026 - HR Phase 1 Fixes + Low Stock Alerts)
- **Biometric Push Per Branch**: `handlePushAllToDevice` in `HR.js` now filters employees by `device.branch_id`. The push-all dialog shows the device's branch name and `data-testid=push-all-eligible-count` reflecting only employees of that branch. Each device exports only its branch employees (e.g., Jadriya device → only Jadriya employees).
- **Account Statement Modal (كشف حساب الموظف)**: New dialog (`data-testid=account-statement-dialog`) opened from each employee row's FileText button (`data-testid=account-statement-{empId}`). Shows totals cards + tables for deductions, bonuses, advances, payrolls, and attendance. A4 print supported via `window.print()` with scoped CSS.
- **New Backend Endpoint** `GET /api/employees/{employee_id}/account-statement` (in `payroll_routes.py`): Returns employee, branch, deductions, bonuses, advances, payrolls, attendance, totals. Tenant-scoped on every sub-query for defence-in-depth. Optional `start_date`/`end_date` filters.
- **Restored** `GET /api/payroll/{payroll_id}/print` endpoint (was missing after server.py refactor) — used by `/payroll/print/:id` route. Tenant-scoped.
- **Branch Count Hardening**: `departmentBranchIds` set now also matches branch names containing مطبخ/مخزن/مستودع/مشتريات for defence-in-depth so internal departments are reliably excluded from `الفروع` salary card count.
- **Salary Report Per-Employee Action**: Replaced row-level `window.print()` with Account Statement opener (`data-testid=statement-from-summary-{empId}`) for actionable per-employee inspection.
- **Print Routing**: Administrative reports (PayrollPrint, Account Statement, salary report) use A4 `window.print()`. Deductions/Bonuses receipts retain thermal-style 350px receipt window per user spec.
- **🔔 Low-Stock Audio Alerts (Owner Dashboard)**: New `LowStockBanner` component (`/app/frontend/src/components/LowStockBanner.js`) rendered at top of Dashboard for admin/super_admin only. Fetches `GET /api/raw-materials-new/alerts/low-stock` (new endpoint in `inventory_system.py`) on mount + auto-refresh every 60s. Plays `playUrgentAlert()` once on first detection. Sticky top banner with red gradient if any material at qty=0 (critical), amber if only below min_quantity (warning). Bell icon with count badge, expandable details list, "فتح المخزن" navigates to /warehouse-manufacturing, dismiss button hides for 24h via localStorage `lowstock_dismiss_until_v1`, with floating revive button bottom-left. Skips materials with `min_quantity=0` (no threshold defined).

## Backlog
- (P1) **Wire FIFO consume_fifo helper into POS sale & manufacturing transfer endpoints** (currently only at receipt; consumption still uses direct $inc — `reconcile_layers_with_quantity` exists as defensive sync but is un-invoked).
- (P2) Refactor `server.py` (21k+ lines) into modular routes (continuing).
- (P2) Split `inventory_system.py` (3400+ lines) — cost layers and price alerts could move to dedicated routers.
- (P2) Refactor `HR.js`, `Dashboard.js`, `Settings.js`, `POS.js`, `WarehouseManufacturing.js` monoliths.

## Completed Features (Feb 6, 2026 - Offline Order Numbering Fix)
- **Critical Bug Fix**: Offline orders synced to a global counter (`counters` collection starting from 1), causing wrong numbers like #13, #14 mixed with online #44-#49.
- **`sync_routes.get_next_order_number`** now uses the SAME counter as online orders (`order_counters` keyed by `branch_id + business_date`).
- **`server.py.get_next_order_number`** also accepts and uses `business_date` (passed from open shift) to prevent UTC-vs-Iraq-TZ midnight drift.
- **Order creation flow** rearranged: business_date is resolved from shift FIRST, then order_number is generated using that business_date — ensures online and sync flows share the exact same counter.
- **Migration `renumber_offline_orders_chronologically_v2`**: Detects branch+business_date groups where order_numbers don't form a continuous sequence (drift ≥ 3) and renumbers all orders chronologically (1, 2, 3, ...). Stores `original_order_number` for audit. Updated 27 orders in production tenant. Updates `order_counters` so future orders continue correctly.
- **Tested**: testing_agent_v3_fork (iter177) — Backend 5/5 pytest ✅. Sync orders + online orders now share counter; sequence verified continuous (1..27).

## Completed Features (Feb 6, 2026 - Three Fixes from User Screenshots)
- **Fix 1: Send-to-Warehouse on Purchase Invoices**: Added `POST /api/purchase-invoices/{id}/send-to-warehouse` (server.py ~line 11458) for the legacy `purchase_invoices` collection. Adds raw_materials, creates FIFO cost layers via `add_cost_layer`, logs `inventory_movements` (type='in', subtype='purchase_receipt'), triggers price alerts (≥1%), sets status='transferred'. Idempotent (returns 400 on re-send). Frontend green button `data-testid=send-to-warehouse-{id}` (`Purchasing.js`) calls this new endpoint.
- **Fix 2: Removed Wrong Cross-Department Navigation**: Deleted blue "طلب من المشتريات" button from `WarehouseManufacturing.js` header per user's role-isolation requirement (warehouse keeper must not enter purchasing area, and vice versa).
- **Fix 3: Instant Page Navigation**: Replaced fullscreen `جاري التحميل` Suspense fallback in `App.js` with a thin 1px top progress bar. Eagerly imported the most-used pages (HR, Purchasing, WarehouseManufacturing, Expenses, Reports, Settings) so they don't trigger Suspense at all. Public route guards also use the thin loader. Initial auth check screens replaced too.
- **Tested**: testing_agent_v3_fork (iter175→iter176) — Backend 6/6 pytest ✅, Frontend FIX1+FIX2+FIX3 verified. iter175 caught a critical collection mismatch bug; agent fixed it; iter176 passes 100%.

## Completed Features (Feb 6, 2026 - Raw Materials Edit/Delete with Transfer Lock)
- **Owner-only Edit/Delete on Raw Materials** in `WarehouseManufacturing.js` raw materials cards. Pencil + Trash buttons (admin only), with state-based lock.
- **Transfer-State Lock**: `GET /api/raw-materials-new` now returns `is_transferred`, `can_edit`, `can_delete` on every material. `is_transferred=true` if material was ever consumed via `manufacturing-requests fulfill` or any `warehouse_to_manufacturing` inventory movement.
- **Backend Enforcement**:
  - `PUT /api/raw-materials-new/{id}` returns **409** with Arabic detail when `is_transferred=true`.
  - `DELETE /api/raw-materials-new/{id}` returns **409** when transferred; **403** for non-admins; **200** + cascade-deletes `material_cost_layers` when allowed.
  - `POST /api/raw-materials-new/{id}/add-stock` always allowed (only mutation post-transfer).
- **Helpers**: `_get_transferred_material_ids` (bulk for list) and `_is_material_transferred` (single check) — both ignore tenant_id strictly because material UUIDs are globally unique (avoids issues with legacy movements lacking tenant_id).
- **Frontend Edit Dialog** (`data-testid=edit-raw-material-dialog`): name, quantity, unit, cost, min_quantity, waste %, category — all editable for non-transferred materials.
- **Frontend Delete Confirm Dialog** with red styling and clear warning.
- **Tested**: testing_agent_v3_fork (iter174) — Backend pytest 7/7, Frontend 100% — no action items.

## Completed Features (Feb 6, 2026 - FIFO Phase 2: Full Auto-Propagation)
- **FIFO Consumption Wired into Manufacturing Fulfill**: `POST /api/manufacturing-requests/{id}/fulfill` now uses `consume_fifo` — oldest layer drains first, `raw_materials.cost_per_unit` auto-updates to next-oldest layer when depleted. Response includes `cost_propagation` array.
- **Reconcile Before Consume**: `reconcile_layers_with_quantity` invoked at start of fulfill to heal any drift from non-FIFO consumption points.
- **Cost Propagation Helper** (`propagate_cost_to_products` in `cost_layer_service.py`): When raw material's effective cost changes, auto-updates every `manufactured_products` and `products` (POS) doc whose recipe references that material — recalculates `cost_per_unit` in recipe ingredients, `raw_material_cost` total, and `profit_margin` (selling_price - cost). Called after FIFO consumption in fulfill.
- **Multi-Tenant Fix**: `create_manufactured_product` endpoint now requires `Depends(get_current_user)` and persists `tenant_id` on every new doc. Startup migration `backfill_tenant_id_on_products_v1` retrofitted existing manufactured_products (+ POS products). This was critical — without it the propagation helper returned 0 matches.
- **Verified E2E**: Created 2 layers (50kg @ 500, 30kg @ 900) + test product. Consumed 50kg → oldest layer depleted → cost_per_unit auto-jumped 500→900 → product's raw_material_cost auto-updated 500→900, profit auto-recalculated 1500→1100. ✅

## Completed Features (Feb 6, 2026 - FIFO Cost Layers + Price Increase Alerts)
- **Cost Layer Service** (`/app/backend/services/cost_layer_service.py`): FIFO infrastructure — `add_cost_layer`, `consume_fifo` (drains oldest first, updates `raw_materials.cost_per_unit` to next oldest layer), `get_active_layers`, `get_current_effective_cost`, `reconcile_layers_with_quantity` (defensive sync for non-FIFO consumption points), `detect_price_increase` (creates `price_alerts` when |percent_change| ≥ 1%).
- **Price Alerts at Purchasing Step**: Modified `POST /api/warehouse-purchase-requests/{id}/price-and-create-invoice` to compare each item's new cost vs current `cost_per_unit`. If diff ≥ 1% (up or down), insert into `price_alerts` collection with severity (critical ≥10%, warning ≥5%, info <5%). Response includes `price_alerts` array.
- **FIFO Layered Receipt**: Modified `POST /api/warehouse-purchase-requests/{id}/confirm-receipt` to add a NEW cost layer instead of weighted-average update. Old quantity stays at old price, new quantity at new price. `cost_per_unit` reflects oldest active layer.
- **New Endpoints in `inventory_system.py`** (~line 1077):
  - `GET /api/raw-materials-new/{material_id}/cost-layers` — list layers per material.
  - `GET /api/price-alerts?status_filter=unread|read|dismissed` — list alerts (admin only).
  - `POST /api/price-alerts/{id}/mark-read`, `POST /api/price-alerts/mark-all-read`, `POST /api/price-alerts/{id}/dismiss`.
- **PriceAlertsBell Component** (`/app/frontend/src/components/PriceAlertsBell.js`): Bell icon in Dashboard header (admin/super_admin only). Badge shows unread count. Click → dropdown panel listing alerts with old→new price, % change badge (red for increase, green for decrease), severity color, mark-read / dismiss / mark-all-read actions. Auto-refreshes every 60s.
- **Startup Migration `seed_initial_cost_layers_v1`**: One-shot migration that seeds an opening-balance layer for every existing raw material (so FIFO works on legacy data without losing inventory). Indexes added on `material_cost_layers` and `price_alerts`.

## Backlog (continued)
- (P1) Audio low-stock alerts for owner — DONE in previous iteration.


## Completed Features (Feb 7, 2026 - Optional Pack Definition for Raw Materials)
- **Need**: When raw material's unit is `قطعة` / `علبة` / `كرتون`, the cashier needs to know what's *inside* the unit (e.g., a cheese box = 250 g, a mayonnaise carton = 12 pieces, a meat piece = 1.5 kg) — for accurate recipe conversions and inventory analysis.
- **Backend (`inventory_system.py`)**: Added two optional fields on `RawMaterialCreate` and `RawMaterialResponse`:
  - `pack_quantity: Optional[float]` — quantity inside one unit (e.g., 250).
  - `pack_unit: Optional[str]` — content unit (`غرام`/`كغم`/`مل`/`لتر`/`قطعة`/`شريحة`).
  - Both POST and PUT endpoints accept and persist them; null values are honoured (e.g., when changing back to `كغم`).
- **Frontend (`WarehouseManufacturing.js`)**: 
  - Add Dialog: when unit ∈ {قطعة, علبة, كرتون}, an amber-themed contextual block appears with two inputs + a per-content-unit cost preview (e.g., "تكلفة الوحدة المُحتوية: 12 IQD / غرام").
  - Edit Dialog: same fields with auto-clearing when unit changes back to weight/volume.
  - Card list: small amber badge ("كل علبة = 250 غرام") on materials that have a pack definition.
- **Self-tested**: Created/updated/deleted raw material with `pack_quantity=250, pack_unit=غرام` via API; switching unit to `كغم` correctly nulled both fields. Visual confirmation with screenshot.

## Completed Features (Feb 8, 2026 - HR Critical Fixes: Payroll, Punch Logic, Agent Detection)
**Three critical HR bugs fixed in one session — affecting real money calculations.**

### 1. Payroll Summary Endpoint Crash (500 → working)
- **Root cause**: `NameError: name 'present_days' is not defined` at `server.py:4140` inside `get_payroll_summary_report`. The variables `present_days`, `late_days`, `early_leave_days` were referenced but never assigned. Caused entire `المستحقات` card and `تقرير الرواتب الشامل` to silently show empty.
- **Fix**: Compute the three counters from `emp_attendance` before usage:
  ```python
  present_days = len([a for a in emp_attendance if a.get("status") == "present"])
  late_days = len([a for a in emp_attendance if a.get("status") == "late"])
  early_leave_days = len([a for a in emp_attendance if a.get("status") == "early_leave"])
  worked_days_count = present_days + late_days + early_leave_days
  ```
- **Verified**: `GET /api/reports/payroll-summary?month=2026-05` returns 200 with proper `totals` & per-employee `earned_salary`/`net_payable`.

### 2. Smart Punch Distribution Logic (server.py ~line 15943)
- **Problem**: Old logic blindly assigned punches: `n=2 → check_in+check_out`, even when both punches were minutes apart (e.g., the `محمد باقر` case: 02:05 + 02:39 → falsely showed 0.6 worked hours). Also failed on accidental double-taps.
- **New logic** (matches user's spec — 2 punches = full shift, 4 punches = with break):
  - **Step 1**: De-dup punches within 5 minutes (handles double-tap on the device).
  - **Step 2**: Distribute by count:
    - **1 punch** → check_in only (no check_out).
    - **2 punches with diff < 60 min** → check_in only (treated as duplicate; user did not actually leave).
    - **2 punches with diff ≥ 60 min** → check_in + check_out (full shift, no break).
    - **3 punches** → check_in + break_start + check_out.
    - **4+ punches** → check_in + break_start + break_end + check_out (first/second/second-to-last/last).
  - Existing-record merge path also applies the same dedup + distribution.
- **Verified**: 8 unit tests passing including the `محمد باقر 02:05 + 02:39` real case (now correctly shows present-only, not a fake 0.6h shift).

### 3. Agent Connection Detection (HR.js)
- **Problem**: Top header used server heartbeat (works through HTTPS) → showed "متصل". But action buttons (إصدار، صورة الوجه) used direct `localhost:9999` from browser → blocked by Mixed Content Policy → showed "غير متصل" → the action was rejected even when the agent was actually running.
- **Fix**: All HR.js action buttons (`handlePushAllToDevice`, `handlePushUserToDevice`, `fetchFacePhoto`) now check `agentConnected` (server heartbeat) FIRST. Only if heartbeat says offline do they fall back to direct localhost probe. This preserves the strict check while removing false negatives.
- Note: `BiometricDevices.js` already had the correct dual-method pattern (heartbeat → localhost fallback). HR.js was the inconsistent file.

### Outstanding (deferred to next session)
- (P1) **Sync failure / device employee fetch failure**: Same root cause class as #3 — direct localhost calls from HTTPS frontend may fail mid-operation. Definitive fix is migrating all biometric ops to the print-queue pattern (frontend → server → agent polls). This is a larger refactor (~300 LOC) and was scoped out of this session.
- (P2) **Night-shift detection**: When `shift_end < shift_start`, punches across midnight should be grouped as one work day. Current logic groups by calendar date.

## Completed Features (Feb 7, 2026 - One-Time Routing Fix for Drifted Offline Orders)
- **Problem**: Offline sync migration `renumber_offline_orders_chronologically_v2` corrected ~27 drifted order numbers but left them with wrong routing (dine_in/cash). The previous UI showed a Wrench icon for ALL offline orders — user feared it would become permanent noise and confuse tenants whose sync already works correctly after the `business_date` fix.
- **Fix — Frontend (`Orders.js`)**: Wrench icon now shows **only** when `order.renumbered_reason === 'fix_offline_sync_drift_v2' && !order.routing_fixed_at`. New offline orders, already-fixed orders, and healthy orders never see it.

## Completed Features (Feb 8, 2026 - Daily Payroll + Cash Salary Payments + Night Shift)
**Owner can now disburse cash advances from real cash daily, with running balance tracking.**

### 1. Night Shift Detection (`process_pending_biometric_records`)
- **Problem**: Punches for night-shift employees (e.g., shift 22:00 → 06:00) crossing midnight were grouped under the *next* calendar date, splitting their work day in two.
- **Fix**: When an employee's `shift_end < shift_start`, any punch within `[00:00, shift_end + 2h]` of date D is reassigned to business date D-1 before grouping.
- Tolerance window of 2 hours after `shift_end` covers late departures.

### 2. Salary Payments Backend (cash advances tracker)
- New collection: `salary_payments` — `{id, employee_id, employee_name, branch_id, amount, payment_date, payment_method (cash|bank|other), notes, paid_by, paid_by_name, tenant_id, created_at}`.
- New endpoints:
  - `POST /api/payroll/payments` — admin/manager only; rejects `amount ≤ 0`; verifies employee belongs to tenant.
  - `GET /api/payroll/payments?employee_id=&branch_id=&start_date=&end_date=` — list with filters.
  - `DELETE /api/payroll/payments/{id}` — admin only (correction tool).
- **Integration with Payroll Summary**: `GET /api/reports/payroll-summary` now returns `paid_amount` and `remaining` per employee plus in `totals`. Net payable still computed from earned + bonuses - deductions - advance installments; `paid_amount` is *separate* (cash actually disbursed) so `remaining = net_payable - paid_amount`.

### 3. Daily Payroll Summary (`GET /api/payroll/daily-summary?date=YYYY-MM-DD&branch_id=`)
- Returns one row per active employee with:
  - `daily_rate = basic_salary / 30`
  - `present` flag + check_in/check_out for the day
  - `earned_today` (daily_rate if present, else 0)
  - `mtd_days`, `mtd_earned`, `mtd_deductions`, `mtd_bonuses` — month-to-date counters up to and including the queried date
  - `pending_advances` (total remaining), `paid_this_month` (sum of cash payments)
  - `remaining_this_month = mtd_earned + mtd_bonuses - mtd_deductions - paid_this_month`
- Plus aggregated `totals` block.

### 4. Frontend — `الكشف اليومي` Tab + `صرف دفعة` Button
- New `daily-payroll` tab in `HR.js` with date picker and 5 KPI cards (present count, daily earned, MTD earned, paid this month, remaining).
- Per-employee row: status badge, check-in/out times, daily rate, MTD earned, deductions, paid, remaining (bold), and **green "صرف دفعة" button** for admin/manager/super_admin.
- Payment dialog: amount (defaults to suggested remaining), payment method (cash/bank/other), notes. On submit:
  - `POST /api/payroll/payments` with `payment_date = selected daily date`.
  - Toast confirms; both daily-payroll and main HR data are refreshed so KPI cards + summary card update instantly.
- All controls have `data-testid`s for testing (`daily-payroll-tab`, `daily-payroll-date`, `pay-btn-{employee_id}`, `payment-amount-input`, `payment-submit-btn`, etc.).

### Self-tested (Feb 8, 2026)
- `POST /api/payroll/payments` with 50,000 IQD for أحمد محمد → succeeds, returns full doc.
- `GET /api/reports/payroll-summary?month=2026-05` now includes `paid_amount: 50000, remaining: -50000` per employee + in totals. ✅
- `GET /api/payroll/daily-summary?date=2026-05-08` returns all employees with present/absent + MTD numbers. ✅
- Visual: Daily Payroll tab loads, table renders, payment dialog opens with pre-filled suggested amount. ✅
- **Fix — Backend (`sync_routes.py` — `PATCH /api/sync/orders/{id}/fix-routing`)**: Added two guard checks:
  - **400**: rejects if `renumbered_reason != 'fix_offline_sync_drift_v2'` (not a drifted order).
  - **409**: rejects if `routing_fixed_at` is already set (one-time only per order).
- **Self-tested**: Fix-once flow verified (27 drifted orders eligible; after fixing one, icon disappears; second fix attempt returns 409; other offline orders never show the icon).

## Backlog (continued)
- (P2) Refactor `/app/backend/server.py` (21k+ lines) into modular routes (migrations, inventory, HR).
- (P2) Refactor `Dashboard.js`, `Settings.js`, `POS.js`, `HR.js`, `WarehouseManufacturing.js` into smaller components.
- (P3) Bulk routing-fix tool (fix multiple drifted orders at once) — optional, currently per-order is sufficient.


## Completed Features (Feb 8, 2026 - Biometric Job Queue + Payment History + Receipt)

### 1. Biometric Job Queue (Backend) — solves Mixed Content blocking
- New collection `biometric_queue` with state machine: pending → processing → completed/failed.
- **Endpoints (server.py around line 16600)**:
  - `POST /api/biometric-queue` — admin/manager creates job (type ∈ {zk-sync, zk-push-user, zk-users, zk-test, zk-face-photo, zk-delete-user, zk-probe-device}).
  - `GET /api/biometric-queue/pending?branch_id=` — local agent polls (no auth needed); atomically marks them as `processing` to prevent duplicate execution.
  - `POST /api/biometric-queue/{id}/result` — agent posts back `{success, result?, error?}`; status moves to completed/failed.
  - `GET /api/biometric-queue/{id}` — frontend polls for the result.
  - `DELETE /api/biometric-queue/{id}` — admin cancel.
- **Startup cleanup**: Stale `processing` jobs > 5 min are auto-failed; jobs > 7 days deleted.
- **End-to-end self-test**: created → claimed via pending → result submitted → state read back as completed with payload. ✅

### 2. Frontend Helper `executeBiometricOp` (`utils/biometricQueue.js`)
- Single function used by all biometric callsites. Tries `http://localhost:9999/{type}` first (fastest path on local network); on `ERR_NETWORK` falls back to job queue with polling (1.5 s interval, 180 s default timeout).
- **Migrated callsites**: 
  - `BiometricDevices.js`: `handleSyncAttendance`, `handleFetchDeviceUsers`, `handleTestConnection`.
  - `HR.js`: `handlePushAllToDevice`, `handlePushUserToDevice`, `fetchFacePhoto`.
- **What this means in practice**: If the user opens the app via HTTPS (Mixed Content blocked), all biometric ops automatically route through the queue. The local PowerShell agent must be updated to poll `/api/biometric-queue/pending` and post results — until then, ops keep working from local-network HTTP exactly as before, and gracefully fail with a clear toast on HTTPS instead of silent breakage.

### 3. Payment History per Employee (Daily Payroll tab)
- Clock icon button next to "صرف دفعة" → opens dialog with all payments in the displayed month.
- Shows: date, amount (bold green), method badge (نقدي/بنكي/أخرى), notes, paid_by_name, and a delete button (admin/super_admin only).
- Header strip: "إجمالي المصروف هذا الشهر: X (N دفعة)".
- Delete reuses existing `DELETE /api/payroll/payments/{id}` and refreshes the daily summary + main HR data.

### 4. Cash Receipt (auto-opens after each payment)
- After successful `submitSalaryPayment`, a print-ready A4 receipt dialog opens with: company name (from `user.tenant_name`), receipt number (first 8 chars of payment id, uppercase), date, employee name, payment method, optional notes, big highlighted amount block, and two signature areas (المستلم / المُصرف).
- "طباعة" button calls `window.print()`. Print CSS uses `body:has(#salary-receipt-print)` to isolate the receipt and hide everything else when printing.

### Self-tested
- Job queue full lifecycle ✅
- Payment history dialog with 1 existing payment renders correctly with delete button visible. ✅
- Daily payroll integration: paid_this_month + remaining update after a new payment. ✅

## Completed Features (Feb 8, 2026 - Salary Payments Linked to Owner Wallet)
**Salary advances are now correctly modelled as withdrawals from the owner's personal treasury — never as shift expenses.**

### Background — User clarification
The owner explicitly rejected having salary advances appear as "expenses on the shift" because:
- The salary itself is not yet earned at the time of the advance (it accrues monthly).
- The advance is paid by the owner from his **own personal treasury**, not from the shop's cash sales.

### Implementation
- `POST /api/payroll/payments` now performs a paired write:
  1. Inserts the `salary_payments` record.
  2. Inserts a matching `owner_withdrawals` row with `category: "salary_payment"`, `beneficiary: "راتب: <name>"`, `linked_salary_payment_id` for traceability.
- `salary_payments` doc stores `linked_owner_withdrawal_id` for the reverse link.
- `DELETE /api/payroll/payments/{id}` cascades the linked withdrawal so the owner's balance is restored automatically.
- **Owner Wallet summary** (`GET /api/owner-wallet/summary`) now reflects salary advances: total_withdrawals increases, available_balance decreases, and the withdrawal appears in the wallet's "السحوبات" panel.
- **No effect on**: shift cash register / closing report, daily expenses, cash sales totals.
- Dialog warning text rewritten: "💼 سيُخصم هذا المبلغ تلقائياً من خزينة المالك (سحب من رصيدك الشخصي). لا يؤثر على نقدي المبيعات أو مصاريف الشفت."

### Verified end-to-end
- Pay 25,000 → owner balance: -25,000, 1 withdrawal labelled "راتب: أحمد محمد" with category `salary_payment`. ✅
- Delete payment → cascade deletes withdrawal → balance restored. ✅
- Visual verification on the Owner Wallet page: السحوبات card shows the entry with proper beneficiary and date. ✅

## Completed Features (Feb 8, 2026 - Per-Branch Owner Wallet Enforcement)
**Salary advances now strictly draw from the matching branch's deposits in the owner wallet.**

### Backend (`POST /api/payroll/payments`)
1. Looks up `branch_id`/`branch_name` for the employee.
2. Computes per-branch wallet balance: sum(deposits) − sum(withdrawals) − sum(profit_transfers) for that branch.
3. **Rejects HTTP 400** if amount > balance with Arabic message naming the branch and exact shortfall.
4. Persists `branch_id` + `branch_name` on both `owner_withdrawals` and `salary_payments` for traceability and display.

### Frontend (`OwnerWallet.js`)
- Added category label: `salary_payment → "دفعة راتب موظف"`.
- Withdrawal cards now render `🏪 الفرع: {branch_name}` in purple under the beneficiary.

### Verified
- 5,000 advance with branch balance 0 → 400 with branch name. ✅
- After 100,000 deposit to that branch → 5,000 advance succeeded, persisted `branch_name`. ✅

## Completed Features (Feb 8, 2026 - Branch / External Source on Owner Wallet Forms)
**All three owner-wallet forms now require a branch (or "Other source") for proper accounting.**

### Forms updated (`OwnerWallet.js`)
- **إيداع جديد** (deposit): mandatory `branch_id` select listing all tenant branches + an `📦 أخرى` option. When "Other" is picked, a free-text `external_source` input appears and is required.
- **سحب / تحويل** (withdrawal): same pattern. The branch determines which deposit pool the withdrawal draws from.
- **تحويل للخزينة** (profit transfer): same pattern.
- All three persist either `branch_id` (resolved into `branch_name` server-side) or `external_source` — never both.

### Backend (`owner_wallet.py`)
- `DepositCreate`, `WithdrawalCreate`, `ProfitTransferCreate` extended with `external_source` and (for withdrawal/transfer) `branch_id`/`branch_name`.
- `POST /owner-wallet/withdrawals` resolves `branch_name` from the branches collection automatically.
- `POST /owner-wallet/profit-transfers` does the same.
- `POST /owner-wallet/deposits` already supported `branch_id` → now also stores `external_source`.

### Visualisation under each deposit
- Each deposit card on `OwnerWallet.js` now lists **its linked withdrawals** (matched by either same `branch_id` or same `external_source`) with:
  - Counter strip: "⬆️ مخصوم من هذا الإيداع: N عملية − {total}".
  - Mini list (top 5) of `beneficiary (category) − amount`.
  - Footer: "المتبقي من الإيداع: {remaining}" — turns red if negative.

### Verified visually

## Completed Features (Feb 8, 2026 - Per-Branch Balance Cards on Owner Wallet)
**Owner now sees a one-glance health overview of every branch's wallet balance.**

### What was added (`OwnerWallet.js`)
- New **"🏪 أرصدة الفروع / المصادر"** section between the top KPI cards and the action buttons.
- For each unique `branch_id` and each unique `external_source` found across the displayed deposits + withdrawals, a card is rendered with:
  - Header: 🏪/📦 icon + branch/source name + "فرع" or "مصدر خارجي" sub-label.
  - Two-column mini-grid: ↓ إيداعات (count + total) | ↑ سحوبات (count + total).
  - Big bottom line: **الرصيد المتاح** (deposits − withdrawals), red if negative.
  - Progress bar (green / amber / red) showing the remaining ratio.
- **Smart status badges**:
  - `سالب!` (red) when balance < 0.
  - `منخفض` (amber) when balance < 20% of total deposits.
- Cards sorted: branches first, then external sources; within each group, healthier balance first.

### Self-tested visually
- Single branch "الفرع الرئيسي": deposits 100,000 / withdrawals 35,000 (2 ops) → balance card shows **65,000 IQD** in green with 65% green progress bar. ✅
- Counter chip in header shows `1` (number of branches/sources tracked). ✅
- "إيداع اختبار للفرع" 100,000 IQD shows under it: "مخصوم من هذا الإيداع: 2 عملية − 20,000" with both withdrawal lines and "المتبقي من الإيداع: 80,000". ✅
- The deposit dialog with "Other" selection auto-revealed the external source input. ✅
- Owner Wallet UI shows `الرصيد المتاح: 80,000 IQD`, the new withdrawal card with branch line. ✅

## Completed Features (Feb 8, 2026 - Branch Detail Dialog with Chart & Filters)
**Drill-down view for any branch/external source with day/month/custom date filters and a visual chart.**

### Backend (`owner_wallet.py`)
- `GET /owner-wallet/deposits` and `GET /owner-wallet/withdrawals` extended with optional query params:
  - `start_date` + `end_date` (preferred when both provided — uses `$gte/$lte` instead of regex month).
  - `branch_id` and `external_source` (server-side filter to drop unrelated rows).
  - List size raised from 100 → 2000 to support multi-month custom ranges.

### Frontend (`OwnerWallet.js`)
- Branch cards on the wallet page are now **clickable** (`cursor-pointer`, hover shadow).
- Click opens a wide modal (`max-w-5xl`) titled `"تفاصيل — {branch_name}"` with three modes:
  - **يومي**: `start = end = today`.
  - **شهري** (default): `start = first of current month`, `end = today`.
  - **مخصص**: keeps user-edited dates; switching to `start`/`end` inputs auto-flips mode to custom.
- Auto-fetches scoped deposits & withdrawals from the new endpoints whenever the dialog opens or the range changes.
- **KPI strip**: deposits / withdrawals / period balance / active-days count.
- **Chart** (`recharts ComposedChart`): green bars for deposits, red bars for withdrawals, cyan line for **cumulative balance** over time (one data point per active date).
- **Two transaction lists** (deposits left, withdrawals right) with description, beneficiary, category, and date.

### Verified visually
- Clicked "الفرع الرئيسي" card → modal opened with all bits populated, chart rendered with the 100k / 35k / 65k pattern, lists populated. ✅