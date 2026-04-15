# Maestro EGP - Multi-Tenant POS System PRD

## Original Problem Statement
Multi-tenant POS system with biometric integration (ZKTeco), thermal receipt printing via Local Print Agent, shift management, expense tracking, and order management. Arabic (RTL) interface.

## Core Architecture
- **Frontend**: React (RTL Arabic UI)
- **Backend**: FastAPI + MongoDB
- **Local Agent**: PowerShell script (print_server.ps1 v3.8.1)

## Latest Changes (April 15, 2026)

### Kitchen Print Fix
- Fixed kitchen Ethernet printers not receiving orders
- Changed: ALL kitchen printers (USB AND Ethernet) now send structured data to the agent
- Agent builds the receipt locally (faster, more reliable than client-side bitmap)
- Previously only USB kitchen printers used this approach; Ethernet used bitmap which failed

### Closing Receipt Width Fix
- Increased from 520px (65mm) to 560px (70mm) to match paper width
- Uses self-contained drawing functions (rC, rRow, rDash, rDbl, rInv) instead of module-scope helpers
- Content now centers properly on 70mm thermal paper

### Print Agent Stability (v3.8.1)
- Added try-catch inside HTTP listener loop
- Agent continues running even when requests fail
- Works for ALL users on the same device

## Completed Features
- ZKTeco Biometric Integration
- Owner Shift Management (active cashiers only, 1-min timeout, auto-release)
- Expenses Tracking by cashier
- POS Order Flow (forced payment, paid/unpaid status)
- Shift Closing Dialog (role-based visibility, deficit tracking)
- Receipt bitmap rendering (Arabic support)
- Print Agent installer (v3.8.1)

## Key API Endpoints
- POST /api/cash-register/close
- GET /api/shifts/current, /api/shifts/cashiers-list
- GET /api/print-agent-version, /api/download-print-agent
- GET /api/printers

## Backlog
- (P2) Refactor server.py (19k+ lines) into modular routes
- (P2) Refactor Dashboard.js, POS.js into smaller components
