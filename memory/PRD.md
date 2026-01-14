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
- [x] فصل البيانات بين العملاء
- [x] تصفير المبيعات للعملاء
- [x] إعادة تعيين كلمات المرور
- [x] **تعديل بيانات العملاء الكاملة** (Jan 15)
- [x] **إرسال بريد ترحيبي تلقائي للعملاء** (Jan 15)

### 🆕 Login Page Animated Backgrounds (Jan 15, 2026)
- [x] **خلفيات متحركة لصفحة تسجيل الدخول**
- [x] **5 أنواع حركات:** Fade, Zoom, Ken Burns, Slide, Parallax
- [x] **تبديل تلقائي** بين الخلفيات
- [x] **تحكم كامل من Super Admin:**
  - إضافة/حذف خلفيات
  - تفعيل/إيقاف الحركة
  - نوع الانتقال
  - حركة الشعار (Pulse, Bounce, Glow)
  - شعار مخصص
  - لون التعتيم
  - مدة الانتقال
- [x] **تصميم Glass Effect** للكارت
- [x] **مؤشرات نقطية** للتنقل بين الخلفيات

### Call Center System
- [x] إعدادات ربط الكول سنتر
- [x] Webhook لاستقبال المكالمات
- [x] إشعار منبثق للمكالمات الواردة
- [x] ملء تلقائي لبيانات العميل في POS
- [x] صفحة سجل المكالمات

### HR System (Jan 14)
- [x] إدارة الموظفين (CRUD)
- [x] تسجيل الحضور والانصراف
- [x] نظام السلف مع الاستقطاع الشهري
- [x] نظام الخصومات
- [x] نظام المكافآت
- [x] حساب كشوفات الرواتب

### Warehouse & Inventory System (Jan 14)
- [x] تحويلات المخزون بين الفروع
- [x] سير عمل التحويلات
- [x] طلبات الشراء من الفروع

### Bug Fixes (Jan 14-15)
- [x] **إصلاح تسرب بيانات المستخدمين** (P0 Critical)
- [x] إصلاح عدم ظهور المستخدمين الجدد
- [x] إصلاح البحث عن العميل بالهاتف
- [x] إصلاح أداء إشعار المكالمات

---

## 🔄 In Progress / Upcoming

### Priority 1 (User Requested - Jan 15)
- [ ] **تحسين خريطة تتبع السائقين** (مثل تطبيقات التوصيل)
  - خريطة دقيقة مع حركة فعلية
  - خط سير واضح ودقيق
- [ ] **إصلاح PWA للسائقين والإدارة**
  - تثبيت تطبيق السائقين على Android/iOS
  - تثبيت تطبيق الإدارة على Windows/Mac/POS
- [ ] **ربط أجهزة البصمة** (ZKTeco) في الإعدادات
- [ ] **إشعارات Push للسائقين والفروع**
  - إشعارات حتى مع إغلاق التطبيق
  - Service Worker

### Code Refactoring
- [ ] تقسيم server.py (5800+ سطر)

---

## 📋 Future Tasks (P2)
- [ ] تقارير المبيعات + تصدير Excel
- [ ] Kitchen Display System
- [ ] برنامج ولاء العملاء
- [ ] تخصيص الفاتورة وربط الطابعات

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

### Tenant Admin
- URL: `/login`
- Email: `ahmed@albait.com`
- Password: `password123`

---

## 📡 Key API Endpoints

### Login Backgrounds (NEW)
- `GET /api/login-backgrounds` - جلب إعدادات الخلفيات (عام)
- `PUT /api/login-backgrounds` - تحديث الإعدادات (Super Admin)
- `POST /api/login-backgrounds/upload` - إضافة خلفية جديدة
- `DELETE /api/login-backgrounds/{id}` - حذف خلفية

### Super Admin
- `POST /api/super-admin/login`
- `GET /api/super-admin/tenants`
- `POST /api/super-admin/tenants` (with auto welcome email)
- `PUT /api/super-admin/tenants/{id}` (edit tenant + optional email)

### HR System
- `GET/POST /api/employees`
- `GET/POST /api/attendance`
- `GET/POST /api/advances`
- `GET/POST /api/payroll`

### Warehouse System
- `GET/POST /api/inventory-transfers`
- `GET/POST /api/purchase-requests`

---

## 🛠️ Tech Stack
- **Frontend**: React + Tailwind CSS + Shadcn/UI
- **Backend**: FastAPI (Python)
- **Database**: MongoDB
- **Auth**: JWT
- **Maps**: Leaflet / OpenStreetMap
- **Email**: SendGrid

---

## 📊 Deployment Status
- ✅ All APIs Working
- ✅ User Data Isolation: Fixed
- ✅ Login Animated Backgrounds: Working
- ✅ Tenant Edit Feature: Working
- ✅ Ready for Production
