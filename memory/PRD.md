# Maestro EGP — PRD (updated Feb 9, 2026)

## Latest Session Fixes (Feb 9, 2026)
Based on user screenshots at 6.19.45–6.19.55 PM:

### Backend: Auto-Backfill Logo on Tier Upgrade
**File**: `backend/routes/super_admin_routes.py:987-1013`
When SuperAdmin converts a tenant to `trial` or `enterprise`:
1. Set `enterprise_enabled=true`, `is_enterprise=(tier=='enterprise')`
2. **NEW**: Backfill `logo_url` on all projects where it's missing — reads from `settings.system_info.logoUrl`
3. **NEW**: Backfill `name` on projects where it's missing — reads from `settings.system_info.name`
4. Preserves existing logos (only fills NULL/empty)

This directly resolves user complaints:
- "لوجو المطعم لا يظهر على المشروع الموجود الفعال" ✅
- "معلومات المطعم المفروض تتحول لمعلومات المشروع" ✅

### Note on "Filter Not Showing"
After upgrading tier, user MUST logout + login to refresh their JWT and ProjectContext. The `enterpriseEnabled` flag is fetched at login via `/enterprise-config/me`. Otherwise the UI continues with cached `enterprise_enabled=false`.

## Pending After This Deploy
- User logs out and logs back in → ProjectContext fetches new `enterprise_enabled=true` → project filter appears → logo visible on project card.

## All Other State
See previous PRD sections for Service Worker v39, deploy.yml fixes, hooks fixes, WA service fixes, shift report project_id, dialog state fix, etc. All deployed and verified live.

## Credentials
See `/app/memory/test_credentials.md`

## Data Safety
Backfill only writes to NULL/empty fields. Zero destructive operations.
