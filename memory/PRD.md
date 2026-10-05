# Maestro EGP — Enterprise Management System

## Problem Statement
Multi-tenant POS → Enterprise Management System. Live production serving real customers (GRaffiti BURGER: 10 branches, 70k+ orders, $757K sales).

## Users
- **Super Admin** (owner@maestroegp.com): Creates tenants, converts tiers, sets limits
- **Admin** (tenant owner, 1 per tenant): Full control within tenant
- **Cashier/Manager/Delivery/Employee**: Per-branch isolated

## Account Tiers (Oct 2026)
| Tier | enterprise_enabled | Projects UI | Limits |
|------|---------|-------------|--------|
| **تجريبي (trial)** | ✅ True | ✅ Shown | 🆓 Unlimited (test as enterprise) |
| **عميل فعال (customer)** | ❌ False | ❌ Hidden | 1 project only, no multi-project UI |
| **مؤسسة (enterprise)** | ✅ True | ✅ Shown | max_projects / max_branches_per_project / max_users_per_branch / max_admins_per_project (set by super admin) |

Tier conversion: Super Admin edits tenant → changes `account_tier` → backend auto-flips `enterprise_enabled` + updates `is_default` on projects.

## Live Deployment
- VPS: 158.220.118.54 → maestroegp.com
- CI/CD: GitHub Actions → GHCR → SSH deploy to `/var/www/maestro`
- Stack: nginx, backend, frontend, wa-service, maestro-mongodb, netdata, portainer, certbot
- Auto-cleans legacy `/root/maestro` compose stack before deploy
- `cancel-in-progress: true`, 20min timeout, docker log rotation 50m×3, weekly cron prune

## Session Fixes (Oct 2026)
### Performance (3-5x)
- Backend: uvicorn `--workers 2 --loop uvloop --http httptools`
- Scheduler file-lock (only 1 worker runs cron)
- Nginx: keepalive 64, gzip comp 5, proxy_read_timeout 180s, buffering on

### Auth
- `AuthContext.logout()` wipes 16 keys + sessionStorage (fixed Owner-after-employee login)

### Enterprise Mode: Projects
- `create_tenant` auto-creates project with tenant.name + activity_type + is_default=(tier==trial) + enterprise_enabled=(tier in trial/enterprise)
- `update_tenant` auto-flips enterprise_enabled when account_tier changes
- `/auth/me` returns tenant_account_tier + tenant_enterprise_enabled + limits
- Migrations: `fix_default_project_names_v1` (UUID→name), `unmark_default_for_real_tenants_v1`
- **🔒 `migrate_tenants_to_customer_tier_v1` (Feb 2026)**: أي عميل قديم بدون `account_tier` → `customer` + `enterprise_enabled=False` (إدارة المشاريع مخفية حتى يُفعّل Super Admin المؤسسة عبر زر 👑). **قرار المالك**: ممنوع auto-trial على السيرفر — "تجريبي" يُنشأ يدوياً فقط. البيانات (projects/branches/orders/users) تبقى كما هي 100% — عند تفعيل المؤسسة لاحقاً كل المشاريع القديمة تعود للظهور ببياناتها. (`/app/backend/tests/test_tenant_tier_migration.py` — 5/5 tests pass)

### Shift Report Audit (Private) + OTP/Auth Hardening (Feb 2026)
- **📊 `shift_report_audit` collection**: كل مرة تُغلَق فيها وردية ويُرسَل التقرير لمالك المطعم، نكتب سجل تدقيق **بدون أي أرقام مالية** (فقط tenant_name/cashier/branch/business_date/channels/status/error).
- `GET /api/super-admin/shift-reports-audit` (SuperAdmin only) → `{summary:{total,delivered,failed}, items:[…], tenants:[…], filters:{…}}`. يدعم فلاتر: `tenant_id`, `status`, `date_from`, `date_to`, `limit`, `skip`.
- `GET /api/super-admin/shift-reports-audit.csv` → تصدير CSV (UTF-8 BOM لدعم Excel عربي) بنفس الفلاتر.
- SuperAdmin UI: تاب جديد "تقارير الورديات" يعرض الجدول + badges للقنوات (📱✉️🔔) + فلاتر (العميل/الحالة/من/إلى تاريخ) + زر "تصدير CSV" — صاحب النظام يرى حالة الوصول فقط، ولا يرى الأرقام المالية (الخصوصية مكفولة للعميل).
- **🔐 OTP TTL**: زِيد من 1 دقيقة إلى 5 دقائق (يتحمّل تأخير واتساب الفعلي ولا يُقفل عملاء بسبب رسائل متأخرة).
- **🛡️ `_ban_ip_permanent`**: لا يحظر دائماً عنواناً عليه دخول ناجح خلال آخر 7 أيام (شبكة مكتبية فيها كاشيرون). يُستبدل بتجميد ناعم 15 دقيقة ويُسجَّل `security.soft_cool_down`. العناوين المجهولة ما زالت تُحظر دائمياً كما كان.
- (`/app/backend/tests/test_shift_report_audit_and_otp.py` — 4/4 tests pass)

### Bug Fixes (Feb 2026 — same session)
- **🐛 👑 "فشل التحويل"**: أُرسلت Authorization صراحةً مع كل PUT.
- **🐛 "المشاريع" يظهر لأدمن تينانت customer**: فصلتُ `SYSTEM_OWNER_ROLES=[super_admin,enterprise_owner]` عن أدوار العرض — admin تينانت customer **لا يرى** تاب المشاريع حتى يفعّل SuperAdmin المؤسسة بزر 👑.
### Bug Fixes (Feb 2026 — same session)
- **🐛 👑 "فشل التحويل" في جميع الاتجاهات (customer↔trial↔enterprise)**: السبب الحقيقي كان **خطأ مرجعي صامت** — زر "حفظ التحويل" يستدعي `fetchTenants()` بعد نجاح الـPUT، لكن الدالة الفعلية اسمها `fetchData()`. ReferenceError يُلتقط في `catch` → يظهر toast "فشل التحويل" **رغم أن التحويل نجح فعلياً في الباك-إند**. الحل: استبدال الاستدعاء إلى `fetchData()`. الآن كل الاتجاهات الستّة تعمل بسلاسة.
- **🐛 "المشاريع" يظهر لأدمن تينانت customer**: فصلتُ `SYSTEM_OWNER_ROLES=[super_admin,enterprise_owner]` — admin تينانت customer لا يرى تاب المشاريع حتى يفعّل SuperAdmin بزر 👑.
- **🐛 "فشل تسجيل الدخول" بعد تبديل المستخدم (كان يحتاج إغلاق التبويب)**:
  - `logout()` الآن يحذف الكوكيز المرئية كلها + ينظّف `caches` + `window.location.replace('/login?_=TS')` لإجبار تحميل جديد يتجاوز أي كاش
  - fallback لـ`super_admin_token` في `/auth/logout`
  - صفحة `/login` تُنظّف دفاعياً أي بقايا مصادقة عند mount
  - أضفتُ `selectedProjectId`, `projects`, `auth_checked` لقائمة المفاتيح المحذوفة
- **🐛 حدود مؤسسة أدنى من الاستهلاك الحالي**: الدايلوج يحسب الحد تلقائياً.
- **🐛 الدايلوج يفتح على مؤسسة بدلاً من "عميل فعال"**: وحّدتُ موضعين منفصلين (`openEditTenant` + زر 👑 المباشر) — كلاهما الآن يفتح على `account_tier='customer'` + `max_projects=1` دائماً. SuperAdmin هو من يُقرّر الترقية يدوياً.
- **🔒 حماية المسارات على مستوى الصفحة**: `/enterprise-dashboard` و `/super-admin/enterprise-config` يُعيدان التوجيه للرئيسية إذا لم يكن المستخدم مُفعّلاً كمؤسسة أو ليس super_admin.
- **التحقق**: 15/15 pytest tests passed + تحقق curl للاتجاهات الستّة (customer↔trial↔enterprise) جميعها.
- **🐛 حدود مؤسسة أدنى من الاستهلاك الحالي**: الدايلوج الآن يحسب الحد تلقائياً.
- **🐛 الدايلوج يفتح على مؤسسة بدلاً من "عميل فعال"**: `openEditTenant` الآن يفتح دائماً على **customer + 1 مشروع** (المربع الوسط). SuperAdmin هو من يُقرّر الترقية بالنقر على مربع "مؤسسة" يدوياً. حقول حدود المؤسسة تظهر فقط بعد اختيار "مؤسسة" (كان موجوداً من قبل، تم التأكيد).
- **🔒 حماية المسارات على مستوى الصفحة**: `/enterprise-dashboard` و `/super-admin/enterprise-config` الآن يُعيدان التوجيه للرئيسية (`<Navigate to="/" />`) إذا لم يكن المستخدم مُفعّلاً كمؤسسة أو ليس super_admin. حماية دفاع-في-عمق فوق إخفاء التبويبات.
- (`/app/backend/tests/test_tier_upgrade_endpoint.py` — 2/2 pass)
- UI: "تعديل الاسم" button on every project card
- `enforce_project_limit`: trial=∞, customer=1, enterprise=max_projects
- Super Admin dialog: 3 account type buttons + conditional enterprise limits section + 20 activity types

### WhatsApp
- Project line "🍽️ Name — Activity" in message template (21 activity types mapped to emoji+Arabic)
- Activity type selector in create tenant dialog
- `shift_close_report_sent_at` idempotency marker (prevents duplicate reports after restart)
- **CRITICAL**: Baileys `getMessage` callback + 1000-msg in-memory store (48h TTL) + `makeCacheableSignalKeyStore` + `retryRequestDelayMs: 2000` → fixed "Waiting for this message" permanent block

## Backlog (P1-P3)
- P1: Daily shift report via WhatsApp (replaces generic "Integrity Check")
- P1: Apply Project→Branch pattern to Driver/Customer/Printer forms
- P1: Enforce `max_branches_per_project` and `max_users_per_branch` on branch/user creation
- P2: Enterprise Dashboard (cross-project comparison)
- P2: Colored project badges
- P3: Refactor `server.py` 18k monolith → `/app/backend/routes/`

## Known Tech Debt
- MongoDB auth: tenant uses `MONGO_INITDB_ROOT_*` but backend connects no-auth

## Credentials
See `/app/memory/test_credentials.md`
