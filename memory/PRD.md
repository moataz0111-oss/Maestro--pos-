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

---

## Completed Features (as of March 2026)

### Offline-First Implementation ✅
- [x] دعم offline لـ POS, Orders, Tables, KitchenDisplay
- [x] دعم offline لـ Inventory, HR
- [x] دعم offline لـ Dashboard و Expenses
- [x] مؤشر تقدم المزامنة في OfflineBanner
- [x] إشعارات صوتية عند نجاح المزامنة
- [x] حفظ اسم المطعم والشعار للعمل offline
- [x] حفظ الإحصائيات والطلبات المحلية

### Authentication & Security ✅
- [x] نظام تسجيل دخول آمن
- [x] دعم تسجيل الدخول offline
- [x] إدارة الصلاحيات والأدوار
- [x] سجل انتحال الهوية (Impersonation Logs)

### Bug Fixes (March 2026) ✅
- [x] إصلاح مشكلة تسجيل الدخول للعملاء
- [x] إصلاح مشكلة إعادة تعيين كلمة المرور
- [x] إصلاح عدم ظهور الإحصائيات offline
- [x] إصلاح عدم حفظ المصاريف offline

### Code Cleanup ✅
- [x] حذف الملفات المكررة (~1.2MB)
- [x] تنظيف مجلد backend/routes
- [x] إنشاء ROUTES_INDEX.md

---

## Backlog / Remaining Tasks

### P0 (Critical)
- [x] النشر (Deployment)

### P1 (High Priority)
- [ ] اختبار شامل للمزامنة على أجهزة متعددة
- [ ] تحسين أداء Service Worker

### P2 (Medium Priority)
- [ ] إعادة هيكلة server.py (~15,000 سطر)
- [ ] مراجعة شاملة للترجمات
- [ ] تصدير التقارير إلى Excel

### P3 (Low Priority)
- [ ] تحسينات UI/UX إضافية
- [ ] توثيق API كامل

---

## Technical Architecture

### Frontend
- React.js with Shadcn/UI
- IndexedDB for offline storage
- Service Worker for caching

### Backend
- FastAPI (Python)
- MongoDB
- JWT Authentication

### Key Files
- `/app/backend/server.py` - Main backend
- `/app/frontend/src/lib/offlineDB.js` - IndexedDB
- `/app/frontend/src/lib/offlineStorage.js` - Offline helpers
- `/app/frontend/src/lib/syncService.js` - Sync logic

---

## Test Credentials
- **Super Admin**: `/super-admin`, password: `superadmin`
- **Demo User**: `demo@maestroegp.com` / `demo123`
- **Client**: `hanialdujaili@gmail.com` / `Hani@2024`

---

## Notes
- يجب زيارة التطبيق مرة واحدة وهو متصل لتثبيت Service Worker
- قاعدة البيانات الإنتاجية تحتاج seed عبر `/api/utils/seed-data`
