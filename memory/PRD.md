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

## User Personas

### 1. مدير النظام (Admin)
- إدارة كاملة للنظام
- إضافة وتعديل المستخدمين والفروع
- عرض جميع التقارير
- إعدادات النظام

### 2. مدير الفرع (Manager)
- إدارة موظفي فرعه
- عرض تقارير الفرع
- إدارة المخزون والمنتجات

### 3. المشرف (Supervisor)
- مراقبة العمليات
- إدارة المخزون
- عرض التقارير

### 4. الكاشير (Cashier)
- استخدام نقاط البيع
- إنشاء الطلبات
- إغلاق الشفت

---

## What's Been Implemented (as of Jan 12, 2026)

### Backend (FastAPI + MongoDB)
- ✅ نظام المصادقة JWT
- ✅ CRUD للمستخدمين مع الصلاحيات والفروع
- ✅ CRUD للفروع
- ✅ CRUD للفئات والمنتجات (مع التكاليف والربح)
- ✅ CRUD للمخزون مع transactions
- ✅ CRUD للطاولات
- ✅ نظام الطلبات الكامل مع الحالات
- ✅ إدارة الشفتات (فتح/إغلاق مع حساب العجز/الفائض)
- ✅ إدارة السائقين
- ✅ إدارة المصاريف اليومية
- ✅ إدارة المشتريات
- ✅ التقارير الشاملة (7 أنواع):
  - تقرير المبيعات
  - تقرير المشتريات
  - تقرير المخزون
  - تقرير المصاريف
  - تقرير الأرباح والخسائر
  - تقرير الأصناف
  - تقرير شركات التوصيل (الآجل)
- ✅ إعدادات شركات التوصيل مع نسب الاستقطاع
- ✅ إعدادات الطابعات
- ✅ إعدادات البريد الإلكتروني
- ✅ Seed data للبيانات الأولية

### Frontend (React + Tailwind + Shadcn)
- ✅ صفحة تسجيل الدخول
- ✅ لوحة التحكم الرئيسية مع 8 إجراءات سريعة
- ✅ شاشة نقاط البيع (POS) كاملة
- ✅ صفحة الطاولات
- ✅ صفحة الطلبات
- ✅ صفحة المخزون
- ✅ صفحة التوصيل والسائقين
- ✅ صفحة المصاريف اليومية
- ✅ صفحة التقارير الشاملة (7 تبويبات)
- ✅ صفحة الإعدادات مع 8 تبويبات:
  - المظهر (فاتح/داكن/تلقائي)
  - المستخدمين (إضافة/تعديل/حذف/صلاحيات)
  - الفروع
  - الفئات (إضافة/تعديل/حذف)
  - المنتجات (إضافة/تعديل/حذف مع التكاليف والربح)
  - الطابعات
  - شركات التوصيل (نسب الاستقطاع)
  - الإشعارات (البريد الإلكتروني)
- ✅ الوضع الليلي/النهاري التلقائي
- ✅ واجهة عربية RTL

---

## Prioritized Backlog

### P0 - Critical (Must Have) ✅ COMPLETED
- [x] Authentication
- [x] POS Core
- [x] Orders
- [x] Tables
- [x] User Management with Permissions
- [x] Categories/Products Management
- [x] Reports (7 types)
- [x] Expenses Management

### P1 - High Priority
- [x] Inventory Management
- [x] Shift Management
- [x] Delivery Tracking
- [ ] Receipt Printing (Hardware Integration) - requires network printer

### P2 - Medium Priority
- [x] Email Reports (SendGrid configured - requires API key)
- [ ] Stripe Payment Integration
- [ ] Real-time Kitchen Display
- [ ] Customer Loyalty Program

### P3 - Low Priority
- [ ] Mobile App
- [ ] Analytics Dashboard with Charts
- [ ] Multi-language Support
- [ ] API for Third-party Integration

---

## Technical Stack

- **Backend:** FastAPI (Python)
- **Database:** MongoDB
- **Frontend:** React 18 + Tailwind CSS + Shadcn/UI
- **Authentication:** JWT
- **Email:** SendGrid (ready for API key)
- **Payment:** Stripe (ready for integration)

---

## Credentials

### Default Admin
- Email: admin@maestroegp.com
- Password: admin123

### Default Cashier
- Email: cashier@maestroegp.com
- Password: cashier123

---

## API Reference

### Authentication
- `POST /api/auth/login` - تسجيل الدخول
- `POST /api/auth/register` - إنشاء مستخدم
- `GET /api/auth/me` - معلومات المستخدم الحالي

### Users
- `GET /api/users` - قائمة المستخدمين
- `PUT /api/users/{id}` - تعديل مستخدم
- `DELETE /api/users/{id}` - حذف مستخدم

### Categories
- `GET /api/categories` - قائمة الفئات
- `POST /api/categories` - إضافة فئة
- `PUT /api/categories/{id}` - تعديل فئة
- `DELETE /api/categories/{id}` - حذف فئة

### Products
- `GET /api/products` - قائمة المنتجات
- `POST /api/products` - إضافة منتج
- `PUT /api/products/{id}` - تعديل منتج
- `DELETE /api/products/{id}` - حذف منتج

### Orders
- `GET /api/orders` - قائمة الطلبات
- `POST /api/orders` - إنشاء طلب
- `PUT /api/orders/{id}/status` - تحديث حالة الطلب
- `PUT /api/orders/{id}/payment` - تحديث طريقة الدفع

### Reports
- `GET /api/reports/sales` - تقرير المبيعات
- `GET /api/reports/purchases` - تقرير المشتريات
- `GET /api/reports/inventory` - تقرير المخزون
- `GET /api/reports/expenses` - تقرير المصاريف
- `GET /api/reports/profit-loss` - تقرير الأرباح والخسائر
- `GET /api/reports/products` - تقرير الأصناف
- `GET /api/reports/delivery-credits` - تقرير شركات التوصيل

### Shifts
- `POST /api/shifts` - فتح شفت
- `POST /api/shifts/{id}/close` - إغلاق شفت
- `GET /api/shifts/current` - الشفت الحالي

---

## Test Reports
- `/app/test_reports/iteration_1.json` - Initial build tests
- `/app/test_reports/iteration_2.json` - New features tests (100% pass rate)
