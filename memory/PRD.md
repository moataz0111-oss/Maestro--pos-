# Maestro Restaurant POS System - PRD

## Original Problem Statement
Multi-tenant POS system (React + FastAPI + MongoDB) with role-based access, POS interface, PWA offline support, shift/cash register management, and dynamic thermal printing.

## Architecture
```
/app
├── frontend/ (React + Shadcn UI + Tailwind)
│   ├── src/pages/ (Dashboard, Reports, POS, Settings, Expenses, Delivery, etc.)
│   ├── src/utils/ (printService.js v2.2 - USB + Ethernet + routing fix)
├── backend/
│   ├── server.py (Main monolith ~18k lines)
│   ├── static/ (print_server.ps1 v2.2 - Arabic bitmap rendering via ReceiptRenderer)
```

## Completed Features (Latest Session - April 3, 2026)
34. **Arabic Bitmap Receipt Rendering** - Complete rewrite of Build-Receipt:
    - Uses ReceiptRenderer C# class to render ALL text as bitmap images (ESC/POS GS v 0)
    - Fixes garbled Arabic text on thermal printers (bypasses codepage limitations)
    - Fixed critical PowerShell bug: `[char]+[char]` integer addition replaced with `"$([char]0xXXXX)"` string interpolation
    - Supports both receipt (with prices) and kitchen (without prices, larger font) formats
    - Includes extras, notes, payment method, cashier name, buzzer number in receipt

35. **handleSubmitOrder Printing** - Submit button (checkmark) now prints:
    - Invoice to cashier printer (printer_type='receipt') with full details
    - Kitchen items routed to assigned kitchen printers based on product-printer mapping
    - Payment method, cashier name, branch phone included in cashier receipt

36. **Kitchen Routing Fix (routeOrderToPrinters v2)** - Robust product-to-printer routing:
    - Handles null/undefined/invalid printer_ids gracefully
    - Validates printer exists in available list before routing
    - Falls back to default kitchen printer if assigned printer not found
    - Default printer changed from 'receipt' to 'kitchen' type for kitchen routing context

## Previous Completed Features
23. **USB Silent Printing via Print Agent** - Major printing architecture upgrade
22. **Print Agent Background Service (v2.0)** - Hidden Windows background service
21. **Printer Connection Type (USB vs Network)** - connection_type field in printer config
24. **Print Agent Installer Kill Fix v2** - WMIC kill logic
25. **Print Agent Path Space Fix** - Quoted paths for spaces
26. **Auto Kitchen Printing on Order Submit** - handleSaveAndSendToKitchen
27. **Silent Invoice Printing** - Print Agent for one-step silent printing
28. **Receipt Footer: Restaurant Logo** - Restaurant logo in receipt footer
29. **Branch Name Above Order Type** - Branch name/phone above order type
30. **Silent Invoice Print (No Second Page)** - @media print CSS overlay
31. **Invoice = Cashier Only** - Invoice prints only to cashier printer
32. **Kitchen Print via ChefHat Button** - Product-printer routing in kitchen dialog
33. **Kitchen Receipt Language** - Arabic/English based on system language

## Key Technical Flow
### Printing Architecture v2.2:
1. **Order placed via Submit (checkmark)** -> Cashier receipt + Kitchen items routed per product
2. **Order placed via Chef Hat** -> Kitchen items routed per product (no cashier receipt)
3. **Print Bill button** -> Opens preview dialog, prints to cashier only
4. **Arabic text** -> ReceiptRenderer converts text to bitmap -> ESC/POS raster image commands
5. **USB Printer** -> RawPrinterHelper.SendBytesToPrinter() -> Windows Spooler
6. **Ethernet Printer** -> TCP Socket -> IP:Port
7. **Fallback** (Agent offline) -> Browser window.print() dialog

## Pending Issues
- None

## Upcoming Tasks
- P0: Multi-Restaurant Tenant Switcher
- P1: ZKTeco Fingerprint Integration
- P2: Refactor server.py (18k+ lines)
- P2: Refactor SuperAdmin.js / Settings.js

## Key Credentials
- Admin: hanialdujaili@gmail.com / Hani@2024
- Super Admin: owner@maestroegp.com / owner123 (Secret: 271018)
- Test Cashier: cashier@test.com / Test@1234

## Key DB Schema
- `printers`: name, ip_address, port, connection_type, usb_printer_name, branch_id, printer_type, print_mode, show_prices
- `products`: name, price, category_id, printer_ids (List of printer IDs for kitchen routing)
