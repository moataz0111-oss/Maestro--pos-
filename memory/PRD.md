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

### Offline Mode Complete Fix ✅ (Fixed - March 23, 2026)

#### Issue 1: Shift and Branch disappearing on offline reload
- [x] حفظ بيانات الوردية في `localStorage` عند تحميلها من API
- [x] تحميل الوردية من `localStorage` عند عدم الاتصال
- [x] حفظ قائمة الفروع في `localStorage` عند تحميلها من API
- [x] تهيئة الفروع من `localStorage` عند بدء التطبيق
- [x] حفظ `cached_user` في `localStorage` عند تسجيل الدخول (لحل مشكلة التنقل)

#### Issue 2: Pending orders count not showing on branch selector
- [x] إضافة دالة `getAllCachedOrders()` في `offlineStorage.js`
- [x] تعديل `fetchPendingOrdersCounts` لاستخدام جميع الطلبات المخزنة (وليس فقط طلبات اليوم)
- [x] إضافة `useEffect` لحساب الطلبات المعلقة عند تحميل الفروع من `localStorage`

#### Issue 3: "Order not found" error when opening order from pending list
- [x] تعديل `loadOrderForEditing` لقبول الطلب كـ object مباشرة
- [x] البحث في قائمة الطلبات المعلقة الموجودة في الـ state أولاً
- [x] تمرير الطلب مباشرة من `pendingOrders` dialogs بدلاً من البحث عنه

### Files Modified:
- `/app/frontend/src/pages/POS.js`
- `/app/frontend/src/context/BranchContext.js`
- `/app/frontend/src/context/AuthContext.js`
- `/app/frontend/src/lib/offlineStorage.js`


### BranchContext Initialization Fix ✅ (Fixed - March 23, 2026)
- [x] إصلاح خطأ `Cannot access 'fetchPendingOrdersCounts' before initialization`
- [x] التأكد من ترتيب تعريف الدوال قبل استخدامها في `useEffect`
- [x] التحقق من عمل التطبيق بعد تسجيل الدخول

### Production Deployment Files ✅ (Created - March 23, 2026)
- [x] إنشاء سكريبت `seed_data.py` لإدخال البيانات الأساسية (Super Admin, Hani, Demo)
- [x] إنشاء دليل النشر `PRODUCTION_GUIDE.md` مع جميع الأوامر
- [x] ملفات Docker جاهزة للنشر

---

### Desktop Application (Electron) ✅ REMOVED
- تم حذف تطبيق سطح المكتب بالكامل بناءً على طلب المستخدم
- التركيز على تطبيق الويب كـ PWA مع دعم كامل للعمل بدون إنترنت

### Edit Table Feature ✅
- [x] إضافة زر "تعديل" في صفحة إدارة الطاولات
- [x] إضافة نافذة منبثقة لتعديل بيانات الطاولة
- [x] إضافة API endpoint جديد `PUT /api/tables/{table_id}`

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
- `/app/frontend/src/lib/offlineStorage.js` - Offline helpers (including getAllCachedOrders)
- `/app/frontend/public/sw-offline.js` - Service Worker V4

---

## Test Credentials
- **Client**: `hanialdujaili@gmail.com` / `Hani@2024`
- **Super Admin**: `owner@maestroegp.com` / `owner123` / Secret: `271018`

---

## Project Health Check
- ✅ Offline persistence for Shift
- ✅ Offline persistence for Branch selector
- ✅ Navigation works in offline mode
- ✅ Pending orders count shows correctly in offline mode
- ✅ Opening orders from pending list works in offline mode
- Mocked: ZKTeco fingerprint integration

---

## Notes
- يجب زيارة التطبيق مرة واحدة وهو متصل لتثبيت Service Worker
- قاعدة البيانات الإنتاجية تحتاج seed عبر `/api/utils/seed-data`
- **تطبيق سطح المكتب (Electron) تم حذفه** - التركيز على PWA
