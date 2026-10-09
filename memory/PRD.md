# Maestro EGP — Multi-Tenant POS + Enterprise Management System

## Original Problem Statement
نظام POS متعدد المستأجرين لإدارة المطاعم (Maestro EGP). التركيز الحالي: ضوابط أمان صارمة، محاسبة متعددة الكاشير، مزامنة البصمة، إشعارات مركزية WhatsApp/Email/UI، وبنية 3-tier (Trial/Customer/Enterprise) بدون التأثير على بيانات العملاء.

## Current State (Feb 7, 2026)
- Full-stack React + FastAPI + MongoDB + Baileys WhatsApp microservice
- 3-tier Enterprise architecture (Trial/Customer/Enterprise)
- Secure cookie/bearer hybrid auth with 2FA + Trusted Devices
- Multi-channel notifications (Bell UI + Baileys WhatsApp + SMTP Email)
- Production live at maestroegp.com (VPS 158.220.118.54, SW v39, main.877d7ec2.js)

## Recent Changes (Feb 7, 2026 Session — User-Annotated Screenshot Fixes)

### Tier Dialog State Fix (SuperAdmin.js:3040-3072)
**Issue**: Dialog always opened on "عميل فعال" (Customer) even for Enterprise tenants.
**Fix**: Load CURRENT tier state when opening — if tenant is `enterprise`, dialog opens on Enterprise with its actual limits; if `trial/customer`, opens accordingly.

### Project Logo Inheritance (projects_routes.py)
**Issue**: Default project card had no logo; new projects required manual logo upload.
**Fix 1 (migration @ line 540-557)**: `_ensure_default_projects` now reads `settings.system_info.logoUrl` and uses it as the default project's `logo_url`.
**Fix 2 (POST /projects @ line 217-233)**: New project creation falls back to tenant's logo if `logo_url` not provided.

### BranchSelector Project Filter (already correct)
`BranchSelector.js:56` already uses `enterpriseEnabled && projects.length > 1` — single-project tenants don't see the filter. No fix needed.

### Previously Deployed (Oct 5, 2026)
- **Deploy Pipeline**: Removed `continue-on-error: true` from frontend Docker build (was silently masking rules-of-hooks errors for weeks).
- **Hooks Fixes**: `EnterpriseDashboard.jsx` + `EnterpriseConfigPanel.jsx` — moved `return <Navigate />` AFTER hooks.
- **Service Worker v39**: Network-First for hashed assets + auto-accept update banner (5s countdown) → fixes PWA stuck on old version.
- **WhatsApp "Waiting for this message" Fix**: `assertSessions([jid], true)` before sendMessage, `getMessage` returns `undefined` (triggers sessionReset), persistent `message-store.json` with 7-day TTL.
- **Project Name in WA Reports**: `shift_close_report` now passes `project_id` → `notify_owner_multichannel` resolves specific project (not just default).

## Key Files
- `/app/.github/workflows/deploy.yml` — Build pipeline
- `/app/frontend/public/sw-offline.js` — SW v39
- `/app/frontend/src/pages/SuperAdmin.js` — Tier dialog + management
- `/app/frontend/src/pages/EnterpriseConfigPanel.jsx` + `EnterpriseDashboard.jsx` — Hooks fixed
- `/app/frontend/src/components/BranchSelector.js` — Project selector hides for single project
- `/app/backend/routes/projects_routes.py` — Logo inheritance from tenant settings
- `/app/backend/routes/shifts_routes.py` — Shift close report with project_id
- `/app/backend/server.py` — notify_owner_multichannel with project resolution
- `/app/wa_service/index.js` — Baileys with assertSessions + persistent store

## Pending / Roadmap
- **P0**: User verification after new deploy — tier dialog state, project logo on default project, WA message decryption.
- **P1**: Build `EnterpriseDashboard.jsx` live multi-project comparison UI.
- **P1**: Daily scheduler for shift closure summary (replace legacy "Integrity Check" messages).
- **P2**: Add activity-type/currency/timezone edit buttons on project card.
- **P3**: Refactor `server.py` monolith (>18K lines) into `/app/backend/routes/`.

## Credentials
See `/app/memory/test_credentials.md`
- Super Admin: owner@maestroegp.com / owner123 / Secret 271018
- Tenant Admin: admin@maestroegp.com / admin123

## Data Safety Policy
Only frontend UI + backend logo inheritance changes. **ZERO destructive MongoDB operations**. Existing projects/tenants retain all data. Logo inheritance only backfills NULL values; existing logos preserved.
