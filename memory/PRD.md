# Maestro POS - PRD

## Original Problem Statement
Multi-tenant POS system (React + FastAPI + MongoDB) with printing, ZKTeco biometric, and HR automation.

## Architecture
```
Print:     Browser Canvas -> ESC/POS -> localhost:9999 -> Agent v3.7.0 -> Printer
Biometric: Browser -> localhost:9999/zk-* -> Agent v3.7.0 -> UDP ZK Protocol -> ZKTeco Device
Auto-Sync: Agent polls ZKTeco every 1min -> Frontend relays -> Backend auto-processes
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
- [x] Agent v3.7.0 with ZK Protocol (UDP C# ZKHelper)
- [x] /zk-test, /zk-sync, /zk-users, /zk-push-user, /zk-delete-user
- [x] /zk-face-photo (HTTP + UDP biophoto retrieval) - C# compiled OK
- [x] Transport header (50 50 82 7D) handling via ExtractPayload
- [x] CMD_AUTH handshake for authenticated devices
- [x] 4-byte data header auto-detection in GetUsers and SyncAttendance
- [x] HexDump debug logging for connection troubleshooting
- [x] Auto-kill old agent on startup
- [x] Frontend BiometricDevices routes through localhost:9999
- [x] Agent status card (online/offline)
- [x] Push employee to device + Push all employees
- [x] sync-from-agent backend endpoint

### Face Photo Feature (2026-04-09)
- [x] GetFacePhoto via HTTP URL patterns + UDP CMD_DATA_WRRQ (C# compiles OK)
- [x] POST /api/employees/{id}/face-photo - saves base64 image to DB
- [x] EmployeeResponse includes face_photo and face_photo_updated_at
- [x] Camera button in employee actions row
- [x] Face photo dialog with employee info, stored photo display, and refresh button
- [x] Employee avatar in name column (photo or initial letter)

### Attendance Auto-Processing
- [x] Employee shift fields: shift_start, shift_end, work_days
- [x] Auto-sync polling (every 1 minute) with toggle
- [x] POST /api/attendance/auto-process with full calculation
- [x] Toast notifications when new attendance arrives during auto-sync

### HR Data Integrity (2026-04-09)
- [x] Employee name enrichment: All GET endpoints return current names from employees collection
- [x] Fixed garbled/stale names in attendance, deductions, bonuses, advances, payroll, overtime
- [x] Push/sync preserves biometric data (fingerprints, face photos) on device
- [x] Reset HR returns biometric_uids_to_delete for device cleanup (skips admin uid=1)

### Overtime Approval System (2026-04-09)
- [x] Auto-generated overtime requests during attendance processing
- [x] GET /api/overtime-requests with name enrichment
- [x] PUT /api/overtime-requests/{id}/approve
- [x] PUT /api/overtime-requests/{id}/reject
- [x] Frontend Overtime tab with approve/reject buttons in HR page

### POS Calculations
- [x] Fixed extras calculation: (item.price * item.quantity) + extrasTotal

## Key Files
- `/app/frontend/src/pages/POS.js` - POS (4.4K+ lines)
- `/app/frontend/src/pages/HR.js` - HR with biometric push + face photo + overtime tab
- `/app/frontend/src/components/BiometricDevices.js` - Device management + auto-sync (1min) + toast notifications
- `/app/frontend/src/utils/receiptBitmap.js` - Receipt Canvas -> ESC/POS
- `/app/backend/server.py` - Backend (18K+ lines)
- `/app/backend/routes/payroll_routes.py` - Payroll calculations + overtime approval
- `/app/backend/static/print_server.ps1` - Local agent v3.7.0

## Key API Endpoints
- POST /api/orders, PUT /api/orders/{id}/update-items
- POST /api/biometric/devices, POST /api/biometric/devices/{id}/sync-from-agent
- POST /api/attendance/auto-process
- GET /api/overtime-requests, PUT /api/overtime-requests/{id}/approve, PUT /api/overtime-requests/{id}/reject
- POST /api/employees/{id}/face-photo (save base64 face photo)
- POST /api/super-admin/tenants/{id}/reset-hr (returns biometric_uids_to_delete)
- GET /api/print-agent-version (3.7.0), GET /api/print-agent-script, GET /api/download-print-agent

## Upcoming Tasks
- P2: Refactor server.py (18K+ lines)
- P2: Refactor POS.js, Settings.js, SuperAdmin.js
