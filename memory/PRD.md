# Maestro POS - PRD

## Print Receipt Format v5.0 (Professional Two-Column Layout)

### Layout:
```
[      Restaurant Logo      ]
[    Restaurant Name (24)    ]
[     Section Name (14)      ]
─────────────────────────────
طلب #36         |      داخلي
الصالة          |  الكاشير يامن
1:31:29 PM      |    3/4/2026
طاولة 5
─────────────────────────────
1 سموکی ریزو          5,000
2 تشیز برجر ميکس      6,000
>> بدون خس
3 بيبسي كبير           4,500
─────────────────────────────
خصم                   -1,000
الاجمالي              15,500
الدفع                   نقدي
─────────────────────────────
      شكرا لزيارتكم
         طلب#36
Printed On 03-04-2026 1:31:29 PM
        Maestro EGP
```

### Dynamic Fields by Order Type:
- **داخلي**: طاولة [number]
- **سفري**: الجهاز [buzzer] + اسم العميل
- **توصيل عادي**: السائق: [name]
- **توصيل شركة**: شركة التوصيل: [company] + العميل

### Kitchen Receipt: NO prices, large font (24px), items + qty only

### Technical:
- `direction='rtl'` + HarfBuzz/raqm for Arabic
- Cairo font (Arabic + Latin + Numbers)
- 12-hour time format with seconds (AM/PM)
- `section_name` from printer name
- Logo support via `logo_base64` field
- Two-column layout: `_two_col()` function

## Architecture
- `receipt_renderer.py` - Server-side Pillow bitmap generator
- `POST /api/print/render-receipt` - Returns base64 ESC/POS bytes
- `printService.js` - Fetches bitmap from server using API_URL, sends to print agent
- `print_server.ps1` - Accepts `raw_data` base64 for printing
- `buildPrintOrderData()` - POS.js helper with all fields

## Print Flow (Fixed 2026-04-03)
1. Frontend calls backend `/api/print/render-receipt` with order data + printer_config
2. Backend renders Arabic receipt as ESC/POS bitmap using Pillow+HarfBuzz
3. Returns base64 `raw_data` to frontend
4. Frontend sends `raw_data` to local print agent (localhost:9999/print-receipt)
5. Print agent decodes base64 and sends bytes directly to printer
6. Kitchen printers: `show_prices=false` (auto-detected by printer_type)
7. If render fails: returns RENDER_FAILED error (NO fallback to garbled text)
8. If agent not connected: Shows clear Arabic error message (NO window.print fallback)

## Error Messages (Arabic):
- Agent offline: "وسيط الطباعة غير متصل! تأكد من تشغيل برنامج الطباعة على الجهاز"
- Render failed: "فشل توليد الفاتورة من السيرفر"
- Cashier print failed: "فشل طباعة فاتورة الكاشير"
- Kitchen print failed: "فشل طباعة طلبات المطبخ"

## Credentials
- Admin: hanialdujaili@gmail.com / Hani@2024
- Super Admin: owner@maestroegp.com / owner123 (Secret: 271018)
- Test Cashier: cashier@test.com / Test@1234

## Completed
- [x] Receipt renderer with Arabic HarfBuzz support
- [x] Professional two-column receipt layout v5
- [x] Kitchen receipts without prices
- [x] Print agent accepts base64 raw data
- [x] Fixed printService.js API URL (window.location.origin → API_URL)
- [x] Fixed kitchen printer auto show_prices:false
- [x] Removed garbled text fallback
- [x] Removed window.print() fallback (was causing blank pages)
- [x] Added clear Arabic error messages for all print failures
- [x] Invoice prints ONLY to USB cashier printer (no browser dialog)

## Upcoming Tasks
- P0: Multi-Restaurant (Tenant) Switcher
- P1: ZKTeco Fingerprint Integration
- P2: Refactor server.py (18K+ lines)
- P2: Refactor SuperAdmin.js & Settings.js
