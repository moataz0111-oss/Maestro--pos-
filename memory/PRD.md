# Maestro EGP - PRD (Product Requirements Document)

## Original Problem Statement
نظام شامل لإدارة المطاعم والكافيهات باسم "Maestro EGP" مع دعم Multi-tenant، تتبع السائقين، نظام كول سنتر، وإعدادات الأصوات.

---

## ✅ Completed Features (Jan 14, 2026)

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

### Call Center System (NEW)
- [x] إعدادات ربط الكول سنتر
- [x] Webhook لاستقبال المكالمات
- [x] إشعار منبثق للمكالمات الواردة
- [x] ملء تلقائي لبيانات العميل في POS
- [x] صفحة سجل المكالمات
- [x] دليل إعداد الأجهزة

### Sound Settings (NEW)
- [x] التحكم بتفعيل/إيقاف الأصوات
- [x] مستوى الصوت
- [x] أصوات الأزرار
- [x] إشعارات الطلبات
- [x] رنين المكالمات
- [x] إشعارات السائقين

### Bug Fixes (Jan 14, 2026)
- [x] إصلاح البحث عن العميل بالهاتف (MongoDB $or conflict)
- [x] إصلاح عرض الطلبات المعلقة (شمول جميع الحالات)
- [x] إصلاح صوت رنين المكالمات (Web Audio API)

---

## 🔄 In Progress

### Code Refactoring
تم إنشاء الهيكل الأساسي:
```
/backend/
├── core/database.py, config.py
├── models/schemas.py
├── utils/auth.py
└── api/ (routes - pending)
```
- [ ] تقسيم server.py (4220 سطر)

---

## 📋 Upcoming Tasks (P1)
- [ ] تحسين خريطة تتبع السائقين
- [ ] إعدادات النظام العامة (لوجو، اسم)
- [ ] تقارير المبيعات بالأصناف + تصدير Excel
- [ ] حساب وقت توصيل الطلب

## 🔮 Future Tasks (P2)
- [ ] تخصيص الفاتورة وربط الطابعات
- [ ] إدارة وصفات المنتجات
- [ ] Kitchen Display System
- [ ] برنامج ولاء العملاء

---

## 🔑 Test Credentials

### Super Admin
- URL: `/super-admin`
- Email: `owner@maestroegp.com`
- Password: `owner123`

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

### Auth
- `POST /api/auth/login`
- `POST /api/auth/register`
- `GET /api/auth/me`

### Orders
- `GET /api/orders`
- `POST /api/orders`
- `PUT /api/orders/{id}/status`

### Call Center
- `POST /api/callcenter/webhook`
- `POST /api/callcenter/simulate`
- `GET /api/callcenter/active-calls`
- `GET /api/callcenter/call-logs`

### Super Admin
- `POST /api/super-admin/login`
- `GET /api/super-admin/tenants`
- `POST /api/super-admin/reset-sales`

---

## 🛠️ Tech Stack
- **Frontend**: React + Tailwind CSS + Shadcn/UI
- **Backend**: FastAPI (Python)
- **Database**: MongoDB
- **Auth**: JWT
- **Maps**: Leaflet / OpenStreetMap

---

## 📊 Deployment Status
- ✅ Health Check: Passed
- ✅ Frontend Build: Passed
- ✅ Database: Connected
- ✅ All APIs: Working
- ✅ Ready for Production
