# Maestro POS - PRD

## Print System v4.0 - Browser Canvas Rendering (Fixed)

### Architecture:
```
Browser Canvas → ESC/POS Bitmap → Print Agent (localhost:9999) → Printer
```

### Files:
- `receiptBitmap.js` - Canvas-based receipt renderer v2 (matches POS preview exactly)
- `printService.js` - v3.1: Passes all invoice settings to kitchen printers
- `AgentUpdateChecker.js` - v4: Flexible semver-like version comparison
- `print_server.ps1` - v2.2: Accepts raw_data base64, improved logging
- `receipt_renderer.py` - Server backup renderer (not primary)

### Agent Auto-Update System:
- Frontend: Checks agent version using semver >= comparison (major.minor)
- Handles version formats: "2.2.0", "2.2", "v2.2.0" etc.
- Banner hidden when agent unreachable (correct behavior)
- After download: polls every 5s to detect update

### Print Flow:
1. POS calls `sendReceiptPrint(printer, orderData)`
2. `renderReceiptBitmap()` renders on Canvas with RTL Arabic
3. Canvas → 1-bit bitmap → ESC/POS GS v 0 → base64
4. Sends `{raw_data, usb_printer_name/ip/port}` to agent
5. Agent sends raw bytes to printer

### Receipt Layout (matches POS preview):
1. Restaurant name (centered, bold)
2. Phone numbers (centered)
3. Address (centered)
4. Branch name (centered)
5. Tax number (if show_tax enabled)
6. Dashed separator
7. Invoice/Order number (centered, bold)
8. Date/Time
9. Cashier name
10. Dashed separator
11. Order type (centered, bold, large)
12. Order-specific details (table/buzzer/delivery info)
13. Custom header text
14. Double separator
15. Items table header (Name | Qty | Price)
16. Items list with extras and notes
17. Double separator
18. Subtotal
19. Discount (if any)
20. Total (bold, large)
21. Payment method
22. Custom footer
23. Dashed separator
24. Thank you message
25. Print timestamp
26. System name (Maestro EGP)

### Kitchen Receipt:
- Larger font, bold items
- Section name displayed prominently
- No prices, no subtotals
- No phone/address/tax info

### Kitchen Routing:
- Products have `printer_ids[]` linking to kitchen printers
- `routeOrderToPrinters()` maps items to printers
- Each printer gets its own receipt with only assigned items
- `buildPrintOrderData` passes all invoice settings for consistent receipt data
- Kitchen: show_prices=false, larger font, section_name

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

## Upcoming Tasks
- P0: Multi-Restaurant (Tenant) Switcher
- P1: ZKTeco Fingerprint Integration
- P2: Refactor server.py (18K+ lines)
- P2: Refactor SuperAdmin.js & Settings.js
- P2: Refactor POS.js (4K+ lines)
