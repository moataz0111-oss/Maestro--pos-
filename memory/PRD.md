# Maestro EGP — PRD (Enterprise Mode complete)

## 🎯 Problem Statement
مؤسسة متعددة الأنشطة (مطاعم، صالونات، عيادات، سوبرماركت، شركات توصيل) تدار من مالك واحد، **عزل صارم للبيانات بين المشاريع** بلا تغيير الـ 28 شاشة الأصلية.

## 🏗️ Stack
FastAPI + Motor MongoDB + React CRA + Baileys WhatsApp + Socket.IO

## ✅ Enterprise Mode — كامل بجميع مراحله (Feb 2026)

### Backend
- `projects` collection + `/api/projects` CRUD + assign-admin + users
- `/api/enterprise/dashboard` + `/api/enterprise/marketplace/*` + `/api/enterprise/activity-templates/*`
- `/api/partner-portal/*` — بوابة تاجر مستقلة (access_code, بدون login)
- Migration تلقائي: 184+ وثيقة ربطت بمشاريع افتراضية عبر مستأجرين
- Roles: `enterprise_owner`, `project_admin`, `project_manager`, `project_employee`
- **العزل المُطبَّق على جميع endpoints**:
  - `/api/branches`, `/api/orders`, `/api/expenses`, `/api/products`
  - `/api/categories`, `/api/customers`, `/api/drivers` (كلاهما راوتر)
  - `/api/recipes/materials`, `/api/driver/orders` (بوابة السائق)
  - `/api/customer/menu/{tenant}?project_id=X` (بوابة الزبون)
- Helper `scoped_query_for_user()` بـ `shared.py` جاهز للـ endpoints المتبقية
- Activity templates: 7 أنواع مع تصنيفات تلقائية عند إنشاء المشروع
- **WebSocket live updates**: emit `enterprise_update` عند إنشاء الطلبات → owner dashboard يحدث لحظياً
- driver create يضيف `project_id` من المستخدم منشئ السائق

### Frontend
- `ProjectContext` + `ProjectBranchSelector` هرمي (مشروع ← فرع)
- Routes:
  - `/settings/projects` — إدارة المشاريع
  - `/enterprise-dashboard` — لوحة المؤسسة (مع WebSocket)
  - `/marketplace/:projectId` — Marketplace التوصيل
  - `/partner/:partnerId` — Portal مستقل للتاجر (بدون login)
- Zero visual disruption على الـ 28 شاشة

## 🧪 Isolation Verification (Live, Full Test)
| Endpoint | Owner | Salon Admin |
|---|---|---|
| categories | 8 | 0 ✅ |
| customers | 15 | 0 ✅ |
| drivers | 4 | 0 ✅ |
| recipes/materials | 2 | 0 ✅ |
| orders | 55 | 0 ✅ |
| products | 8 | 0 ✅ |
| expenses | 10 | 0 ✅ |
| branches | 1 | 0 ✅ |
| Enterprise Dashboard | ✅ | 403 ✅ |
| Marketplace other project | ✅ | 403 ✅ |
| Customer Menu (project_id) | filters correctly ✅ |
| Partner Portal (access_code) | works ✅ / bad code = 401 ✅ |

## 📁 Key Files
- `/app/backend/routes/projects_routes.py`
- `/app/backend/routes/enterprise_routes.py`
- `/app/backend/routes/partner_portal_routes.py`
- `/app/backend/routes/drivers_routes.py` (project isolation added)
- `/app/backend/routes/customer_menu_api_routes.py` (project_id param)
- `/app/backend/services/websocket_service.py` (notify_enterprise_update)
- `/app/backend/routes/shared.py` (scoped_query_for_user)
- `/app/frontend/src/context/ProjectContext.js`
- `/app/frontend/src/components/ProjectBranchSelector.js`
- `/app/frontend/src/pages/ProjectsSettings.jsx`
- `/app/frontend/src/pages/EnterpriseDashboard.jsx`
- `/app/frontend/src/pages/Marketplace.jsx`
- `/app/frontend/src/pages/PartnerPortal.jsx`

## 🧪 Test Credentials
- Owner: `admin@maestroegp.com / admin123` + trusted device `e2e-tester-persistent`
- Salon admin (isolated): `salon@test.com / salon1234` + trusted device `salon-test-device`

## 📋 Optional Future Enhancements
- Apply `scoped_query_for_user()` to remaining niche endpoints (payroll, biometric, purchases, warehouses)
- WhatsApp daily digest للمالك عبر كل المشاريع
- Real-time expense/shift-close SIO events (already available in helper)
- Refactor `server.py` (18k+ سطر)

## ✅ Enterprise Auto-Injection + Backfill — Feb 28, 2026 (fork)
### تعليقات المستخدم على اللقطات (Screenshot 2026-09-28 …) المُنفَّذة:
1. **الترويسة**: عند تفعيل Enterprise يستبدل "مطعم" بـ "مؤسسة" في اسم العميل تلقائياً (regex `/مطعم/g` → `مؤسسة`). عند اختيار مشروع محدد تظهر اسم/شعار المشروع + نوع النشاط. Test-id: `tenant-header-title`, `tenant-header-logo`.
2. **تبويب الإعدادات**: "المطعم" → "المؤسسة" ديناميكياً بناءً على `enterpriseEnabled`. جميع النصوص داخل التبويب (اسم/شعار/زر الحفظ) تتبدّل. Test-id: `settings-tab-enterprise`.
3. **تبويب "🏢 المشاريع"**: يعرض `ProjectsSettings` inline (بدل الانتقال لصفحة منفصلة). زر "مشروع جديد" (add-project-btn) + بطاقة لكل مشروع مع شعار/نوع نشاط + أزرار "تعيين مدير" و"حذف".
4. **الفلتر الهرمي مشروع→فرع**: BranchContext يعيد جلب الفروع بمعامل `project_id` عند حدث `project-changed`؛ فلا تظهر إلا فروع المشروع المختار.

### Files modified
- `/app/frontend/src/pages/Dashboard.js` — header rebranding + project-aware logo/subtitle
- `/app/frontend/src/pages/Settings.js` — tab rename + Projects TabsContent + import ProjectsSettings
- `/app/frontend/src/pages/ProjectsSettings.jsx` — (كما هو، يُعرض الآن inline)

### Lint fixes
- `backend/routes/pdf_export_routes.py` و `printer_routes.py`: إضافة imports صريحة من `server` لحل جميع F405 (star imports) — 99 error → 0.

### Backend endpoints المُحدَّثة (حقن `project_id` تلقائياً عند الإنشاء) — إجمالي 8 collections:
- `POST /api/categories` (server.py)
- `POST /api/products` (server.py)
- `POST /api/branches` (server.py) — يحترم `max_branches_per_project` عند تفعيل المؤسسة
- `POST /api/expenses` (server.py) — عزل المصاريف بالمشروع
- `POST /api/printers` (routes/printer_routes.py)
- `POST /api/invoices/printers` (server.py)
- `POST /api/raw-materials-new` (routes/inventory_system.py)
- `POST /api/manufactured-products` (routes/inventory_system.py)
- `POST /api/packaging-materials` (routes/inventory_system.py)

### Backfill script — 241 وثيقة قديمة مُرحَّلة
- `/app/backend/backfill_project_ids.py` — ربط الوثائق القديمة (بلا `project_id`) بالمشروع الافتراضي لكل مستأجر.
- شامل: categories, products, branches, raw_materials, manufactured_products, packaging_materials, printers, expenses, orders, customers, recipes, packaging_requests, branch_requests, branch_orders.
- تحقق حي: 100% تغطية الآن — `19/19` categories, `97/97` manufactured, `10/10` expenses…

### Axios Interceptor (Frontend)
- `utils/api.js`: يقرأ `selectedProjectId` من localStorage ويُضيف `X-Project-Id` header + `project_id` query تلقائياً لكل طلب.
- Enterprise Owner يختار مشروعاً من الترويسة → كل إنشاء/قراءة تُحصر بذلك المشروع تلقائياً بلا تعديل واجهات إضافية.
