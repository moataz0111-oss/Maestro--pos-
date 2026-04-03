# Maestro POS - PRD

## Print System v3.0 - Browser Canvas Rendering

### Architecture:
```
Browser Canvas → ESC/POS Bitmap → Print Agent (localhost:9999) → Printer
```

### Files:
- `receiptBitmap.js` - Canvas-based receipt renderer (Arabic native)
- `printService.js` - v3.0: Uses browser rendering, sends raw bytes to agent
- `AgentUpdateChecker.js` - Auto-update banner for print agent
- `print_server.ps1` - v2.2: Accepts raw_data base64, improved logging
- `receipt_renderer.py` - Server backup renderer (not primary)

### Agent Auto-Update System:
- Backend: `/api/print-agent-version` returns latest version
- Frontend: Checks agent version vs server version every 60 seconds
- If mismatch → amber banner appears: "تحديث وسيط الطباعة متاح (1.0 → 2.2.0)"
- User clicks "تحديث الوسيط" → downloads new agent file
- After update → banner disappears automatically
- Shows in POS and Settings (Printers tab)

### Print Flow:
1. POS calls `sendReceiptPrint(printer, orderData)`
2. `renderReceiptBitmap()` renders on Canvas with RTL Arabic
3. Canvas → 1-bit bitmap → ESC/POS GS v 0 → base64
4. Sends `{raw_data, usb_printer_name/ip/port}` to agent
5. Agent sends raw bytes to printer

### Kitchen Routing:
- Products have `printer_ids[]` linking to kitchen printers
- `routeOrderToPrinters()` maps items to printers
- Each printer gets its own receipt with only assigned items
- Kitchen: show_prices=false, larger font, section_name

## Credentials
- Admin: hanialdujaili@gmail.com / Hani@2024
- Super Admin: owner@maestroegp.com / owner123 (Secret: 271018)
- Test Cashier: cashier@test.com / Test@1234

## Completed
- [x] Browser Canvas receipt renderer
- [x] ESC/POS bitmap conversion in JavaScript
- [x] Print agent auto-update banner
- [x] Complete printService.js rewrite (v3.0)
- [x] Kitchen printer routing
- [x] Print agent v2.2 with logging

## Upcoming Tasks
- P0: Multi-Restaurant (Tenant) Switcher
- P1: ZKTeco Fingerprint Integration
- P2: Refactor server.py (18K+ lines)
- P2: Refactor SuperAdmin.js & Settings.js
