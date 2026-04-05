# Maestro POS - PRD

## Original Problem Statement
Multi-tenant POS system (React + FastAPI + MongoDB) requiring:
- Multi-printer support (USB cashier, Ethernet kitchen)
- Arabic text via Canvas -> ESC/POS
- 65mm receipt formatting (bold fonts, logo, QR code, no blank spaces)
- Kitchen routing: products print to assigned printers
- Order/Product notes saving and printing
- Offline mode, order modifications
- ZKTeco fingerprint device integration

## Architecture
```
Browser Canvas -> ESC * 33 -> base64 -> Agent v2.4.0 -> Chunked Write -> Printer
Browser -> localhost:9999/zk-* -> Agent v2.4.0 -> UDP ZK Protocol -> ZKTeco Device
```

## Credentials
- Admin: hanialdujaili@gmail.com / Hani@2024
- Super Admin: owner@maestroegp.com / owner123 (Secret: 271018)
- Test Cashier: cashier@test.com / Test@1234

## Completed
- [x] ESC * 33 column-mode encoding
- [x] Agent v2.3.0 with chunked USB/TCP WritePrinter
- [x] Fixed false success in kitchen printing
- [x] Fixed printer_type mismatch (use print_mode)
- [x] Redesigned receipt to 65mm, ALL bold fonts, QR Code + System Logo
- [x] Optimized print speed (skip blank lines, parallel requests)
- [x] Fixed kitchen ticket repeating/wrong items
- [x] Fixed loadOrderForEditing extras loading
- [x] (2026-04-05) Fixed Product Notes and Order Notes not saving to DB
- [x] (2026-04-05) Fixed handlePrintBill missing notes:orderNotes
- [x] (2026-04-05) Added PUT /api/orders/{id}/update-items endpoint
- [x] (2026-04-05) Extras quantity counter: +/- buttons in modal
- [x] (2026-04-05) Product quantity badge in extras modal
- [x] (2026-04-05) Receipt: base product price only, extras listed separately
- [x] (2026-04-05) **Agent v2.4.0**: ZKTeco support via local agent
  - ZK Protocol over UDP (C# ZKHelper class)
  - /zk-test: Test connection to device
  - /zk-sync: Download attendance logs
  - /zk-users: Get registered users
  - /zk-push-user: Push employee to device
  - /zk-delete-user: Delete user from device
  - Auto-kill old agent on startup
- [x] (2026-04-05) Frontend BiometricDevices: Routes through localhost:9999
- [x] (2026-04-05) Agent status card with online/offline indicator
- [x] (2026-04-05) POST /api/biometric/devices/{id}/sync-from-agent endpoint
- [x] (2026-04-05) Employee biometric_uid field + push to device UI
- [x] (2026-04-05) "إصدار للبصمة" per employee + "إصدار الكل للبصمة" bulk push

## Extras Data Structure
```json
{ "id": "ext1", "name": "بيبسي كومبو", "price": 750, "quantity": 2 }
```

## Key Files
- `/app/frontend/src/pages/POS.js` - Main POS (4.4K+ lines)
- `/app/frontend/src/pages/HR.js` - HR with biometric push (2.1K+ lines)
- `/app/frontend/src/components/BiometricDevices.js` - Biometric device management
- `/app/frontend/src/utils/receiptBitmap.js` - Receipt Canvas -> ESC/POS
- `/app/frontend/src/utils/printService.js` - Print routing
- `/app/backend/server.py` - Backend monolith (18K+ lines)
- `/app/backend/static/print_server.ps1` - Local agent v2.4.0

## Key API Endpoints
- POST /api/orders - Create order
- PUT /api/orders/{id}/update-items - Update items, notes, discount
- POST /api/biometric/devices - Create biometric device
- POST /api/biometric/devices/{id}/sync-from-agent - Sync attendance from agent
- PUT /api/employees/{id} - Update employee (incl. biometric_uid)

## Upcoming Tasks
- P0: Multi-Restaurant (Tenant) Switcher
- P2: Refactor server.py (18K+ lines)
- P2: Refactor POS.js, Settings.js, SuperAdmin.js
