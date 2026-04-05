# Maestro POS - PRD

## Original Problem Statement
Multi-tenant POS system (React + FastAPI + MongoDB) with printing, ZKTeco biometric, and HR automation.

## Architecture
```
Print:     Browser Canvas -> ESC/POS -> localhost:9999 -> Agent v2.5 -> Printer
Biometric: Browser -> localhost:9999/zk-* -> Agent v2.5 -> UDP ZK Protocol (with 50508273 header) -> ZKTeco Device
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

### ZKTeco Biometric (2026-04-05)
- [x] Agent v2.5.0 with ZK Protocol (UDP C# ZKHelper + transport header fix)
- [x] /zk-test, /zk-sync, /zk-users, /zk-push-user, /zk-delete-user
- [x] Transport header (50 50 82 7D) added to all packets (was missing in v2.4.0)
- [x] ExtractPayload strips transport header from device responses
- [x] HexDump debug logging for connection troubleshooting
- [x] Auto-kill old agent on startup
- [x] Frontend BiometricDevices routes through localhost:9999
- [x] Agent status card (online/offline)
- [x] Push employee to device + Push all employees
- [x] sync-from-agent backend endpoint

### Attendance Auto-Processing (2026-04-05)
- [x] Employee shift fields: shift_start, shift_end, work_days
- [x] Auto-sync polling (every 5 minutes) with toggle
- [x] POST /api/attendance/auto-process:
  - Converts raw biometric punches → attendance records
  - First punch = check-in, last punch = check-out
  - Calculates worked_hours, late_minutes, early_leave_minutes, overtime
  - Auto-creates deductions for late >15min
  - Auto-creates deductions for early_leave >15min
  - Auto-creates absence records for missing work days
  - Marks raw records as processed (dedup)
- [x] Payroll integrates with auto-calculated attendance + deductions

## Key Files
- `/app/frontend/src/pages/POS.js` - POS (4.4K+ lines)
- `/app/frontend/src/pages/HR.js` - HR with biometric push (2.2K+ lines)
- `/app/frontend/src/components/BiometricDevices.js` - Device management + auto-sync
- `/app/frontend/src/utils/receiptBitmap.js` - Receipt Canvas -> ESC/POS
- `/app/backend/server.py` - Backend (18K+ lines)
- `/app/backend/routes/payroll_routes.py` - Payroll calculations
- `/app/backend/static/print_server.ps1` - Local agent v2.5.0 (with ZK transport header fix)

## Key API Endpoints
- POST /api/orders, PUT /api/orders/{id}/update-items
- POST /api/biometric/devices, POST /api/biometric/devices/{id}/sync-from-agent
- POST /api/attendance/auto-process
- PUT /api/employees/{id} (incl. biometric_uid, shift_start, shift_end, work_days)

## Upcoming Tasks
- P0: Multi-Restaurant (Tenant) Switcher
- P2: Refactor server.py (18K+ lines)
- P2: Refactor POS.js, Settings.js, SuperAdmin.js
