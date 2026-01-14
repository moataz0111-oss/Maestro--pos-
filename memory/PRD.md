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
- [x] **تعديل بيانات العملاء الكاملة** (NEW - Jan 15, 2026)
- [x] **إرسال بريد ترحيبي تلقائي للعملاء** (NEW - Jan 15, 2026)

### Call Center System
- [x] إعدادات ربط الكول سنتر
- [x] Webhook لاستقبال المكالمات
- [x] إشعار منبثق للمكالمات الواردة
- [x] ملء تلقائي لبيانات العميل في POS
- [x] صفحة سجل المكالمات

### Sound Settings
- [x] التحكم بتفعيل/إيقاف الأصوات
- [x] مستوى الصوت
- [x] أصوات الأزرار والإشعارات

### HR System (Jan 14, 2026)
- [x] إدارة الموظفين (CRUD)
- [x] تسجيل الحضور والانصراف
- [x] نظام السلف مع الاستقطاع الشهري
- [x] نظام الخصومات (غياب، تأخير، مخالفة)
- [x] نظام المكافآت والوقت الإضافي
- [x] حساب كشوفات الرواتب التلقائي
- [x] ربط الرواتب بالتكلفة التشغيلية

### Warehouse & Inventory System (Jan 14, 2026)
- [x] تحويلات المخزون بين الفروع
- [x] سير عمل التحويلات (انتظار -> موافقة -> شحن -> استلام)
- [x] طلبات الشراء من الفروع
- [x] أولويات طلبات الشراء (عاجل، مرتفع، عادي، منخفض)

### Bug Fixes (Jan 14-15, 2026)
- [x] إصلاح عدم ظهور المستخدمين الجدد عند العملاء
- [x] إصلاح البحث عن العميل بالهاتف
- [x] إصلاح عرض الطلبات المعلقة
- [x] إصلاح صوت رنين المكالمات
- [x] **إصلاح تسرب بيانات المستخدمين** (P0 CRITICAL - Fixed Jan 15, 2026)

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
- [ ] تقسيم server.py (5000+ سطر)

### PWA Driver Portal
- [ ] إصلاح تثبيت تطبيق السائقين على Android/iOS
- [ ] إصلاح تثبيت تطبيق الإدارة على Windows/Mac/POS

---

## 📋 Upcoming Tasks (P1)
- [ ] ربط أجهزة البصمة (ZKTeco) للحضور التلقائي
- [ ] خلفيات متحركة لصفحة تسجيل الدخول (تحكم من Super Admin)
- [ ] تحسين خريطة تتبع السائقين (مثل تطبيقات التوصيل)
- [ ] طباعة بيانات الخصومات للموظفين
- [ ] تحسين واجهة تعديل بيانات المستخدمين
- [ ] إعدادات النظام العامة (لوجو، اسم)
- [ ] حساب وقت توصيل الطلب

## 🔮 Future Tasks (P2)
- [ ] تقارير المبيعات بالأصناف + تصدير Excel
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

### Auth
- `POST /api/auth/login`
- `POST /api/users` (creates user with tenant_id)
- `GET /api/auth/me`

### Super Admin (NEW)
- `POST /api/super-admin/login` (requires secret_key)
- `GET /api/super-admin/tenants`
- `POST /api/super-admin/tenants` (with auto welcome email)
- `PUT /api/super-admin/tenants/{id}` (edit tenant data + optional welcome email)
- `DELETE /api/super-admin/tenants/{id}/permanent`
- `POST /api/super-admin/tenants/{id}/reset-password`
- `POST /api/super-admin/tenants/{id}/reset-sales`

### HR System
- `GET/POST /api/employees`
- `GET/POST /api/attendance`
- `GET/POST /api/advances`
- `GET/POST /api/deductions`
- `GET/POST /api/bonuses`
- `GET/POST /api/payroll`
- `POST /api/payroll/calculate`
- `PUT /api/payroll/{id}/pay`

### Warehouse System
- `GET/POST /api/inventory-transfers`
- `PUT /api/inventory-transfers/{id}/approve`
- `PUT /api/inventory-transfers/{id}/ship`
- `PUT /api/inventory-transfers/{id}/receive`
- `GET/POST /api/purchase-requests`
- `PUT /api/purchase-requests/{id}/approve`

### Orders
- `GET /api/orders`
- `POST /api/orders`
- `PUT /api/orders/{id}/status`

### Call Center
- `POST /api/callcenter/webhook`
- `POST /api/callcenter/simulate`
- `GET /api/callcenter/active-calls`
- `GET /api/callcenter/call-logs`

---

## 🛠️ Tech Stack
- **Frontend**: React + Tailwind CSS + Shadcn/UI
- **Backend**: FastAPI (Python)
- **Database**: MongoDB
- **Auth**: JWT
- **Maps**: Leaflet / OpenStreetMap
- **Email**: SendGrid (for welcome emails)

---

## 📊 Deployment Status
- ✅ Health Check: Passed
- ✅ Frontend Build: Passed
- ✅ Database: Connected
- ✅ All APIs: Working
- ✅ HR System: Working (100% tests passed)
- ✅ Warehouse System: Working (100% tests passed)
- ✅ User Data Isolation: Working (100% tests passed - Jan 15)
- ✅ Tenant Edit Feature: Working (100% tests passed - Jan 15)
- ✅ Ready for Production
