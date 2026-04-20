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
