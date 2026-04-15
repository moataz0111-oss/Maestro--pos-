# Maestro EGP - Multi-Tenant POS System PRD

## Original Problem Statement
Multi-tenant POS system with biometric integration (ZKTeco), thermal receipt printing via Local Print Agent, shift management, expense tracking, and order management. Arabic (RTL) interface.

## Core Architecture
- **Frontend**: React (RTL Arabic UI)
- **Backend**: FastAPI + MongoDB
- **Local Agent**: PowerShell script (print_server.ps1 v3.8.1) with embedded C# for ESC/POS printing and ZKTeco biometric communication

## Completed Features

### Print Agent Stability Fix (v3.8.1 - April 2026)
- Added try-catch inside HTTP listener loop so individual request errors don't crash the entire agent
- Agent now continues running even when malformed requests are received
- Works for ALL users on the same device without stopping
- Only stops when a new update is installed

### Receipt Encoding Fix (April 2026)
- Fixed closing receipt printing garbled characters on thermal printers
- Converted from raw ESC/POS text to bitmap rendering (renderClosingReceiptBitmap)

### Owner Shift Management (Updated April 2026)
- Owners select from ACTIVE cashiers only (with open shifts, green badge)
- If no active cashiers → owner opens shift under their own name
- 1-minute auto-timeout if no order made
- Owner auto-released from cashier's shift after register close
- Shift badge in header is clickable to re-select cashier

### Shift Closing Dialog (April 2026)
- Role-based visibility: Cashiers cannot see Expected Cash
- "No cash available" button disappears when denomination values entered
- Deficit tracking and printing on receipts

### Print Agent Installer (v3.8.1)
- Fixed PRINT_AGENT_VERSION, Get-Content parameter conflict
- All version references updated

## Key API Endpoints
- POST /api/cash-register/close
- GET /api/shifts/current
- POST /api/shifts/open-for-cashier
- GET /api/shifts/cashiers-list (includes has_active_shift)
- GET /api/print-agent-version
- GET /api/download-print-agent

## Backlog
- (P2) Refactor server.py (19k+ lines) into modular routes
- (P2) Refactor Dashboard.js, POS.js, SuperAdmin.js into smaller components
