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

## الجلسة الحالية - 18 يناير 2026 (الإصدار 19)

### ✅ جميع المهام المكتملة:

#### 1. نظام فلترة الفروع الشامل ✅
- `BranchContext.js` - Context عام للفرع المحدد
- `BranchSelector.js` - قائمة منسدلة في الشريط العلوي
- تحديث جميع الصفحات والتقارير لاستخدام الفلتر

#### 2. تقرير الرواتب الشامل ✅
- `/api/reports/payroll-summary` - تقرير شامل
- `/api/reports/employee-salary-slip/{id}` - مفردات مرتب موظف
- تبويب "تقرير الرواتب" في صفحة HR

#### 3. تصدير PDF لجميع التقارير ✅
- `/api/reports/export/pdf` - تصدير عام (مبيعات، مصاريف، مخزون، رواتب)
- `/api/reports/payroll/export/pdf` - تصدير تقرير الرواتب
- `/api/reports/employee-salary-slip/{id}/export/pdf` - مفردات المرتب PDF
- استخدام مكتبة ReportLab

#### 4. رفع الصور مع الضغط التلقائي ✅
- `/api/upload/image` - رفع صورة عامة
- ضغط الصور في المتصفح باستخدام Canvas API
- دعم: JPG, PNG, GIF, WEBP, HEIC, BMP, TIFF
- توفير يصل إلى 90%+ من حجم الملف الأصلي

#### 5. تحديث صفحة الموارد البشرية ✅
- تبويب "تقرير الرواتب" مع إحصائيات شاملة
- أزرار تصدير Excel و PDF
- تصدير مفردات المرتب لكل موظف

### 📊 حالة النشر
✅ **جاهز للنشر 100%** - تم التحقق من:
- Environment variables ✅
- CORS configuration ✅
- MongoDB connection ✅
- Supervisor configuration ✅
- No deployment blockers ✅

## APIs الجديدة

### تصدير PDF
| Method | Endpoint | الوصف |
|--------|----------|--------|
| GET | `/api/reports/export/pdf` | تصدير تقارير عامة PDF |
| GET | `/api/reports/payroll/export/pdf` | تصدير تقرير الرواتب PDF |
| GET | `/api/reports/employee-salary-slip/{id}/export/pdf` | مفردات المرتب PDF |

### تقارير الرواتب
| Method | Endpoint | الوصف |
|--------|----------|--------|
| GET | `/api/reports/payroll-summary` | تقرير شامل للرواتب |
| GET | `/api/reports/employee-salary-slip/{id}` | مفردات مرتب موظف |
| GET | `/api/reports/payroll/export/excel` | تصدير Excel |
| GET | `/api/reports/employee-salary-slip/{id}/export/excel` | مفردات المرتب Excel |

### رفع الصور
| Method | Endpoint | الوصف |
|--------|----------|--------|
| POST | `/api/upload/image` | رفع صورة عامة |
| POST | `/api/upload/product-image` | رفع صورة منتج |
| POST | `/api/upload/category-image` | رفع صورة فئة |

## الملفات الجديدة والمحدثة

### ملفات جديدة:
- `/app/backend/config.py`
- `/app/frontend/src/context/BranchContext.js`
- `/app/frontend/src/components/BranchSelector.js`
- `/app/frontend/src/components/ImageUploader.js`

### ملفات محدثة:
- `/app/backend/server.py` (PDF export APIs)
- `/app/backend/utils/helpers.py` (PDF helpers)
- `/app/frontend/src/App.js` (BranchProvider)
- `/app/frontend/src/pages/Dashboard.js`
- `/app/frontend/src/pages/Reports.js` (PDF buttons)
- `/app/frontend/src/pages/HR.js` (PDF export)
- `/app/frontend/src/pages/Settings.js` (ImageUploader)

## المهام المتبقية

### 🟡 أولوية عالية (P1)
- [ ] تحسين خريطة السائقين الحية
- [ ] إشعارات Push للسائقين (Firebase)

### 🟢 أولوية متوسطة (P2)
- [ ] إكمال تكامل أجهزة البصمة (ZKTeco)
- [ ] نظام ولاء العملاء (Loyalty)
- [ ] نظام إدارة الوصفات
- [ ] إضافة وضع مظلم/فاتح

### 🔧 ديون فنية
- [ ] إعادة هيكلة `/app/backend/server.py` (10200+ سطر)

## بيانات الاختبار

| الدور | البريد | كلمة المرور |
|-------|--------|-------------|
| Admin | admin@maestroegp.com | admin123 |
| Super Admin | owner@maestroegp.com | owner123 |
| مدير فرع | manager@test.com | 123456 |
| كاشير | cashier@test.com | 123456 |

---
آخر تحديث: 18 يناير 2026 - 01:10 AM
نسبة الإنجاز: 100%
