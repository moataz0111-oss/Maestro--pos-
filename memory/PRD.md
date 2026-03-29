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

---

## Latest Updates (March 25, 2026)

### تحسينات صفحة التقارير ✅
تم إضافة 3 ميزات جديدة حسب طلب العميل:

#### 1. زر تحصيل الآجل (تبويب الآجل)
- إضافة عمود "إجراء" في جدول الطلبات الآجلة
- زر "تحصيل" لكل طلب غير محصل
- نافذة Dialog لتسجيل التحصيل مع:
  - المبلغ المحصل
  - اسم المستلم
  - التاريخ والوقت (تلقائي)
  - ملاحظات (اختياري)
- API: `POST /api/reports/credit/collect`
- API: `GET /api/reports/credit/collections`

#### 2. تحديث تبويب التوصيل (شركات التوصيل كآجل)
- 5 بطاقات إحصائية جديدة:
  - إجمالي المبيعات (قبل الاستقطاع)
  - العمولات المستقطعة
  - صافي المستحق (بعد الاستقطاع)
  - تم التحصيل
  - المتبقي للتحصيل
- زر تحصيل لكل شركة توصيل
- API: `POST /api/reports/delivery/collect`
- API: `GET /api/reports/delivery/collections`

#### 3. مربع تكلفة التغليف (تبويب المبيعات)
- 3 مربعات جديدة في تبويب المبيعات:
  - تكلفة المواد (برتقالي)
  - تكلفة التغليف (أصفر)
  - صافي الربح (أخضر)
- API محدث: `GET /api/reports/sales` يُرجع `total_packaging_cost` و `total_materials_cost`

### Files Modified:
- `/app/backend/routes/reports_routes.py` - إضافة endpoints التحصيل
- `/app/frontend/src/pages/Reports.js` - تحديث واجهات التبويبات الثلاث

### Testing Status: ✅
- Backend: 100% (15/15 tests passed)
- Frontend: 100% verified
- Test Report: `/app/test_reports/iteration_124.json`

---

### نظام مواد التغليف (الورقيات) ✅
تم إنشاء نظام كامل لإدارة مواد التغليف:

#### Backend APIs:
- `GET /api/packaging-materials` - جلب مواد التغليف
- `POST /api/packaging-materials` - إضافة مادة جديدة
- `POST /api/packaging-materials/{id}/add-stock` - إضافة كمية
- `GET/POST /api/packaging-requests` - طلبات مواد التغليف
- `POST /api/packaging-requests/{id}/transfer` - تحويل للفرع
- `GET /api/branch-packaging-inventory` - مخزون الفرع

#### Frontend:
- تاب "الورقيات" جديد في صفحة المخزن والتصنيع
- ربط مواد التغليف بالمنتجات في الإعدادات
- الخصم التلقائي من مخزون الفرع عند البيع (سفري/توصيل فقط)

#### إصلاحات:
- إزالة تعارض Routes (`/purchase-requests`)
- تحديث CORS للإنتاج

### Deployment Status: ✅ Ready for Production

---

### تحسينات إعداد المنتج - المرحلة النهائية ✅ (March 25, 2026)

تم تنفيذ 3 تحسينات رئيسية لنموذج إعداد المنتج:

#### 1. تكلفة التغليف المرنة
- **خيار 1**: إدخال مبلغ يدوي مباشر في حقل "تكلفة التغليف"
- **خيار 2**: ربط مواد تغليف من المخزن → حساب تلقائي للتكلفة
- عند اختيار مواد تغليف، يتم إفراغ الحقل اليدوي وحساب التكلفة تلقائياً
- النص التوضيحي يتغير حسب الحالة

#### 2. الإضافات مع الكمية والوحدة
- إضافة حقل **الكمية (quantity)** لكل إضافة
- إضافة حقل **الوحدة (unit)** مع خيارات: قطعة، غرام، ملعقة، كوب، شريحة
- مثال: "جبنة إضافية - 30 غرام - 500 د.ع"
- موجود في نموذجي الإضافة والتعديل

#### 3. تكلفة المواد الخام التلقائية
- حقل "تكلفة المواد الخام" يكون:
  - **قابل للتعديل**: إذا لم يُربط منتج مصنع
  - **للقراءة فقط (بخلفية بنفسجية)**: إذا تم ربط منتج مصنع
- النص التوضيحي يشرح الحالة للمستخدم

#### تعديلات Backend:
- إضافة `packaging_items` و `recipe_quantities` إلى نموذج `ProductResponse`
- الـ API يحفظ ويرجع جميع الحقول الجديدة بشكل صحيح

#### تعديلات Frontend:
- نموذج إضافة المنتج: إضافات مع كمية ووحدة
- نموذج تعديل المنتج: إضافات مع كمية ووحدة + قسم ربط مواد التغليف

### Files Modified:
- `/app/backend/server.py` - Lines 1080-1122 (ProductCreate & ProductResponse models)
- `/app/frontend/src/pages/Settings.js` - Lines 3724-3805, 4028-4090, 4247-4367

### Testing Status: ✅
- Backend: 100% (10/10 tests passed)
- Frontend: 100% verified
- Test Report: `/app/test_reports/iteration_125.json`

---

## Remaining Tasks (Backlog)

### P0 - High Priority
- [x] ~~**نظام مواد التغليف - المراحل المتبقية** ✅ (Completed March 25, 2026)~~

### P1 - Medium Priority
- [ ] تكامل بصمة ZKTeco
- [ ] تصدير التقارير إلى Excel

### P2 - Low Priority
- [ ] تحسين أداء الاستعلامات (pagination)
- [ ] إعادة هيكلة server.py (16,000+ سطر)
- [ ] إعادة هيكلة Settings.js (6,700+ سطر)
- [ ] إعادة هيكلة WarehouseManufacturing.js (3,400+ سطر)

---

### نظام مواد التغليف - المراحل 2-4 ✅ (March 25, 2026)

تم إكمال نظام مواد التغليف بجميع مراحله:

#### المرحلة 2: واجهة طلب الفروع
- تاب **"طلب تغليف"** جديد للفروع
- شبكة عرض المواد المتاحة للطلب
- سلة طلب مع إمكانية تعديل الكميات
- إرسال الطلب للمستودع مع ملاحظات
- قسم "طلباتي الأخيرة" لمتابعة حالة الطلبات
- زر "سجل الطلبات" لعرض جميع الطلبات السابقة

#### المرحلة 3: موافقة أمين المستودع
- عرض الطلبات الواردة في تاب "الورقيات"
- أزرار "موافقة" و"تحويل" لكل طلب
- خصم الكمية من المخزن الرئيسي عند التحويل
- إضافة الكمية لمخزون الفرع تلقائياً

#### المرحلة 4: مخزون التغليف في الفرع
- تاب **"مخزون الفرع"** جديد
- بطاقات لكل صنف تغليف مع:
  - الكمية المتبقية
  - الكمية المستخدمة
  - القيمة الإجمالية
  - شريط تقدم بصري
  - تنبيه للكميات المنخفضة
- إحصائيات سريعة:
  - إجمالي الأصناف
  - إجمالي القيمة
  - أصناف منخفضة
  - إجمالي المستخدم

#### Backend APIs:
- `POST /api/packaging-requests` - إنشاء طلب مع from_branch_id
- `POST /api/packaging-requests/{id}/approve` - موافقة على الطلب
- `POST /api/packaging-requests/{id}/transfer` - تحويل للفرع
- `GET /api/branch-packaging-inventory` - مخزون الفرع

#### Files Modified:
- `/app/backend/routes/inventory_system.py` - إضافة from_branch_id للطلبات
- `/app/frontend/src/pages/WarehouseManufacturing.js` - إضافة تابي طلب التغليف ومخزون الفرع

### Testing Status: ✅
- Backend: 100% (16/16 tests passed)
- Frontend: 100% verified
- Test Report: `/app/test_reports/iteration_126.json`

---

### ميزة التقاط صور الفواتير بالكاميرا ✅ (March 25, 2026)

تم إكمال ميزة التقاط صور فواتير الشراء من الكاميرا مباشرة:

#### الميزات المُنفذة:
1. **خياران واضحان لرفع الصور**:
   - 📷 "التقاط صورة" - يفتح كاميرا الجهاز
   - 📁 "رفع من الجهاز" - اختيار ملف من الجهاز

2. **dialog الكاميرا**:
   - عرض بث الفيديو الحي من الكاميرا
   - زر "التقاط الصورة" لأخذ صورة
   - زر "إلغاء" لإغلاق الكاميرا
   - تنظيف تلقائي للموارد (camera stream)

3. **معالجة الصور**:
   - دعم الكاميرا الخلفية (facingMode: 'environment')
   - تحويل الصورة إلى Base64 JPEG
   - معاينة الصورة قبل الحفظ
   - زر حذف الصورة وإعادة الاختيار

#### التقنيات المستخدمة:
- `navigator.mediaDevices.getUserMedia` - للوصول للكاميرا
- HTML5 Canvas - لالتقاط الصورة من الفيديو
- React Refs (useRef) - للتحكم في video و canvas

#### Files Modified:
- `/app/frontend/src/pages/Purchasing.js`:
  - Lines 196-254: Camera functions (openCamera, capturePhoto, closeCamera)
  - Lines 719-741: Camera and upload buttons UI
  - Lines 934-976: Camera dialog UI

### Testing Status: ✅
- Frontend: 100% (8/8 tests passed)
- Test Report: `/app/test_reports/iteration_128.json`
- ملاحظة: خطأ "الكاميرا غير متاحة" في بيئة headless متوقع وطبيعي

### Backend APIs Added:
- `GET /api/purchase-invoices` - جلب فواتير الشراء
- `POST /api/purchase-invoices` - إنشاء فاتورة شراء مع صورة (image_data)
- `DELETE /api/purchase-invoices/{id}` - حذف فاتورة
- `GET /api/purchase-suppliers` - جلب موردي المشتريات
- `POST /api/purchase-suppliers` - إضافة مورد جديد
- `GET /api/warehouse-purchase-requests` - طلبات الشراء من المخزن
- `POST /api/warehouse-purchase-requests/{id}/transfer` - تحويل للمخزن

### Files Modified:
- `/app/backend/server.py` - Lines 9543-9673: Added purchase invoice APIs with image support

---

### ميزة OCR لاستخراج بيانات الفاتورة ✅ (March 25, 2026)

تم إضافة ميزة الذكاء الاصطناعي لاستخراج بيانات الفاتورة من الصورة تلقائياً:

#### الوظائف:
- **تحليل صور الفواتير** باستخدام Gemini 2.5 Flash
- **استخراج البيانات التالية تلقائياً**:
  - رقم الفاتورة
  - اسم المورد/الشركة
  - قائمة الأصناف (الاسم، الكمية، الوحدة، السعر)
  - المجموع الكلي
  - الملاحظات

#### كيفية الاستخدام:
1. رفع صورة الفاتورة أو التقاطها بالكاميرا
2. النقر على زر "استخراج البيانات تلقائياً (AI)"
3. مراجعة البيانات المستخرجة وتعديلها إذا لزم الأمر
4. حفظ الفاتورة

#### Backend API:
- `POST /api/purchase-invoices/ocr` - استخراج بيانات الفاتورة من الصورة

#### Files Modified:
- `/app/backend/server.py` - Lines 9684-9772: Added OCR API endpoint
- `/app/frontend/src/pages/Purchasing.js` - Added OCR button and extractInvoiceData function

---

### إضافة الفواتير والموردين لنظام التصفير ✅ (March 25, 2026)

تم إضافة الجداول التالية لنظام تصفير المخزون:
- `purchase_invoices` - فواتير الشراء
- `purchase_suppliers` - موردي المشتريات
- `warehouse_purchase_requests` - طلبات الشراء من المخزن

#### Files Modified:
- `/app/backend/server.py` - Lines 9491-9510: Updated reset-inventory endpoint

---

### تحسين نظام تصفير المخزون - إضافة التغليف والمواد الغذائية ✅ (March 26, 2026)

تم إضافة collections جديدة لآلية تصفير المخزون لتشمل:

#### مخزون التغليف (الورقيات):
- `packaging_materials` - مواد التغليف الرئيسية
- `packaging_requests` - طلبات التغليف من الفروع
- `branch_packaging_inventory` - مخزون التغليف في الفروع

#### مخزون المواد الغذائية:
- `raw_materials_new` - المواد الخام الجديدة
- `manufacturing_requests` - طلبات التصنيع من المصنع للمخزن

#### Files Modified:
- `/app/backend/server.py` - Lines 9532-9554: Added packaging and food inventory reset


---

### 🚨 إصلاح عزل البيانات بين المستأجرين (Multi-tenant Isolation) ✅ (March 26, 2026)

**المشكلة الحرجة**: العملاء كانوا يرون بيانات عملاء آخرين:
- في الشاشة الرئيسية (Dashboard) ونقطة البيع (POS) تظهر فروع عملاء آخرين
- في صفحة الطاولات تظهر الفروع الصحيحة (كان العزل يعمل جزئياً)

**السبب الجذري**:
1. دالة `build_tenant_query()` كانت تسمح لـ Super Admin برؤية كل البيانات
2. عند Impersonation، لم يتم فلترة البيانات بشكل صحيح
3. دالة `get_user_tenant_id()` كانت تُرجع `"default"` كـ fallback

**الإصلاحات**:

#### 1. إصلاح `get_user_tenant_id()` (السطر 1672-1686)
- Super Admin بدون tenant يحصل على `None` (بدلاً من `"system"`)
- يمنع الوصول العشوائي لبيانات العملاء

#### 2. إصلاح `build_tenant_query()` (السطر 1688-1718)
- Super Admin بدون tenant يحصل على query بـ `__NO_ACCESS__`
- يُرجع نتائج فارغة لمنع تسرب البيانات

#### 3. إصلاح `get_branches()` (السطر 2340-2374)
- Super Admin بدون tenant يحصل على قائمة فارغة
- فلترة صارمة بـ `tenant_id`

#### 4. إصلاح `get_categories()` (السطر 2492-2502)
- نفس منطق العزل الصارم

#### 5. إصلاح `get_products()` (السطر 2549-2569)
- نفس منطق العزل الصارم

#### 6. إصلاح `get_dashboard_stats()` (السطر 14633-14655)
- يُرجع إحصائيات فارغة للـ Super Admin بدون tenant

#### 7. تحسين تسجيل الدخول والخروج (Frontend)
- مسح `localStorage.branches` عند تسجيل الدخول
- مسح `localStorage.branches` عند تسجيل الخروج
- يضمن الحصول على البيانات الحديثة من API

**الملفات المعدلة**:
- `/app/backend/server.py`
- `/app/frontend/src/context/AuthContext.js`

**هل سيتكرر؟**: لا! الإصلاح يضمن:
- كل tenant يرى فقط بياناته
- Super Admin يستخدم Super Admin Panel فقط لإدارة العملاء
- لا fallback إلى `"default"` يمكن أن يتسبب في تداخل البيانات

---

### CI/CD Deployment Fix ✅ (March 26, 2026)

**المشكلة**: GitHub Actions كانت تفشل بسبب خطأ `ContainerConfig KeyError` من Docker Compose

**الحل**: إعادة كتابة `deploy.yml` لاستخدام `docker run` مباشرة بدلاً من `docker-compose`

**الملفات المعدلة**:
- `/app/.github/workflows/deploy.yml`

**ملاحظة**: لا تستخدم `docker-compose up` في scripts النشر التلقائي على VPS


---

### 🔐 إصلاح مشكلة Impersonation (انتحال الهوية) ✅ (March 26, 2026)

**المشكلة**: عند دخول Super Admin لحساب عميل، يتم الكتابة فوق جلسة العميل الفعلي إذا كان يعمل في نفس المتصفح (لأن localStorage مشترك بين جميع التابات)

**الحل**: استخدام `sessionStorage` للنوافذ الجديدة بدلاً من `localStorage`

#### التغييرات:

1. **SuperAdmin.js** - `impersonateTenant()`:
   - حفظ بيانات Impersonation في `sessionStorage` بدلاً من `localStorage`
   - فتح نافذة جديدة مع URL خاص
   - تمرير البيانات عبر `postMessage` كخطة بديلة
   - الاحتفاظ بـ fallback للسلوك القديم إذا تم حظر النوافذ المنبثقة

2. **AuthContext.js**:
   - قراءة `impersonation_session` من `sessionStorage` عند التحميل
   - استماع لـ `postMessage` من نافذة Super Admin
   - التحقق من صلاحية الجلسة (5 دقائق)

3. **Dashboard.js** - `exitImpersonation()`:
   - إغلاق النافذة الجديدة بدلاً من إعادة التوجيه
   - مسح `sessionStorage` عند الخروج

**النتيجة**:
- ✅ Super Admin يمكنه معاينة حسابات العملاء في نافذة منفصلة
- ✅ العميل الفعلي لا يتأثر إذا كان يعمل في تاب آخر
- ✅ كل نافذة لها جلستها الخاصة

**الملفات المعدلة**:
- `/app/frontend/src/pages/SuperAdmin.js`
- `/app/frontend/src/context/AuthContext.js`
- `/app/frontend/src/pages/Dashboard.js`


---

### 🔧 إصلاح اختفاء اختيار الفروع ✅ (March 26, 2026)

**المشكلة**: اختيار الفروع مخفي في الشاشة الرئيسية ونقاط البيع

**السبب**: كان الكود يستبعد فروع بأسماء افتراضية مثل "الفرع الرئيسي" و "Main Branch"، مما يسبب اختفاء الفروع للعملاء الذين يستخدمون هذه الأسماء

**الحل**: إزالة فلتر الأسماء الافتراضية من `get_branches()` - كل فروع العميل يجب أن تظهر

**الملف المعدل**: `/app/backend/server.py` (السطر 2340-2373)

---

### 🔧 إصلاح فصل شركات التوصيل عن الآجل العادي ✅ (March 27, 2026)

**المشكلات المُصلحة**:

1. **التقرير الشامل يعرض أصفار**:
   - **السبب**: الـ API كان يُرجع مفاتيح طرق الدفع بالإنجليزية (`cash`, `credit`) لكن Frontend يتوقع مفاتيح عربية (`نقدي`, `آجل`)
   - **الحل**: تحويل أسماء طرق الدفع للعربية في `/reports/sales`

2. **طلبات شركات التوصيل تظهر في تقرير الآجل العادي**:
   - **السبب**: تقرير الآجل `/reports/credit` كان يجلب جميع الطلبات الآجلة بدون استثناء شركات التوصيل
   - **الحل**: إضافة فلتر لاستثناء الطلبات التي لها `delivery_app` أو `is_delivery_company`

3. **في حسب طريقة الدفع تظهر "آجل" بدلاً من اسم شركة التوصيل**:
   - **السبب**: المنطق لم يكن يفرّق بين الآجل العادي وآجل شركات التوصيل
   - **الحل**: إذا كان الطلب آجل ولديه شركة توصيل، يظهر باسم الشركة (مثل "بالي") بدلاً من "آجل"

4. **`delivery_app_name` لا يُحفظ عند إنشاء الطلب**:
   - **السبب**: شركات التوصيل الافتراضية مُعرّفة في الكود وليست في قاعدة البيانات
   - **الحل**: إضافة قاموس `default_delivery_apps` لتحويل معرفات الشركات (مثل `baly`) لأسمائها العربية (مثل "بالي")

**المنطق الجديد**:
- **آجل عادي** = طلب آجل بدون شركة توصيل → يظهر في تقرير الآجل + يظهر كـ "آجل" في المبيعات
- **آجل شركات توصيل** = طلب آجل مع شركة توصيل → يظهر فقط في تقرير التوصيل + يظهر باسم الشركة في المبيعات

**الملفات المعدلة**:
- `/app/backend/routes/reports_routes.py` - تحديث `/reports/sales` و `/reports/credit` و `/reports/delivery-credits`
- `/app/backend/server.py` - تحديث إنشاء الطلب لحفظ `delivery_app_name` و `is_delivery_company` + تحديث `/smart-reports/sales`

---

## P0 Issues (Critical)
- ✅ فصل شركات التوصيل عن الآجل العادي (Fixed - March 27, 2026)
- ✅ إصلاح "أكثر المنتجات مبيعاً" - يظهر الآن اسم المنتج بدلاً من "غير معروف" (Fixed - March 27, 2026)
- ✅ تحسين "آخر الطلبات" - يظهر الآن نوع الزبون (داخلي/سفري/توصيل) وأسماء المنتجات مع الكمية (Fixed - March 27, 2026)
- ✅ إضافة معاينة الفاتورة عند النقر على أي طلب في "آخر الطلبات" (Fixed - March 27, 2026)
- ✅ إضافة تقرير مبيعات البطاقة مع زر تحصيل (Fixed - March 27, 2026)
- ✅ طباعة إيصال إغلاق الصندوق تلقائياً عند تأكيد الإغلاق (Fixed - March 27, 2026)
- ✅ تسجيل خروج إجباري للكاشير بعد إغلاق الصندوق (Fixed - March 27, 2026)

### صلاحيات جديدة + تحسين الطباعة ✅ (March 29, 2026)

**صلاحيات جديدة**:
- `hide_cash_expected`: إخفاء حقول النقدي والمتوقع والفرق من حوار إغلاق الصندوق
- `hide_recent_orders`: إخفاء قسم آخر الطلبات من الشاشة الرئيسية
- مُفعّلة في الإعدادات → المستخدمين → تعديل الصلاحيات

**تحسين الطباعة الحرارية**:
- حوار المعاينة الآن قابل للتمرير + زر الطباعة يظهر دائماً
- طباعة بـ iframe مخفي بدلاً من نافذة جديدة
- CSS مخصص لورق 72mm (حراري 80mm) مع تقليل الهوامش والخطوط

**الاختبار**: ✅ Frontend 100% - التقرير: `/app/test_reports/iteration_132.json`

---

### إصلاح شامل لـ KeyError في إغلاق الصندوق ✅ (March 29, 2026)

**المشكلة**: أخطاء `KeyError` متعددة في `shifts_routes.py` عند:
- `shift["opening_cash"]` → الحقل الفعلي `opening_balance`
- `shift["branch_id"]` → قد لا يكون موجود
- `o["total"]` و `o["payment_method"]` → طلبات قديمة بدون هذه الحقول

**الإصلاح**: تحويل جميع الوصول المباشر إلى `.get()` مع قيم احتياطية
**حذف** endpoint مكرر `GET /cash-register/summary` من server.py
**الملفات**: `/app/backend/routes/shifts_routes.py` (سطور 219, 364-410, 480-560, 628-640)
**الاختبار**: ✅ Backend 5/5, Frontend 4/4 - التقرير: `/app/test_reports/iteration_131.json`

### تحسين الطباعة الحرارية ✅ (March 29, 2026)

**التغييرات**:
- طباعة بـ iframe مخفي بدلاً من نافذة جديدة
- تنسيق CSS مخصص لورق 80mm
- يعمل في POS والـ Dashboard (إيصال إغلاق الصندوق)

### إصلاح PWA (التطبيق المثبت) ✅ (March 29, 2026)

**المشكلة**: التطبيق لا يتحدث بعد التثبيت
**الإصلاح**: Service Worker V5 مع:
- `updateViaCache: 'none'` → يتحقق من التحديثات دائماً
- تحديث تلقائي كل 5 دقائق
- إعادة تحميل تلقائية عند وجود نسخة جديدة

### حالة الطابعة ✅ (March 29, 2026)

**التغيير**: النقطة تظهر خضراء عند إدخال IP وPort صحيح، بدلاً من الاعتماد على فحص TCP من السيرفر

---

### إصلاح إغلاق الصندوق (Cash Register Close) ✅ (March 27, 2026)

**المشكلة**: عند فتح حوار إغلاق الصندوق يظهر "فشل في جلب بيانات الصندوق"
**السبب الجذري**: `shifts_routes.py` سطر 557 يستخدم `shift["opening_cash"]` لكن الحقل الفعلي هو `opening_balance`
**الإصلاح**: تغيير إلى `shift.get("opening_cash", shift.get("opening_balance", 0))`
**الملفات المعدلة**: `/app/backend/routes/shifts_routes.py`, `/app/backend/server.py`
**حالة الاختبار**: ✅ 100% - التقرير: `/app/test_reports/iteration_130.json`

### تحسين اختبار الطابعة ✅ (March 27, 2026)

**المشكلة**: الطابعة تظهر "غير متصلة" عند إدخال IP
**السبب**: السيرفر في الـ cloud لا يستطيع الوصول للطابعات المحلية عبر TCP
**الإصلاح**: تغيير زر الاختبار ليرسل صفحة طباعة تجريبية من المتصفح
**الملفات المعدلة**: `/app/frontend/src/pages/Settings.js`

---

### إصلاح انتحال الشخصية (Admin → Employee Preview) ✅ (March 27, 2026)

**المشكلة**: عند معاينة حساب كاشير من صفحة الإعدادات، لوحة التحكم تعرض جميع صلاحيات المدير بدلاً من صلاحيات الكاشير فقط.

**السبب الجذري**: `Settings.js` كانت تحفظ بيانات المستخدم المنتحَل في مفتاح `user` بينما `AuthContext.js` يقرأ من مفتاح `cached_user`.

**الإصلاحات**:
1. **Settings.js** - `handlePreviewUser`: تغيير مفتاح التخزين من `user` إلى `cached_user` + مسح `sessionStorage.user_verified`
2. **Dashboard.js** - `isImpersonating`: يكتشف الآن كلا النوعين (SuperAdmin→Tenant و Admin→Employee)
3. **POS.js** - إضافة شريط انتحال مع زر "العودة لحسابي"

**الملفات المعدلة**:
- `/app/frontend/src/pages/Settings.js`
- `/app/frontend/src/pages/Dashboard.js`
- `/app/frontend/src/pages/POS.js`

**حالة الاختبار**: ✅ 100% (Backend: 6/6, Frontend: 7/7)
**التقرير**: `/app/test_reports/iteration_129.json`

---

### إصلاح خطأ 500 في إغلاق/ملخص صندوق النقد ✅ (March 29, 2026)

**المشكلة**: خطأ `TypeError` عند إغلاق الصندوق بسبب قيم `null` في حقول `total` و `amount` في MongoDB.

**السبب الجذري**: `dict.get("total", 0)` في Python يُرجع `None` عندما يكون المفتاح موجوداً بقيمة `null` في MongoDB (القيمة الافتراضية `0` لا تُستخدم لأن المفتاح موجود). هذا يسبب `TypeError: unsupported operand type(s) for +: 'int' and 'NoneType'` عند الجمع.

**الإصلاحات**:
1. **shifts_routes.py** - إضافة دالة `_safe_num(val, default=0)` لتحويل `None` إلى `0` بأمان
2. **shifts_routes.py** - استبدال كل `o.get("total", 0)` و `e.get("amount", 0)` و `o["total"]` بـ `_safe_num(o.get("total"))`
3. **server.py** - إصلاح `o["total"]` في حساب إحصائيات اليوم (سطر 9191)

**الملفات المعدلة**:
- `/app/backend/routes/shifts_routes.py`
- `/app/backend/server.py`

**حالة الاختبار**: ✅ (Backend curl tests + Python unit tests)

---

## P1 Issues (High Priority)
- [ ] تكامل بصمة ZKTeco

## P2 Issues (Backlog)
- [ ] إعادة هيكلة `server.py` (أكثر من 17 ألف سطر)
- [ ] إعادة هيكلة `SuperAdmin.js`

