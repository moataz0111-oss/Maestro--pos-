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
- **Start-Job USB Fix (v6.1.0)**: The polling job compiles its own C# classes (`JobRawPrinter`, `JobReceiptRenderer`) because `Start-Job` creates a separate process that cannot access the parent's compiled types

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
- Print Agent v6.0.0 (Server Polling Architecture)
- Real Heartbeat mechanism for agent status (April 17, 2026)
- v6.1.0: USB print fix in polling job (C# compiled inside Start-Job)
- v6.1.0: Test print bitmap now includes printer name, IP, connection type

## Key API Endpoints
- POST /api/print-queue (submit print job)
- GET /api/print-queue/pending (agent pulls jobs + heartbeat)
- GET /api/print-queue/agent-status (frontend checks real agent status)
- PUT /api/print-queue/{job_id}/complete
- PUT /api/print-queue/{job_id}/failed
- DELETE /api/print-queue/cleanup
- POST /api/cash-register/close
- GET /api/shifts/current, /api/shifts/cashiers-list
- GET /api/print-agent-version, /api/download-print-agent

## Key DB Collections
- `print_queue`: Print jobs for local agent
- `agent_heartbeats`: Agent heartbeat timestamps (device_id, last_seen, version, status)
- `cash_register_closings`: Historical closing data

## Backlog
- (P2) Refactor server.py (19k+ lines) into modular routes
- (P2) Refactor Dashboard.js, POS.js, Settings.js into smaller components
