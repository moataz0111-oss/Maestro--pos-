# Maestro EGP - POS System PRD

## Original Problem Statement
Multi-tenant POS system (React + FastAPI + MongoDB) with ZKTeco biometric integration, HR/payroll module, and comprehensive restaurant management.

## Architecture
- **Frontend**: React (port 3000) - Dashboard.js, POS.js, HR.js, SuperAdmin.js, Settings.js
- **Backend**: FastAPI (port 8001) - server.py (monolith) + routes/ (partial refactor)
- **Database**: MongoDB
- **Local Agent**: PowerShell print_server.ps1 v3.8.0 with embedded C# ZKHelper

## Completed Features

### Previous Sessions
- ZKTeco fingerprint device integration, HR payroll, audit logs, refund handling, kitchen printing, delivery app separation, etc.

### April 11, 2026 - ZKTeco Photo Improvements
- Fixed critical CMD_DATA_WRRQ bug (0x000D → 0x05DF)
- Enhanced GetFacePhoto with 11 HTTP credentials + 16 URL paths for iFace990 Plus
- Added ProbeDevice diagnostic endpoint `/zk-probe-device`
- Added auto face photo sync every 5 minutes in useAutoSync.js
- Dashboard.js sync event listener for real-time updates
- Agent version bumped to v3.8.0

### April 13, 2026 - Cash Register Closing Improvements
- **Denominations grid always visible** - Removed conditional hide when expected_cash <= 0
- **Refresh button** added to closing dialog header for refreshing summary data
- **"لا يوجد نقد متوفر" button** - Direct close with zero inventory, confirms + prints + closes in one step
- **Expected = Cash Sales - Expenses** - Label shows "(نقدي - المصاريف)"
- **Receipt restructured**: Expenses & Discounts → Returns & Cancellations → Cash Inventory → Surplus/Deficit → Net Cash
- **Net cash = actual counted cash** (not the difference)
- **Surplus/Deficit separate fields** above net cash in receipt
- **Returns & Cancellations always shown** (not conditional) in same section as expenses
- **One-step auto-print** on confirmation - USB print via Local Agent, no browser dialog, dialog closes automatically
- **Both receipt formats updated** (HTML bitmap + ESC/POS USB)

## Key Files
- `/app/frontend/src/pages/Dashboard.js` - Cash register closing flow + receipt generation
- `/app/frontend/src/hooks/useAutoSync.js` - Global auto-sync hook (attendance + photos)
- `/app/frontend/src/utils/receiptBitmap.js` - Browser receipt bitmap rendering
- `/app/frontend/src/utils/printService.js` - Print routing
- `/app/backend/static/print_server.ps1` - Local print agent v3.8.0 with C# ZKHelper
- `/app/backend/routes/shifts_routes.py` - Cash register summary + close endpoints

## Key API Endpoints
- `GET /api/cash-register/summary` - Get shift summary with sales, expenses, expected cash
- `POST /api/cash-register/close` - Close register with denominations
- Local Agent: `POST /zk-face-photo`, `POST /zk-probe-device`, `POST /print-receipt`

## Backlog
### P2 - Refactoring
- Break down server.py (18k+ lines)
- Break down large frontend files (SuperAdmin.js, Settings.js, POS.js)

## Test Credentials
- Admin: hanialdujaili@gmail.com / Hani@2024
- Super Admin: owner@maestroegp.com / owner123 (Secret: 271018)
