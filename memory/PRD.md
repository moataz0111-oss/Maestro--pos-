# Maestro POS - PRD

## Print System v3.0 - Browser Canvas Rendering

### Architecture (Complete Rewrite 2026-04-03):
```
Browser Canvas → ESC/POS Bitmap → Print Agent → Printer
```

### Files:
- `receiptBitmap.js` - NEW: Canvas-based receipt renderer (Arabic native support)
- `printService.js` - REWRITTEN: Uses browser rendering, sends raw bytes to agent
- `print_server.ps1` - v2.2: Accepts raw_data base64, improved logging
- `receipt_renderer.py` - BACKUP: Server-side renderer (no longer primary)

### Print Flow:
1. User clicks Print/Save&Send in POS
2. `sendReceiptPrint()` calls `renderReceiptBitmap()` 
3. Canvas renders receipt with Arabic text (browser native RTL)
4. Canvas → 1-bit bitmap → ESC/POS GS v 0 commands → base64
5. Sends `{raw_data, usb_printer_name/ip/port}` to localhost:9999/print-receipt
6. Print agent decodes base64 and sends bytes to printer

### Why Canvas (not Server):
- Browser natively supports Arabic text rendering
- No server dependencies (libraqm, fonts, packages)
- Works offline
- Same code in preview and production
- Instant rendering (no network round-trip)

### Receipt Layout:
- Restaurant name (centered, bold)
- Section name for kitchen (centered)
- Order number + type (two columns)
- Cashier + date/time
- Table/Buzzer/Driver info
- Items with price or qty only
- Total + payment method (cashier only)
- Footer: شكرا لزيارتكم

### Kitchen vs Cashier:
- Kitchen: show_prices=false, larger font, section_name shown
- Cashier: show_prices=true, total, payment method, full receipt

## Credentials
- Admin: hanialdujaili@gmail.com / Hani@2024
- Super Admin: owner@maestroegp.com / owner123 (Secret: 271018)
- Test Cashier: cashier@test.com / Test@1234

## Completed
- [x] Browser Canvas receipt renderer (receiptBitmap.js)
- [x] Complete printService.js rewrite (v3.0)
- [x] Arabic text via Canvas RTL direction
- [x] ESC/POS bitmap conversion in JavaScript
- [x] Kitchen printer routing by product.printer_ids
- [x] Print agent v2.2 with MemoryStream + logging
- [x] Error messages in Arabic for all failure cases

## Upcoming Tasks
- P0: Multi-Restaurant (Tenant) Switcher
- P1: ZKTeco Fingerprint Integration
- P2: Refactor server.py (18K+ lines)
- P2: Refactor SuperAdmin.js & Settings.js
