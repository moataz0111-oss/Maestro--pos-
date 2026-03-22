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
7. **PWA (Progressive Web App)** يعمل بدون إنترنت

---

## Completed Features (as of March 2026)

### Offline Mode Bug Fix ✅ (Fixed - March 22, 2026)
- [x] **إصلاح اختفاء الوردية عند إعادة التحميل offline**
  - حفظ بيانات الوردية في `localStorage` عند تحميلها من API
  - تحميل الوردية من `localStorage` عند عدم الاتصال
- [x] **إصلاح اختفاء dropdown الفروع عند إعادة التحميل offline**
  - حفظ قائمة الفروع في `localStorage` عند تحميلها من API
  - تهيئة الفروع من `localStorage` عند بدء التطبيق
- [x] **إصلاح عدم التنقل إلى صفحات أخرى في وضع offline**
  - حفظ `cached_user` في `localStorage` عند تسجيل الدخول
  - السماح بالتنقل بين الصفحات باستخدام بيانات المستخدم المحفوظة

### Desktop Application (Electron) ✅ REMOVED
- تم حذف تطبيق سطح المكتب بالكامل بناءً على طلب المستخدم
- التركيز على تطبيق الويب كـ PWA مع دعم كامل للعمل بدون إنترنت

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
- [x] **Service Worker V4** لتخزين جميع مسارات التطبيق

### Edit Table Feature ✅ (Fixed - March 22, 2026)
- [x] إضافة زر "تعديل" في صفحة إدارة الطاولات
- [x] إضافة نافذة منبثقة لتعديل بيانات الطاولة (رقم، سعة، قسم)
- [x] إضافة API endpoint جديد `PUT /api/tables/{table_id}` للتحديث

### SuperAdmin UI Fix ✅ (Fixed - March 22, 2026)
- [x] إخفاء عمود "الأجهزة" من صفحة العملاء

---

## Backlog / Remaining Tasks

### P1 (Next Priority)
- [ ] **تكامل بصمة ZKTeco** - تنفيذ واجهة المستخدم والتكامل مع الأجهزة

### P2 (Medium Priority)
- [ ] **تصدير التقارير إلى Excel** - إضافة خاصية التصدير للتقارير

### P3 (Low Priority)
- [ ] إعادة هيكلة `server.py` (~16,000 سطر)
- [ ] إعادة هيكلة `POS.js` (~3,500 سطر)
- [ ] توثيق API كامل

---

## Technical Architecture

### Frontend
- React.js with Shadcn/UI
- IndexedDB for offline storage
- Service Worker V4 for caching
- Push Notifications API

### Backend
- FastAPI (Python)
- MongoDB
- JWT Authentication
- Push Subscriptions

### Key Files
- `/app/backend/server.py` - Main backend
- `/app/frontend/src/pages/POS.js` - Point of Sale
- `/app/frontend/src/context/AuthContext.js` - Authentication with offline support
- `/app/frontend/src/context/BranchContext.js` - Branch management with offline support
- `/app/frontend/src/lib/offlineDB.js` - IndexedDB
- `/app/frontend/src/lib/offlineStorage.js` - Offline helpers
- `/app/frontend/public/sw-offline.js` - Service Worker V4

---

## Test Credentials
- **Client**: `hanialdujaili@gmail.com` / `Hani@2024`
- **Super Admin**: `owner@maestroegp.com` / `owner123` / Secret: `271018`

---

## Recent Updates (March 22, 2026)

### Offline Persistence Fix ✅
**المشكلة**: عند إعادة تحميل صفحة POS في وضع عدم الاتصال:
1. الوردية تختفي (تظهر "لا توجد وردية مفتوحة")
2. dropdown اختيار الفرع يختفي
3. لا يمكن التنقل بين الصفحات

**الحل**:
1. **POS.js**: إضافة حفظ الوردية في `localStorage` عند تحميلها من API
2. **BranchContext.js**: 
   - إضافة حفظ الفروع في `localStorage` عند تحميلها من API
   - تهيئة الفروع من `localStorage` عند بدء التطبيق (للعمل offline)
3. **AuthContext.js**: 
   - إضافة حفظ `cached_user` في `localStorage` عند تسجيل الدخول
   - هذا يسمح للتطبيق بالتعرف على صلاحيات المستخدم في وضع offline

**الملفات المعدلة**:
- `/app/frontend/src/pages/POS.js`
- `/app/frontend/src/context/BranchContext.js`
- `/app/frontend/src/context/AuthContext.js`

---

## Notes
- يجب زيارة التطبيق مرة واحدة وهو متصل لتثبيت Service Worker
- قاعدة البيانات الإنتاجية تحتاج seed عبر `/api/utils/seed-data`
- إشعارات Push تتطلب HTTPS في الإنتاج
- الترجمة تعتمد على حقل `name_en` في الفئات والمنتجات والعملاء
- **تطبيق سطح المكتب (Electron) تم حذفه** - التركيز على PWA

---

## Project Health Check
- ✅ Offline persistence for Shift
- ✅ Offline persistence for Branch selector
- ✅ Navigation works in offline mode
- Mocked: ZKTeco fingerprint integration
