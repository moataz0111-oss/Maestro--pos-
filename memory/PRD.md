# Maestro POS - PRD

## Print System v4.0 - Browser Canvas Rendering

### Architecture:
```
Browser Canvas → ESC/POS Bitmap → Print Agent (localhost:9999) → Printer
```

### Files:
- `receiptBitmap.js` - Canvas-based receipt renderer v2 + test page renderer (Arabic native)
- `printService.js` - v3.1: Passes all invoice settings, USB test uses bitmap
- `AgentUpdateChecker.js` - v4: Flexible semver-like version comparison
- `print_server.ps1` - v2.2: Accepts raw_data base64, improved logging

### Kitchen Dialog (NEW):
- Shows each cart item individually with quantity
- Under each item: printer badge showing linked kitchen printer name
- On "Save & Send": printer badges animate (orange → green/red)
- Dialog stays 30 seconds after completion to show print status
- "Done" button appears after print to close immediately
- Items with no assigned printer show "لا توجد طابعة" badge

### USB Test Print:
- Uses Canvas bitmap (large Arabic page) via `/print-receipt` instead of plain text `/print-test`
- Uses `renderTestBitmap()` from `receiptBitmap.js`

### Receipt Layout (matches POS preview):
1. Restaurant name, Phone, Address, Branch, Tax number
2. Invoice/Order number, Date/Time, Cashier
3. Order type + details (table/buzzer/delivery)
4. Items table (Name | Qty | Price) with extras and notes
5. Subtotal, Discount, Total, Payment method
6. Custom header/footer, Thank you message

### Kitchen Routing:
- Products have `printer_ids[]` linking to kitchen printers
- `routeOrderToPrinters()` maps items to printers
- `getCartItemPrinterMap()` resolves printer names for display
- Each printer gets its own receipt with only assigned items

## Credentials
- Admin: hanialdujaili@gmail.com / Hani@2024
- Super Admin: owner@maestroegp.com / owner123 (Secret: 271018)
- Test Cashier: cashier@test.com / Test@1234

## Completed
- [x] Browser Canvas receipt renderer v2 (matches POS preview exactly) - Apr 2026
- [x] ESC/POS bitmap conversion in JavaScript
- [x] Print agent auto-update banner (semver comparison)
- [x] Complete printService.js rewrite (v3.1)
- [x] Kitchen printer routing with real-time status feedback
- [x] USB test print uses full Arabic bitmap - Apr 2026
- [x] Kitchen Dialog redesign: shows items + printers + status - Apr 2026
- [x] buildPrintOrderData includes all invoice settings

## Upcoming Tasks
- P0: Multi-Restaurant (Tenant) Switcher
- P1: ZKTeco Fingerprint Integration
- P2: Refactor server.py (18K+ lines)
- P2: Refactor SuperAdmin.js, Settings.js, POS.js
