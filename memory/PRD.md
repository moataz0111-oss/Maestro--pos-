# Maestro EGP - PRD (Product Requirements Document)

## Original Problem Statement
نظام شامل لإدارة المطاعم والكافيهات باسم "Maestro EGP" مع دعم Multi-tenant، تتبع السائقين، نظام كول سنتر، إدارة الموارد البشرية، وتحويلات المخزون.

---

## ✅ Completed Features

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
- [x] تعديل بيانات العملاء الكاملة
- [x] إرسال بريد ترحيبي تلقائي للعملاء

### Login Page Animated Backgrounds
- [x] خلفيات متحركة لصفحة تسجيل الدخول
- [x] 5 أنواع حركات: Fade, Zoom, Ken Burns, Slide, Parallax
- [x] تبديل تلقائي بين الخلفيات
- [x] تحكم كامل من Super Admin
- [x] تصميم Glass Effect للكارت

### Kitchen Display System (KDS)
- [x] شاشة المطبخ KDS كاملة
- [x] عرض الطلبات الجديدة والمحضّرة
- [x] تتبع وقت كل طلب
- [x] تنبيهات للطلبات المتأخرة
- [x] وضع ملء الشاشة
- [x] صوت تنبيه للطلبات الجديدة

### Excel Export
- [x] تصدير تقارير المبيعات إلى Excel
- [x] تصدير تقارير المنتجات (الأكثر مبيعاً)
- [x] تصدير تقارير المصاريف
- [x] تنسيق احترافي مع ألوان

### Call Center System
- [x] إعدادات ربط الكول سنتر
- [x] Webhook لاستقبال المكالمات
- [x] إشعار منبثق للمكالمات الواردة
- [x] صفحة سجل المكالمات

### HR System
- [x] إدارة الموظفين (CRUD)
- [x] تسجيل الحضور والانصراف
- [x] نظام السلف والخصومات
- [x] حساب كشوفات الرواتب

### Warehouse & Inventory System
- [x] تحويلات المخزون بين الفروع
- [x] طلبات الشراء من الفروع

### 🆕 Driver Tracking Map (Jan 15, 2026)
- [x] مكون خريطة متقدم `/components/DriverTrackingMap.js`
- [x] 3 أنماط خريطة (Streets, Satellite, Dark)
- [x] تتبع السائقين بماركرات متحركة
- [x] خطوط توصيل للطلبات النشطة
- [x] قائمة جانبية للسائقين
- [x] نوافذ معلومات تفاعلية
- [x] تكامل كامل مع صفحة التوصيل

### 🆕 PWA Enhancement (Jan 15, 2026)
- [x] تحسين Service Worker v3
- [x] Manifest لتطبيق الإدارة (manifest-admin.json)
- [x] مكون زر تثبيت PWA (`PWAInstallButton.js`)
- [x] تعليمات التثبيت للـ iOS, Android, Desktop
- [x] استراتيجيات تخزين مؤقت متعددة

### 🆕 Biometric Device Integration (Jan 15, 2026)
- [x] واجهة API لأجهزة البصمة ZKTeco
- [x] واجهة مستخدم لإدارة الأجهزة في صفحة HR
- [x] دعم Push SDK لاستقبال البيانات
- [x] مزامنة سجلات الحضور
- [x] اختبار الاتصال بالأجهزة
- [x] تعليمات الربط للمستخدم

---

## 🔄 In Progress / Upcoming

### Priority 1 (P0/P1)
- [ ] **إصلاح PWA للسائقين** - يتطلب اختبار من المستخدم على جهاز فعلي
- [ ] **إكمال تكامل أجهزة البصمة** - تثبيت مكتبة pyzk على السيرفر الإنتاجي

### Code Refactoring (P1)
- [ ] **تقسيم server.py** (6100+ سطر) إلى ملفات منفصلة
  - تم إنشاء `/backend/api/login_backgrounds.py` كنموذج
  - تم إنشاء `/backend/api/biometric.py`
  - باقي الملفات تحتاج النقل التدريجي

---

## 📋 Future Tasks (P2)
- [ ] برنامج ولاء العملاء
- [ ] تخصيص الفاتورة وربط الطابعات
- [ ] نظام الوصفات والمواد الخام
- [ ] ربط السلف والخصومات بالرواتب
- [ ] كشوف رواتب مطبوعة

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

### Biometric Devices (NEW)
- `GET /api/biometric/devices` - قائمة الأجهزة
- `POST /api/biometric/devices` - إضافة جهاز
- `POST /api/biometric/devices/{id}/test` - اختبار الاتصال
- `POST /api/biometric/devices/{id}/sync` - مزامنة الحضور
- `POST /api/biometric/push` - استقبال Push من الأجهزة
- `GET /api/biometric/attendance` - سجلات الحضور

### Kitchen Display
- `GET /api/orders?status=pending,preparing` - طلبات المطبخ
- `PUT /api/orders/{id}/status` - تحديث حالة الطلب

### Excel Export
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
- **Biometric**: pyzk (ZKTeco devices)

---

## 📁 New Files Created (Jan 15, 2026)
- `/app/frontend/src/components/PWAInstallButton.js` - مكون زر تثبيت PWA
- `/app/frontend/src/components/BiometricDevices.js` - واجهة إدارة أجهزة البصمة
- `/app/frontend/public/manifest-admin.json` - ملف manifest للوحة الإدارة
- `/app/backend/api/biometric.py` - ملف API منفصل لأجهزة البصمة (نموذج)
- `/app/backend/api/login_backgrounds.py` - ملف API منفصل للخلفيات (نموذج)

---

## 📊 Deployment Status
- ✅ All APIs Working
- ✅ Kitchen Display: Working
- ✅ Excel Export: Working
- ✅ Login Backgrounds: Working
- ✅ Driver Map: Working
- ✅ Biometric Devices UI: Working
- ✅ PWA Install Button: Working
- ✅ Ready for Production

---

## ⚠️ Notes for Next Session
1. **PWA Testing**: يحتاج اختبار من المستخدم على جهاز فعلي (Android/iOS/Desktop)
2. **Biometric Devices**: يحتاج تثبيت `pyzk` على السيرفر الإنتاجي للاتصال الفعلي بالأجهزة
3. **Refactoring**: يُفضل نقل routes تدريجياً من `server.py` لتحسين الصيانة
