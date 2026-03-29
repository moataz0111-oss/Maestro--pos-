# Maestro Restaurant POS System - PRD

## Original Problem Statement
Multi-tenant POS system (React + FastAPI + MongoDB) with role-based access, POS interface, PWA offline support, shift/cash register management, and dynamic thermal printing.

## Architecture
```
/app
├── frontend/ (React + Shadcn UI + Tailwind)
│   ├── src/pages/ (Dashboard, Reports, POS, Settings, Expenses, Delivery, etc.)
│   ├── src/context/ (AuthContext.js)
├── backend/
│   ├── server.py (Main monolith ~17k lines)
│   ├── routes/ (shifts_routes.py, reports_routes.py, inventory_system.py, etc.)
```

## Completed Features
- Multi-tenant POS system with role-based access
- Cash register / shift management
- Dashboard with configurable permissions
- Thermal printing (72mm paper, base64 logo)
- Delivery management with driver/company differentiation
- Inventory system (raw materials, packaging, manufacturing)
- Reports (sales, delivery credits, expenses, profit/loss)
- PWA offline support

## Recent Fixes (March 29, 2026)
1. **Inventory tenant_id bug**: Raw materials created via `/raw-materials-new` now include `tenant_id`
2. **Sales report exclusions**: Refunded/cancelled orders excluded; pending orders shown separately
3. **Delivery driver vs company**: Driver deliveries labeled "توصيل سائقين" in reports; delivery credits report shows only companies
4. **Permissions for expenses/delivery**: Cashiers with `expenses` or `delivery` permissions can now create items
5. **Print improvements**: Logo base64, 72mm paper, centered content, image preloading
6. **Branch requests tenant_id**: Branch requests now include tenant_id filtering

## Pending Issues
- User reported closing expenses error (need screenshot to reproduce)
- Production deployment may need update for permission hiding to work

## Upcoming Tasks (P0-P2)
- P0: Multi-Restaurant Tenant Switcher
- P1: ZKTeco Fingerprint Integration
- P2: Refactor server.py (17k+ lines)
- P2: Refactor SuperAdmin.js (5.4k+ lines)

## Key Credentials
- Admin: hanialdujaili@gmail.com / Hani@2024
- Super Admin: owner@maestroegp.com / owner123 (Secret: 271018)
- Test Cashier: cashier@test.com / Test@1234
