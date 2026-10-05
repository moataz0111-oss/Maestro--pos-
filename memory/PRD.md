# Maestro EGP — Multi-Tenant POS → Enterprise Management

## Problem Statement
Multi-tenant POS system scaling into a Multi-Activity Enterprise Management System. Live production serving real customers (GRaffiti BURGER, 10 branches, 70,619 orders, $757K sales). Users: owner (super_admin), tenant admins, cashiers, managers.

## Users
- **Super Admin (Owner)**: Creates tenants, manages SMTP, monitors all tenants (bilateral: owner@maestroegp.com + MoatazMehana/27/10/2018 + secret key)
- **Admin (Tenant Owner)**: One per tenant (GRaffiti BURGER / hanialdujaili@gmail.com)
- **Cashier / Manager / Delivery / Employee**: Per-branch isolated roles

## Core Requirements (Enforced)
1. Strict shift isolation per cashier
2. Business-date aware auto-close (Iraq TZ UTC+3)
3. Enterprise Mode: Project-level isolation across tenants
4. Multi-currency per project (exchange rate history)
5. Biometric sync across branches via local agent + queue
6. Multichannel notifications: UI bell + WhatsApp (Baileys) + Email (SMTP)
7. Offline-capable with cached auth + IndexedDB

## Live Deployment
- VPS: 158.220.118.54, domain: maestroegp.com
- CI/CD: GitHub Actions → builds on GH runners → pushes to GHCR → deploys via SSH
- Deploy folder on VPS: `/var/www/maestro` (not `/root/maestro` which is legacy)
- Containers: nginx, backend, frontend, wa-service, maestro-mongodb, netdata, portainer, certbot

## Session Fixes (Oct 2026)
### 🚨 Production Outage Recovery (Oct 3-4)
- Root cause: disk 100% full → Docker log explosion (no rotation configured)
- Fix: cleared logs/journals → freed 93G
- **Permanent**: added `/etc/docker/daemon.json` log rotation (50m × 3) + weekly cron prune

### ⚡ Backend Performance (3-5x speedup)
- `backend/Dockerfile`: `uvicorn ... --workers 2 --loop uvloop --http httptools`
- `backend/requirements.txt`: `uvicorn[standard]==0.25.0` for uvloop/httptools
- `backend/server.py`: `is_scheduler_worker()` file lock → only 1 worker runs cron schedulers

### 🌐 Nginx (reports stopped failing)
- `nginx.conf`: keepalive 64 upstream, gzip comp_level 5, proxy_read_timeout 60s→180s, proxy_buffering on, proxy_next_upstream retry

### 🛠️ CI/CD Hardening
- `.github/workflows/deploy.yml`: 
  - `cancel-in-progress: true` (prev false → stuck 15m)
  - `command_timeout: 60m → 20m`
  - Auto-stops old `/root/maestro` stack + removes `maestro-*` zombie containers before deploy
  - Final sweep removes stragglers after deploy

### 🔐 Auth: Owner login after employee logout
- `AuthContext.logout()` previously left behind `super_admin_token`, `super_admin_user`, `original_super_admin_token`, `pending_impersonation`, `impersonated*` keys → forced browser restart
- Fix: single `authKeys` array wipes 16 keys + full sessionStorage

### 🏢 Enterprise Mode: Project naming
- Create tenant now auto-creates default project with `tenant.name` + links categories + admin user
- `fix_default_project_names_v1` migration: renames existing UUID-named projects using tenants.name → settings → users.restaurant_name fallbacks
- UI: added "تعديل الاسم" button on every project card (even default), kept "تعيين مدير"
- Removed "افتراضي" badge → "المشروع الرئيسي" neutral label

## Backlog
- P1: Daily shift report via WhatsApp (replaces generic "Integrity Check")
- P1: Apply Project→Branch pattern to Driver/Customer/Printer forms
- P2: Enterprise Dashboard (cross-project comparison)
- P2: Colored project badges on cards
- P3: Refactor `server.py` 18k monolith → routes/

## Known Tech Debt
- Dual stacks (legacy `/root/maestro` + new `/var/www/maestro`) resolved via CI auto-cleanup
- MongoDB auth: created with `MONGO_INITDB_ROOT_*` but new backend connects no-auth to existing volume — works but inconsistent

## Credentials
See `/app/memory/test_credentials.md`
