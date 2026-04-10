# Maestro POS - PRD

## Original Problem Statement
Multi-tenant POS system (React + FastAPI + MongoDB) with printing, ZKTeco biometric, and HR automation.

## Architecture
```
Print:     Browser Canvas -> ESC/POS -> localhost:9999 -> Agent v3.7.0 -> USB/TCP Printer
Biometric: Browser -> localhost:9999/zk-* -> Agent v3.7.0 -> UDP ZK Protocol -> ZKTeco Device
Auto-Sync: Agent polls ZKTeco every 1min -> Frontend relays -> Backend auto-processes -> Toast notification
Audit:     Login/Logout/Impersonation -> audit_logs collection -> Auto-delete after 30 days
```

## Credentials
- Admin: hanialdujaili@gmail.com / Hani@2024
- Super Admin: owner@maestroegp.com / owner123 (Secret: 271018)
- Test Cashier: cashier@test.com / Test@1234

## Completed Features

### Printing & Receipt
- [x] ESC/POS encoding with Arabic Canvas (65mm receipt)
- [x] Close register receipt: 65mm x 25cm, prints via USB directly (no print dialog)
- [x] Net cash on receipt: ✅ (match), + (over), - (under) indicators
- [x] Kitchen routing by print_mode

### ZKTeco Biometric (Agent v3.7.0)
- [x] Full ZK Protocol (UDP C# ZKHelper)
- [x] All endpoints: /zk-test, /zk-sync, /zk-users, /zk-push-user, /zk-delete-user, /zk-face-photo
- [x] Face Photo UI: camera button, dialog with preview/refresh, avatar in employee list
- [x] Auto-sync every 1 minute with toggle + toast notifications

### HR System
- [x] Attendance in 12-hour format (ص/م AM/PM)
- [x] Auto-refresh HR data every 60 seconds (no page reload)
- [x] Employee break time: break_start, break_end fields with AM/PM picker
- [x] Break time deducted from worked_hours in auto-process
- [x] Overtime approval tab with approve/reject buttons
- [x] Employee name enrichment across all endpoints
- [x] Reset HR deletes employees from biometric (skips admin uid=1)

### Audit Log System (2026-04-10)
- [x] Tracks ALL login/logout/impersonation events
- [x] GET /api/auth/audit-logs with pagination
- [x] DELETE /api/auth/audit-logs (clear button)
- [x] Auto-deletes records older than 30 days
- [x] Frontend UI: event type icons (login/logout/impersonation), user name, role, timestamp
- [x] Logout audit logging via /api/auth/logout endpoint

### Reports
- [x] by_cashier resolves names from users collection (fixes "غير محدد")

## Key Files
- `/app/frontend/src/pages/Dashboard.js` - Dashboard + close register receipt (USB print)
- `/app/frontend/src/pages/Settings.js` - Audit log tab
- `/app/frontend/src/pages/HR.js` - HR with biometric, face photo, overtime, break fields
- `/app/frontend/src/context/AuthContext.js` - Logout audit logging
- `/app/backend/server.py` - Backend (18K+ lines)
- `/app/backend/routes/payroll_routes.py` - Payroll + overtime
- `/app/backend/static/print_server.ps1` - Local agent v3.7.0

## Key API Endpoints
- POST /api/auth/login (+ audit log), POST /api/auth/logout (+ audit log)
- GET /api/auth/audit-logs, DELETE /api/auth/audit-logs
- POST /api/employees/{id}/face-photo
- POST /api/attendance/auto-process
- GET /api/overtime-requests, PUT /api/overtime-requests/{id}/approve|reject
- GET /api/print-agent-version (3.7.0)

## Upcoming Tasks
- P2: Refactor server.py (18K+ lines) into modular routes
- P2: Refactor POS.js, Settings.js, SuperAdmin.js
