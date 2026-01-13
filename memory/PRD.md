# Maestro EGP - PRD (Product Requirements Document)

## Original Problem Statement
بناء نظام شامل للتحكم بالتكاليف ونقاط البيع (Maestro EGP) للمطاعم والكافيهات.

### المتطلبات الأساسية:
- نظام متعدد المستخدمين (Admin, Manager, Supervisor, Cashier, Delivery)
- إدارة الفروع مع صلاحيات لكل فرع
- إدارة المخازن (مواد خام + منتجات نهائية)
- تتبع المبيعات والكميات بالتفصيل
- إدارة الشفتات مع تقارير تلقائية بالبريد
- دعم متعدد العملات (الدينار العراقي كأساس)
- إدارة الطاولات
- تتبع التوصيل والسائقين
- تكامل مع تطبيقات التوصيل (توترز، طلبات، بالي، عالسريع، طلباتي)
- الوضع الليلي/النهاري التلقائي
- واجهة عربية RTL

---

## What's Been Implemented (as of Jan 13, 2026)

### الميزات الجديدة (الإصدار الأخير - Jan 13, 2026):

#### 1. إصلاح تضارب الجلسات ✅
- بوابة السائق تستخدم مفاتيح localStorage منفصلة (`maestro_driver_session`, `maestro_driver_token`)
- التطبيق الرئيسي يستخدم (`token`)
- يمكن الآن استخدام كلا التطبيقين بشكل مستقل بدون تضارب

#### 2. إغلاق الصندوق المتقدم ✅
- زر "إغلاق الصندوق" في header لوحة التحكم
- **فتح الوردية تلقائياً** عند تسجيل دخول الكاشير أو المدير ✅
- جرد فئات النقود العراقية (250، 500، 1000، 5000، 10000، 25000، 50000)
- حساب تلقائي للفرق بين المتوقع والفعلي
- تقرير شامل يشمل:
  - بيانات الوردية (الكاشير، الفرع، وقت الدخول والإغلاق)
  - إجمالي المبيعات (نقدي، بطاقات، آجل)
  - مبيعات تطبيقات التوصيل
  - مبيعات السائقين
  - الخصومات والإلغاءات مع تفاصيل من قام بها
  - المصاريف
  - جرد الصندوق مع الفرق
  - صافي الربح
- إمكانية طباعة التقرير
- تسجيل خروج تلقائي بعد إغلاق الصندوق

---

### الميزات السابقة (Jan 12-13, 2026):

#### 1. بوابة السائق (PWA) ✅
- بوابة موحدة للسائقين على `/driver`
- تسجيل دخول آمن باسم المستخدم وكلمة المرور
- تتبع GPS تلقائي كل 30 ثانية
- عرض الطلبات النشطة والمكتملة
- أزرار "فتح الخريطة" و"تم التسليم"
- إحصائيات: غير مدفوع، مدفوع اليوم، طلبات نشطة
- **إشعارات صوتية عند وصول طلب جديد** ✅ (مع زر تفعيل/إيقاف)
- **صوت تأكيد عند إتمام التوصيل** ✅
- **إشعارات نظام الهاتف (Notifications API)** ✅

#### 2. خريطة تتبع السائقين ✅
- خريطة تفاعلية باستخدام Leaflet/OpenStreetMap
- أيقونات دراجات نارية 🏍️ للسائقين
- ألوان مختلفة (أخضر للمتاح، برتقالي للمشغول)
- معلومات منبثقة عند النقر على السائق
- تحديث تلقائي للمواقع

#### 3. إدارة السائقين ✅
- إضافة/تعديل/حذف السائقين
- ربط السائقين بحسابات المستخدمين
- تتبع حالة السائق (متاح/مشغول)

#### 4. إدارة المستخدمين ✅
- إضافة دور "سائق توصيل" (delivery)
- إعادة تعيين كلمة المرور للمستخدمين
- صلاحيات متقدمة (26 صلاحية)

#### 5. إدارة العملاء ✅
- قاعدة بيانات العملاء مع البحث
- إنشاء تلقائي للعملاء من الطلبات
- البحث بالهاتف في POS

#### 6. نقاط البيع (POS) ✅
- الطلبات المعلقة (سفري، توصيل، محلي)
- تعديل الطلبات الموجودة
- معاينة وطباعة الفاتورة
- تكامل مع تطبيقات التوصيل

---

## Tech Stack
- **Backend:** FastAPI (Python)
- **Frontend:** React.js with TailwindCSS + Shadcn/UI
- **Database:** MongoDB
- **Authentication:** JWT
- **Maps:** Leaflet.js, OpenStreetMap

---

## API Reference - Key Endpoints

### Cash Register (جديد)
- `GET /api/cash-register/summary` - ملخص الصندوق قبل الإغلاق
- `POST /api/cash-register/close` - إغلاق الصندوق مع جرد الفئات

### Authentication
- `POST /api/auth/login` - تسجيل الدخول
- `POST /api/auth/register` - تسجيل مستخدم جديد

### Shifts
- `GET /api/shifts` - قائمة الورديات
- `GET /api/shifts/current` - الوردية الحالية
- `POST /api/shifts` - فتح وردية
- `POST /api/shifts/{id}/close` - إغلاق وردية

### Drivers
- `GET /api/drivers` - قائمة السائقين
- `GET /api/drivers/locations` - مواقع السائقين
- `GET /api/drivers/by-user/{user_id}` - السائق بالمستخدم
- `PUT /api/drivers/portal/{id}/location` - تحديث موقع GPS

---

## Prioritized Backlog

### P0 - Completed ✅
- [x] Authentication System
- [x] Product & Category Management
- [x] Order Management (Dine-in, Takeaway, Delivery)
- [x] Table Management
- [x] Shift Management
- [x] Delivery & Driver Tracking
- [x] Sound Notifications
- [x] Customer Management
- [x] Driver Portal (PWA)
- [x] Driver Tracking Map
- [x] **إصلاح تضارب الجلسات** ✅
- [x] **إغلاق الصندوق المتقدم** ✅

### P1 - In Progress / Upcoming
- [ ] تحسين خريطة التتبع الاحترافية
- [ ] إعدادات النظام (لوجو، اسم، صلاحيات الفروع)
- [ ] تتبع أوقات السائق بالتفصيل
- [ ] التقارير الجديدة (ملغاة، خصومات، آجلة)
- [ ] Caller ID Integration
- [ ] Email Reports (SendGrid)
- [ ] تقارير المبيعات بالأصناف + تصدير Excel

### P0 - Completed ✅
- [x] **نظام Multi-tenant (Super Admin)** ✅ - لوحة تحكم المالك لإدارة عملاء متعددين
- [x] Authentication System
- [x] Product & Category Management
- [ ] تخصيص الفاتورة وربط الطابعات
- [ ] إدارة وصفات المنتجات (المواد الخام)
- [ ] Real-time Kitchen Display
- [ ] Customer Loyalty Program

---

## Credentials

### Default Admin
- Email: admin@maestroegp.com
- Password: admin123

### Default Cashier
- Email: cashier@maestroegp.com
- Password: cashier123

### Default Driver
- Email: moustafa@maestroegp.com
- Password: driver123

---

## Test Reports
- `/app/test_reports/iteration_4.json` - Driver tracking & Pending orders
- `/app/test_reports/iteration_5.json` - Session fix & Cash register (100% pass)

---

## Code Architecture
```
/app
├── backend/
│   ├── .env
│   ├── requirements.txt
│   ├── server.py (Main API - needs refactoring)
│   └── tests/
│       └── test_iteration5_features.py
├── frontend/
│   ├── .env
│   ├── package.json
│   ├── public/
│   │   ├── index.html (PWA support)
│   │   ├── manifest.json
│   │   └── sw.js (Service Worker)
│   └── src/
│       ├── components/ui/ (Shadcn components)
│       ├── context/
│       │   ├── AuthContext.js
│       │   └── ThemeContext.js
│       ├── pages/
│       │   ├── Dashboard.js (+ Cash Register Close)
│       │   ├── Delivery.js (+ Map & Driver CRUD)
│       │   ├── DriverPortal.js (PWA with separate session)
│       │   ├── POS.js
│       │   ├── Reports.js
│       │   └── Settings.js
│       └── utils/
└── memory/
    └── PRD.md
```

---

## Notes for Future Development

### Backend Refactoring Needed (CRITICAL)
ملف `server.py` أكثر من 2800 سطر. يجب تقسيمه إلى:
- `/routes/` (auth, orders, customers, products, drivers, shifts)
- `/models/` (Pydantic models)
- `/services/` (Business logic)

### localStorage Keys Reference
- **Main App:** `token`
- **Driver Portal:** `maestro_driver_session`, `maestro_driver_token`
