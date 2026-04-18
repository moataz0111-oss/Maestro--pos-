# Maestro EGP - Multi-Tenant POS System PRD

## Original Problem Statement
Multi-tenant POS system with biometric integration (ZKTeco), thermal receipt printing via Local Print Agent, shift management, expense tracking, and order management. Arabic (RTL) interface. Multi-branch support.

## Core Architecture
- **Frontend**: React (RTL Arabic UI)
- **Backend**: FastAPI + MongoDB
- **Local Agent**: PowerShell script (print_server.ps1 v6.1.0 - Server Polling Architecture)

## Print Architecture (v6.1.0) - Multi-Branch
- Each branch has its own printers (Cashier, Kitchen, etc.)
- POS fetches only current branch printers via `GET /printers?branch_id=xxx`
- Print jobs include `branch_id` for proper routing
- Agent polls all pending jobs for the device
- Products link to printers per-branch via `printer_ids` array
- Settings shows printers grouped by branch with filter tabs

## Completed Features
- ZKTeco Biometric Integration
- Owner Shift Management
- Expenses Tracking by cashier
- POS Order Flow
- Shift Closing Dialog (role-based, deficit tracking, blind counts)
- Receipt bitmap rendering (Arabic support)
- Kitchen printing (Bitmap for USB and Ethernet)
- Print Bill separated from Payment flow
- Kitchen order appending (_sentToKitchen flag)
- Print Agent v6.1.0 (Server Polling + USB fix + heartbeat)
- Closing receipt with real logo, restaurant name, branch name
- Print Bill always shows "غير مدفوعة" for pending orders
- "Save and Send" orders save as pending
- Individual shift view in closing report with toggle
- **Multi-branch printer support with branch filter in Settings**
- **Product printer linking grouped by branch**

## Key API Endpoints
- GET /api/printers?branch_id=xxx
- POST /api/print-queue (with branch_id)
- GET /api/print-queue/pending, /agent-status
- GET /api/shifts?status=closed
- GET /api/reports/cash-register-closing, /cash-register-closings

## Backlog
- (P2) Refactor server.py (19k+ lines) into modular routes
- (P2) Refactor Dashboard.js, POS.js, Settings.js into smaller components
