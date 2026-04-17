# Maestro EGP - Multi-Tenant POS System PRD

## Original Problem Statement
Multi-tenant POS system with biometric integration (ZKTeco), thermal receipt printing via Local Print Agent, shift management, expense tracking, and order management. Arabic (RTL) interface.

## Core Architecture
- **Frontend**: React (RTL Arabic UI)
- **Backend**: FastAPI + MongoDB
- **Local Agent**: PowerShell script (print_server.ps1 v6.1.0 - Server Polling Architecture)

## Print Architecture (v6.1.0)
- Browser sends print jobs to backend via `POST /api/print-queue` with `branch_id`
- PowerShell agent polls `GET /api/print-queue/pending` every 3 seconds with heartbeat params
- Frontend checks `GET /api/print-queue/agent-status` for online status
- **Multi-branch**: Each branch has its own printers. POS fetches only current branch printers.
- **CRITICAL**: Do NOT attempt direct browser-to-localhost communication (Chrome PNA blocks this)

## Completed Features
- ZKTeco Biometric Integration
- Owner Shift Management
- Expenses Tracking by cashier
- POS Order Flow (forced payment, paid/unpaid status)
- Shift Closing Dialog (role-based visibility, deficit tracking, blind counts)
- Receipt bitmap rendering (Arabic support)
- Kitchen printing (Bitmap for USB and Ethernet)
- Print Bill separated from Payment flow
- Kitchen order appending (_sentToKitchen flag)
- Print Agent v6.1.0 (Server Polling + USB fix + heartbeat)
- Closing receipt with real logo, restaurant name, branch name
- Print Bill always shows "غير مدفوعة" for pending orders
- "Save and Send" orders save as pending (not paid)
- Individual shift view in closing report with toggle (individual/combined)
- **Multi-branch printer support**: POS fetches printers per branch, products show printers grouped by branch

## Key API Endpoints
- POST /api/print-queue (submit print job with branch_id)
- GET /api/print-queue/pending (agent pulls jobs + heartbeat)
- GET /api/print-queue/agent-status
- GET /api/printers?branch_id=xxx (printers filtered by branch)
- GET /api/shifts?status=closed (closed shifts with full details)
- GET /api/reports/cash-register-closing
- GET /api/reports/cash-register-closings

## Important Notes
- POS.js fetches printers with `branch_id` filter (lines 453, 705)
- Products store `printer_ids` array - works across branches because POS only loads branch printers
- Settings shows printers grouped by branch name in product edit forms
- handleNewOrder sends payment_method: 'pending' - order not counted as sale until paid
- Closing report has viewMode toggle: 'individual' (each shift separately) vs 'all' (combined)

## Backlog
- (P2) Refactor server.py (19k+ lines) into modular routes
- (P2) Refactor Dashboard.js, POS.js, Settings.js into smaller components
