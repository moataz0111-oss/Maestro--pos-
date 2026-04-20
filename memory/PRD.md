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
