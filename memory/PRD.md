# Maestro EGP - POS System PRD

## Original Problem Statement
Multi-tenant POS system (React + FastAPI + MongoDB) with ZKTeco biometric integration, HR/payroll module, and comprehensive restaurant management. The system includes a local print agent (PowerShell + C#) for thermal printing and biometric device communication.

## Architecture
- **Frontend**: React (port 3000) - Dashboard.js, POS.js, HR.js, SuperAdmin.js, Settings.js
- **Backend**: FastAPI (port 8001) - server.py (monolith) + routes/ (partial refactor)
- **Database**: MongoDB
- **Local Agent**: PowerShell print_server.ps1 v3.7.0 with embedded C# ZKHelper

## Core Modules
1. **POS**: Orders, payments (cash/card/credit), kitchen printing, delivery management
2. **HR**: Attendance (ZKTeco), payroll, shifts, overtime, breaks
3. **Dashboard**: Cash register open/close, closing reports, daily statistics
4. **Admin**: Multi-tenant, branches, users, roles, permissions

## Completed Features (All Sessions)
- ZKTeco fingerprint device integration (sync, push/fetch employees, face photos)
- HR payroll with attendance-based deductions, overtime approval, break times
- 12-hour AM/PM time format
- Audit logs for all login/logout activities with 30-day auto-delete
- POS refund handling (excluded from active sales, credit, cash)
- Kitchen printing for refunded/cancelled items
- Fixed "Unknown" cashier name in closing reports
- Local Print Agent v3.7.0

### Completed - April 10, 2026
- **Fixed Counted Cash showing 0 in closing receipt**: Frontend was reading `data.counted_cash` but backend returns `closing_cash`. Fixed to use `data.closing_cash || data.counted_cash`.
- **Separated Delivery App Sales in printed receipt**: Added delivery app sales section (grouped by company name) to both HTML receipt and USB ESC/POS receipt. Backend now uses `delivery_app_name` as key instead of `delivery_app` ID.
- **Receipt formatting 70mm centered auto-height**: Updated `@page` from `65mm 250mm` to `70mm auto`, body width from 61mm to 66mm. Content auto-sizes to fit.

## Backlog (Prioritized)
### P2 - Refactoring
- Break down `server.py` (18k+ lines) into modular route files
- Break down `SuperAdmin.js`, `Settings.js`, `POS.js` into smaller components

### Deferred (Do NOT implement until explicitly requested)
- Multi-restaurant switcher

## Key API Endpoints
- `/api/cash-register/close` - Close cash register with denominations
- `/api/cash-register/summary` - Get current shift summary
- `/api/cash-register/today` - Today's cash register data
- Local Agent: `http://localhost:9999/print-receipt`, `/zk-face-photo`

## Test Credentials
- Admin: hanialdujaili@gmail.com / Hani@2024
- Super Admin: owner@maestroegp.com / owner123 (Secret: 271018)
