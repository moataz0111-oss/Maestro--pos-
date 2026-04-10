# Maestro POS - PRD

## Original Problem Statement
Multi-tenant POS system (React + FastAPI + MongoDB) with printing, ZKTeco biometric, and HR automation.

## Architecture
```
Print:     Browser Canvas -> ESC/POS -> localhost:9999 -> Agent v3.7.0 -> Printer
Biometric: Browser -> localhost:9999/zk-* -> Agent v3.7.0 -> UDP ZK Protocol -> ZKTeco Device
Auto-Sync: Agent polls ZKTeco every 1min -> Frontend relays -> Backend auto-processes -> Toast notification
```

## Credentials
- Admin: hanialdujaili@gmail.com / Hani@2024
- Super Admin: owner@maestroegp.com / owner123 (Secret: 271018)
- Test Cashier: cashier@test.com / Test@1234

## Completed Features

### Printing & Receipt
- [x] ESC * 33 column-mode encoding with Arabic Canvas
- [x] Agent v2.4.0 chunked USB/TCP printing
- [x] 65mm receipt: bold fonts, QR, logos, skip blank lines
- [x] Kitchen routing by print_mode
- [x] Close register receipt auto-prints on USB cashier printer
- [x] Net cash on receipt: ✅ (match), + (over), - (under)

### ZKTeco Biometric (Agent v3.7.0)
- [x] Full ZK Protocol (UDP C# ZKHelper)
- [x] Endpoints: /zk-test, /zk-sync, /zk-users, /zk-push-user, /zk-delete-user, /zk-face-photo
- [x] GetFacePhoto via HTTP URL patterns (7 patterns) + UDP CMD_DATA_WRRQ
- [x] Transport header, CMD_AUTH, 4-byte data header auto-detection
- [x] Auto-kill old agent, status card, push employee/push all
- [x] Face Photo UI: camera button, dialog with preview/refresh, avatar in employee list

### HR System
- [x] Attendance auto-sync every 1 minute with toggle
- [x] Toast notifications on new biometric punches
- [x] Auto-refresh HR data every 60 seconds (no page reload needed)
- [x] Attendance times in 12-hour format (ص/م)
- [x] Employee break time: break_start, break_end fields with AM/PM picker
- [x] Break time deducted from worked_hours in auto-process
- [x] Shift fields with 12-hour AM/PM picker (TimePickerAmPm component)
- [x] Employee name enrichment: all endpoints use current names
- [x] Reset HR returns biometric_uids_to_delete (skips admin uid=1)

### Overtime Approval
- [x] Auto-generated overtime requests during attendance processing
- [x] Frontend tab with approve/reject buttons
- [x] API: GET/PUT overtime-requests

### POS
- [x] Fixed extras calculation
- [x] Sales Leaderboard (hidden from cashiers)
- [x] Expense creation permission fix

## Key Files
- `/app/frontend/src/pages/POS.js` - POS (4.4K+ lines)
- `/app/frontend/src/pages/HR.js` - HR with biometric, face photo, overtime, break fields
- `/app/frontend/src/pages/Dashboard.js` - Dashboard + close register receipt
- `/app/frontend/src/components/BiometricDevices.js` - Device management + auto-sync
- `/app/backend/server.py` - Backend (18K+ lines)
- `/app/backend/routes/payroll_routes.py` - Payroll + overtime
- `/app/backend/static/print_server.ps1` - Local agent v3.7.0

## Key API Endpoints
- POST /api/employees/{id}/face-photo
- POST /api/attendance/auto-process
- GET /api/overtime-requests, PUT /api/overtime-requests/{id}/approve|reject
- POST /api/super-admin/tenants/{id}/reset-hr
- GET /api/print-agent-version (3.7.0)

## Upcoming Tasks
- P2: Refactor server.py (18K+ lines) into modular routes
- P2: Refactor POS.js, Settings.js, SuperAdmin.js
