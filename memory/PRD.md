# Maestro Restaurant POS System - PRD

## Architecture
```
/app
├── frontend/ (React + Shadcn UI + Tailwind)
│   ├── src/pages/ (POS.js - main POS with buildPrintOrderData helper)
│   ├── src/utils/ (printService.js v3.0 - Server bitmap + agent routing)
├── backend/
│   ├── server.py (Main monolith ~18k lines)
│   ├── receipt_renderer.py (Pillow + HarfBuzz/raqm - Arabic bitmap)
│   ├── static/
│   │   ├── print_server.ps1 v3.0 (Accepts base64 bitmap OR local build)
│   │   ├── fonts/ (Cairo-Variable.ttf)
```

## Current Session Fixes (April 3, 2026)

### Arabic Receipt - FINAL FIX
- **Root cause**: Pillow default layout doesn't connect Arabic letters
- **Solution**: Use `direction='rtl'` with HarfBuzz/raqm layout engine (built into Pillow)
- **Result**: Arabic text is perfectly connected and readable on thermal printers
- No more `arabic_reshaper` or `bidi` manual shaping - HarfBuzz handles everything
- Cairo font supports Arabic + Latin + Numbers

### Receipt Format
**Invoice (Cashier)**:
- Restaurant name + Branch name
- Invoice number + Order type
- Table/Buzzer number + Date + Customer name  
- Items with prices, notes, extras
- Discount + Total (large font) + Payment method + Cashier name
- "شكرا لزيارتكم" + Maestro EGP

**Kitchen Order**:
- Restaurant name + Branch name
- Invoice number + Order type
- Driver name + Delivery company (for delivery orders)
- Table number (for dine-in)
- Items with quantity ONLY - NO PRICES (large font 24px)
- Notes + Extras
- Maestro EGP

### handleSubmitOrder Printing
- Submit button prints invoice to cashier + routes items to kitchen printers
- Uses `buildPrintOrderData()` helper with branch_name, driver_name, delivery_company

### Kitchen Routing Fix  
- `routeOrderToPrinters` handles null/undefined printer_ids
- Editing existing orders also prints new items to kitchen
- Default printer = 'kitchen' type (not 'receipt')

## Print Flow v3.0
```
Frontend → POST /api/print/render-receipt (server generates bitmap with Pillow+HarfBuzz)
         → Returns base64 ESC/POS raster bytes
Frontend → POST localhost:9999/print-receipt (with raw_data field)
Agent    → Decodes base64 → Sends bytes to printer
Printer  → Prints bitmap image (Arabic is IMAGE, not text)
```

## Pending Issues
- None

## Upcoming Tasks
- P0: Multi-Restaurant Tenant Switcher
- P1: ZKTeco Fingerprint Integration
- P2: Refactor server.py, Settings.js, SuperAdmin.js

## Credentials
- Admin: hanialdujaili@gmail.com / Hani@2024
- Super Admin: owner@maestroegp.com / owner123 (Secret: 271018)
- Test Cashier: cashier@test.com / Test@1234

## Dependencies
- Pillow (with raqm/harfbuzz support) - Image generation + Arabic text shaping
- Cairo-Variable.ttf font - Arabic + Latin support
