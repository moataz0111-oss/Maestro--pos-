# Maestro POS - PRD

## Print System v4.1 - Single GS v 0 Image (Fixed)

### Architecture:
```
Browser Canvas → ESC/POS (single GS v 0) → Print Agent (localhost:9999) → Printer
```

### Critical Fix (Apr 2026):
- **Before**: Image split into 24px strips, each as separate GS v 0 command → SAM4S printer overwrites each strip (only footer visible)
- **After**: Entire image sent as ONE GS v 0 command → Complete receipt prints correctly

### Files:
- `receiptBitmap.js` - Canvas renderer v2, ESC/POS single-image encoder, test page renderer
- `printService.js` - v3.1: USB test uses bitmap, all invoice settings passed
- `AgentUpdateChecker.js` - v4: Flexible semver comparison
- `print_server.ps1` - v2.2: Accepts raw_data base64

### Kitchen Dialog:
- Shows each cart item with its linked kitchen printer badge
- Real-time status: orange=sending → green=success / red=error
- Dialog stays 30 seconds after completion, with "Done" button for immediate close

## Credentials
- Admin: hanialdujaili@gmail.com / Hani@2024
- Super Admin: owner@maestroegp.com / owner123 (Secret: 271018)
- Test Cashier: cashier@test.com / Test@1234

## Completed
- [x] Browser Canvas receipt renderer (matches POS preview)
- [x] Single GS v 0 ESC/POS encoding (fixes strip overlap) - Apr 2026
- [x] USB test print uses full Arabic bitmap - Apr 2026
- [x] Kitchen dialog with per-item printer status - Apr 2026
- [x] AgentUpdateChecker semver comparison - Apr 2026
- [x] buildPrintOrderData includes all invoice settings - Apr 2026

## Upcoming Tasks
- P0: Multi-Restaurant (Tenant) Switcher
- P1: ZKTeco Fingerprint Integration
- P2: Refactor server.py (18K+ lines)
- P2: Refactor SuperAdmin.js, Settings.js, POS.js
