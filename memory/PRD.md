# Maestro EGP - PRD (Product Requirements Document)

## Original Problem Statement
بناء نظام شامل للتحكم بالتكاليف ونقاط البيع (Maestro EGP) للمطاعم والكافيهات.

### المتطلبات الأساسية:
- نظام متعدد المستخدمين (Admin, Manager, Supervisor, Cashier)
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

#### 1. إصلاح الطلبات المعلقة ✅
- الطلبات السفري والمحلي عبر "حفظ وإرسال للمطبخ" تحفظ بحالة `pending`
- الطلبات التوصيل تحفظ بحالة `ready` مباشرة
- تم تصحيح استخدام `auto_ready` flag

#### 2. تتبع السائقين GPS ✅
- API لتحديث موقع السائق: `PUT /api/drivers/portal/{id}/location`
- API لجلب مواقع جميع السائقين: `GET /api/drivers/locations`
- تخزين الإحداثيات (lat/lng) مع وقت التحديث

#### 3. خريطة تتبع السائقين ✅
- علامة تبويب جديدة "الخريطة" في صفحة التوصيل
- عرض Google Maps مع مواقع السائقين
- مؤشرات حالة GPS (أخضر للنشط، رمادي لغير المتاح)
- عرض معلومات الطلب الحالي لكل سائق

#### 4. تطبيق السائق PWA ✅
- بوابة موبايل للسائقين على `/driver?id={driver_id}`
- دعم تثبيت كتطبيق (Progressive Web App)
- تتبع GPS تلقائي كل 30 ثانية
- عرض الطلبات النشطة والمكتملة
- أزرار "فتح الخريطة" (Google Maps/Waze) و "تم التسليم"
- إحصائيات: غير مدفوع، مدفوع اليوم، طلبات نشطة

#### 5. دور "سائق توصيل" delivery ✅
- إضافة دور جديد للمستخدمين
- يمكن إنشاء حسابات للسائقين
- السائقين يتم توجيههم تلقائياً لبوابة السائق

---

### الميزات السابقة (Jan 12, 2026):
- نافذة منبثقة بـ 3 تبويبات (سفري، توصيل، محلي)
- عرض تفاصيل كل طلب (الرقم، النوع، العميل، الأصناف، السعر، الوقت)
- زر "فتح للتعديل" لكل طلب
- مؤشر عدد الطلبات على الزر الرئيسي
- تحديث تلقائي كل 30 ثانية

#### 2. تعديل الطلبات الموجودة ✅
- تحميل الطلب المعلق في السلة
- مؤشر "تعديل طلب #X" في الهيدر
- إمكانية إضافة أصناف جديدة للطلب
- API: `PUT /api/orders/{order_id}/add-items`

#### 3. زر طباعة الفاتورة ✅
- معاينة الفاتورة قبل الدفع
- تصميم إيصال احترافي
- عرض تفاصيل الطلب والأسعار

#### 4. إدارة العملاء ✅
- قسم جديد في الإعدادات "العملاء"
- إضافة/تعديل/حذف العملاء
- حقول: الاسم، الهاتف، هاتف إضافي، العنوان، المنطقة، ملاحظات
- خاصية حظر العميل
- عرض إجمالي الطلبات والمبلغ المصروف
- البحث بالاسم أو الهاتف

#### 5. البحث عن العملاء بالهاتف ✅
- حقل بحث في هيدر POS
- عرض بيانات العميل عند العثور عليه
- ملء حقول الاسم والعنوان تلقائياً
- API: `GET /api/customers/by-phone/{phone}`

#### 6. إنشاء العملاء تلقائياً ✅
- عند إنشاء طلب برقم هاتف، يتم إنشاء العميل تلقائياً
- تحديث إحصائيات العميل (عدد الطلبات، إجمالي المصروف)

---

### الميزات السابقة المنفذة:

#### نظام الصلاحيات (26 صلاحية)
مجموعات الصلاحيات:
- المبيعات: نقاط البيع، إعطاء خصومات، إلغاء الطلبات، الطلبات، تعديل الطلبات، الطاولات
- المطبخ: شاشة المطبخ
- المخزون: عرض المخزون، تعديل المخزون، نقل المخزون
- التقارير: التقارير الأساسية، التقارير المالية، تصدير التقارير
- المالية: المصاريف، إضافة مصاريف، المشتريات
- التوصيل: التوصيل، السائقين
- الإعدادات: المنتجات، تعديل المنتجات، تعديل الأسعار، الفئات
- الإدارة: المستخدمين، الفروع، الإعدادات، الورديات، إغلاق الصندوق

#### إعدادات شركات التوصيل
- نسب العمولة لكل شركة
- حساب العمولة التلقائي في POS
- عرض الصافي بعد العمولة

#### إدارة المستخدمين المتقدمة
- إضافة مستخدمين مع كل الصلاحيات
- تعديل الصلاحيات لكل مستخدم
- تفعيل/تعطيل المستخدمين

#### إدارة الفروع
- إضافة/تعديل/تعطيل الفروع
- ربط المستخدمين بالفروع

#### إدارة المنتجات والفئات
- CRUD للمنتجات والفئات
- تحديد أسعار البيع والتكلفة
- حساب الربح التلقائي

#### صفحة التقارير المتقدمة
- تقارير المبيعات
- تقارير شركات التوصيل
- تقارير المصاريف
- فلترة بالتاريخ

#### رقم جهاز التنبيه للسفري
- حقل اختياري لرقم جهاز العميل
- يظهر في الطلبات المعلقة

---

## Tech Stack
- **Backend:** FastAPI (Python)
- **Frontend:** React.js with TailwindCSS + Shadcn/UI
- **Database:** MongoDB
- **Authentication:** JWT

---

## API Reference - Key Endpoints

### Authentication
- `POST /api/auth/login` - تسجيل الدخول
- `POST /api/auth/register` - تسجيل مستخدم جديد

### Customers (جديد)
- `GET /api/customers` - قائمة العملاء
- `POST /api/customers` - إنشاء عميل
- `GET /api/customers/by-phone/{phone}` - البحث بالهاتف
- `PUT /api/customers/{id}` - تحديث عميل
- `DELETE /api/customers/{id}` - حذف عميل

### Drivers Location Tracking (جديد)
- `PUT /api/drivers/portal/{driver_id}/location` - تحديث موقع السائق GPS
- `GET /api/drivers/locations` - جلب مواقع جميع السائقين للخريطة

### Driver Portal (جديد)
- `GET /api/drivers/portal/{driver_id}` - بيانات السائق والطلبات
- `GET /api/drivers/portal/by-phone/{phone}` - بوابة السائق بالهاتف
- `PUT /api/drivers/portal/{driver_id}/complete` - إكمال توصيل طلب

### Orders
- `GET /api/orders?status=pending` - الطلبات المعلقة
- `GET /api/orders/{id}` - تفاصيل طلب
- `POST /api/orders` - إنشاء طلب
- `PUT /api/orders/{id}/add-items` - إضافة أصناف (جديد)
- `PUT /api/orders/{id}/payment` - تحديث طريقة الدفع
- `PUT /api/orders/{id}/status` - تحديث حالة الطلب

### Products & Categories
- `GET /api/products` - المنتجات
- `GET /api/categories` - الفئات

### Reports
- `GET /api/reports/sales` - تقارير المبيعات
- `GET /api/reports/delivery-credits` - تقارير التوصيل

---

## Prioritized Backlog

### P0 - Completed ✅
- [x] Authentication System
- [x] Product Management
- [x] Category Management
- [x] Order Creation (Dine-in, Takeaway, Delivery)
- [x] Table Management
- [x] Shift Management
- [x] Delivery Tracking
- [x] Sound Notifications
- [x] Pending Orders Queue
- [x] Order Editing
- [x] Customer Management
- [x] Print Bill Preview

### P1 - Upcoming
- [ ] Caller ID Integration (يحتاج بحث تقني)
- [ ] Email Reports (SendGrid configured)
- [ ] Receipt Printing (Hardware Integration)

### P2 - Future
- [ ] Stripe Payment Integration
- [ ] Real-time Kitchen Display Screen
- [ ] Customer Loyalty Program
- [ ] Multi-Currency Full Support

---

## Credentials

### Default Admin
- Email: admin@maestroegp.com
- Password: admin123

### Default Cashier
- Email: cashier@maestroegp.com
- Password: cashier123

---

## Test Reports
- `/app/test_reports/iteration_1.json` - Initial build tests
- `/app/test_reports/iteration_2.json` - Settings features
- `/app/test_reports/iteration_3.json` - POS workflow & Customer management (100% pass)

---

## Code Architecture
```
/app
├── backend/
│   ├── .env
│   ├── requirements.txt
│   ├── server.py (Main API - 2000+ lines, needs refactoring)
│   └── tests/
│       └── test_new_features.py
├── frontend/
│   ├── .env
│   ├── package.json
│   └── src/
│       ├── components/ui/ (Shadcn components)
│       ├── context/
│       │   ├── AuthContext.js
│       │   └── ThemeContext.js
│       ├── pages/
│       │   ├── Dashboard.js
│       │   ├── Expenses.js
│       │   ├── Inventory.js
│       │   ├── Login.js
│       │   ├── Orders.js
│       │   ├── POS.js (Updated with new features)
│       │   ├── Reports.js
│       │   ├── Settings.js (Updated with Customers tab)
│       │   └── Tables.js
│       └── utils/
│           ├── currency.js
│           └── sound.js
└── memory/
    └── PRD.md
```

---

## Notes for Future Development

### Caller ID Feature
يحتاج بحث تقني - الخيارات المحتملة:
1. خدمة VoIP (Twilio) - تكلفة شهرية
2. تطبيق مساعد على الهاتف - معقد تقنياً
3. ربط مع نظام هاتف الفرع - يحتاج hardware

### Backend Refactoring Needed
ملف `server.py` أكثر من 2000 سطر. يجب تقسيمه إلى:
- `/routes/auth.py`
- `/routes/orders.py`
- `/routes/customers.py`
- `/routes/products.py`
- `/models/` (Pydantic models)
- `/services/` (Business logic)
