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
7. **تطبيق سطح مكتب** (Electron) يعمل بدون إنترنت

---

## Completed Features (as of March 2026)

### Desktop Application (Electron) ✅ NEW
- [x] **نظام الترخيص** - Backend endpoints للتحقق من الترخيص
  - `GET /api/license/verify` - التحقق من صلاحية الترخيص
  - `POST /api/license/activate` - تفعيل الترخيص على جهاز جديد
  - `GET /api/license/devices` - قائمة الأجهزة المرخصة
  - `DELETE /api/license/devices/{device_id}` - إلغاء ترخيص جهاز
- [x] **License Manager** - إدارة الترخيص في Electron
  - التحقق من الترخيص عند بدء التشغيل
  - فترة سماح (24 ساعة) للعمل offline
  - فحص دوري للترخيص كل ساعة
- [x] **Sync Manager** - مزامنة البيانات
  - مزامنة الطلبات والمصاريف والورديات
  - تحديث البيانات المحلية من السيرفر
- [x] **قاعدة بيانات SQLite** - للعمل offline
- [x] **Printer Manager** - طباعة الفواتير وطلبات المطبخ
- [x] **صفحات الإعداد** - setup.html, offline.html
- [x] **قارئ الباركود** - دعم USB HID scanners (مارس 2026)
- [x] **لوحة تحكم الأجهزة** - إدارة الأجهزة المرخصة من Super Admin (مارس 2026)
  - `GET /api/super-admin/tenants/{id}/devices` - جلب أجهزة عميل
  - `PUT /api/super-admin/tenants/{id}/max-devices` - تحديث الحد الأقصى
  - `DELETE /api/super-admin/tenants/{id}/devices/{device_id}` - إلغاء جهاز
- [x] **ZKTeco Integration** - placeholder لدعم أجهزة البصمة (يتطلب SDK)

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
- [x] **اختبار License APIs** (100% نجاح - مارس 2026)

---

## Backlog / Remaining Tasks

### P0 (Immediate - COMPLETED ✅)
- [x] **نظام الترخيص Backend** - تم إنشاء endpoints (مارس 2026)
- [x] **إكمال تطبيق Electron** - دمج الواجهة الأمامية مع Electron
- [x] **لوحة تحكم الأجهزة** - إدارة الأجهزة من Super Admin
- [x] **دعم قارئ الباركود** - USB HID scanners

### P1 (Next Priority)
- [ ] **بناء ملفات التثبيت** - يتطلب تشغيل على Windows/Mac
  - Windows: `build-win.bat`
  - Mac: `build-mac.sh`
- [x] **دمج الأجهزة** - طابعات، قارئ باركود (جاهز)

### P2 (Medium Priority)
- [ ] إعادة هيكلة server.py (~16,000 سطر)
- [ ] تصدير التقارير إلى Excel
- [ ] دمج أجهزة البصمة ZKTeco (placeholder جاهز - يتطلب SDK)

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

### Desktop App
- **Electron** - Desktop shell
- **SQLite** (better-sqlite3) - Local database
- **electron-store** - Settings storage
- **electron-builder** - Installers
- **Barcode Scanner** - USB HID support
- **ZKTeco Manager** - Fingerprint device (placeholder)

### Key Files
- `/app/backend/server.py` - Main backend
- `/app/backend/routes/sync_routes.py` - Sync & Push APIs
- `/app/frontend/src/lib/offlineDB.js` - IndexedDB
- `/app/frontend/src/lib/offlineStorage.js` - Offline helpers
- `/app/frontend/src/lib/syncService.js` - Sync logic
- `/app/frontend/src/lib/pushService.js` - Push notifications
- `/app/frontend/public/sw-offline.js` - Service Worker V3
- `/app/frontend/src/pages/POS.js` - Point of Sale
- `/app/frontend/src/pages/Settings.js` - Settings page
- `/app/frontend/src/pages/SuperAdmin.js` - Owner dashboard with devices management
- `/app/desktop-app/main.js` - Electron main process
- `/app/desktop-app/src/license-manager.js` - License management
- `/app/desktop-app/src/sync-manager.js` - Data synchronization
- `/app/desktop-app/src/database.js` - SQLite database
- `/app/desktop-app/src/printer-manager.js` - Printing

---

## Test Credentials
- **Super Admin**: `owner@maestroegp.com` / `owner123` / Secret: `271018`
- **Demo User**: `demo@maestroegp.com` / `demo123`
- **Client**: `hanialdujaili@gmail.com` / `Hani@2024`

---

## API Endpoints

### Sync & Push
- `POST /api/sync/orders` - مزامنة الطلبات
- `POST /api/sync/customers` - مزامنة العملاء
- `POST /api/sync/batch` - مزامنة دفعية
- `GET /api/sync/status` - حالة المزامنة
- `POST /api/sync/push/subscribe` - تسجيل اشتراك Push
- `POST /api/sync/push/unsubscribe` - إلغاء اشتراك Push
- `GET /api/sync/push/subscriptions` - قائمة الأجهزة المشتركة
- `POST /api/upload/restaurant-logo` - رفع شعار المطعم (يدعم HEIC)

### License Management (NEW)
- `GET /api/license/verify` - التحقق من صلاحية الترخيص
- `POST /api/license/activate` - تفعيل الترخيص على جهاز
- `GET /api/license/devices` - قائمة الأجهزة المرخصة
- `DELETE /api/license/devices/{device_id}` - إلغاء ترخيص جهاز

---

## Recent Updates (March 17, 2026)

### Manufactured Product Link Field ✅
- [x] حقل "ربط بمنتج مصنع (للخصم التلقائي)" يظهر دائماً في نموذج إضافة/تعديل المنتج
- [x] رسالة تنبيه "لا توجد منتجات مصنعة حالياً. أضف منتجات من قسم المخزن والتصنيع أولاً" عندما لا توجد منتجات مصنعة
- [x] تصميم محسّن بخلفية بنفسجية للحقل

### Unit Options Enhancement ✅
- [x] إضافة وحدات قياس جديدة للمنتجات المصنعة:
  - مل (ملليلتر)
  - غرام
  - علبة
  - كرتون
- [x] الوحدات متوفرة في: قطعة، حبة، صحن، كغم، غرام، لتر، مل، علبة، كرتون

### Translation Updates ✅
- [x] ترجمة تبويبات Super Admin (العملاء، التجريبية، الأجهزة، الاشتراكات، الكل)
- [x] ترجمة وحدات القياس للإنجليزية (Kg, Gram, ml, Piece, Item, Tray, Box, Carton)
- [x] ترجمة رسائل حقل ربط المنتج المصنع

### POS Filter Fix ✅
- [x] إصلاح منطق فلترة المنتجات لمعالجة أنواع البيانات المختلفة
- [x] مقارنة مرنة لـ category_id باستخدام String conversion

---

## Notes
- يجب زيارة التطبيق مرة واحدة وهو متصل لتثبيت Service Worker
- قاعدة البيانات الإنتاجية تحتاج seed عبر `/api/utils/seed-data`
- إشعارات Push تتطلب HTTPS في الإنتاج
- الترجمة تعتمد على حقل `name_en` في الفئات والمنتجات والعملاء
- قائمة الأيقونات وسجلات المراقبة تترجم عبر `autoTranslate.js`
- دعم صيغ HEIC/HEIF من iPhone عبر مكتبة `pillow-heif`
- **تطبيق سطح المكتب** يحتاج بناء على جهاز Windows/Mac
