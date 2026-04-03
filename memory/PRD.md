# Maestro POS - PRD

## Print System v4.0 - Browser Canvas Rendering (Fixed)

### Architecture:
```
Browser Canvas → ESC/POS Bitmap → Print Agent (localhost:9999) → Printer
```

### Files:
- `receiptBitmap.js` - Canvas-based receipt renderer v2 + test page renderer (Arabic native)
- `printService.js` - v3.1: Passes all invoice settings, USB test uses bitmap
- `AgentUpdateChecker.js` - v4: Flexible semver-like version comparison
- `print_server.ps1` - v2.2: Accepts raw_data base64, improved logging

### USB Test Print:
- Previously: Small English text via `/print-test` (plain ESC/POS text commands)
- Now: Full Arabic bitmap test page via Canvas → `/print-receipt` (same as kitchen test)
- Shows: Printer name, USB name, branch, date/time, success message in Arabic
- Uses `renderTestBitmap()` from `receiptBitmap.js`

### Agent Auto-Update System:
- Frontend: Checks agent version using semver >= comparison (major.minor)
- Handles version formats: "2.2.0", "2.2", "v2.2.0" etc.
- Banner hidden when agent unreachable (correct behavior)

### Print Flow:
1. POS calls `sendReceiptPrint(printer, orderData)`
2. `renderReceiptBitmap()` renders on Canvas with RTL Arabic
3. Canvas → 1-bit bitmap → ESC/POS GS v 0 → base64
4. Sends `{raw_data, usb_printer_name/ip/port}` to agent
5. Agent sends raw bytes to printer

### Receipt Layout (matches POS preview):
1. Restaurant name, Phone, Address, Branch, Tax number
2. Invoice/Order number, Date/Time, Cashier
3. Order type + details (table/buzzer/delivery)
4. Items table (Name | Qty | Price) with extras and notes
5. Subtotal, Discount, Total, Payment method
6. Custom header/footer, Thank you message
7. System name

### Kitchen Routing:
- Products have `printer_ids[]` linking to kitchen printers
- `routeOrderToPrinters()` maps items to printers
- Each printer gets its own receipt with only assigned items
- `buildPrintOrderData` passes all invoice settings

## Credentials
- Admin: hanialdujaili@gmail.com / Hani@2024
- Super Admin: owner@maestroegp.com / owner123 (Secret: 271018)
- Test Cashier: cashier@test.com / Test@1234

## Completed
- [x] Browser Canvas receipt renderer v1
- [x] ESC/POS bitmap conversion in JavaScript
- [x] Print agent auto-update banner
- [x] Complete printService.js rewrite (v3.0)
- [x] Kitchen printer routing
- [x] Print agent v2.2 with logging
- [x] Receipt Canvas rewrite to match POS preview exactly (v2) - Apr 2026
- [x] buildPrintOrderData includes all invoice settings - Apr 2026
- [x] AgentUpdateChecker flexible version comparison (semver) - Apr 2026
- [x] printOrderToAllPrinters passes invoice settings to kitchen printers - Apr 2026
- [x] USB test print now uses full Arabic bitmap (same as kitchen) - Apr 2026

## Upcoming Tasks
- P0: Multi-Restaurant (Tenant) Switcher
- P1: ZKTeco Fingerprint Integration
- P2: Refactor server.py (18K+ lines)
- P2: Refactor SuperAdmin.js & Settings.js & POS.js
