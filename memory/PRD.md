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
- Thermal printing (popup window approach, base64 logo)
- Delivery management with driver/company differentiation
- Inventory system (raw materials, packaging, manufacturing)
- Reports (sales, delivery credits, expenses, profit/loss)
- PWA offline support
- Customer menu app with order tracking
- Incoming customer order notifications on POS (accept/reject modal)

## Recent Fixes (March 29, 2026)
1. **Cash Register 500 Error**: PaymentMethod.CREDIT was missing from shared.py + expenses query missing tenant_id
2. **Inventory tenant_id**: Raw materials via /raw-materials-new now include tenant_id
3. **Sales report**: Refunded/cancelled orders excluded, pending shown separately, "توصيل سائقين" label
4. **Permissions**: Cashiers with expenses/delivery permission can create items
5. **Printing**: Switched from iframe to popup window (fixes 1.5m blank paper), base64 logo, proper sizing
6. **Customer order notifications**: customer_menu.py now creates notifications, 60min cutoff, accept/reject endpoints
7. **Android PWA reload**: Removed aggressive skipWaiting + auto-reload loop from service worker
8. **Driver assignment**: Includes driver_name and driver_phone in order update
9. **Customer order timeline**: Added "confirmed" step between pending and preparing

## Pending Issues
- Production deployment needs latest code push

## Upcoming Tasks (P0-P2)
- P0: Multi-Restaurant Tenant Switcher
- P1: ZKTeco Fingerprint Integration
- P2: Refactor server.py (17k+ lines)
- P2: Refactor SuperAdmin.js (5.4k+ lines)

## Key Credentials
- Admin: hanialdujaili@gmail.com / Hani@2024
- Super Admin: owner@maestroegp.com / owner123 (Secret: 271018)
- Test Cashier: cashier@test.com / Test@1234
