# Maestro POS - PRD

## Print System v5.0 - ESC * Column-Mode (Fixed SAM4S)

### Architecture:
```
Browser Canvas → ESC * 33 (24-dot column) → Print Agent (localhost:9999) → Printer
```

### Critical Fix (Apr 2026):
- **GS v 0 (raster) failed**: SAM4S GIANT-100 has small image buffer, overwrites previous data → only footer prints
- **ESC * 33 (column-mode) fix**: Sends image 24 rows at a time with explicit line feeds → works on ALL thermal printers
- Each strip: `ESC * 33 nL nH [3 bytes per column × 384 columns]` + LF
- Line spacing set to 24 dots (`ESC 3 24`) for seamless strips

### Files:
- `receiptBitmap.js` - Canvas renderer + ESC * column-mode encoder + test page renderer
- `printService.js` - v3.1: USB test uses bitmap, all invoice settings passed
- `AgentUpdateChecker.js` - v4: Flexible semver comparison
- `print_server.ps1` - v2.2: Accepts raw_data base64

### Kitchen Dialog:
- Shows each cart item with its linked kitchen printer badge
- Real-time status: orange=sending → green=success / red=error
- Dialog stays 30 seconds, with "Done" button for immediate close

### Printer Settings:
- Each printer card shows count of linked products ("X منتج مربوط")
- Products link to printers via `printer_ids[]` in product edit form

### Receipt Layout (matches POS preview):
1. Restaurant name, Phone, Address, Branch, Tax number
2. Invoice/Order number, Date/Time, Cashier
3. Order type + details
4. Items table with extras and notes
5. Subtotal, Discount, Total, Payment method
6. Custom header/footer, Thank you message

## Credentials
- Admin: hanialdujaili@gmail.com / Hani@2024
- Super Admin: owner@maestroegp.com / owner123 (Secret: 271018)
- Test Cashier: cashier@test.com / Test@1234

## Completed
- [x] Browser Canvas receipt renderer (matches POS preview)
- [x] ESC * 33 column-mode encoding (fixes SAM4S buffer issue) - Apr 2026
- [x] USB test print uses full Arabic bitmap - Apr 2026
- [x] Kitchen dialog with per-item printer status - Apr 2026
- [x] Printer settings show linked product count - Apr 2026
- [x] AgentUpdateChecker semver comparison - Apr 2026
- [x] buildPrintOrderData includes all invoice settings

## Upcoming Tasks
- P0: Multi-Restaurant (Tenant) Switcher
- P1: ZKTeco Fingerprint Integration
- P2: Refactor server.py (18K+ lines)
- P2: Refactor SuperAdmin.js, Settings.js, POS.js
