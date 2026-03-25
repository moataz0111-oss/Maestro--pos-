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

### Product Extras in Sales Reports ✅ (Fixed - March 24, 2026)
**المشكلة**: الإضافات (Extras) كانت تُحسب بشكل صحيح في سلة POS والفاتورة، لكنها لم تُضمّن في تقارير المبيعات وإحصائيات لوحة التحكم.

**الحل**:
- [x] إضافة حقل `extras` إلى نموذج `OrderItemCreate` (السطر 1250)
- [x] تعديل حساب `subtotal` ليشمل سعر الإضافات: `(base_price + extras_price) * quantity`
- [x] إضافة حقل `extras_total` لكل عنصر في الطلب لسهولة التتبع
- [x] التحقق من صحة التقارير (9/9 اختبارات ناجحة)

**الملفات المعدلة**:
- `/app/backend/server.py` - السطور 1243-1250, 4593-4644

### Manufacturing to Branch Transfer Fix ✅ (Fixed - March 25, 2026)
**المشكلة 1 - UI**: حقل الكمية لم يتغير لونه بين الوضع الليلي والنهاري.
**الحل**: إضافة `bg-white dark:bg-gray-800 text-black dark:text-white` للحقل.

**المشكلة 2 - وظيفية**: زر "تحويل للفرع" لا يعمل عند إدخال الكمية.
**السبب**: الـ endpoint `POST /api/warehouse-transfers` غير موجود.
**الحل**: إنشاء endpoint جديد للتحويل من التصنيع للفرع يقوم بـ:
- التحقق من وجود الفرع
- التحقق من توفر الكمية المطلوبة
- خصم الكمية من المنتجات المصنعة
- إضافة الكمية لمخزون الفرع
- تسجيل حركة التحويل

**الملفات المعدلة**:
- `/app/frontend/src/pages/WarehouseManufacturing.js` - إصلاح ألوان حقل الكمية
- `/app/backend/routes/inventory_system.py` - إضافة endpoint التحويل

### Add Stock / Product Statistics Feature ✅ (Added - March 25, 2026)
**الميزة الجديدة**: إضافة زيادة كمية المنتج المصنع مباشرة + عرض إحصائيات الإنتاج.

**المشكلة**: 
- المستخدم كان يحتاج لإنشاء "تصنيع جديد" كل مرة لزيادة الكمية
- لم يكن هناك تتبع للكمية المحولة للفروع

**الحل**:
- إضافة endpoint `POST /api/manufactured-products/{id}/add-stock?quantity=N` لزيادة الكمية مباشرة
- إضافة حقول `total_produced` و `transferred_quantity` لتتبع الإحصائيات
- عرض إحصائيات (إجمالي المُصنّع، المحول للفروع، المتبقي) لكل منتج
- إضافة شريط تقدم بصري لنسبة المتبقي
- زر "زيادة الكمية" مع نافذة حوار مخصصة

**الملفات المعدلة**:
- `/app/backend/routes/inventory_system.py`
- `/app/frontend/src/pages/WarehouseManufacturing.js`
- `/app/frontend/src/utils/autoTranslate.js`

**حالة الاختبار**: ✅ 10/10 اختبارات ناجحة (iteration_120)

---

### Raw Materials Stock & Statistics Feature ✅ (Added - March 25, 2026)
**الميزة الجديدة**: إضافة زيادة كمية المادة الخام مباشرة + عرض إحصائيات المخزون + تنبيهات انخفاض المخزون.

**الحل**:
- إضافة endpoint `POST /api/raw-materials-new/{id}/add-stock?quantity=N` لزيادة الكمية مباشرة
- إضافة حقول `total_received` و `transferred_to_manufacturing` لتتبع الإحصائيات
- عرض إحصائيات (إجمالي الوارد، المحول للتصنيع، المتبقي) لكل مادة خام
- إضافة شريط تقدم بصري لنسبة المتبقي
- زر "+" لزيادة الكمية مع نافذة حوار مخصصة
- تنبيه بصري (animate-pulse + أيقونة تحذير) عند انخفاض المخزون أقل من الحد الأدنى

**الملفات المعدلة**:
- `/app/backend/routes/inventory_system.py`
- `/app/frontend/src/pages/WarehouseManufacturing.js`
- `/app/frontend/src/utils/autoTranslate.js`

**حالة الاختبار**: ✅ 10/10 اختبارات ناجحة (iteration_121)

---

### Manufacturing to Warehouse Requests Feature ✅ (Added - March 25, 2026)
**الميزة الجديدة**: نظام طلبات المواد الخام من التصنيع إلى المخزن.

**الوصف**:
- قسم التصنيع يمكنه طلب مواد خام من المخزن
- المخزن يرى الطلبات الواردة في تاب "طلبات التصنيع"
- أمين المخزن يمكنه تنفيذ الطلب (تحويل المواد) أو رفضه

**الـ APIs**:
- `POST /api/manufacturing-requests` - إنشاء طلب جديد
- `GET /api/manufacturing-requests` - جلب جميع الطلبات
- `POST /api/manufacturing-requests/{id}/fulfill` - تنفيذ الطلب وتحويل المواد
- `PATCH /api/manufacturing-requests/{id}/status?status=rejected` - رفض الطلب

**الملفات المعدلة**:
- `/app/backend/routes/inventory_system.py`
- `/app/frontend/src/pages/WarehouseManufacturing.js`
- `/app/frontend/src/utils/autoTranslate.js`

**حالة الاختبار**: ✅ 14/14 اختبارات ناجحة (iteration_122)

---

### Role-Based Access Control (RBAC) ✅ (Added - March 25, 2026)
**الميزة الجديدة**: صلاحيات الأدوار وتوجيه المستخدمين حسب دورهم.

**الأدوار وصلاحياتها**:
1. **warehouse_keeper (أمين المخزن)**:
   - يرى فقط: المخزن، طلبات التصنيع الواردة، الحركات، التحويلات
   - التوجيه التلقائي: `/warehouse-manufacturing`

2. **manufacturer (مسؤول التصنيع)**:
   - يرى فقط: التصنيع، طلبات الفروع، التحويلات
   - التوجيه التلقائي: `/warehouse-manufacturing`

3. **purchaser (مسؤول المشتريات)**:
   - يرى فقط: صفحة المشتريات
   - التوجيه التلقائي: `/purchasing`

**التغييرات**:
- تعديل `PermissionRoute` في App.js للتحقق من صلاحيات الدور
- تعديل `PublicRoute` للتوجيه التلقائي بعد تسجيل الدخول
- إخفاء/إظهار التابات في WarehouseManufacturing.js حسب الدور

**الملفات المعدلة**:
- `/app/frontend/src/App.js`
- `/app/frontend/src/pages/WarehouseManufacturing.js`

**حالة الاختبار**: ✅ 20/20 اختبارات ناجحة (iteration_123)

---

### Purchase Receive Endpoint ✅ (Added - March 25, 2026)
**الميزة الجديدة**: استلام طلبات الشراء وإضافة المواد للمخزن تلقائياً.

**الـ API**:
- `POST /api/purchase-requests/{id}/receive` - استلام الطلب وتحديث المخزون

**الملفات المعدلة**:
- `/app/backend/routes/inventory_system.py`

**حالة الاختبار**: ✅ متضمن في iteration_123

---

### Waste Percentage Feature ✅ (Added - March 25, 2026)
**الميزة الجديدة**: إضافة حقل "نسبة الهدر" للمواد الخام في المخزون.

**الوصف**: 
- عند شراء مادة خام (مثل اللحم)، يمكن تحديد نسبة الهدر (مثل 10%)
- النظام يحسب تلقائياً التكلفة الفعلية بعد الهدر
- مثال: كيلو لحم بـ 8,000 دينار مع هدر 10% = التكلفة الفعلية 8,889 دينار

**التغييرات**:
- إضافة حقل `waste_percentage` لنموذج المادة الخام (Frontend)
- إضافة حقل `effective_cost_per_unit` للـ Backend
- عرض نسبة الهدر والتكلفة الفعلية في بطاقة المادة الخام

**الملفات المعدلة**:
- `/app/frontend/src/pages/WarehouseManufacturing.js`
- `/app/backend/routes/inventory_system.py`
- `/app/frontend/src/utils/autoTranslate.js`

### Data Persistence on Deployment ✅ (Fixed - March 24, 2026)
**المشكلة**: البيانات (المبيعات، المنتجات، التعديلات) كانت تُحذف عند كل تحديث/نشر للتطبيق.

**السبب**: سكريبتات `seed_data.py` و `seed_demo_data.py` كانت تحتوي على أوامر `delete_many()` و `delete_one()` التي تحذف البيانات الموجودة قبل إعادة إنشائها.

**الحل الشامل**:
- [x] تعديل `seed_data.py` - إزالة جميع أوامر الحذف
- [x] تعديل `seed_demo_data.py` - إزالة جميع أوامر الحذف (الفروع، الفئات، المنتجات، الطاولات، العملاء، المستخدمين)
- [x] تعديل `server.py` startup - استبدال حذف Super Admin بتحديثه فقط
- [x] جميع السكريبتات الآن تتحقق من وجود البيانات أولاً → إذا موجودة = تخطي

**البيانات المحمية الآن**:
- ✅ الطلبات والمبيعات
- ✅ الفروع وإعداداتها
- ✅ المخازن والمخزون
- ✅ التصنيع والمنتجات المصنعة
- ✅ خزينة المالك (الإيداعات والسحوبات)
- ✅ سحبات الفروع
- ✅ الموظفين والرواتب
- ✅ العملاء ونقاط الولاء
- ✅ التصنيفات والمنتجات وتعديلاتها
- ✅ الطاولات والحجوزات
- ✅ السائقين والتوصيل
- ✅ جميع الإعدادات والتخصيصات

**الملفات المعدلة**:
- `/app/backend/seed_data.py`
- `/app/backend/seed_demo_data.py`
- `/app/backend/server.py` (السطر 151-161)

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
- ✅ Product Extras included in Sales Reports (Fixed March 24, 2026)
- ✅ Data persistence on deployment (Fixed March 24, 2026) - البيانات لن تُحذف بعد الآن
- Mocked: ZKTeco fingerprint integration

---

## Notes
- يجب زيارة التطبيق مرة واحدة وهو متصل لتثبيت Service Worker
- قاعدة البيانات الإنتاجية تحتاج seed عبر `/api/utils/seed-data`
- **تطبيق سطح المكتب (Electron) تم حذفه** - التركيز على PWA
