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

## الجلسة الحالية - 18 يناير 2026 (الإصدار 18)

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

#### 3. نظام رفع الصور ✅
- **API جديد:** `/api/upload/image` - رفع صورة عامة
- **API جديد:** `/api/upload/product-image` - رفع صورة منتج
- **API جديد:** `/api/upload/category-image` - رفع صورة فئة
- **مكون جديد:** `ImageUploader.js` مع:
  - خيار إدخال رابط الصورة
  - خيار رفع صورة من الجهاز
  - معاينة الصورة
  - دعم جميع الصيغ: JPG, PNG, GIF, WEBP, HEIC, BMP, TIFF

#### 4. تحديث صفحة الإعدادات ✅
- استخدام `ImageUploader` في نموذج إضافة فئة
- استخدام `ImageUploader` في نموذج تعديل فئة
- استخدام `ImageUploader` في نموذج إضافة منتج
- استخدام `ImageUploader` في نموذج تعديل منتج

### 📊 حالة النشر
✅ **جاهز للنشر بنسبة 100%** - تم التحقق ثلاث مرات بواسطة وكيل النشر

## ملفات التغييرات:
- `/app/frontend/src/context/BranchContext.js` (جديد)
- `/app/frontend/src/components/BranchSelector.js` (جديد)
- `/app/frontend/src/components/ImageUploader.js` (جديد)
- `/app/frontend/src/App.js` (تحديث)
- `/app/frontend/src/pages/Dashboard.js` (تحديث)
- `/app/frontend/src/pages/Reports.js` (تحديث)
- `/app/frontend/src/pages/HR.js` (تحديث كبير)
- `/app/frontend/src/pages/Settings.js` (تحديث - ImageUploader)
- `/app/backend/server.py` (تحديث كبير - APIs جديدة)

## APIs الجديدة

### رفع الصور
| Method | Endpoint | الوصف |
|--------|----------|--------|
| POST | `/api/upload/image` | رفع صورة عامة |
| POST | `/api/upload/product-image` | رفع صورة منتج |
| POST | `/api/upload/category-image` | رفع صورة فئة |

### تقارير الرواتب
| Method | Endpoint | الوصف |
|--------|----------|--------|
| GET | `/api/reports/payroll-summary` | تقرير شامل للرواتب |
| GET | `/api/reports/employee-salary-slip/{id}` | مفردات مرتب موظف |
| GET | `/api/reports/payroll/export/excel` | تصدير تقرير الرواتب |
| GET | `/api/reports/employee-salary-slip/{id}/export/excel` | تصدير مفردات المرتب |

## المهام المتبقية

### 🔴 أولوية قصوى (P0)
- [ ] إعادة هيكلة `/app/backend/server.py` (10200+ سطر)

### 🟡 أولوية عالية (P1)
- [ ] تحسين خريطة السائقين الحية
- [ ] إشعارات Push للسائقين (Firebase)
- [ ] تصدير PDF للتقارير

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
آخر تحديث: 18 يناير 2026 - 12:50 AM
نسبة الإنجاز: 99%
