# Maestro POS - PRD

## Print Receipt Format v5.0 (Professional Two-Column Layout)

### Technical Architecture:
- `receipt_renderer.py` - Server-side bitmap generator using Pillow + arabic_reshaper + python-bidi
- `POST /api/print/render-receipt` - Returns base64 ESC/POS bytes
- `printService.js` - Fetches bitmap from backend API_URL, sends to print agent
- `print_server.ps1` v2.2 - Local agent accepts raw_data base64 + improved logging

### Print Flow:
1. Frontend calls `/api/print/render-receipt` with order data
2. Backend reshapes Arabic text (arabic_reshaper + python-bidi) and renders bitmap
3. Returns base64 ESC/POS data
4. Frontend sends to local print agent (localhost:9999/print-receipt)
5. If server render fails → falls back to local agent rendering + warning
6. Kitchen printers: auto show_prices=false

### Arabic Text Fix (2026-04-03):
- **Root cause**: Production server lacked libraqm OS package
- **Fix**: Switched from libraqm to pure Python arabic_reshaper + python-bidi
- No OS-level dependencies needed anymore

## Credentials
- Admin: hanialdujaili@gmail.com / Hani@2024
- Super Admin: owner@maestroegp.com / owner123 (Secret: 271018)
- Test Cashier: cashier@test.com / Test@1234

## Completed
- [x] Receipt renderer with Arabic support (arabic_reshaper + python-bidi)
- [x] Professional two-column receipt layout v5
- [x] Kitchen receipts without prices
- [x] Print agent v2.2 with improved logging
- [x] Fixed API URL in printService.js
- [x] Removed window.print() fallback
- [x] Smart printer lookup (receipt → USB → any)
- [x] Detailed console logging for debugging
- [x] Fallback to local agent rendering when server fails

## Upcoming Tasks
- P0: Multi-Restaurant (Tenant) Switcher
- P1: ZKTeco Fingerprint Integration
- P2: Refactor server.py (18K+ lines)
- P2: Refactor SuperAdmin.js & Settings.js
