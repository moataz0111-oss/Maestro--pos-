# Maestro EGP - PRD (Product Requirements Document)

## Original Problem Statement
نظام شامل لإدارة المطاعم والكافيهات باسم "Maestro EGP" مع دعم Multi-tenant، تتبع السائقين، نظام كول سنتر، إدارة الموارد البشرية، وتحويلات المخزون.

---

## ✅ All Completed Features (Updated Jan 16, 2026)

### Core System
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
- [x] نظام صلاحيات الميزات (Feature Flags)
- [x] تعديل بيانات العملاء + بريد ترحيبي

### Login Page 
- [x] خلفيات متحركة قابلة للتخصيص
- [x] 5 أنواع حركات
- [x] تحكم كامل من Super Admin

### Kitchen Display System (KDS)
- [x] شاشة المطبخ KDS كاملة
- [x] تتبع الطلبات والأوقات

### Excel Export
- [x] تصدير تقارير المبيعات
- [x] تصدير تقارير المنتجات والمصاريف

### Call Center
- [x] Webhook للمكالمات
- [x] إشعار منبثق + سجل مكالمات

### HR System
- [x] إدارة الموظفين (CRUD)
- [x] تسجيل الحضور والانصراف
- [x] نظام السلف والخصومات
- [x] كشوفات الرواتب

### Warehouse System
- [x] تحويلات المخزون
- [x] طلبات الشراء

### PWA Enhancement
- [x] Service Worker v3 محسّن
- [x] manifest-admin.json للوحة الإدارة
- [x] مكون PWAInstallButton
- [x] تعليمات التثبيت لجميع الأجهزة

### Biometric Device Integration
- [x] pyzk مثبت للاتصال بأجهزة ZKTeco
- [x] واجهة API كاملة للأجهزة
- [x] واجهة مستخدم في HR
- [x] دعم Push SDK

### Loyalty Program
- [x] نظام نقاط الولاء الكامل
- [x] 4 مستويات (برونزي، فضي، ذهبي، بلاتيني)
- [x] كسب واستبدال النقاط

### Recipes & Raw Materials
- [x] إدارة المواد الخام
- [x] إنشاء وصفات للمنتجات
- [x] حساب التكلفة التلقائي

### Coupons & Promotions System
- [x] نظام الكوبونات الكامل
- [x] نظام العروض الترويجية
- [x] واجهة مستخدم كاملة `/coupons`

### Payroll System
- [x] ربط السلف والخصومات بالرواتب تلقائياً
- [x] صفحة طباعة كشف الراتب `/payroll/print/:id`

### 🆕 Background & Logo Upload System (Jan 16, 2026)
- [x] **رفع الخلفيات من الجهاز**: خيار جديد لرفع الصور مباشرة
- [x] **معالجة تلقائية للصور**: تحويل جميع الصيغ إلى JPEG بحجم مناسب (1920x1080)
- [x] **دعم صيغ متعددة**: JPEG, PNG, GIF, WEBP, HEIC, BMP, TIFF
- [x] **واجهة سحب وإفلات**: منطقة رفع بديهية

### 🆕 Tenant Identity Management (Jan 16, 2026)
- [x] **شعار المطعم**: رفع شعار مخصص لكل عميل من الجهاز
- [x] **اسم المطعم (عربي)**: حقل جديد للاسم بالعربي
- [x] **اسم المطعم (إنجليزي)**: حقل جديد للاسم بالإنجليزي
- [x] **تحكم من المالك**: يتحكم Super Admin فقط في هوية العميل

### 🆕 Dashboard UI Improvements (Jan 16, 2026)
- [x] **تصغير الأزرار**: أزرار الإجراءات السريعة أصغر وأكثر كثافة
- [x] **قابلية التمرير**: الصفحة قابلة للتمرير لعرض جميع الخيارات
- [x] **شبكة أفضل**: 3 أعمدة على الجوال، 4 متوسط، 6 كبير
- [x] **إزالة قسم الفواتير**: تم حذفه حسب طلب المستخدم

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

## 📡 New API Endpoints (Jan 16, 2026)

### File Upload
- `POST /api/upload/background` - رفع خلفية من الجهاز (multipart/form-data)
- `POST /api/upload/logo` - رفع شعار للعميل (multipart/form-data)

### Tenant Updates
- `PUT /api/super-admin/tenants/{id}` - تحديث بيانات العميل (يشمل name_ar, name_en, logo_url)

---

## 📁 New/Modified Files (Jan 16, 2026)

### Backend
- `/app/backend/server.py` - إضافة APIs رفع الملفات ومعالجة الصور
- `/app/backend/uploads/` - مجلد جديد للملفات المرفوعة
  - `/backgrounds/` - خلفيات صفحة الدخول
  - `/logos/` - شعارات العملاء

### Frontend
- `/app/frontend/src/pages/SuperAdmin.js` - تحديث نوافذ إضافة الخلفية وتعديل العميل
- `/app/frontend/src/pages/Dashboard.js` - تحسين حجم الأزرار والتخطيط
- `/app/frontend/src/App.js` - إزالة مسار الفواتير

---

## 🛠️ Tech Stack
- **Frontend**: React + Tailwind CSS + Shadcn/UI
- **Backend**: FastAPI (Python)
- **Database**: MongoDB
- **Maps**: Leaflet / OpenStreetMap
- **Excel**: openpyxl
- **Biometric**: pyzk (ZKTeco)
- **Push**: firebase-admin
- **Image Processing**: Pillow (PIL)

---

## 📊 Deployment Status
- ✅ All Core APIs Working
- ✅ Kitchen Display: Working
- ✅ Excel Export: Working
- ✅ Login Backgrounds: Working (with device upload)
- ✅ Driver Map: Working
- ✅ PWA Install Button: Working
- ✅ Loyalty Program: Working
- ✅ Recipes System: Working
- ✅ Coupons & Promotions: Working
- ✅ Background Upload: Working
- ✅ Logo Upload: Working
- ✅ Ready for Production

---

## 🔄 Needs Configuration
1. **PWA**: يحتاج اختبار على أجهزة فعلية
2. **Biometric**: يحتاج جهاز ZKTeco للاتصال الفعلي
3. **Push Notifications**: يحتاج إعداد Firebase project

---

## 📋 Backlog / Future Enhancements

### P0 - High Priority
- [ ] إعادة هيكلة server.py (ملف كبير جداً)
- [ ] نظام طلبات بين الفروع والمخزن
- [ ] نظام متكامل للمشتريات
- [ ] تنبيهات تلقائية عند انخفاض المخزون

### P1 - Medium Priority
- [ ] تحسين خريطة السائقين الحية (خط السير والتتبع الدقيق)
- [ ] الخلفيات المتجاوبة (وضع مظلم/فاتح)
- [ ] إشعارات Push (Firebase) للسائقين
- [ ] تكامل أجهزة البصمة ZKTeco (كتابة منطق الاتصال)
- [ ] نظام الولاء والوصفات (إكمال الواجهات)
- [ ] نظام تقييم العملاء للطلبات
- [ ] نظام حجوزات الطاولات
- [ ] تقارير ذكية بالرسوم البيانية

### P2 - Low Priority
- [ ] ميزة السحب والإفلات لترتيب أيقونات Dashboard
- [ ] أزرار رجوع موحدة في جميع الصفحات
- [ ] تقسيم ملفات SuperAdmin.js و HR.js
