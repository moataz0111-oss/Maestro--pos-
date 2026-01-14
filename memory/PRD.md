# Maestro EGP - PRD (Product Requirements Document)

## Original Problem Statement
نظام شامل لإدارة المطاعم والكافيهات باسم "Maestro EGP" مع دعم Multi-tenant، تتبع السائقين، نظام كول سنتر، إدارة الموارد البشرية، وتحويلات المخزون.

---

## ✅ All Completed Features (Updated Jan 15, 2026)

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
- [x] نقاط ترحيب وإحالة وعيد ميلاد
- [x] مضاعفات النقاط حسب المستوى
- [x] واجهة مستخدم كاملة `/loyalty`

### Recipes & Raw Materials
- [x] إدارة المواد الخام (11 تصنيف)
- [x] إنشاء وصفات للمنتجات
- [x] حساب التكلفة التلقائي
- [x] حساب هامش الربح
- [x] تنبيهات المخزون المنخفض
- [x] واجهة مستخدم كاملة `/recipes`

### Invoice Customization & Printing
- [x] قوالب فواتير مخصصة
- [x] دعم طابعات حرارية (58mm/80mm)
- [x] إعدادات الشعار والعنوان والتذييل
- [x] معاينة الفاتورة
- [x] إدارة الطابعات (Network/USB/Bluetooth)
- [x] واجهة مستخدم كاملة `/invoices`

### Push Notifications Infrastructure
- [x] واجهة API لتسجيل FCM tokens
- [x] إرسال إشعارات (user/role/branch/all)
- [x] قوالب إشعارات جاهزة
- [x] سجل الإشعارات
- [x] firebase-admin مثبت

### 🆕 Payroll Automation (Jan 15, 2026)
- [x] ربط السلف والخصومات بالرواتب تلقائياً
- [x] API لتوليد كشوفات رواتب لجميع الموظفين دفعة واحدة
- [x] API لجلب بيانات طباعة كشف الراتب
- [x] صفحة طباعة كشف الراتب `/payroll/print/:id`
- [x] تصميم احترافي للطباعة مع:
  - تفاصيل الموظف والفرع
  - جدول المكافآت
  - جدول الخصومات
  - استقطاع السلف
  - ملخص صافي الراتب
  - توقيعات
- [x] زر طباعة في صفحة HR

### 🆕 Coupons & Promotions System (Jan 15, 2026)
- [x] نظام الكوبونات الكامل:
  - كوبون نسبة مئوية أو مبلغ ثابت
  - حد أدنى للطلب
  - حد أقصى للخصم
  - عدد استخدامات كلي ولكل عميل
  - تاريخ بداية ونهاية الصلاحية
  - ربط بمستوى الولاء (للأعضاء المميزين)
  - خيار للطلب الأول فقط
  - التحقق من صلاحية الكوبون
  - تتبع الاستخدامات
- [x] نظام العروض الترويجية:
  - اشترِ X واحصل على Y
  - ساعة السعادة (Happy Hour)
  - باقات بسعر ثابت
  - ربط بمستوى الولاء
- [x] واجهة مستخدم كاملة `/coupons`
- [x] إحصائيات الكوبونات والعروض

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

## 📡 New API Endpoints (Jan 15, 2026)

### Payroll
- `GET /api/payroll/{id}/print` - بيانات طباعة كشف الراتب
- `POST /api/payroll/generate-all` - توليد كشوفات لجميع الموظفين

### Coupons
- `GET /api/coupons` - قائمة الكوبونات
- `POST /api/coupons` - إنشاء كوبون
- `PUT /api/coupons/{id}` - تعديل كوبون
- `DELETE /api/coupons/{id}` - حذف كوبون
- `POST /api/coupons/validate` - التحقق من صلاحية الكوبون
- `POST /api/coupons/{id}/use` - تسجيل استخدام الكوبون

### Promotions
- `GET /api/promotions` - قائمة العروض
- `POST /api/promotions` - إنشاء عرض
- `PUT /api/promotions/{id}` - تعديل عرض
- `DELETE /api/promotions/{id}` - حذف عرض
- `GET /api/promotions/active` - العروض النشطة حالياً

---

## 📁 New Files Created (Jan 15, 2026)

### Frontend
- `/app/frontend/src/pages/Coupons.js` - صفحة الكوبونات والعروض
- `/app/frontend/src/pages/PayrollPrint.js` - صفحة طباعة كشف الراتب

---

## 🛠️ Tech Stack
- **Frontend**: React + Tailwind CSS + Shadcn/UI
- **Backend**: FastAPI (Python)
- **Database**: MongoDB
- **Maps**: Leaflet / OpenStreetMap
- **Excel**: openpyxl
- **Biometric**: pyzk (ZKTeco)
- **Push**: firebase-admin

---

## 📊 Deployment Status
- ✅ All Core APIs Working
- ✅ Kitchen Display: Working
- ✅ Excel Export: Working
- ✅ Login Backgrounds: Working
- ✅ Driver Map: Working
- ✅ Biometric Devices UI: Working
- ✅ PWA Install Button: Working
- ✅ Loyalty Program: Working
- ✅ Recipes System: Working
- ✅ Invoice Templates: Working
- ✅ Payroll Print: Working
- ✅ Coupons & Promotions: Working
- ✅ Ready for Production

---

## 🔄 Needs Configuration
1. **PWA**: يحتاج اختبار على أجهزة فعلية
2. **Biometric**: يحتاج جهاز ZKTeco للاتصال الفعلي
3. **Push Notifications**: يحتاج إعداد Firebase project

---

## 📋 Future Enhancements (P2/P3)
- [ ] إشعارات Push حية للسائقين (يحتاج Firebase setup)
- [ ] نظام حجوزات الطاولات مسبقاً
- [ ] تطبيق موبايل للعملاء
- [ ] تقارير ذكية بالرسوم البيانية
- [ ] ربط مع شركات التوصيل الخارجية
