# Maestro EGP - POS System PRD

## Original Problem Statement
Multi-tenant POS system (React + FastAPI + MongoDB) with ZKTeco biometric integration, HR/payroll module, and comprehensive restaurant management.

## Architecture
- **Frontend**: React (port 3000) - Dashboard.js, POS.js, HR.js, Expenses.js, etc.
- **Backend**: FastAPI (port 8001) - server.py + routes/shifts_routes.py
- **Database**: MongoDB (maestro_pos)
- **Local Agent**: PowerShell print_server.ps1 v3.8.0

## Completed Features

### April 13, 2026 - Session 1: ZKTeco Photo + Cash Register
- Fixed CMD_DATA_WRRQ bug, enhanced face photo fetching
- Cash register: denominations always visible, no-cash button, auto-print, receipt restructured

### April 13, 2026 - Session 2: Owner Shift Management
- Owner does NOT create own shift - uses cashier's shift
- Cashier selection dialog when no shift exists
- Active shift badge shows cashier name
- Orders by owner go under cashier's shift

### April 13, 2026 - Session 3: Expenses + POS Flow (CURRENT)
**Expenses Enhancement:**
- Expenses API returns `created_by_name` (cashier who created each expense)
- Old expenses populated with cashier names from users collection
- **3 sections**: حسب التصنيف (by category), مصاريف الكاشيرية (by cashier), سجل المصاريف (log)
- Expense log shows: date + time + cashier name + amount + category

**POS Order Flow:**
- Payment method buttons turn **orange** (bg-orange-500) when selected
- `handleSaveAndSendToKitchen` now validates: payment method + table (dine-in) + phone (takeaway) + delivery details
- After kitchen send: auto-prints customer receipt via USB with `is_paid: false`
- Receipt shows **"غير مدفوعة"** (unpaid, red) when sent to kitchen
- Receipt shows **"مدفوعة"** (paid, green) when payment completed
- Receipt bitmap updated with paid/unpaid status below total
- printService passes `is_paid` to receipt data

## Key Files
- `/app/frontend/src/pages/Expenses.js` - Expenses with cashier breakdown
- `/app/frontend/src/pages/POS.js` - POS with orange buttons + validation
- `/app/frontend/src/utils/receiptBitmap.js` - Receipt with paid/unpaid status
- `/app/frontend/src/utils/printService.js` - Print service with is_paid
- `/app/frontend/src/pages/Dashboard.js` - Dashboard + cash register + cashier selection
- `/app/backend/routes/shifts_routes.py` - Shift management
- `/app/backend/server.py` - Main API

## Backlog
### P2 - Refactoring
- Break down server.py (18k+ lines)
- Break down large frontend files (SuperAdmin.js, Settings.js, POS.js)

## Test Credentials
- Admin: hanialdujaili@gmail.com / Hani@2024
- Super Admin: owner@maestroegp.com / owner123 (Secret: 271018)
