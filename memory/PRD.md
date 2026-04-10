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

### POS Core
- [x] Orders, items, extras with ESC/POS printing
- [x] Payment: cash, card, credit (آجل), delivery
- [x] Payment does NOT resend to kitchen for existing orders
- [x] Cancel order prints "[تم حذف]" to kitchen printers
- [x] Refund prints "[مرتجع]" to kitchen printers

### Returns & Cancellations (2026-04-10)
- [x] Renamed الإرجاعات → المرتجعات throughout the app
- [x] Refunded orders excluded from: total_sales, cash_sales, card_sales, credit_sales
- [x] Refunded orders only count in المرتجعات report
- [x] Cancelled orders only count in الإلغاءات (not in any sales total)
- [x] Close receipt shows المرتجعات section with count and total
- [x] Close receipt shows الإلغاءات section (info only, not calculated)
- [x] USB direct print for close receipt (no print dialog)

### Printing & Receipt
- [x] ESC/POS 65mm receipt with Arabic Canvas
- [x] Close register receipt: 65mm x 25cm, prints via USB directly
- [x] Net cash: ✅ (match), + (over), - (under) indicators

### ZKTeco Biometric (Agent v3.7.0)
- [x] Full ZK Protocol with face photo support
- [x] Auto-sync every 1 minute with toast notifications
- [x] Face photo UI: camera button, dialog, avatar

### HR System
- [x] Attendance in 12-hour format (ص/م)
- [x] Auto-refresh every 60 seconds
- [x] Break time fields with AM/PM picker
- [x] Overtime approval tab
- [x] Employee name enrichment across all endpoints

### Audit Log System (2026-04-10)
- [x] Tracks ALL login/logout/impersonation events
- [x] Clear button + auto-delete after 30 days

### Reports
- [x] by_cashier resolves names (fixes "غير محدد")
- [x] Closing report includes المرتجعات and الإلغاءات

## Upcoming Tasks
- P2: Refactor server.py (18K+ lines) into modular routes
- P2: Refactor POS.js, Settings.js, SuperAdmin.js
