# Maestro EGP - PRD (Product Requirements Document)

## Original Problem Statement
نظام شامل لإدارة المطاعم والكافيهات باسم "Maestro EGP" مع دعم Multi-tenant، تتبع السائقين، نظام كول سنتر، إدارة الموارد البشرية، وتحويلات المخزون.

---

## ✅ Completed Features (Jan 14-15, 2026)

### Core Features
- [x] نظام المصادقة (JWT)
- [x] إدارة المنتجات والتصنيفات
- [x] إدارة الطلبات (محلي، سفري، توصيل)
- [x] إدارة الطاولات
- [x] إدارة الورديات والصندوق
- [x] إدارة السائقين والتوصيل
- [x] إشعارات صوتية

### Multi-tenant System
- [x] لوحة تحكم Super Admin
- [x] فصل البيانات بين العملاء (**Fixed Jan 15**)
- [x] تصفير المبيعات للعملاء
- [x] إعادة تعيين كلمات المرور
- [x] **تعديل بيانات العملاء الكاملة** (Jan 15)
- [x] **إرسال بريد ترحيبي تلقائي للعملاء** (Jan 15)

### 🆕 Login Page Animated Backgrounds (Jan 15)
- [x] **خلفيات متحركة** لصفحة تسجيل الدخول
- [x] **5 أنواع حركات:** Fade, Zoom, Ken Burns, Slide, Parallax
- [x] **تبديل تلقائي** بين الخلفيات
- [x] **تحكم كامل من Super Admin**
- [x] **تصميم Glass Effect** للكارت

### 🆕 Kitchen Display System (Jan 15)
- [x] **شاشة المطبخ KDS** كاملة
- [x] عرض الطلبات الجديدة والمحضّرة
- [x] تتبع وقت كل طلب
- [x] تنبيهات للطلبات المتأخرة (أصفر/أحمر)
- [x] وضع ملء الشاشة
- [x] صوت تنبيه للطلبات الجديدة
- [x] وظيفة تحديد الأصناف المكتملة

### 🆕 Excel Export (Jan 15)
- [x] **تصدير تقارير المبيعات** إلى Excel
- [x] **تصدير تقارير المنتجات** (الأكثر مبيعاً)
- [x] **تصدير تقارير المصاريف**
- [x] تنسيق احترافي مع ألوان

### Call Center System
- [x] إعدادات ربط الكول سنتر
- [x] Webhook لاستقبال المكالمات
- [x] إشعار منبثق للمكالمات الواردة
- [x] صفحة سجل المكالمات

### HR System (Jan 14)
- [x] إدارة الموظفين (CRUD)
- [x] تسجيل الحضور والانصراف
- [x] نظام السلف والخصومات
- [x] حساب كشوفات الرواتب

### Warehouse & Inventory System (Jan 14)
- [x] تحويلات المخزون بين الفروع
- [x] طلبات الشراء من الفروع

### 🆕 Driver Tracking Map Component (Jan 15)
- [x] **مكون خريطة متقدم** `/components/DriverTrackingMap.js`
- [x] 3 أنماط خريطة (Streets, Satellite, Dark)
- [x] تتبع السائقين بماركرات متحركة
- [x] خطوط توصيل للطلبات النشطة
- [x] قائمة جانبية للسائقين
- [x] نوافذ معلومات تفاعلية

---

## 🔄 In Progress / Upcoming

### Priority 1 (User Requested)
- [ ] **تكامل خريطة السائقين** في صفحة التوصيل
- [ ] **إصلاح PWA للسائقين والإدارة**
- [ ] **ربط أجهزة البصمة** (ZKTeco)
- [ ] **إشعارات Push** للسائقين والفروع

### Code Refactoring
- [ ] **تقسيم server.py** (6000+ سطر) إلى ملفات منفصلة

---

## 📋 Future Tasks (P2)
- [ ] برنامج ولاء العملاء
- [ ] تخصيص الفاتورة وربط الطابعات
- [ ] نظام الوصفات والمواد الخام

---

## 🔑 Test Credentials

### Super Admin
- URL: `/super-admin`
- Email: `owner@maestroegp.com`
- Password: `owner123`
- Secret Key: `271018`

### Main System Admin
- URL: `/login`
- Email: `admin@maestroegp.com`
- Password: `admin123`

---

## 📡 Key API Endpoints

### NEW - Kitchen Display
- `GET /api/orders?status=pending,preparing` - طلبات المطبخ
- `PUT /api/orders/{id}/status` - تحديث حالة الطلب

### NEW - Excel Export
- `GET /api/reports/export/excel?report_type=sales|products|expenses`

### Login Backgrounds
- `GET /api/login-backgrounds`
- `PUT /api/login-backgrounds`
- `POST /api/login-backgrounds/upload`

---

## 🛠️ Tech Stack
- **Frontend**: React + Tailwind CSS + Shadcn/UI
- **Backend**: FastAPI (Python)
- **Database**: MongoDB
- **Maps**: Leaflet / OpenStreetMap
- **Excel**: openpyxl

---

## 📊 Deployment Status
- ✅ All APIs Working
- ✅ Kitchen Display: Working
- ✅ Excel Export: Working
- ✅ Login Backgrounds: Working
- ✅ Ready for Production
