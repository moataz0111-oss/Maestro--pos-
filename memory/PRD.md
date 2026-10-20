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

## 2026-06 — Projects: hard delete, full edit, per-project logo & branding
- DELETE /api/projects/{id}: permanent hard delete + cascade (all docs with project_id or its branch_ids, non-owner users; owners unlinked). Refuses last project. Audit log `project_hard_delete`.
- GET /api/projects hides legacy soft-deleted (deleted_at) projects. Removed org-logo auto-backfill into projects (list, create, restaurant settings save).
- POST /api/projects/{id}/logo: any image format (HEIC→JPG via pillow_heif, SVG sanitized).
- GET /api/projects/branding/current?branch_id|project_id (+X-Project-Id): project name/logo for enterprise tenants only.
- Receipts (POS invoices + Dashboard closing receipt) use project name/logo instead of org (Maestro system logo unchanged).
- WhatsApp: Maestro image kept; header line uses project resolved via project_id → branch → header → single project; no "مؤسسة" label.
- UI: ProjectsSettings full edit dialog + ProjectLogoUpload component + typed-name delete confirmation dialog.
- Tested: iteration_314 (backend 100%, frontend 100%).

## 2026-06 — Reports strict project isolation
- reports_routes router dependency `_set_project_scope` (query project_id / X-Project-Id / restricted user's project) + `_scope()` applied to all report queries (auto via `_apply_business_date_filter`), also smart_reports & GET /refunds. Branch is source of truth (docs with branch_id belong to the branch's project; docs without branch use project_id). Branch of another project → empty.
- GET /api/reports/projects-activity: per-project orders/sales for date range (restricted users see only their project).
- Reports UI refetches on project change; BranchContext resets branch to 'all' on project change; red dot for projects without data in dropdown + ProjectsActivityStrip chips when "كل المشاريع".
- Tested iteration_315 (backend 23/24 → products catalog leak fixed after; frontend 95%).
- Known pre-existing: profit-loss counts pending orders (53) vs sales (33) → "صافي الربح" can exceed sales. Not fixed (not requested).

## 2026-06 — Settings full project isolation (iterations 316-317 passed)
- Settings: SettingsProjectBar (global project select), ProjectFormSelect (required in add/edit category & product, add branch), ProjectBadge under "كل المشاريع", CopyCatalogDialog (POST /api/projects/{id}/copy-catalog; links to raw/manufactured/packaging stripped).
- Product dialog pickers (categories, manufactured, packaging) filtered by the product's project; other-project lists fetched on demand (ensureProjectLists).
- Backend: requested_project_id / project_branch_condition / delivery_commission_rate in routes/shared.py. Project-scoped GETs: categories (header too), products, manufactured-products (also fixed missing tenant filter = cross-tenant leak), raw-materials-new, packaging-materials, printers (by project branches). delivery_app_settings & tenant_invoice_settings per project with tenant fallback; order commission uses branch's project. Category move moves its products.
- /tenant/limits per project for enterprise tenants (fixed false "max branches reached").
- New projects no longer seed template categories; migration cleanup_empty_template_categories_v1 removes empty template categories.

## 2026-06 — Inventory / purchasing / manufacturing project isolation (iterations 318-319)
- routes/inventory_scope.py: ContextVar scope (set_inventory_scope dependency on inventory_system + suppliers routers) + _ScopedDB wrapper via get_db(): reads strict by project (branch collections also by project branches incl. to/from_branch_id), find_one & writes lenient (project or untagged), inserts auto-tagged, *_number counters tenant-global. Migration inventory_project_backfill_v1.
- server.py: purchase-invoices, purchase-suppliers, inventory-transfers, inventory-transactions, warehouse-purchase-requests scoped; duplicate packaging-requests/branch-packaging-inventory routes removed (inventory_system versions used).
- Projects API: POST /api/projects/inventory/move, POST /api/projects/inventory/transfer (logged in project_inventory_log + inventory_movements both sides), GET /api/projects/inventory/log.
- Frontend: PageProjectBar on WarehouseManufacturing, PurchasesPage, Purchasing, BranchOrders, InventoryReports, ExternalPurchasesReport, WarehouseTransfers, PriceIncreaseReport; InventoryProjectField in add dialogs (selecting project switches page scope); ProjectBadge on cards; MoveToProjectDialog; api.js guard blocks creates under "all" without project.
- Known minor: PriceIncreaseReport dark header contrast (pre-existing).

## 2026-06 — Transfer log, stock alerts, enterprise dashboard, admin welcome (iteration 320 + fixes)
- /project-transfers-log page (ProjectTransfersLog.jsx): filters project/date, direct print via hidden iframe (utils/printTransferLog.js). GET /api/projects/inventory/log?project_id&start_date&end_date.
- PriceIncreaseReport + PageProjectBar theme-aware (bg-background/text-foreground).
- routes/stock_alerts.py run_stock_alerts(tenant_id?) — in-app scheduler every 10 min (server startup, is_scheduler_worker): instant alert once per item until restocked (low_stock_alert_state, first run seeds silently via low_stock_seed) + daily summary ≥08:00 Baghdad (low_stock_daily_state). POST /api/projects/stock-alerts/run (owner, own tenant).
- notify_owner_multichannel recipients: + project_admin users of the project + project.owner_phone; managers of other projects excluded.
- Projects: owner_name/owner_phone fields; assign-admin sends WhatsApp welcome with credentials (whatsapp_sent/whatsapp_error).
- /api/enterprise/dashboard: branch-based attribution, purchases, inventory_value, net = revenue−expenses−purchases; EnterpriseDashboard.jsx charts (ProjectsComparisonChart, separate inventory chart), direct-load redirect fixed via ProjectContext.configLoaded. Entry: Settings → المشاريع → "لوحة المؤسسة".

## 2026-06 — Two limit systems
- Non-enterprise tenant: limits from client creation (tenant.max_branches / max_users), tenant-wide.
- Enterprise tenant: limits from enterprise activation (max_branches_per_project / max_users_per_project), per project. Applied in GET /tenant/limits, POST /branches, POST /users (new users get project_id from branch's project or selected project).


## 2026-06 — Enterprise buttons moved to Reports
- Removed 'لوحة المؤسسة' and 'سجل التحويلات' buttons from ProjectsSettings (header + project cards).
- Added them as tabs in Reports page (enterprise-enabled owner/admin/GM only); embedded mode hides back button and global report filters. Tested iteration_321 (100%).

## 2026-06 — Project colors + strict enterprise gating
- Project color: owner picks from 12-swatch palette or a custom color (projects.color, validated hex). Projects without a saved color get distinct automatic defaults (components/ProjectColor.jsx). Colors show on project cards, in selectors, in the enterprise dashboard and charts, and in the transfers log.
- Enterprise Dashboard / Transfers Log are shown only when tenant enterprise_enabled=true (ProjectContext.tenantEnterpriseActive). Backend require_tenant_enterprise guards /enterprise/dashboard and /projects/inventory/log. enterprise_owner no longer bypasses the flag. Tested iteration_322-324 (all pass).
