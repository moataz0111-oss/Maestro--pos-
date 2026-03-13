# Maestro Restaurant Management System - PRD

## Original Problem Statement
نظام إدارة مطاعم متكامل يدعم العمل بدون إنترنت (Offline-First) مع مزامنة البيانات عند عودة الاتصال.

## User Personas
- **مدير المطعم**: إدارة الموظفين، التقارير، المصاريف
- **الكاشير**: نقطة البيع، إنشاء الطلبات
- **موظف المطبخ**: شاشة المطبخ، إدارة الطلبات
- **السائق**: إدارة التوصيل

## Core Requirements
1. نظام نقطة بيع (POS) سريع وسهل الاستخدام
2. دعم العمل بدون إنترنت مع مزامنة تلقائية
3. إدارة المخزون والمشتريات
4. إدارة الموظفين والرواتب
5. التقارير والإحصائيات
6. دعم متعدد اللغات (عربي/إنجليزي/كردي)

---

## Completed Features (as of December 2025)

### Offline-First Implementation ✅
- [x] دعم offline لـ POS, Orders, Tables, KitchenDisplay
- [x] دعم offline لـ Inventory, HR, Expenses
- [x] دعم offline لـ Dashboard (الإحصائيات)
- [x] مؤشر تقدم المزامنة في OfflineBanner
- [x] إشعارات صوتية عند نجاح المزامنة
- [x] حفظ اسم المطعم والشعار للعمل offline
- [x] حفظ الإحصائيات والطلبات المحلية
- [x] **مزامنة تلقائية** عند عودة الاتصال (بدون زر)
- [x] **إخفاء شريط Offline** بعد اكتمال المزامنة
- [x] **تحميل مسبق لجميع الصفحات** للعمل offline
- [x] **Service Worker V3** لتخزين جميع مسارات التطبيق

### Push Notifications ✅
- [x] تسجيل اشتراكات Push في Backend
- [x] إرسال إشعارات عند مزامنة طلبات من أجهزة أخرى
- [x] UI لتفعيل/إلغاء الإشعارات في صفحة الإعدادات
- [x] إشعار تجريبي للاختبار

### Multi-Language Support ✅ (Fully Fixed Dec 2025)
- [x] ترجمة أسماء الفئات (name_en) في POS والإعدادات
- [x] ترجمة أسماء المنتجات (name_en) في POS والإعدادات
- [x] ترجمة أيقونات الفئات في dropdown الإعدادات
- [x] **ترجمة قائمة اختيار الأيقونات** (Coffee, Juices, Pizza, etc.)
- [x] **ترجمة سجلات المراقبة (Audit Logs)**
- [x] **ترجمة أسماء العملاء** في Dashboard و SuperAdmin
- [x] دالة getLocalizedName() للحصول على الاسم المترجم
- [x] دعم 3 لغات: العربية، الإنجليزية، الكردية

### Category Icons Fix ✅ (Fixed Dec 2025)
- [x] الأيقونة تظهر دائماً في منتصف بطاقة الفئة
- [x] الأيقونة تظهر في الشريط السفلي مع الاسم
- [x] الأيقونة مرئية حتى مع وجود صورة للفئة
- [x] أيقونة افتراضية 📦 للفئات بدون أيقونة

### Image Upload & Display Fix ✅ (Fixed Mar 2026)
- [x] دعم صيغ HEIC/HEIF من iPhone
- [x] إصلاح عرض شعار المطعم بعد الرفع
- [x] إصلاح معالجة URLs الصور
- [x] **إصلاح مشكلة تكرار /api في روابط الصور** (BACKEND_URL بدلاً من API)
- [x] **ظهور شعار المطعم في header لوحة التحكم** للمستخدم hanialdujaili@gmail.com
- [x] **ظهور صور الفئات والمنتجات في شاشة POS** بشكل صحيح
- [x] **ظهور صور الفئات في صفحة الإعدادات** بشكل صحيح

### Authentication & Security ✅
- [x] نظام تسجيل دخول آمن
- [x] دعم تسجيل الدخول offline
- [x] إدارة الصلاحيات والأدوار
- [x] سجل انتحال الهوية (Impersonation Logs)

### Testing ✅
- [x] اختبار المزامنة على أجهزة متعددة (21/21 اختبار نجح)
- [x] اختبار منع تكرار الطلبات
- [x] اختبار مزامنة المصاريف والعملاء
- [x] اختبار الترجمة (100% نجاح)
- [x] اختبار قائمة الأيقونات (100% نجاح)
- [x] اختبار سجلات المراقبة والشعار وأسماء العملاء (100% نجاح)

---

## Backlog / Remaining Tasks

### P0 (Immediate - Ready for Deployment)
- [x] **إصلاح عرض الشعار والصور** - تم الإصلاح والاختبار (مارس 2026)
- [ ] **نشر التطبيق (Deployment)** - جاهز للنشر (تم فحص الجاهزية ✅)

### P2 (Medium Priority)
- [ ] إعادة هيكلة server.py (~15,000 سطر)
- [ ] تصدير التقارير إلى Excel

### P3 (Low Priority)
- [ ] تحسينات UI/UX إضافية
- [ ] توثيق API كامل

---

## Technical Architecture

### Frontend
- React.js with Shadcn/UI
- IndexedDB for offline storage
- Service Worker V3 for caching
- Push Notifications API

### Backend
- FastAPI (Python)
- MongoDB
- JWT Authentication
- Push Subscriptions
- pillow-heif for HEIC support

### Key Files
- `/app/backend/server.py` - Main backend
- `/app/backend/routes/sync_routes.py` - Sync & Push APIs
- `/app/frontend/src/lib/offlineDB.js` - IndexedDB
- `/app/frontend/src/lib/offlineStorage.js` - Offline helpers
- `/app/frontend/src/lib/syncService.js` - Sync logic
- `/app/frontend/src/lib/pushService.js` - Push notifications
- `/app/frontend/public/sw-offline.js` - Service Worker V3
- `/app/frontend/src/pages/POS.js` - Point of Sale (with getLocalizedName and icon display)
- `/app/frontend/src/pages/Settings.js` - Settings page (logo handling fixed)
- `/app/frontend/src/pages/Dashboard.js` - Dashboard (tenant name translation)
- `/app/frontend/src/pages/SuperAdmin.js` - Super Admin (tenant name translation)
- `/app/frontend/src/utils/translations.js` - All translations including icons
- `/app/frontend/src/utils/autoTranslate.js` - Translation map used by t() function
- `/app/frontend/src/components/ImageUploader.js` - Image upload component

---

## Test Credentials
- **Super Admin**: `/super-admin`, password: `superadmin`
- **Demo User**: `demo@maestroegp.com` / `demo123`
- **Client**: `hanialdujaili@gmail.com` / `Hani@2024`

---

## API Endpoints (Sync & Push)
- `POST /api/sync/orders` - مزامنة الطلبات
- `POST /api/sync/customers` - مزامنة العملاء
- `POST /api/sync/batch` - مزامنة دفعية
- `GET /api/sync/status` - حالة المزامنة
- `POST /api/sync/push/subscribe` - تسجيل اشتراك Push
- `POST /api/sync/push/unsubscribe` - إلغاء اشتراك Push
- `GET /api/sync/push/subscriptions` - قائمة الأجهزة المشتركة
- `POST /api/upload/restaurant-logo` - رفع شعار المطعم (يدعم HEIC)

---

## Notes
- يجب زيارة التطبيق مرة واحدة وهو متصل لتثبيت Service Worker
- قاعدة البيانات الإنتاجية تحتاج seed عبر `/api/utils/seed-data`
- إشعارات Push تتطلب HTTPS في الإنتاج
- الترجمة تعتمد على حقل `name_en` في الفئات والمنتجات والعملاء
- قائمة الأيقونات وسجلات المراقبة تترجم عبر `autoTranslate.js`
- دعم صيغ HEIC/HEIF من iPhone عبر مكتبة `pillow-heif`
