# Maestro POS - PRD

## Print System v5.1 - Chunked WritePrinter Fix

### Root Cause Found:
- `WritePrinter` Win32 API sends 40KB+ data in ONE call
- SAM4S GIANT-100 USB printer has ~4KB internal buffer
- Buffer overflows → printer only processes LAST chunk → only footer prints
- Same issue for Ethernet printers via TCP Write

### Fix (Agent v2.3.0):
- **USB**: `SendBytesToPrinter` now sends in 1024-byte chunks with 15ms delay between each
- **Ethernet**: `Send-ToPrinter` now sends in 1024-byte chunks with 10ms delay
- This gives the printer time to process each chunk before receiving the next one

### Files Modified:
- `print_server.ps1` v2.3.0 - Chunked USB + TCP writes
- `AgentUpdateChecker.js` - Now requires v2.3+
- `POS.js` - Fixed pending orders showing table UUID instead of number

### Architecture:
```
Browser Canvas → ESC * 33 → base64 → Agent v2.3.0 → Chunked Write → Printer
```

## Credentials
- Admin: hanialdujaili@gmail.com / Hani@2024
- Super Admin: owner@maestroegp.com / owner123 (Secret: 271018)
- Test Cashier: cashier@test.com / Test@1234

## Completed
- [x] ESC * 33 column-mode encoding
- [x] Agent v2.3.0 with chunked USB WritePrinter (1KB chunks, 15ms delay)
- [x] Agent v2.3.0 with chunked TCP Write (1KB chunks, 10ms delay)
- [x] Fixed pending orders showing table UUID → now shows table number
- [x] Kitchen dialog with per-item printer status
- [x] Printer settings show linked product count
- [x] AgentUpdateChecker semver comparison (requires 2.3+)

## Upcoming Tasks
- P0: Multi-Restaurant (Tenant) Switcher
- P1: ZKTeco Fingerprint Integration
- P2: Refactor server.py (18K+ lines)
- P2: Refactor SuperAdmin.js, Settings.js, POS.js
