# Maestro POS - PRD

## Original Problem Statement
Multi-tenant POS system (React + FastAPI + MongoDB) requiring:
- Multi-printer support (USB cashier, Ethernet kitchen)
- Arabic text via Canvas -> ESC/POS
- 65mm receipt formatting (bold fonts, logo, QR code, no blank spaces)
- Kitchen routing: products print to assigned printers
- Order/Product notes saving and printing
- Offline mode, order modifications

## Print System v5.1 - Chunked WritePrinter Fix

### Architecture:
```
Browser Canvas -> ESC * 33 -> base64 -> Agent v2.3.0 -> Chunked Write -> Printer
```

## Credentials
- Admin: hanialdujaili@gmail.com / Hani@2024
- Super Admin: owner@maestroegp.com / owner123 (Secret: 271018)
- Test Cashier: cashier@test.com / Test@1234

## Completed
- [x] ESC * 33 column-mode encoding
- [x] Agent v2.3.0 with chunked USB WritePrinter (1KB chunks, 15ms delay)
- [x] Agent v2.3.0 with chunked TCP Write (1KB chunks, 10ms delay)
- [x] Fixed pending orders showing table UUID -> now shows table number
- [x] Kitchen dialog with per-item printer status
- [x] Printer settings show linked product count
- [x] AgentUpdateChecker semver comparison (requires 2.3+)
- [x] Fixed false success in kitchen printing on existing orders
- [x] Fixed printer_type mismatch (use print_mode instead)
- [x] Fixed IndexedDB boolean key error in offlineDB.js
- [x] Redesigned receipt to 65mm, ALL bold fonts, QR Code + System Logo
- [x] Optimized print speed (skip blank lines, parallel requests)
- [x] Fixed kitchen ticket repeating/wrong items
- [x] Fixed loadOrderForEditing extras loading
- [x] (2026-04-05) Fixed Product Notes and Order Notes not saving to DB
- [x] (2026-04-05) Fixed handlePrintBill missing notes:orderNotes in payload
- [x] (2026-04-05) Fixed editing path to use new update-items endpoint
- [x] (2026-04-05) Fixed add-items endpoint missing extras field
- [x] (2026-04-05) Fixed loadOrderForEditing missing product_name field
- [x] (2026-04-05) Added PUT /api/orders/{id}/update-items endpoint

## Key Files
- `/app/frontend/src/pages/POS.js` - Main POS page (4.3K+ lines)
- `/app/frontend/src/utils/receiptBitmap.js` - Receipt rendering (Canvas -> ESC/POS)
- `/app/frontend/src/utils/printService.js` - Print routing to kitchen/cashier printers
- `/app/backend/server.py` - Backend monolith (18K+ lines)

## Key API Endpoints
- POST /api/orders - Create order
- GET /api/orders/{id} - Fetch order
- PUT /api/orders/{id}/update-items - Update all items, notes, discount
- PUT /api/orders/{id}/add-items - Add new items to existing order
- PUT /api/orders/{id}/status - Update order status
- PUT /api/orders/{id}/payment - Set payment method

## Upcoming Tasks
- P0: Multi-Restaurant (Tenant) Switcher
- P1: ZKTeco Fingerprint Integration
- P2: Refactor server.py (18K+ lines)
- P2: Refactor SuperAdmin.js, Settings.js, POS.js
