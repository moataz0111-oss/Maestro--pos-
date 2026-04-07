# Maestro POS - PRD

## Original Problem Statement
Multi-tenant POS system (React + FastAPI + MongoDB) with printing, ZKTeco biometric, and HR automation.

## Architecture
```
Print:     Browser Canvas -> ESC/POS -> localhost:9999 -> Agent v3.2.1 -> Printer
Biometric: Browser -> localhost:9999/zk-* -> Agent v3.2.1 -> UDP ZK Protocol -> ZKTeco Device
Auto-Sync: Agent polls ZKTeco every 5min -> Frontend relays -> Backend auto-processes
```

## Credentials
- Admin: hanialdujaili@gmail.com / Hani@2024
- Super Admin: owner@maestroegp.com / owner123 (Secret: 271018)
- Test Cashier: cashier@test.com / Test@1234

## Completed Features
### Printing
- [x] ESC * 33 column-mode encoding with Arabic Canvas
- [x] Agent v2.4.0 chunked USB/TCP printing
- [x] 65mm receipt: bold fonts, QR, logos, skip blank lines
- [x] Kitchen routing by print_mode
- [x] Product/Order notes saving and printing
- [x] Extras quantity counter (+/-) with receipt separation

### ZKTeco Biometric
- [x] Agent v3.2.1 with ZK Protocol (UDP C# ZKHelper)
- [x] /zk-test, /zk-sync, /zk-users, /zk-push-user, /zk-delete-user
- [x] Transport header (50 50 82 7D) handling via ExtractPayload
- [x] CMD_AUTH handshake for authenticated devices
- [x] 4-byte data header auto-detection in GetUsers and SyncAttendance
- [x] HexDump debug logging for connection troubleshooting
- [x] Auto-kill old agent on startup
- [x] Frontend BiometricDevices routes through localhost:9999
- [x] Agent status card (online/offline)
- [x] Push employee to device + Push all employees
- [x] sync-from-agent backend endpoint

### Attendance Auto-Processing
- [x] Employee shift fields: shift_start, shift_end, work_days
- [x] Auto-sync polling (every 5 minutes) with toggle
- [x] POST /api/attendance/auto-process with full calculation

### POS Calculations
- [x] Fixed extras calculation: (item.price * item.quantity) + extrasTotal

### Agent Bug Fixes (2026-04-07)
- [x] Fixed C# compilation error (uHeaderSize/recordSize scope bug) - v3.2.1
- [x] Fixed BAT installer version check regex (was checking v2.5.0, now v3.2.1)
- [x] Fixed status endpoint version verification (was checking 2.6.0, now 3.2.1)

## Key Files
- `/app/frontend/src/pages/POS.js` - POS (4.4K+ lines)
- `/app/frontend/src/pages/HR.js` - HR with biometric push
- `/app/frontend/src/components/BiometricDevices.js` - Device management + auto-sync
- `/app/frontend/src/utils/receiptBitmap.js` - Receipt Canvas -> ESC/POS
- `/app/backend/server.py` - Backend (18K+ lines)
- `/app/backend/routes/payroll_routes.py` - Payroll calculations
- `/app/backend/static/print_server.ps1` - Local agent v3.2.1

## Key API Endpoints
- POST /api/orders, PUT /api/orders/{id}/update-items
- POST /api/biometric/devices, POST /api/biometric/devices/{id}/sync-from-agent
- POST /api/attendance/auto-process
- GET /api/print-agent-version, GET /api/print-agent-script, GET /api/download-print-agent

## Upcoming Tasks
- P1: Verify ZKTeco SyncAttendance data parsing with real device
- P2: Refactor server.py (18K+ lines)
- P2: Refactor POS.js, Settings.js, SuperAdmin.js
