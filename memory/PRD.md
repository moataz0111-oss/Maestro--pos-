# Maestro Restaurant POS System - PRD

## Original Problem Statement
Multi-tenant POS system (React + FastAPI + MongoDB) with role-based access, POS interface, PWA offline support, shift/cash register management, and dynamic thermal printing.

## Architecture
```
/app
├── frontend/ (React + Shadcn UI + Tailwind)
│   ├── src/pages/ (Dashboard, Reports, POS, Settings, Expenses, Delivery, etc.)
│   ├── src/context/ (AuthContext.js)
│   ├── src/utils/ (orderNotifications.js)
│   ├── public/ (sw-offline.js, manifest.json)
├── backend/
│   ├── server.py (Main monolith ~17k lines)
│   ├── routes/ (shifts_routes.py, reports_routes.py, inventory_system.py, customer_menu.py, order_notifications.py)
```

## Completed Features
- Multi-tenant POS system with role-based access
- Cash register / shift management
- Dashboard with configurable permissions
- Thermal printing (hidden iframe, 80mm width, auto height)
- Delivery management with driver/company differentiation
- Inventory system (raw materials, packaging, manufacturing)
- Reports (sales, delivery credits, expenses, profit/loss)
- PWA offline support
- Customer menu app with order tracking
- Incoming customer order notifications on POS (accept/reject modal)

## Recent Fixes

### March 29, 2026 (Session 1)
1. Cash Register 500 Error: PaymentMethod.CREDIT missing from shared.py
2. Inventory tenant_id: Raw materials via /raw-materials-new now include tenant_id
3. Sales report: Refunded/cancelled orders excluded, pending shown separately
4. Permissions: Cashiers with expenses/delivery permission can create items
5. Printing: Switched from iframe to popup window
6. Customer order notifications: 60min cutoff, accept/reject endpoints
7. Android PWA reload: Removed aggressive skipWaiting + auto-reload loop
8. Driver assignment: Includes driver_name and driver_phone
9. Customer order timeline: Added "confirmed" step

### March 29, 2026 (Session 2)
10. User Permissions Stale Closure Bug (P0): Fixed all form handlers to use functional state updates

### March 30, 2026 (Session 3 - Current)
11. **Cash Register Calculation Fix (P0)**: Fixed orders without shift_id (customer app orders) not being counted. Now combines shift_id based orders + unlinked orders from same branch/period with deduplication. Applied to both get_cash_register_summary and close_cash_register endpoints.
12. **User Permissions Hide UI (P0)**: Verified permission checks in Dashboard.js correctly hide: 'النقدي' and 'المتوقع' cards in cash register dialog (hide_cash_expected), 'آخر الطلبات' section (hide_recent_orders), 'المبيعات حسب طريقة الدفع' section (hide_cash_expected).
13. **Thermal Printing Rewrite (P1)**: Rewrote printing for POS receipts and cash register close reports. Changed from popup window to hidden iframe for direct one-click printing. CSS: @page { size: 80mm auto; margin: 0; }, fonts: Arial/Tahoma (not Courier New) for clarity, increased font sizes, proper 76mm content width. Applied to both POS.js and Dashboard.js.

## Pending Issues
- None currently blocking

## Upcoming Tasks (P1-P2)
- P1: ZKTeco Fingerprint Integration
- P2: Refactor server.py (17k+ lines into modular routes)
- P2: Refactor SuperAdmin.js (5.4k+ lines into smaller components)

## Deferred Tasks
- Multi-Restaurant Tenant Switcher (deferred by user - not wanted currently)

## Key Credentials
- Admin: hanialdujaili@gmail.com / Hani@2024
- Super Admin: owner@maestroegp.com / owner123 (Secret: 271018)
- Test Cashier: cashier@test.com / Test@1234
