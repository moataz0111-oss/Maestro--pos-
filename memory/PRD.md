# Maestro EGP - POS System PRD

## Original Problem Statement
Multi-tenant POS system (React + FastAPI + MongoDB) with ZKTeco biometric integration, HR/payroll module, and comprehensive restaurant management.

## Architecture
- **Frontend**: React (port 3000) - Dashboard.js, POS.js, HR.js, SuperAdmin.js, Settings.js
- **Backend**: FastAPI (port 8001) - server.py (monolith) + routes/shifts_routes.py
- **Database**: MongoDB (maestro_pos)
- **Local Agent**: PowerShell print_server.ps1 v3.8.0 with embedded C# ZKHelper

## Completed Features

### Previous Sessions
- ZKTeco fingerprint device integration, HR payroll, audit logs, refund handling, kitchen printing, delivery app separation, receipt formatting, auto-sync, etc.

### April 11, 2026 - ZKTeco Photo Improvements
- Fixed CMD_DATA_WRRQ bug (0x000D → 0x05DF)
- Enhanced GetFacePhoto with 11 HTTP credentials + 16 URL paths for iFace990 Plus
- Added ProbeDevice diagnostic endpoint
- Auto face photo sync every 5 minutes
- Dashboard sync event listener
- Agent v3.8.0

### April 13, 2026 - Cash Register Closing Improvements
- Denominations grid always visible
- Refresh button + "لا يوجد نقد متوفر" direct close button
- Receipt restructured: Expenses→Returns→Cancellations→Inventory→Surplus/Deficit→Net Cash
- Net cash = actual counted cash (not difference)
- One-step auto-print via USB (no browser dialog)

### April 13, 2026 - Owner Shift Management (NEW)
- **Owner does NOT create own shift** - admin/manager/super_admin blocked from auto-opening shifts
- **Cashier selection dialog** - When no shift exists, owner sees list of cashiers to choose from
- **Open shift for cashier** - `POST /api/shifts/open-for-cashier` creates shift under cashier's name
- **Active shift badge** - Shows "الوردية: [cashier name]" in header bar
- **shifts/current for admin** - Returns active cashier's shift (not admin's)
- **shifts/auto-open for admin** - Returns existing cashier shift or 404 (doesn't create)
- **Order creation** - When admin creates order, uses cashier_id from active shift (effective_cashier_id)
- **Cash register close** - Closes the cashier's shift, not the admin's
- **AuthContext.js** - autoOpenShift only runs for cashier role (not admin/manager)
- **cash-register/summary for admin** - Returns 404 instead of auto-creating shift

## Key API Endpoints
- `GET /api/shifts/current` - Returns active shift (for admin: cashier's shift)
- `POST /api/shifts/auto-open` - Auto-open for cashier, returns existing for admin
- `POST /api/shifts/open-for-cashier` - Admin opens shift for selected cashier
- `GET /api/shifts/cashiers-list` - List of cashiers for admin to choose from
- `GET /api/cash-register/summary` - Shift summary (needs branch_id for admin)
- `POST /api/cash-register/close` - Close register
- Local Agent: `POST /zk-face-photo`, `POST /zk-probe-device`, `POST /print-receipt`

## Key Files
- `/app/backend/routes/shifts_routes.py` - Shift management + cash register
- `/app/backend/server.py` - Main API (order creation with effective_cashier_id)
- `/app/frontend/src/pages/Dashboard.js` - Dashboard + cash register closing + cashier selection
- `/app/frontend/src/context/AuthContext.js` - Auth + auto-open shift logic
- `/app/frontend/src/pages/POS.js` - POS page
- `/app/frontend/src/hooks/useAutoSync.js` - Auto-sync hook
- `/app/backend/static/print_server.ps1` - Local print agent v3.8.0

## Backlog
### P2 - Refactoring
- Break down server.py (18k+ lines)
- Break down large frontend files (SuperAdmin.js, Settings.js, POS.js)

## Test Credentials
- Admin: hanialdujaili@gmail.com / Hani@2024
- Super Admin: owner@maestroegp.com / owner123 (Secret: 271018)
