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
- **Data isolation**: Non-admin users only see their own orders/stats

## Recent Fixes

### March 29, 2026 (Session 1)
1. Cash Register 500 Error: PaymentMethod.CREDIT missing
2. Inventory tenant_id fix
3. Sales report: Refunded/cancelled orders excluded
4. Permissions: Cashiers with expenses/delivery permission see buttons
5. Printing: popup window approach
6. Customer order notifications
7. Android PWA reload fix
8. Driver assignment fix
9. Customer order timeline

### March 29, 2026 (Session 2)
10. User Permissions Stale Closure Bug fix

### March 30, 2026 (Session 3 - Current)
11. **Cash Register Calculation Fix (P0)**: Orders without shift_id now counted via combined queries
12. **User Permissions Hide UI (P0)**: Verified working in Dashboard/close dialog
13. **Thermal Printing Rewrite (P1)**: Hidden iframe, 80mm CSS, Arial/Tahoma fonts
14. **Data Isolation for Non-Admin Users (P0)**: 
    - `get_orders` adds `cashier_id` filter for non-admin users
    - `get_dashboard_stats` adds `cashier_id` to base_query for non-admin users  
    - Non-admin users default to today's orders only
    - Admin/manager/super_admin bypass all filters
    - Verified: Backend 11/11, Frontend 100%

## Pending Issues
- None currently blocking

## Upcoming Tasks (P1-P2)
- P1: ZKTeco Fingerprint Integration
- P2: Refactor server.py (17k+ lines into modular routes)
- P2: Refactor SuperAdmin.js (5.4k+ lines into smaller components)

## Deferred Tasks
- Multi-Restaurant Tenant Switcher (deferred by user)

## Key Credentials
- Admin: hanialdujaili@gmail.com / Hani@2024
- Super Admin: owner@maestroegp.com / owner123 (Secret: 271018)
- Test Cashier: cashier@test.com / Test@1234
