# Maestro EGP — Multi-Tenant POS + Enterprise Management System

## Original Problem Statement
نظام POS متعدد المستأجرين لإدارة المطاعم (Maestro EGP). التركيز الحالي: ضوابط أمان صارمة، محاسبة متعددة الكاشير بدون دمج، مزامنة أجهزة البصمة بين الفروع، إشعارات مركزية متعددة القنوات (WhatsApp/Email/UI)، وبنية 3-tier (Trial/Customer/Enterprise) بدون التأثير على بيانات العملاء.

## Current State (Feb 2026)
- Full-stack React + FastAPI + MongoDB + Baileys WhatsApp microservice
- 3-tier Enterprise architecture (Trial/Customer/Enterprise)
- Secure cookie/bearer hybrid auth with 2FA + Trusted Devices
- Multi-channel notifications (Bell UI + Baileys WhatsApp + SMTP Email)

## Recent Changes (Oct 5, 2026 — Fork Session)

### Deployment Pipeline Fixes
- **ROOT CAUSE discovered**: `continue-on-error: true` on frontend Docker build in `.github/workflows/deploy.yml` was silently masking `rules-of-hooks` compile errors — causing ALL deploys to serve the OLD `:latest` frontend image for weeks.
- **Fixed `EnterpriseConfigPanel.jsx`**: Moved `return <Navigate />` AFTER all React hooks to satisfy `rules-of-hooks`.
- **Fixed `EnterpriseDashboard.jsx`**: Same hooks ordering fix.
- **Removed `continue-on-error: true`** from frontend build step so failures are visible.
- **Added `timeout-minutes: 15`** to Docker builds to prevent hanging.

### Service Worker — Aggressive Update (v38 → v39)
- **File**: `frontend/public/sw-offline.js` — bumped `CACHE_VERSION` to `v39`.
- **Added Network-First strategy for hashed assets** (`/static/js/*.chunk.js`): prevents PWA from serving old cached JS after new deploy. Legacy assets still use Cache-First with background refresh.
- **Enabled `self.clients.claim()`** in activate handler — new SW takes control immediately on skipWaiting.
- **Auto-accept update banner** in `src/index.js` — 5-second countdown then auto-triggers `SKIP_WAITING` to resolve the "PWA stuck on old version" issue permanently.

### SuperAdmin UI Fixes
- **Tier Dialog default fix**: Clicking 👑 opens on "عميل فعال" (middle Customer) with `max_projects=1`; Enterprise limits section hidden until user clicks "مؤسسة" manually.
- **Toast cleanup**: `toast.dismiss()` called when crown button opens to clear any stale "فشل التحويل" from previous attempts.
- **Fixed false error toast**: The `fetchData` ReferenceError was wrapped in a NEW inner try/catch, so API failures and post-save refresh errors are isolated — eliminates the OLD bug showing BOTH "success + fail" toasts simultaneously.

### WhatsApp "Waiting for this message" Fix (`wa_service/index.js`)
- **getMessage callback returns `undefined` (not `{conversation:''}`)**: Empty string broke Signal re-encryption. `undefined` triggers Baileys sessionReset instead of infinite loop.
- **`sock.assertSessions([jid], true)` before `sendMessage`** in both `/send` and `/send-media`: forces fresh Signal session for recipients whose session is corrupt.
- **Persistent Message Store (file-based)**: `message-store.json` under `AUTH_DIR` survives container restarts. TTL extended from 48h → 7 days (WhatsApp retry window). Max 2000 entries.
- **`maxMsgRetryCount: 5`** + `retryRequestDelayMs: 1000` for faster, bounded retries.

### Enterprise Account Tiers (safe rollout)
- Migration `migrate_tenants_to_customer_tier_v1` defaults all legacy tenants to Customer tier (preserves data).
- `enterprise_enabled` properly gated per tenant.
- All project-scoped data (drivers, customers, printers) isolated via `project_id` + `branch_id`.

## Key Files
- `/app/.github/workflows/deploy.yml` — Build pipeline (fixed error masking)
- `/app/frontend/public/sw-offline.js` — Service Worker v39
- `/app/frontend/src/index.js` — Auto-updating banner
- `/app/frontend/src/pages/SuperAdmin.js` — Tier management UI
- `/app/frontend/src/pages/EnterpriseConfigPanel.jsx` — Hooks fix
- `/app/frontend/src/pages/EnterpriseDashboard.jsx` — Hooks fix
- `/app/wa_service/index.js` — Baileys with assertSessions + persistent store
- `/app/backend/whatsapp_free.py` — WA client wrapper
- `/app/backend/routes/shifts_routes.py` — Shift close reports
- `/app/backend/server.py` — Main API (18K lines, needs refactoring)

## Pending / Roadmap
- **P0**: Verify WhatsApp messages decrypt correctly on recipient side after wa_service redeploy.
- **P1**: Build `EnterpriseDashboard.jsx` live comparison UI (deferred).
- **P1**: Daily shift closure WhatsApp/Email report replacing "Integrity Check" alerts.
- **P2**: Colored project badges on tenant cards.
- **P3**: Refactor `server.py` monolith (>18K lines) into `/app/backend/routes/`.

## Deployment Workflow
1. User edits code in Emergent preview.
2. User clicks "Save to Github" → auto-commit to `main`.
3. GitHub Actions `deploy.yml` builds Docker images, pushes to GHCR, SSHes to VPS 158.220.118.54.
4. VPS pulls new images and restarts containers (nginx, backend, frontend, wa-service, mongodb).
5. CDN/edge: nginx-alpine on VPS, no external CDN.

## Credentials
See `/app/memory/test_credentials.md`
- Super Admin: owner@maestroegp.com / owner123 / Secret 271018
- Tenant Admin: admin@maestroegp.com / admin123

## Data Safety Policy (this session)
**ZERO backend/database changes** — all fixes are frontend-only (JS/UI/Service Worker) + Node wa_service + CI workflow config. No MongoDB migrations, no API changes, no schema changes. Customer data untouched.
