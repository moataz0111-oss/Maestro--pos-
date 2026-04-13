# Maestro EGP - Multi-Tenant POS System PRD

## Original Problem Statement
Multi-tenant POS system with biometric integration (ZKTeco), thermal receipt printing via Local Print Agent, shift management, expense tracking, and order management. Arabic (RTL) interface.

## Core Architecture
- **Frontend**: React (RTL Arabic UI)
- **Backend**: FastAPI + MongoDB
- **Local Agent**: PowerShell script (print_server.ps1 v3.8.0) with embedded C# for ESC/POS printing and ZKTeco biometric communication

## Completed Features

### ZKTeco Biometric Integration
- Real-time background sync via useAutoSync hook
- Face photo fetching from iFace990 Plus (CMD_DATA_WRRQ)
- /zk-probe-device diagnostic endpoint

### Owner Shift Management (Updated April 2026)
- Owners cannot open their own shift; must select an active cashier
- Cashier selection dialog shows ONLY active cashiers (with open shifts) + green "نشط" badge
- If no active cashiers → owner opens shift under their own name
- 1-minute auto-timeout: if no order created, owner is auto-released from cashier's shift
- After register close → owner is automatically released from cashier's shift
- Shift badge in header is now a clickable button to re-select cashier

### Expenses Tracking
- Breakdown by cashier name
- Detailed log with exact time and cashier for each expense

### POS Order Flow
- Forced payment method selection (orange highlight)
- Auto-save + print to kitchen/customer
- "Paid/Unpaid" status on receipts

### Shift Closing Dialog (April 2026)
- **Role-based visibility**: Cashiers cannot see "Expected Cash" (المتوقع) or surplus/deficit
- **"No cash available" button**: Disappears automatically when cashier enters any value in denomination grid
- **Deficit tracking**: Closing with 0 cash records full expected amount as deficit
- **Receipt printing**: Deficit printed correctly on both canvas and USB receipts

### Receipt Encoding Fix (April 2026)
- Fixed closing receipt printing garbled/encoded characters on thermal printers
- Converted from raw ESC/POS text (UTF-8 encoded, codepage mismatch) to **bitmap rendering**
- Uses same Canvas-based bitmap approach as order receipts (renderClosingReceiptBitmap)
- Arabic text now renders correctly as images on any printer regardless of codepage

### Print Agent Installer Fix (April 2026)
- Fixed PRINT_AGENT_VERSION from 3.7.0 to 3.8.0 
- Fixed Get-Content `-Head -Raw` parameter conflict in PowerShell installer
- Updated all version references in BAT installer to 3.8.0

## Key API Endpoints
- POST /api/cash-register/close
- GET /api/shifts/current
- POST /api/shifts/open-for-cashier
- GET /api/shifts/cashiers-list (now includes has_active_shift boolean)
- GET /api/expenses
- GET /api/cash-register/summary
- GET /api/print-agent-version
- GET /api/download-print-agent

## DB Schema (Key)
- orders: status, payment_method, is_paid
- shifts: cashier_id, cashier_name, status, branch_id, expected_cash, cash_difference
- expenses: created_by_name, category, amount

## Backlog
- (P2) Refactor server.py (19k+ lines) into modular routes
- (P2) Refactor Dashboard.js, POS.js, SuperAdmin.js into smaller components
