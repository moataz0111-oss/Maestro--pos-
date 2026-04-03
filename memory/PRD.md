# Maestro POS - PRD

## Print Receipt Format v4.0 (Professional Two-Column Layout)

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
- `printService.js` - Fetches bitmap from server, sends to print agent
- `print_server.ps1` - Accepts `raw_data` base64 or local fallback
- `buildPrintOrderData()` - POS.js helper with all fields

## Credentials
- Admin: hanialdujaili@gmail.com / Hani@2024
- Super Admin: owner@maestroegp.com / owner123 (Secret: 271018)

## Upcoming: P0 Multi-Restaurant Switcher | P1 ZKTeco | P2 Refactoring
