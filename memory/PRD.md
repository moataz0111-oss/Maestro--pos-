# Maestro EGP - Restaurant Management System PRD

## Original Problem Statement
نظام إدارة مطاعم متكامل يدعم لغات متعددة (عربي، إنجليزي، كردي). يشمل:
- نقطة البيع (POS)
- إدارة المخزون
- شاشة المطبخ
- إدارة التوصيل والسائقين
- إدارة الموظفين والرواتب
- التقارير الذكية
- قائمة الزبائن الرقمية

## Core Features Implemented

### ✅ Completed Features
1. **نظام الترجمة الشامل** (Completed: Feb 2025)
   - `useTranslation` hook with centralized dictionary
   - Supports Arabic (ar), English (en), Kurdish (ku)
   - Applied to: Login, Dashboard, Orders, DriverApp, Tables, POS, Settings
   - Direction-aware (RTL/LTR) based on language
   - 400+ translations in `/app/frontend/src/utils/autoTranslate.js`

2. **شاشة المطبخ المحسّنة** (Completed: Feb 2025)
   - Decoupled `kitchen_status` from main order status
   - Orders persist until marked "ready" by kitchen staff
   - Sound notification for new orders
   - Branch name display on each order

3. **نقطة البيع (POS)** (Completed)
   - Table filtering by branch
   - Changed "محلي" to "داخل المطعم"
   - Full translation support

4. **تطبيق السائق** (Completed)
   - Removed old DriverPortal.js
   - Unified routing to DriverApp.js
   - Full translation support

5. **Authentication System** (Completed)
   - JWT-based authentication
   - Role-based access (super_admin, admin, cashier, driver)
   - Secret key for owner login

### 🔄 In Progress
- None currently

### 📋 Backlog (P1)
1. **Code Refactoring**
   - `server.py` (~14,600 lines) - needs splitting into routes
   - `Settings.js` (~5,700 lines)
   - `POS.js` (~2,800 lines)
   - `CustomerMenu.js` (~2,000 lines)

### 📋 Future Tasks (P2-P3)
1. SendGrid email integration (waiting for API key)
2. Map design verification with user
3. PWA installation testing guidance

## Technical Architecture

```
/app
├── backend/
│   └── server.py          # FastAPI (needs refactoring)
└── frontend/
    └── src/
        ├── components/
        │   └── PWAInstallButton.js  # Translated
        ├── context/
        │   ├── LanguageContext.js   # Language state management
        │   └── AuthContext.js
        ├── hooks/
        │   └── useTranslation.js    # Translation hook
        ├── pages/
        │   ├── Dashboard.js         # Fully translated
        │   ├── Login.js             # Fully translated
        │   ├── Orders.js            # Fully translated
        │   ├── DriverApp.js         # Fully translated
        │   ├── Tables.js            # Fully translated
        │   ├── POS.js               # Translation hook added
        │   └── [30+ more pages]     # Translation hook added
        └── utils/
            └── autoTranslate.js     # Translation dictionary
```

## Key API Endpoints
- `PUT /api/orders/{order_id}/kitchen-status`
- `GET /api/kitchen-orders` (includes branch_name)
- `GET /api/tables?branch_id=xxx`

## Database Schema Updates
- `orders` collection: Added `kitchen_status: str` field
- `tables` collection: Proper branch_id filtering

## 3rd Party Integrations
- OpenStreetMap Nominatim (address search)
- CARTO (map tiles)
- Leaflet & react-leaflet
- SendGrid (installed, not configured)

## Test Credentials
- **Super Admin**: owner@maestroegp.com / owner123
- **Demo Client**: demo@maestroegp.com / demo123
- **Cashier**: Hani@maestroegp.com / test123

## Notes
- Translation system uses Arabic text as lookup key
- Language stored in localStorage as 'app_language'
- Document direction changes automatically based on language
