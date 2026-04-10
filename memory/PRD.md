# Maestro POS - PRD

## Original Problem Statement
Multi-tenant POS system (React + FastAPI + MongoDB) with printing, ZKTeco biometric, and HR automation.

## Architecture
```
Print:     Browser Canvas -> ESC/POS -> localhost:9999 -> Agent v3.7.0 -> USB/TCP Printer
Biometric: Browser -> localhost:9999/zk-* -> Agent v3.7.0 -> UDP ZK Protocol -> ZKTeco Device
Auto-Sync: Agent polls ZKTeco every 1min -> Toast notification on new punches
Audit:     Login/Logout/Impersonation -> audit_logs -> Auto-delete after 30 days
```

## Credentials
- Admin: hanialdujaili@gmail.com / Hani@2024
- Super Admin: owner@maestroegp.com / owner123 (Secret: 271018)
- Test Cashier: cashier@test.com / Test@1234

## Completed Features

### POS Core & Refund System (2026-04-10)
- [x] Orders with cash, card, credit, delivery payments
- [x] **Refunded orders completely excluded** from: credit_sales, cash_sales, card_sales, total_sales
- [x] Refunded orders appear ONLY in المرتجعات report
- [x] Close receipt shows المرتجعات section with count + total
- [x] Close receipt shows الإلغاءات section (info only)
- [x] Refund prints "[مرتجع]" to kitchen printers
- [x] Cancel prints "[تم حذف]" to kitchen printers
- [x] Payment for existing order does NOT resend to kitchen
- [x] All queries use $nin: [cancelled, refunded] filter

### Printing & Receipt
- [x] ESC/POS 65mm receipt, close receipt 65mm x 25cm via USB
- [x] Net cash indicators: ✅/+/-

### ZKTeco Biometric (Agent v3.7.0)
- [x] Full ZK Protocol, face photo, auto-sync 1min

### HR System
- [x] 12-hour format, break time, overtime, name enrichment

### Audit Log
- [x] All login/logout/impersonation events, clear button, auto-delete 30 days

## Key API Endpoints
- POST /api/refunds (creates refund, marks order as "refunded")
- GET /api/cash-register/summary (total_refunds, refund_count excluded from sales)
- POST /api/cash-register/close (total_refunds, refund_count in response)
- GET /api/reports/credit (excludes refunded orders)

## Upcoming Tasks
- P2: Refactor server.py (18K+ lines) into modular routes
- P2: Refactor POS.js, Settings.js, SuperAdmin.js
