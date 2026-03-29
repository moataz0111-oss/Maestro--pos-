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
- Cash register / shift management with correct calculation (including customer app orders)
- Dashboard with configurable permissions (toggle ON = show, toggle OFF = hide)
- Thermal printing (hidden iframe, 80mm width, auto height, Arial/Tahoma fonts)
- Delivery management with driver/company differentiation
- Inventory system (raw materials, packaging, manufacturing)
- Reports (sales, delivery credits, expenses, profit/loss)
- PWA offline support
- Customer menu app with order tracking
- Incoming customer order notifications on POS (accept/reject modal)
- Data isolation: Non-admin users only see their own orders/stats
- **Sales Competition Leaderboard**: Daily/weekly/monthly cashier rankings by total sales

## Recent Fixes (March 30, 2026 - Session 3)
11. Cash Register Calculation Fix: Orders without shift_id now counted
12. User Permissions Hide UI: Verified working
13. Thermal Printing Rewrite: Hidden iframe, 80mm CSS, clear fonts
14. Data Isolation: Non-admin users see only their own orders
15. **Permission Toggle Logic Fix**: Inverted logic so toggle ON = show, toggle OFF = hide
16. **Sales Competition Leaderboard**: New feature - daily cashier rankings with Trophy icon, period filters (today/week/month), rank badges, average order calculation

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
