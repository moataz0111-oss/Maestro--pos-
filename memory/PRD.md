# Maestro EGP — PRD (Feb 9, 2026)

## Critical Fix Added — Project Logo Auto-Fallback
**File**: `backend/routes/projects_routes.py:141-205` (`list_projects` endpoint)

Every call to `GET /projects` now:
1. Detects projects with missing `logo_url`
2. Reads tenant logo from 3 fallback sources (settings.restaurant → settings.system_info → tenants.logo_url)
3. Injects logo into response AND persists it to DB (idempotent)

Resolves user complaints:
- "لوجو المطعم لا يظهر على بطاقة المشروع" ✅ immediate on page load
- No need for user to re-save institution settings
- Works for all existing projects without manual intervention

## Also Added (prior commits in session)
- `super_admin_routes.py:987-1013`: Logo backfill on tier upgrade
- `server.py:9272-9324`: Logo backfill when saving institution settings
- `projects_routes.py:217-233`: Logo inheritance for new projects
- SuperAdmin.js dialog: Opens on actual tier (not always Customer)

## Deployment
Needs Save to Github → ~7 min deploy → logo appears automatically on next page refresh.

## Data Safety
Only fills NULL/empty logo_url. Existing logos preserved. Zero destructive ops.

## Credentials
See `/app/memory/test_credentials.md`
