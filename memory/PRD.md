# Maestro EGP - PRD (Product Requirements Document)

## Original Problem Statement
بناء نظام شامل للتحكم بالتكاليف ونقاط البيع (Maestro EGP) للمطاعم والكافيهات.

### المتطلبات الأساسية:
- نظام متعدد المستخدمين (Admin, Manager, Supervisor, Cashier, Delivery, Super Admin)
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
- **نظام متعدد العملاء (Multi-tenant) لبيع البرنامج**

---

## What's Been Implemented (as of Jan 13, 2026)

### الميزات الجديدة (الإصدار الأخير - Jan 14, 2026):

#### 1. نظام الكول سنتر (Caller ID) - المرحلة الكاملة ✅ **NEW**
- إعدادات لربط أنظمة الكول سنتر (3CX, RingCentral, Asterisk, إلخ)
- Webhook API لاستقبال المكالمات الواردة
- إشعار منبثق عند ورود مكالمة مع بيانات المتصل:
  - اسم العميل (إذا موجود)
  - رقم الهاتف
  - العنوان المحفوظ
  - إجمالي الطلبات والمصروفات
  - آخر طلبات العميل
- **ملء تلقائي لبيانات العميل** عند الضغط على "إنشاء طلب" ✅ **FIXED**
  - نوع الطلب = توصيل
  - رقم الهاتف
  - اسم العميل
  - العنوان
  - عرض سجل الطلبات السابقة
- صفحة سجل المكالمات `/call-logs`
- دليل إعداد شامل لأجهزة الكول سنتر

#### 2. إعدادات الأصوات والتنبيهات ✅ **NEW**
- التحكم الرئيسي بتفعيل/إيقاف جميع الأصوات
- مستوى الصوت (0-100%)
- أنواع التنبيهات مع إمكانية التحكم بكل نوع:
  - أصوات الأزرار
  - إشعارات الطلبات الجديدة
  - رنين المكالمات الواردة
  - إشعارات السائقين
- زر "تجربة" لكل نوع صوت
- حفظ الإعدادات في localStorage

#### 3. إصلاحات هامة ✅
- **إصلاح مشكلة البحث عن العميل بالهاتف**: كان هناك تعارض في استعلام MongoDB عند استخدام `$or` متعدد. تم إعادة بناء الاستعلام باستخدام `$and` بشكل صحيح.

---

### الميزات السابقة (Jan 13, 2026):

#### 1. نظام Super Admin متعدد العملاء (Multi-tenant) ✅ **NEW**
- لوحة تحكم خاصة بالمالك على `/super-admin`
- إدارة العملاء (Tenants): إنشاء، عرض، تعديل، تعطيل/تفعيل، حذف
- إحصائيات شاملة: إجمالي العملاء، النشطون، المستخدمين، المبيعات
- عرض مباشر (Live View) لإحصائيات كل عميل
- **زر تصفير المبيعات** لكل عميل (حذف الطلبات والورديات) ✅ **NEW**
- الدخول كعميل (Impersonate) للمشاهدة والتحكم
- إعادة تعيين كلمات المرور للعملاء
- فصل كامل للبيانات عبر `tenant_id`
- مفتاح سري خاص لإنشاء حسابات Super Admin (`271018`)

#### 2. إصلاح تقرير إغلاق الصندوق ✅ **FIXED**
- إضافة فلترة `tenant_id` لـ APIs إغلاق الصندوق
- ربط الطلبات بالوردية عبر `shift_id`
- تقرير شامل يعرض:
  - إجمالي المبيعات (نقدي، بطاقات، آجل)
  - مبيعات تطبيقات التوصيل
  - مبيعات السائقين
  - الخصومات والإلغاءات مع تفاصيل من قام بها
  - المصاريف
  - جرد الصندوق مع الفرق
  - صافي الربح

#### 3. إصلاح تضارب الجلسات ✅
- بوابة السائق تستخدم مفاتيح localStorage منفصلة (`maestro_driver_session`, `maestro_driver_token`)
- التطبيق الرئيسي يستخدم (`token`)
- يمكن الآن استخدام كلا التطبيقين بشكل مستقل بدون تضارب

#### 4. إغلاق الصندوق المتقدم ✅
- زر "إغلاق الصندوق" في header لوحة التحكم
- **فتح الوردية تلقائياً** عند تسجيل دخول الكاشير أو المدير ✅
- جرد فئات النقود العراقية (250، 500، 1000، 5000، 10000، 25000، 50000)
- حساب تلقائي للفرق بين المتوقع والفعلي
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
- [x] **نظام Multi-tenant (Super Admin)** ✅
- [x] **زر تصفير المبيعات في لوحة Super Admin** ✅
- [x] **إصلاح تقرير إغلاق الصندوق (tenant_id + shift_id)** ✅
- [x] **نظام الكول سنتر (Caller ID)** ✅ **NEW**
- [x] **إعدادات الأصوات والتنبيهات** ✅ **NEW**

### P1 - In Progress / Upcoming
- [ ] تحسين خريطة التتبع الاحترافية
- [ ] إعدادات النظام (لوجو، اسم، صلاحيات الفروع)
- [ ] تتبع أوقات السائق بالتفصيل
- [ ] التقارير الجديدة (ملغاة، خصومات، آجلة)
- [ ] Email Reports (SendGrid)
- [ ] تقارير المبيعات بالأصناف + تصدير Excel

### P2 - Future
- [ ] تخصيص الفاتورة وربط الطابعات
- [ ] إدارة وصفات المنتجات (المواد الخام)
- [ ] Real-time Kitchen Display
- [ ] Customer Loyalty Program

### ⚠️ Technical Debt - إعادة الهيكلة
- [ ] **تقسيم server.py** (4220+ سطر) إلى وحدات منفصلة:
  - `/routes/` - ملفات API مقسمة حسب الوظيفة
  - `/models/` - نماذج Pydantic (تم إنشاء الهيكل)
  - `/services/` - خدمات البريد والإشعارات
  - `/utils/` - دوال المصادقة والمساعدة

---

## Credentials

### Super Admin (Owner)
- Login Page: `/super-admin`
- Email: owner@maestroegp.com
- Password: owner123
- Secret Key: 271018

### Default Admin
- Email: admin@maestroegp.com
- Password: admin123

### Default Cashier
- Email: cashier@maestroegp.com
- Password: cashier123

### Default Driver
- Email: moustafa@maestroegp.com
- Password: driver123

### Tenant Admin (مطعم البيت العراقي)
- Login Page: `/login`
- Email: ahmed@albait.com
- Password: password

---

## Test Reports
- `/app/test_reports/iteration_4.json` - Driver tracking & Pending orders
- `/app/test_reports/iteration_5.json` - Session fix & Cash register (100% pass)
- `/app/test_reports/iteration_6.json` - Super Admin + Reset Sales + Cash Register Fix (100% pass) **NEW**

---

## Code Architecture
```
/app
├── backend/
│   ├── .env
│   ├── requirements.txt
│   ├── server.py (Main API - needs refactoring)
│   └── tests/
│       ├── test_iteration5_features.py
│       └── test_iteration6_features.py
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
│       │   ├── SuperAdmin.js (Multi-tenant Management)
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
