# PRD - نظام إدارة المطاعم والكافيهات (Maestro EGP)

## المشكلة الأصلية
بناء نظام شامل لإدارة المطاعم والكافيهات يدعم:
- إدارة نقاط البيع (POS)
- إدارة الفروع المتعددة
- إدارة الموارد البشرية والرواتب
- إدارة المخزون والمشتريات
- نظام التوصيل وتتبع السائقين
- تقارير وإحصائيات ذكية
- دعم Multi-tenancy (عدة عملاء)

## الجلسة الحالية - 18 يناير 2026 (الإصدار 17)

### ✅ ما تم إنجازه في هذه الجلسة:

#### 1. نظام فلترة الفروع الشامل ✅
- إنشاء `BranchContext.js` - Context عام للفرع المحدد
- إنشاء `BranchSelector.js` - مكون اختيار الفرع في الشريط العلوي
- تحديث جميع الصفحات لاستخدام الفلتر العام

#### 2. تقرير الرواتب الشامل ✅
- **API جديد:** `/api/reports/payroll-summary` - تقرير شامل للرواتب والمكافآت والخصومات والسلف
- **API جديد:** `/api/reports/employee-salary-slip/{employee_id}` - مفردات مرتب موظف واحد
- **API جديد:** `/api/reports/payroll/export/excel` - تصدير تقرير الرواتب Excel
- **API جديد:** `/api/reports/employee-salary-slip/{employee_id}/export/excel` - تصدير مفردات المرتب Excel

#### 3. تحديث صفحة الموارد البشرية ✅
- إضافة تبويب "تقرير الرواتب" جديد
- إضافة فلتر الفروع (`BranchSelector`)
- إضافة زر تصدير Excel للتقرير الشامل
- إضافة زر تصدير مفردات المرتب لكل موظف
- إضافة بطاقة "المستحقات" في الإحصائيات

#### 4. تحديث جميع نقاط النهاية للتقارير ✅
- جميع التقارير تدعم فلترة الفروع
- `/api/reports/sales`, `/api/reports/purchases`, `/api/reports/inventory`
- `/api/reports/expenses`, `/api/reports/profit-loss`, `/api/reports/products`
- `/api/reports/delivery-credits`, `/api/reports/cancellations`, `/api/reports/discounts`, `/api/reports/credit`

### 📊 حالة النشر
✅ **جاهز للنشر** - تم التحقق مرتين بواسطة وكيل النشر

## ملفات التغييرات:
- `/app/frontend/src/context/BranchContext.js` (جديد)
- `/app/frontend/src/components/BranchSelector.js` (جديد)
- `/app/frontend/src/App.js` (تحديث)
- `/app/frontend/src/pages/Dashboard.js` (تحديث)
- `/app/frontend/src/pages/Reports.js` (تحديث)
- `/app/frontend/src/pages/HR.js` (تحديث كبير)
- `/app/backend/server.py` (تحديث كبير - APIs جديدة)

## جدول الصلاحيات

### صلاحيات الصفحات الرئيسية
| ID | الاسم | الوصف |
|----|-------|--------|
| `pos` | نقاط البيع | إنشاء وإدارة الطلبات |
| `pos_discount` | إعطاء خصومات | السماح بإعطاء خصومات |
| `orders` | الطلبات | عرض الطلبات |
| `tables` | الطاولات | إدارة الطاولات |
| `kitchen` | شاشة المطبخ | عرض طلبات المطبخ |
| `delivery` | التوصيل | إدارة التوصيل |
| `inventory` | المخزون | عرض المخزون |
| `reports` | التقارير | عرض التقارير |
| `expenses` | المصاريف | عرض وإضافة المصاريف |
| `shifts_close` | إغلاق الصندوق | إغلاق صندوق الوردية |

### صلاحيات الإعدادات
| ID | الاسم | الوصف |
|----|-------|--------|
| `settings` | الإعدادات | الوصول للإعدادات |
| `settings_appearance` | المظهر | تغيير مظهر التطبيق |
| `settings_dashboard` | الرئيسية | إعدادات الصفحة الرئيسية |
| `settings_customers` | العملاء | إدارة العملاء |
| `settings_categories` | الفئات | إدارة فئات المنتجات |
| `settings_products` | المنتجات | إدارة المنتجات |
| `settings_branches` | الفروع | إدارة الفروع |
| `settings_printers` | الطابعات | إدارة الطابعات |
| `settings_kitchen` | أقسام المطبخ | إدارة أقسام المطبخ |
| `settings_delivery` | شركات التوصيل | إدارة شركات التوصيل |
| `settings_notifications` | الإشعارات | إعدادات الإشعارات |

## APIs الجديدة للرواتب

| Method | Endpoint | الوصف |
|--------|----------|--------|
| GET | `/api/reports/payroll-summary` | تقرير شامل للرواتب |
| GET | `/api/reports/employee-salary-slip/{id}` | مفردات مرتب موظف |
| GET | `/api/reports/payroll/export/excel` | تصدير تقرير الرواتب |
| GET | `/api/reports/employee-salary-slip/{id}/export/excel` | تصدير مفردات المرتب |

## المهام المتبقية

### 🔴 أولوية قصوى (P0)
- [ ] إعادة هيكلة `/app/backend/server.py` (10000+ سطر)

### 🟡 أولوية عالية (P1)
- [ ] تحسين خريطة السائقين الحية
- [ ] إشعارات Push للسائقين (Firebase)

### 🟢 أولوية متوسطة (P2)
- [ ] إكمال تكامل أجهزة البصمة (ZKTeco)
- [ ] نظام ولاء العملاء (Loyalty)
- [ ] نظام إدارة الوصفات
- [ ] إضافة وضع مظلم/فاتح

## بيانات الاختبار

| الدور | البريد | كلمة المرور | الصلاحيات |
|-------|--------|-------------|-----------|
| Admin | admin@maestroegp.com | admin123 | جميع الصلاحيات |
| Super Admin | owner@maestroegp.com | owner123 | جميع الصلاحيات |
| مدير فرع | manager@test.com | 123456 | معظم الصلاحيات |
| كاشير | cashier@test.com | 123456 | فرع محدد فقط |

---
آخر تحديث: 18 يناير 2026 - 12:40 AM
نسبة الإنجاز: 99%
