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
│   ├── src/utils/ (orderNotifications.js, printService.js)
│   ├── public/ (sw-offline.js, manifest.json)
├── backend/
│   ├── server.py (Main monolith ~18k lines)
│   ├── routes/ (shifts_routes.py, reports_routes.py, inventory_system.py, customer_menu.py, order_notifications.py)
│   ├── static/ (print_server.ps1, MaestroPrintAgent.bat [legacy])
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
- **Daily Sales Target System**: Admin sets target, all see progress bar, animated celebration on achievement
- **Multi-Printer System**: Complete multi-printer routing architecture (USB + Ethernet)

## Session 4 Fixes (March 31, 2026)
22. **Print Agent Background Service (v2.0)** - Converted MaestroPrintAgent.bat from visible CMD window to hidden background service:
    - Dynamic BAT generation from endpoint (not static file)
    - Setup PowerShell extracts server code, saves as PS1, creates VBS launcher
    - VBS runs PowerShell with `-WindowStyle Hidden` (completely invisible)
    - Auto-copies VBS to Windows Startup folder for boot persistence
    - User sees brief 5-second setup window then it auto-closes
    - Server runs on localhost:9999 completely hidden

## Pending Issues
- None

## Upcoming Tasks
- P0: Multi-Restaurant Tenant Switcher (deferred by user but top priority backlog)
- P1: ZKTeco Fingerprint Integration
- P2: Refactor server.py (18k+ lines) - duplicate routes still exist for packaging-requests
- P2: Refactor SuperAdmin.js (5.4k+ lines)
- P2: Refactor Settings.js (7.1k+ lines)

## Key Credentials
- Admin: hanialdujaili@gmail.com / Hani@2024
- Super Admin: owner@maestroegp.com / owner123 (Secret: 271018)
- Test Cashier: cashier@test.com / Test@1234

## Key Endpoints
- `GET /api/download-print-agent` - Dynamically generates BAT installer for hidden print agent
- `GET /api/settings/restaurant` - Fetches tenant restaurant data

## Key DB Schema
- `printers`: name, ip_address, port, connection_type, print_mode, show_prices
- `tenant_invoice_settings`: show_logo, invoice_logo, restaurant_name
- `settings`: Handles restaurant and system configurations
