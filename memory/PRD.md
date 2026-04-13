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
- ZKTeco fingerprint device integration, HR payroll, audit logs, refund handling, kitchen printing, etc.

### April 10-11, 2026
- Fixed Counted Cash showing 0 in closing receipt
- Separated Delivery App Sales from normal credit in closing report + receipt
- Receipt formatting 70mm centered auto-height
- Delivery company credit tracking for ALL companies
- Excluded delivery orders from normal credit
- Delivery company on kitchen print (text-based ESC/POS)
- delivery_app_name sent in all 5 order creation paths
- Cancelled/Refunded items visual markers on kitchen print
- Receipt formatting fixes
- Persistent auto-sync for biometric attendance
- Auto-sync API endpoints
- Global useAutoSync hook

### April 11, 2026 (Current Session)
- **Fixed critical CMD_DATA_WRRQ bug**: Was using 0x000D (CMD_ATTLOG_RRQ) instead of 0x05DF (1503). This was why UDP face photo retrieval never worked.
- **Enhanced GetFacePhoto**: Added 11 HTTP credential combos (admin/12345, admin/00000, etc.), 16 URL paths specific to iFace990 Plus, proper large data exchange protocol for UDP, face template retrieval via CMD_USERTEMP_RRQ with face indexes (50-55).
- **Added ProbeDevice diagnostic**: New `/zk-probe-device` endpoint tests all HTTP port/credential/path combinations and reports results. Helps debug device connectivity.
- **Added ReceiveLargeData helper**: Proper implementation of ZKTeco large data exchange protocol (CMD_DATA_RDY, CMD_PREPARE_DATA, CMD_DATA, CMD_FREE_DATA).
- **Added HttpGetPhoto helper**: Reusable HTTP photo fetcher with proper auth support.
- **Auto face photo sync**: useAutoSync.js now runs photo sync every 5 minutes for employees without face_photo who have biometric_uid.
- **Dashboard sync listener**: Dashboard.js now listens for 'biometric-sync-data-updated' events for real-time updates.
- **Probe device UI**: Face photo dialog in HR.js now has "فحص اتصال الجهاز" button showing diagnostic results.
- **Agent version bumped to v3.8.0**
- **Added System.IO using directive** to C# code (was missing, could cause compilation issues).

## Key Files
- `/app/frontend/src/hooks/useAutoSync.js` - Global auto-sync hook (attendance + photos)
- `/app/frontend/src/utils/receiptBitmap.js` - Browser receipt bitmap rendering
- `/app/frontend/src/utils/printService.js` - Print routing
- `/app/backend/static/print_server.ps1` - Local print agent v3.8.0 with C# ZKHelper

## Key API Endpoints
- `POST /zk-face-photo` - Fetch face photo from device (Local Agent)
- `POST /zk-probe-device` - Diagnostic probe of device HTTP/UDP connectivity (Local Agent)
- `GET/POST /api/biometric/auto-sync` - Auto-sync toggle
- `POST /api/employees/{id}/face-photo` - Save face photo
- `POST /api/attendance/auto-process` - Process attendance records

## Backlog
### P2 - Refactoring
- Break down server.py (18k+ lines)
- Break down large frontend files (SuperAdmin.js, Settings.js, POS.js)

### Deferred
- Multi-restaurant switcher (do NOT implement until requested)

## Test Credentials
- Admin: hanialdujaili@gmail.com / Hani@2024
- Super Admin: owner@maestroegp.com / owner123 (Secret: 271018)
