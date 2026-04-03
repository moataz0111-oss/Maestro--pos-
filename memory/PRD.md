# Maestro Restaurant POS System - PRD

## Original Problem Statement
Multi-tenant POS system (React + FastAPI + MongoDB) with role-based access, POS interface, PWA offline support, shift/cash register management, and dynamic thermal printing.

## Architecture
```
/app
├── frontend/ (React + Shadcn UI + Tailwind)
│   ├── src/pages/ (Dashboard, Reports, POS, Settings, Expenses, Delivery, etc.)
│   ├── src/utils/ (printService.js v2.1 - USB + Ethernet support)
├── backend/
│   ├── server.py (Main monolith ~18k lines)
│   ├── static/ (print_server.ps1 v2.1 - USB via Windows Spooler + Ethernet via TCP)
```

## Completed Features (Latest Session - March 31, 2026)
23. **USB Silent Printing via Print Agent** - Major printing architecture upgrade:
    - Print Agent (print_server.ps1 v2.1) now handles BOTH USB and Ethernet printers
    - USB printers: Uses Windows Print Spooler (RawPrinterHelper via Win32 API winspool.drv)
    - Ethernet printers: Uses direct TCP connection (unchanged)
    - New endpoint `/list-printers`: Lists available Windows printers
    - `/print-test`, `/print-receipt`, `/print-raw` all accept `usb_printer_name` parameter
    - POS.js routes ALL printers through Print Agent (no browser dialog needed)
    - Browser dialog only appears as fallback when Print Agent is offline
    - Settings: USB printer form shows `usb_printer_name` field with auto-discovery from Windows
    - Backend model: Added `usb_printer_name` field to PrinterCreate

22. **Print Agent Background Service (v2.0)** - Hidden Windows background service
21. **Printer Connection Type (USB vs Network)** - connection_type field in printer config

## Key Technical Flow
### Printing Architecture v2.1:
1. **Order placed** → POS.js sends to ALL configured printers via Print Agent
2. **USB Printer** → Print Agent → `RawPrinterHelper.SendBytesToPrinter()` → Windows Spooler → USB printer (SILENT)
3. **Ethernet Printer** → Print Agent → TCP Socket → IP:Port → Ethernet printer (SILENT)
4. **Fallback** (Agent offline) → Browser `window.print()` dialog

## Completed Features (April 2026)
24. **Print Agent Installer Kill Fix v2** - Complete rewrite of kill logic:
    - Uses WMIC to kill PowerShell/WScript processes by command line match (not port PID)
    - Deletes entire MaestroPrintAgent directory (`rd /s /q`)
    - Waits for port 9999 to be free with retry loop before installing
    - Solves PID 4 (System/HTTP.SYS) issue that made old approach impossible
25. **Print Agent Path Space Fix** - Fixed Start-Process ArgumentList to properly quote paths with spaces (e.g., "Graffiti zeona" username)
26. **Auto Kitchen Printing on Order Submit** - `handleSubmitOrder` now triggers print routing to kitchen/receipt printers via Print Agent
27. **Silent Invoice Printing** - Print button in invoice dialog uses Print Agent for one-step silent printing (falls back to browser if agent offline)
28. **Receipt Footer: Restaurant Logo** - Replaced Maestro EGP system logo with restaurant's own logo in receipt footer
29. **Branch Name Above Order Type** - Moved branch name and phone to appear above order type in receipt template
30. **Silent Invoice Print (No Second Page)** - Replaced iframe.contentWindow.print() with same-page window.print() using @media print CSS overlay. Agent route prints only to cashier printer.
31. **Invoice = Cashier Only** - Removed kitchen printing from handlePrintBill. Invoice button now ONLY prints to cashier printer.
32. **Kitchen Print via ChefHat Button** - Added product-printer routing in kitchen dialog handler. Each product prints to its assigned kitchen printer.
33. **Kitchen Receipt Language** - Build-Receipt in print_server.ps1 now supports Arabic/English based on system language setting.

## Pending Issues
- None

## Upcoming Tasks
- P0: Multi-Restaurant Tenant Switcher
- P1: ZKTeco Fingerprint Integration
- P2: Refactor server.py (18k+ lines)
- P2: Refactor SuperAdmin.js / Settings.js

## Key Credentials
- Admin: hanialdujaili@gmail.com / Hani@2024
- Super Admin: owner@maestroegp.com / owner123 (Secret: 271018)
- Test Cashier: cashier@test.com / Test@1234

## Key DB Schema
- `printers`: name, ip_address, port, connection_type, usb_printer_name, branch_id, printer_type, print_mode, show_prices
