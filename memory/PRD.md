# Maestro EGP - Multi-Tenant POS System PRD

## Original Problem Statement
Multi-tenant POS system with biometric integration (ZKTeco), thermal receipt printing via Local Print Agent, shift management, expense tracking, and order management. Arabic (RTL) interface.

## Core Architecture
- **Frontend**: React (RTL Arabic UI)
- **Backend**: FastAPI + MongoDB
- **Local Agent**: PowerShell script (print_server.ps1 v6.1.0 - Server Polling Architecture)

## Print Architecture (v6.1.0)
- Browser sends print jobs to backend via `POST /api/print-queue`
- PowerShell agent polls `GET /api/print-queue/pending` every 3 seconds with `agent_version=6.1.0&device_id=default`
- This polling doubles as a heartbeat mechanism - backend records timestamp in `agent_heartbeats` collection
- Frontend checks `GET /api/print-queue/agent-status` to determine if agent is online (heartbeat < 30 seconds)
- **CRITICAL**: Do NOT attempt direct browser-to-localhost communication (Chrome PNA blocks this)
- **Start-Job USB Fix (v6.1.0)**: The polling job compiles its own C# classes (`JobRawPrinter`, `JobReceiptRenderer`) because `Start-Job` creates a separate process

## Completed Features
- ZKTeco Biometric Integration
- Owner Shift Management (active cashiers only, 1-min timeout, auto-release)
- Expenses Tracking by cashier
- POS Order Flow (forced payment, paid/unpaid status)
- Shift Closing Dialog (role-based visibility, deficit tracking, blind counts)
- Receipt bitmap rendering (Arabic support via Canvas/GS v 0 raster)
- Kitchen printing (Bitmap for both USB and Ethernet)
- Print Bill separated from Payment flow
- Kitchen order appending (_sentToKitchen flag - only new items sent)
- Print Agent v6.1.0 (Server Polling Architecture + USB fix + heartbeat)
- Test print now shows printer name, IP, connection type
- Version comparison for agent update notifications
- Closing receipt now shows real restaurant logo, name, branch name (April 17, 2026)
- Print Bill always shows "غير مدفوعة" for pending orders (April 17, 2026)
- "Save and Send" orders now save as payment_method: 'pending' (April 17, 2026)

## Key API Endpoints
- POST /api/print-queue (submit print job)
- GET /api/print-queue/pending (agent pulls jobs + heartbeat)
- GET /api/print-queue/agent-status (frontend checks real agent status)
- PUT /api/print-queue/{job_id}/complete
- PUT /api/print-queue/{job_id}/failed
- POST /api/cash-register/close
- GET /api/shifts/current, /api/shifts/cashiers-list
- GET /api/print-agent-version, /api/download-print-agent
- GET /api/smart-reports/sales, /api/reports/cash-register-closing

## Key DB Collections
- `print_queue`: Print jobs for local agent
- `agent_heartbeats`: Agent heartbeat timestamps
- `cash_register_closings`: Historical closing data
- `orders`: All orders with tenant_id, payment_status, payment_method

## Important Notes
- handleNewOrder (Save and Send) sets payment_method: 'pending' - order won't count in sales until paid
- handleSubmitOrder (Submit/Pay) sets payment_method to actual method + payment_status: 'paid'
- handlePrintBill always sets is_paid: false (unpaid receipt)
- Reports use build_tenant_query which filters by tenant_id (not user) - ALL users' orders visible
- Closing receipt uses renderClosingReceiptBitmap (async) with logo from tenantInfo

## Backlog
- (P2) Refactor server.py (19k+ lines) into modular routes
- (P2) Refactor Dashboard.js, POS.js, Settings.js into smaller components
