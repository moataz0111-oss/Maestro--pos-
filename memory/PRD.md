# Maestro EGP - POS System PRD

## Original Problem Statement
Multi-tenant POS system (React + FastAPI + MongoDB) with ZKTeco biometric integration, HR/payroll module, and comprehensive restaurant management.

## Architecture
- **Frontend**: React (port 3000) - Dashboard.js, POS.js, HR.js, SuperAdmin.js, Settings.js
- **Backend**: FastAPI (port 8001) - server.py (monolith) + routes/ (partial refactor)
- **Database**: MongoDB
- **Local Agent**: PowerShell print_server.ps1 v3.7.0 with embedded C# ZKHelper

## Completed Features

### Previous Sessions
- ZKTeco fingerprint device integration, HR payroll, audit logs, refund handling, kitchen printing, etc.

### April 10-11, 2026 (Current Session)
- **Fixed Counted Cash showing 0** in closing receipt
- **Separated Delivery App Sales** from normal credit in closing report + receipt
- **Receipt formatting 70mm** centered auto-height
- **Delivery company credit tracking** for ALL companies (not just one)
- **Excluded delivery orders** from normal credit (آجل)
- **Delivery company on kitchen print** (text-based ESC/POS)
- **delivery_app_name** sent in all 5 order creation paths
- **Cancelled/Refunded items** visual markers (XXXX + labels) on kitchen print
- **Receipt formatting fixes**: delivery company shows name only (centered, no label), thicker dashed lines (lineWidth=2), branch name shows
- **Persistent auto-sync**: Biometric auto-sync state saved in MongoDB. Runs at App level (not just BiometricDevices page). Survives logout/login. Only stops when toggled off.
- **Auto-sync API**: GET/POST /api/biometric/auto-sync endpoints
- **Global useAutoSync hook**: Checks backend every 60s, syncs from all ZKTeco devices, auto-processes attendance

## Key Files
- `/app/frontend/src/hooks/useAutoSync.js` - Global auto-sync hook
- `/app/frontend/src/utils/receiptBitmap.js` - Browser receipt bitmap rendering
- `/app/frontend/src/utils/printService.js` - Print routing (bitmap for receipt, text for kitchen)
- `/app/backend/static/print_server.ps1` - Local print agent with C# ZKHelper

## Backlog
### P2 - Refactoring
- Break down server.py (18k+ lines)
- Break down large frontend files

### Deferred
- Multi-restaurant switcher (do NOT implement until requested)

## Test Credentials
- Admin: hanialdujaili@gmail.com / Hani@2024
- Super Admin: owner@maestroegp.com / owner123 (Secret: 271018)
