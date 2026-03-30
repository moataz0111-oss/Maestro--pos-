# Maestro Restaurant POS System - PRD

## Original Problem Statement
Multi-tenant POS system (React + FastAPI + MongoDB) with role-based access, POS interface, PWA offline support, shift/cash register management, and dynamic thermal printing.

## Architecture
```
/app
├── frontend/ (React + Shadcn UI + Tailwind)
│   ├── src/pages/ (Dashboard, Reports, POS, Settings, Expenses, Delivery, etc.)
│   ├── src/components/ (TargetCelebration.js)
│   ├── src/context/ (AuthContext.js)
│   ├── src/utils/ (orderNotifications.js)
│   ├── public/ (sw-offline.js, manifest.json)
├── backend/
│   ├── server.py (Main monolith ~18k lines)
│   ├── routes/ (shifts_routes.py, reports_routes.py, inventory_system.py, customer_menu.py, order_notifications.py)
```

## Completed Features
- Multi-tenant POS system with role-based access
- Cash register / shift management with correct calculation
- Dashboard with configurable permissions (canSee helper)
- Thermal printing (hidden iframe, 80mm width, auto height)
- Delivery management with driver/company differentiation
- Inventory system (raw materials, packaging, manufacturing)
- Reports (sales, delivery credits, expenses, profit/loss)
- PWA offline support
- Customer menu app with order tracking
- Incoming customer order notifications on POS
- Data isolation: Non-admin users only see their own orders/stats
- Sales Competition Leaderboard: Daily/weekly/monthly cashier rankings
- Smart cash register close: auto-enable confirm when expenses >= cash
- **Daily Sales Target System**: Admin sets target, all see progress bar, animated 🎯 celebration on achievement

## Session 3 Fixes (March 30, 2026)
11. Cash Register Calculation Fix
12. User Permissions Stale Closure Fix  
13. Thermal Printing Rewrite (80mm, hidden iframe)
14. Data Isolation for non-admin users
15. Permission Toggle Logic Fix + canSee() helper
16. Sales Competition Leaderboard
17. Cash Register Close Smart Button
18. **Daily Sales Target System** - POST/GET /api/sales-target, progress bar, animated celebration

## Pending Issues
- None

## Upcoming Tasks
- P1: ZKTeco Fingerprint Integration
- P2: Refactor server.py (18k+ lines)
- P2: Refactor SuperAdmin.js (5.4k+ lines)

## Deferred
- Multi-Restaurant Tenant Switcher

## Key Credentials
- Admin: hanialdujaili@gmail.com / Hani@2024
- Super Admin: owner@maestroegp.com / owner123 (Secret: 271018)
- Test Cashier: cashier@test.com / Test@1234
