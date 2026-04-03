# Maestro Restaurant POS System - PRD

## Original Problem Statement
Multi-tenant POS system (React + FastAPI + MongoDB) with role-based access, POS interface, PWA offline support, shift/cash register management, and dynamic thermal printing.

## Architecture
```
/app
├── frontend/ (React + Shadcn UI + Tailwind)
│   ├── src/pages/ (Dashboard, Reports, POS, Settings, Expenses, Delivery, etc.)
│   ├── src/utils/ (printService.js v3.0 - Server-side bitmap + USB/Ethernet routing)
├── backend/
│   ├── server.py (Main monolith ~18k lines)
│   ├── receipt_renderer.py (Python Pillow bitmap receipt generator - Arabic support)
│   ├── static/ 
│   │   ├── print_server.ps1 v3.0 (Accepts pre-rendered base64 bitmap data)
│   │   ├── fonts/ (Cairo-Variable.ttf, NotoSansArabic-Bold.ttf)
```

## Completed Features (April 3, 2026 - Current Session)

### Arabic Receipt Bitmap Rendering (SERVER-SIDE)
- **NEW: Python Pillow receipt renderer** (`receipt_renderer.py`):
  - Generates ESC/POS raster bitmap (GS v 0) from order data
  - Uses Cairo font (supports Arabic + Latin + Numbers)
  - `arabic_reshaper` + `python-bidi` for proper Arabic text shaping & RTL
  - Two modes: Invoice (show_prices=true) and Kitchen ticket (show_prices=false, larger font)
  - Includes: restaurant name, order#, type, table, buzzer, items, extras, notes, discount, total, payment method, cashier name
  
- **NEW API endpoint**: `POST /api/print/render-receipt` → Returns base64 ESC/POS bytes

- **Updated `printService.js` v3.0**:
  - `sendReceiptPrint()` now calls server first to generate bitmap, then sends to print agent
  - Fallback: if server render fails, print agent builds receipt locally (UTF-8)

- **Updated `print_server.ps1` v3.0**:
  - `/print-receipt` now checks for `raw_data` (base64 bitmap) in payload
  - If present: decodes and sends directly to printer (guaranteed Arabic support)
  - If absent: falls back to local Build-Receipt (C# ReceiptRenderer or UTF-8)

### handleSubmitOrder Now Prints
- Submit button (checkmark) now triggers:
  1. Invoice to cashier printer (printer_type='receipt')
  2. Kitchen items routed to assigned printers based on product-printer mapping
  
### Kitchen Routing Fix
- `routeOrderToPrinters` handles null/undefined/invalid printer_ids
- Validates target printer exists before routing
- Default printer changed from 'receipt' to 'kitchen' for kitchen context
- Editing existing orders now also prints new items to kitchen

### .gitignore Fix
- Removed 100+ malformed entries blocking .env files
- Added test_credentials.md to .gitignore

## Previous Completed Features
23-33. USB Silent Printing, Print Agent Background Service, Printer Connection Types, Kill Fix, Path Fix, Kitchen Printing, Receipt Layout, Font Sizes, Silent Invoice, etc.

## Key Technical Flow - Printing v3.0
```
1. User clicks Print/Submit/Chef → Frontend builds order data
2. Frontend → POST /api/print/render-receipt (server generates bitmap)
3. Server: Python Pillow renders Arabic text → ESC/POS raster bytes → base64
4. Frontend → POST localhost:9999/print-receipt (with raw_data base64)
5. Print Agent: Decodes base64 → sends raw bytes to printer (USB or TCP)
6. Printer: Receives raster image → prints bitmap (Arabic is an IMAGE, not text)
```

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

## Dependencies Added
- Pillow (PIL) - Image generation
- arabic_reshaper - Arabic character shaping
- python-bidi - Bidirectional text algorithm
- Cairo font (Cairo-Variable.ttf) - Arabic+Latin+Numbers support
