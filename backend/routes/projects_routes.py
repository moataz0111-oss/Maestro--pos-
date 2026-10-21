"""
Projects Routes - إدارة المشاريع (Enterprise Mode)
كل مشروع = كيان مستقل تماماً (خزينة، موارد بشرية، مخزون، مستخدمون، تقارير).
"""
from fastapi import APIRouter, Depends, HTTPException, Body, UploadFile, File, Request
import re
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, timezone
import uuid
import logging

from .shared import (
    get_database, get_current_user, get_user_tenant_id,
    UserRole, has_role, hash_password, build_tenant_query,
    logger as shared_logger,
)

router = APIRouter(prefix="/projects", tags=["Projects (Enterprise)"])
logger = logging.getLogger(__name__)

# ==================== ADDITIONAL ROLES ====================
class EnterpriseRole:
    ENTERPRISE_OWNER = "enterprise_owner"   # مالك المؤسسة - يرى كل المشاريع
    PROJECT_ADMIN = "project_admin"         # مدير مشروع واحد - معزول تماماً
    PROJECT_MANAGER = "project_manager"     # مدير داخل مشروع
    PROJECT_EMPLOYEE = "project_employee"   # موظف داخل مشروع

# أدوار المؤسسة (يشوفون كل المشاريع)
ENTERPRISE_WIDE_ROLES = {
    UserRole.SUPER_ADMIN,
    UserRole.ADMIN,
    UserRole.GENERAL_MANAGER,
    EnterpriseRole.ENTERPRISE_OWNER,
}

# أنواع الأنشطة المدعومة
ACTIVITY_TYPES = [
    "restaurant",       # مطعم
    "salon",            # صالون
    "clinic",           # عيادة
    "supermarket",      # سوبرماركت
    "distribution",     # توزيع
    "delivery_company", # شركة توصيل (Toters-Style)
    "manufacturing",    # تصنيع
    "retail",           # تجزئة
    "other",            # أخرى
]

IMAGE_EXTS = {"jpg", "jpeg", "png", "gif", "webp", "heic", "heif", "bmp", "tiff", "tif", "avif", "svg", "ico", "jfif"}

PROJECT_PALETTE = ["#F97316", "#10B981", "#3B82F6", "#EC4899", "#A855F7", "#EAB308",
                   "#06B6D4", "#EF4444", "#84CC16", "#14B8A6", "#F43F5E", "#6366F1"]

# ==================== MODELS ====================
class ProjectCreate(BaseModel):
    name: str
    name_en: Optional[str] = None
    activity_type: str = "restaurant"
    logo_url: Optional[str] = None
    color: Optional[str] = Field(None, pattern=r"^#[0-9a-fA-F]{6}$")
    currency: str = "IQD"
    timezone: str = "Asia/Baghdad"
    description: Optional[str] = None
    # سعر صرف عملة المشروع مقارنة بالعملة الرئيسية للمؤسسة (1 unit عملة المشروع = X عملة المؤسسة)
    exchange_rate: Optional[float] = None

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    name_en: Optional[str] = None
    activity_type: Optional[str] = None
    logo_url: Optional[str] = None
    color: Optional[str] = Field(None, pattern=r"^#[0-9a-fA-F]{6}$")
    admin_reports_enabled: Optional[bool] = None  # المالك فقط: تقارير مدير المشروع
    admin_daily_summary: Optional[bool] = None    # المالك فقط: ملخص الإغلاق اليومي لمدير المشروع
    admin_inventory_enabled: Optional[bool] = None  # المالك فقط: المخزون والتصنيع
    admin_purchases_enabled: Optional[bool] = None  # المالك فقط: المشتريات والموردين
    cash_diff_alert_threshold: Optional[float] = Field(None, ge=0)  # تنبيه فرق الصندوق (0 = معطّل)
    currency: Optional[str] = None
    timezone: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None
    exchange_rate: Optional[float] = None
    owner_name: Optional[str] = None
    owner_phone: Optional[str] = None

class ProjectAdminAssign(BaseModel):
    username: str
    email: str
    password: str
    full_name: str
    phone: Optional[str] = None


class ExchangeRateUpdate(BaseModel):
    exchange_rate: float
    reason: Optional[str] = None  # سبب/ملاحظة التغيير (اختياري)

# ==================== HELPERS ====================
def user_is_enterprise_owner(user: dict) -> bool:
    """المستخدم مالك مؤسسة أو أعلى - يشوف كل المشاريع"""
    return user.get("role") in ENTERPRISE_WIDE_ROLES

async def require_tenant_enterprise(db, user: dict):
    """يمنع ميزات المؤسسة عن العميل العادي (غير مفعّل له التوسعة)"""
    if user.get("role") == UserRole.SUPER_ADMIN:
        return
    t = await db.tenants.find_one({"id": get_user_tenant_id(user)}, {"_id": 0, "enterprise_enabled": 1})
    if not (t or {}).get("enterprise_enabled"):
        raise HTTPException(status_code=403, detail="هذه الميزة متاحة فقط لحسابات المؤسسة")

def user_allowed_projects(user: dict) -> Optional[List[str]]:
    """
    يُرجع قائمة project_ids المسموحة للمستخدم.
    None = مسموح بكل شيء (enterprise owner).
    [] = لا شيء مسموح.
    [id1, id2] = مسموح بهذه المشاريع فقط.
    """
    if user_is_enterprise_owner(user):
        return None  # يرى كل المشاريع
    pid = user.get("project_id")
    if pid:
        return [pid]
    # مستخدم قديم بدون project_id → يستخدم الافتراضي للـ tenant
    return []

async def get_default_project_for_tenant(db, tenant_id: str) -> Optional[dict]:
    """يجلب المشروع الافتراضي للـ tenant (المُنشأ من الـ migration)"""
    return await db.projects.find_one(
        {"tenant_id": tenant_id, "is_default": True},
        {"_id": 0}
    )

async def build_project_query(user: dict, base_query: Optional[dict] = None,
                              explicit_project_id: Optional[str] = None) -> dict:
    """
    يبني query يفلتر البيانات حسب المشروع المسموح للمستخدم.
    - Enterprise owner: يشوف كل شيء (اختيارياً مع project_id محدد)
    - Project user: يشوف مشروعه فقط
    """
    query = dict(base_query or {})

    # فلتر الـ tenant أولاً
    tenant_id = get_user_tenant_id(user)
    if tenant_id and user.get("role") != UserRole.SUPER_ADMIN:
        query["tenant_id"] = tenant_id

    allowed = user_allowed_projects(user)
    if allowed is None:
        # enterprise owner - اختياري بtroي project_id محدد
        if explicit_project_id and explicit_project_id != "all":
            query["project_id"] = explicit_project_id
    elif len(allowed) == 0:
        # مستخدم قديم أو بدون مشروع - fallback للمشروع الافتراضي
        pass
    else:
        # project user - إجباري
        query["project_id"] = {"$in": allowed}

    return query

# ==================== ENDPOINTS ====================
@router.get("")
async def list_projects(current_user: dict = Depends(get_current_user)):
    """قائمة المشاريع - المالك يشوف كل مشاريع مؤسسته، والباقي مشاريعهم فقط"""
    db = get_database()
    tenant_id = get_user_tenant_id(current_user)

    query = {}
    if tenant_id and current_user.get("role") != UserRole.SUPER_ADMIN:
        query["tenant_id"] = tenant_id

    allowed = user_allowed_projects(current_user)
    if allowed is not None:
        if not allowed:
            return []
        query["id"] = {"$in": allowed}

    query["deleted_at"] = {"$exists": False}
    projects = await db.projects.find(query, {"_id": 0}).sort("created_at", 1).to_list(length=None)
    return projects


@router.get("/branding/current")
async def get_project_branding(
    request: Request,
    branch_id: Optional[str] = None,
    project_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """اسم وشعار المشروع للفواتير والإيصالات (فقط عند تفعيل المؤسسة)"""
    db = get_database()
    tenant_id = get_user_tenant_id(current_user)
    if not tenant_id:
        return {}
    tenant = await db.tenants.find_one({"id": tenant_id}, {"_id": 0, "enterprise_enabled": 1})
    if not (tenant or {}).get("enterprise_enabled"):
        return {}
    proj = await resolve_project_for_context(db, tenant_id, project_id=project_id,
                                             branch_id=branch_id, user=current_user,
                                             header_project_id=request.headers.get("X-Project-Id"))
    if not proj:
        return {}
    return {k: proj.get(k) for k in ("id", "name", "name_en", "logo_url", "activity_type")}


async def resolve_project_for_context(db, tenant_id: str, project_id: Optional[str] = None,
                                      branch_id: Optional[str] = None, user: Optional[dict] = None,
                                      header_project_id: Optional[str] = None) -> Optional[dict]:
    """يحدد المشروع الفعلي: project_id → مشروع الفرع → مشروع المستخدم → المشروع الوحيد/الافتراضي"""
    base = {"tenant_id": tenant_id, "deleted_at": {"$exists": False}}
    proj_fields = {"_id": 0, "id": 1, "name": 1, "name_en": 1, "logo_url": 1, "activity_type": 1, "is_default": 1}
    candidates = [project_id]
    if branch_id:
        br = await db.branches.find_one({"id": branch_id, "tenant_id": tenant_id}, {"_id": 0, "project_id": 1})
        candidates.append((br or {}).get("project_id"))
    candidates.append(header_project_id)
    if user:
        candidates.append(user.get("project_id"))
    for pid in candidates:
        if pid and pid != "all":
            proj = await db.projects.find_one({**base, "id": pid}, proj_fields)
            if proj:
                return proj
    projs = await db.projects.find(base, proj_fields).sort("created_at", 1).to_list(length=2)
    if len(projs) == 1:
        return projs[0]
    return next((p for p in projs if p.get("is_default")), None)


@router.post("")
async def create_project(
    project: ProjectCreate,
    current_user: dict = Depends(get_current_user)
):
    """إنشاء مشروع جديد - للمالك فقط"""
    if not user_is_enterprise_owner(current_user):
        raise HTTPException(status_code=403, detail="فقط مالك المؤسسة يمكنه إنشاء مشاريع")

    if project.activity_type not in ACTIVITY_TYPES:
        raise HTTPException(status_code=400, detail=f"نوع النشاط غير مدعوم")

    db = get_database()
    tenant_id = get_user_tenant_id(current_user) or "default"

    # ⭐ أكتوبر 2026: تطبيق حدود الحسابات (طلب العميل)
    #    • trial: بدون قيود — يستطيع تجربة كل شيء كأنه مؤسسة (المشاريع، الفروع، المستخدمين)
    #    • customer: مشروع واحد فقط
    #    • enterprise: حسب max_projects المشترى على tenant
    tenant_doc = await db.tenants.find_one(
        {"id": tenant_id},
        {"_id": 0, "max_projects": 1, "account_tier": 1, "is_demo": 1, "subscription_type": 1}
    )
    tenant_doc = tenant_doc or {}
    _tier = tenant_doc.get("account_tier")
    _is_trial = (
        _tier == "trial"
        or bool(tenant_doc.get("is_demo"))
        or (tenant_doc.get("subscription_type") in ("trial", "demo"))
    )

    if _is_trial:
        # 🆓 حساب تجريبي: بدون قيود — يُجرب كل الميزات بلا حدود
        max_projects = 10**9
    elif _tier == "enterprise":
        max_projects = int(tenant_doc.get("max_projects") or 1)
    else:
        # عميل عادي: مشروع واحد فقط
        max_projects = 1

    current_count = await db.projects.count_documents({"tenant_id": tenant_id, "is_active": True})
    if current_count >= max_projects:
        raise HTTPException(
            status_code=403,
            detail=(
                f"وصلت للحد الأقصى من المشاريع ({max_projects}). "
                f"{'ترقية الاشتراك إلى مؤسسة لإضافة المزيد.' if _tier != 'enterprise' else 'تواصل مع الدعم لرفع الحد.'}"
            )
        )

    # (توافق قديم) التحقق من حد المشاريع عبر الوحدة المركزية إن وُجدت
    try:
        from .enterprise_config_routes import enforce_project_limit
        await enforce_project_limit(db, tenant_id)
    except Exception:
        pass

    # 🖼️ Feb 2026: إذا لم يُحدَّد لوجو للمشروع الجديد، اقتبسه من إعدادات المؤسسة (settings.system_info.logoUrl)
    _project_logo = project.logo_url
    _used_colors = {(p.get("color") or "").upper() async for p in db.projects.find(
        {"tenant_id": tenant_id, "deleted_at": {"$exists": False}}, {"_id": 0, "color": 1})}

    project_doc = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "name": project.name,
        "name_en": project.name_en,
        "activity_type": project.activity_type,
        "logo_url": _project_logo,
        "color": (project.color or next(
            (c for c in PROJECT_PALETTE if c not in _used_colors),
            PROJECT_PALETTE[len(_used_colors) % len(PROJECT_PALETTE)]
        )).upper(),
        "currency": project.currency,
        "timezone": project.timezone,
        "description": project.description,
        # سعر الصرف: 1 unit من عملة المشروع = X unit من العملة الرئيسية للمؤسسة
        "exchange_rate": project.exchange_rate if project.exchange_rate and project.exchange_rate > 0 else 1.0,
        "is_active": True,
        "is_default": False,
        "admin_user_id": None,
        "created_by": current_user.get("id"),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.projects.insert_one(project_doc)
    project_doc.pop("_id", None)

    return {"message": "تم إنشاء المشروع بنجاح", "project": project_doc}


class CopyCatalogRequest(BaseModel):
    source_project_id: str
    category_ids: Optional[List[str]] = None  # None = كل الفئات


@router.post("/{project_id}/copy-catalog")
async def copy_catalog(project_id: str, payload: CopyCatalogRequest, current_user: dict = Depends(get_current_user)):
    """نسخ فئات ومنتجات من مشروع إلى آخر (نسخ مستقلة — بدون تكرار الفئات بنفس الاسم)"""
    if not user_is_enterprise_owner(current_user):
        raise HTTPException(status_code=403, detail="غير مصرح")
    if payload.source_project_id == project_id:
        raise HTTPException(status_code=400, detail="اختر مشروعاً مصدراً مختلفاً")
    db = get_database()
    tenant_id = get_user_tenant_id(current_user)
    base = {"tenant_id": tenant_id, "deleted_at": {"$exists": False}}
    for pid in (project_id, payload.source_project_id):
        if not await db.projects.find_one({**base, "id": pid}, {"_id": 1}):
            raise HTTPException(status_code=404, detail="المشروع غير موجود")

    cq = {"tenant_id": tenant_id, "project_id": payload.source_project_id, "is_active": {"$ne": False}}
    if payload.category_ids:
        cq["id"] = {"$in": payload.category_ids}
    src_cats = await db.categories.find(cq, {"_id": 0}).to_list(length=None)
    target_cats = await db.categories.find({"tenant_id": tenant_id, "project_id": project_id}, {"_id": 0, "id": 1, "name": 1}).to_list(length=None)
    by_name = {c["name"]: c["id"] for c in target_cats}
    now = datetime.now(timezone.utc).isoformat()
    cat_map, cats_added = {}, 0
    for c in src_cats:
        if c["name"] in by_name:
            cat_map[c["id"]] = by_name[c["name"]]
            continue
        new_id = str(uuid.uuid4())
        await db.categories.insert_one({**c, "id": new_id, "project_id": project_id, "created_at": now})
        cat_map[c["id"]] = new_id
        cats_added += 1

    existing_names = {(p.get("category_id"), p.get("name")) async for p in db.products.find(
        {"tenant_id": tenant_id, "project_id": project_id}, {"_id": 0, "name": 1, "category_id": 1})}
    prods_added = 0
    async for p in db.products.find({"tenant_id": tenant_id, "project_id": payload.source_project_id,
                                     "deleted_at": {"$exists": False}, "is_active": {"$ne": False},
                                     "category_id": {"$in": list(cat_map.keys())}}, {"_id": 0}):
        new_cat = cat_map[p["category_id"]]
        if (new_cat, p.get("name")) in existing_names:
            continue
        # روابط المصنّع/المواد تخص المشروع المصدر → تُفرَّغ ليربطها المستخدم بمواد مشروعه
        await db.products.insert_one({
            **p, "id": str(uuid.uuid4()), "project_id": project_id, "category_id": new_cat,
            "manufactured_product_id": None, "manufactured_links": [], "finished_product_id": None,
            "packaging_items": [], "recipe_quantities": [], "ingredients": [], "printer_ids": [],
            "created_at": now,
        })
        prods_added += 1
    return {"message": f"تم نسخ {cats_added} فئة و {prods_added} منتج",
            "categories_added": cats_added, "products_added": prods_added}


@router.post("/owner-weekly-summary/test")
async def send_owner_weekly_summary_now(current_user: dict = Depends(get_current_user)):
    """إرسال الملخص الأسبوعي للمالك الآن (للتجربة)"""
    if not user_is_enterprise_owner(current_user) or current_user.get("is_project_admin"):
        raise HTTPException(status_code=403, detail="غير مصرح")
    db = get_database()
    await require_tenant_enterprise(db, current_user)
    from routes.project_daily_summary import run_owner_weekly_summaries, _owner_phones
    tid = get_user_tenant_id(current_user)
    if not await _owner_phones(db, tid):
        raise HTTPException(status_code=400, detail="لا يوجد رقم هاتف للمالك — أضفه في بيانات الحساب")
    sent = await run_owner_weekly_summaries(force_tenant_id=tid)
    return {"sent": sent, "message": "تم إرسال الملخص الأسبوعي" if sent else "تعذّر الإرسال — تحقق من ربط واتساب النظام"}


@router.put("/owner-weekly-summary")
async def toggle_owner_weekly_summary(body: dict = Body(...), current_user: dict = Depends(get_current_user)):
    if not user_is_enterprise_owner(current_user) or current_user.get("is_project_admin"):
        raise HTTPException(status_code=403, detail="غير مصرح")
    db = get_database()
    await require_tenant_enterprise(db, current_user)
    enabled = bool(body.get("enabled", True))
    await db.tenants.update_one({"id": get_user_tenant_id(current_user)}, {"$set": {"owner_weekly_summary": enabled}})
    return {"enabled": enabled}


@router.get("/owner-weekly-summary")
async def get_owner_weekly_summary(current_user: dict = Depends(get_current_user)):
    if not user_is_enterprise_owner(current_user) or current_user.get("is_project_admin"):
        raise HTTPException(status_code=403, detail="غير مصرح")
    db = get_database()
    t = await db.tenants.find_one({"id": get_user_tenant_id(current_user)}, {"_id": 0, "owner_weekly_summary": 1}) or {}
    return {"enabled": t.get("owner_weekly_summary") is not False}


@router.get("/{project_id}")
async def get_project(project_id: str, current_user: dict = Depends(get_current_user)):
    """جلب مشروع محدد"""
    db = get_database()
    tenant_id = get_user_tenant_id(current_user)

    query = {"id": project_id}
    if tenant_id and current_user.get("role") != UserRole.SUPER_ADMIN:
        query["tenant_id"] = tenant_id

    project = await db.projects.find_one(query, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="المشروع غير موجود")

    allowed = user_allowed_projects(current_user)
    if allowed is not None and project_id not in allowed:
        raise HTTPException(status_code=403, detail="غير مصرح - هذا المشروع لا يخصك")

    return project


@router.put("/{project_id}")
async def update_project(
    project_id: str,
    updates: ProjectUpdate,
    current_user: dict = Depends(get_current_user)
):
    """تحديث مشروع - للمالك أو مدير المشروع نفسه فقط"""
    db = get_database()
    tenant_id = get_user_tenant_id(current_user)

    query = {"id": project_id}
    if tenant_id and current_user.get("role") != UserRole.SUPER_ADMIN:
        query["tenant_id"] = tenant_id

    project = await db.projects.find_one(query, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="المشروع غير موجود")

    is_owner = user_is_enterprise_owner(current_user)
    is_project_admin = (
        (current_user.get("role") == EnterpriseRole.PROJECT_ADMIN or current_user.get("is_project_admin"))
        and current_user.get("project_id") == project_id
    )
    if not (is_owner or is_project_admin):
        raise HTTPException(status_code=403, detail="غير مصرح لك بتعديل هذا المشروع")

    payload = {k: v for k, v in updates.dict().items() if v is not None}
    # لا يسمح بتغيير سعر الصرف مباشرة عبر PUT - لأنه يحتاج تسجيل سجل تاريخي
    payload.pop("exchange_rate", None)
    if not is_owner:
        payload.pop("admin_reports_enabled", None)
        for _k in ("admin_daily_summary", "admin_inventory_enabled", "admin_purchases_enabled", "cash_diff_alert_threshold"):
            payload.pop(_k, None)
    if payload:
        payload["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.projects.update_one({"id": project_id}, {"$set": payload})

    updated = await db.projects.find_one({"id": project_id}, {"_id": 0})
    return {"message": "تم تحديث المشروع بنجاح", "project": updated}


@router.post("/{project_id}/daily-summary/test")
async def send_project_daily_summary_now(project_id: str, current_user: dict = Depends(get_current_user)):
    """إرسال ملخص إغلاق الأمس لمدير المشروع الآن (للتجربة) — مالك المؤسسة فقط"""
    if not user_is_enterprise_owner(current_user):
        raise HTTPException(status_code=403, detail="غير مصرح")
    db = get_database()
    await require_tenant_enterprise(db, current_user)
    if not await db.projects.find_one({"id": project_id, "tenant_id": get_user_tenant_id(current_user)}, {"_id": 1}):
        raise HTTPException(status_code=404, detail="المشروع غير موجود")
    if not await db.users.find_one({"project_id": project_id, "role": "project_admin", "phone": {"$type": "string", "$ne": ""}}, {"_id": 1}):
        raise HTTPException(status_code=400, detail="لا يوجد مدير مشروع برقم هاتف لهذا المشروع")
    from routes.project_daily_summary import run_project_daily_summaries
    sent = await run_project_daily_summaries(force_project_id=project_id)
    return {"sent": sent, "message": "تم إرسال الملخص" if sent else "تعذّر الإرسال — تحقق من ربط واتساب النظام"}


# ==================== EXCHANGE RATE MANAGEMENT ====================
@router.patch("/{project_id}/exchange-rate")
async def update_project_exchange_rate(
    project_id: str,
    body: ExchangeRateUpdate,
    current_user: dict = Depends(get_current_user)
):
    """تحديث سعر صرف المشروع مع تسجيل سجل تاريخي كامل"""
    if not user_is_enterprise_owner(current_user):
        raise HTTPException(status_code=403, detail="فقط مالك المؤسسة يمكنه تحديث سعر الصرف")
    if body.exchange_rate <= 0:
        raise HTTPException(status_code=400, detail="سعر الصرف يجب أن يكون أكبر من صفر")

    db = get_database()
    tenant_id = get_user_tenant_id(current_user)

    query = {"id": project_id}
    if tenant_id and current_user.get("role") != UserRole.SUPER_ADMIN:
        query["tenant_id"] = tenant_id
    project = await db.projects.find_one(query, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="المشروع غير موجود")
    if project.get("is_default"):
        raise HTTPException(status_code=400, detail="لا يمكن تعديل سعر صرف المشروع الافتراضي (=العملة الرئيسية)")

    old_rate = project.get("exchange_rate", 1.0)
    now_iso = datetime.now(timezone.utc).isoformat()

    # سجل تاريخي — نسجّل كل تغيير حتى لو نفس السعر (للتدقيق)
    await db.exchange_rate_history.insert_one({
        "id": str(uuid.uuid4()),
        "project_id": project_id,
        "tenant_id": tenant_id,
        "currency": project.get("currency"),
        "old_rate": old_rate,
        "new_rate": body.exchange_rate,
        "reason": body.reason,
        "changed_by": current_user.get("id"),
        "changed_by_name": current_user.get("full_name") or current_user.get("username"),
        "changed_at": now_iso,
    })

    await db.projects.update_one(
        {"id": project_id},
        {"$set": {"exchange_rate": body.exchange_rate, "updated_at": now_iso}}
    )

    updated = await db.projects.find_one({"id": project_id}, {"_id": 0})
    return {
        "message": "تم تحديث سعر الصرف بنجاح",
        "project": updated,
        "old_rate": old_rate,
        "new_rate": body.exchange_rate,
    }


@router.get("/{project_id}/exchange-rate-history")
async def get_exchange_rate_history(
    project_id: str,
    limit: int = 50,
    current_user: dict = Depends(get_current_user)
):
    """سجل التاريخ لسعر صرف المشروع"""
    db = get_database()
    tenant_id = get_user_tenant_id(current_user)

    query = {"project_id": project_id}
    if tenant_id and current_user.get("role") != UserRole.SUPER_ADMIN:
        query["tenant_id"] = tenant_id

    history = await db.exchange_rate_history.find(query, {"_id": 0}) \
        .sort("changed_at", -1).to_list(length=limit)
    return {"history": history, "total": len(history)}


@router.delete("/{project_id}")
async def delete_project(
    project_id: str,
    current_user: dict = Depends(get_current_user)
):
    """حذف/تعطيل مشروع - للمالك فقط. المشروع الافتراضي لا يُحذف."""
    if not user_is_enterprise_owner(current_user):
        raise HTTPException(status_code=403, detail="فقط مالك المؤسسة يمكنه حذف مشاريع")

    db = get_database()
    tenant_id = get_user_tenant_id(current_user)

    query = {"id": project_id}
    if tenant_id and current_user.get("role") != UserRole.SUPER_ADMIN:
        query["tenant_id"] = tenant_id

    project = await db.projects.find_one(query, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="المشروع غير موجود")

    if project.get("is_default"):
        raise HTTPException(status_code=400, detail="لا يمكن حذف المشروع الافتراضي")

    tid = project.get("tenant_id")
    remaining = await db.projects.count_documents({
        "tenant_id": tid, "id": {"$ne": project_id}, "deleted_at": {"$exists": False}
    })
    if remaining == 0:
        raise HTTPException(status_code=400, detail="لا يمكن حذف آخر مشروع في المؤسسة")

    # 🗑️ حذف نهائي: المشروع + كل بياناته (الفروع، الطلبات، المصاريف، المخزون، الموظفين...)
    branch_ids = [b["id"] async for b in db.branches.find(
        {"tenant_id": tid, "project_id": project_id}, {"_id": 0, "id": 1}) if b.get("id")]
    data_filter = {"tenant_id": tid, "$or": [{"project_id": project_id}]}
    if branch_ids:
        data_filter["$or"].append({"branch_id": {"$in": branch_ids}})

    owner_roles = list(ENTERPRISE_WIDE_ROLES)
    await db.users.update_many(
        {"tenant_id": tid, "role": {"$in": owner_roles}, "project_id": project_id},
        {"$unset": {"project_id": ""}}
    )
    if branch_ids:
        await db.users.update_many(
            {"tenant_id": tid, "role": {"$in": owner_roles}, "branch_id": {"$in": branch_ids}},
            {"$set": {"branch_id": None}}
        )
    deleted_users = await db.users.delete_many({**data_filter, "role": {"$nin": owner_roles}})

    skip = {"projects", "users", "tenants", "migrations", "audit_logs", "system_email_logs"}
    deleted_counts = {"users": deleted_users.deleted_count}
    for coll_name in await db.list_collection_names():
        if coll_name in skip or coll_name.startswith("system."):
            continue
        try:
            res = await db[coll_name].delete_many(data_filter)
            if res.deleted_count:
                deleted_counts[coll_name] = res.deleted_count
        except Exception as e:
            logger.warning(f"project cascade delete {coll_name} failed: {e}")

    await db.projects.delete_one({"id": project_id})
    _logo = project.get("logo_url") or ""
    if _logo.startswith("/api/uploads/logos/"):
        try:
            from server import LOGOS_DIR
            (LOGOS_DIR / _logo.rsplit("/", 1)[-1]).unlink(missing_ok=True)
        except Exception:
            pass
    try:
        await db.audit_logs.insert_one({
            "id": str(uuid.uuid4()), "tenant_id": tid, "action": "project_hard_delete",
            "project_id": project_id, "project_name": project.get("name"),
            "deleted_counts": deleted_counts, "user_id": current_user.get("id"),
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception:
        pass
    logger.info(f"🗑️ project {project_id} hard-deleted: {deleted_counts}")
    return {"message": "تم حذف المشروع وكل بياناته نهائياً", "deleted_counts": deleted_counts}


@router.post("/{project_id}/logo")
async def upload_project_logo(
    project_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user)
):
    """رفع/تغيير شعار المشروع — يدعم كل صيغ الصور (JPG, PNG, WEBP, GIF, HEIC, BMP, TIFF, AVIF, SVG)"""
    from server import process_and_save_image, LOGOS_DIR
    db = get_database()
    tenant_id = get_user_tenant_id(current_user)
    query = {"id": project_id, "deleted_at": {"$exists": False}}
    if tenant_id and current_user.get("role") != UserRole.SUPER_ADMIN:
        query["tenant_id"] = tenant_id
    project = await db.projects.find_one(query, {"_id": 0, "id": 1})
    if not project:
        raise HTTPException(status_code=404, detail="المشروع غير موجود")
    is_project_admin = (
        (current_user.get("role") == EnterpriseRole.PROJECT_ADMIN or current_user.get("is_project_admin"))
        and current_user.get("project_id") == project_id
    )
    if not (user_is_enterprise_owner(current_user) or is_project_admin):
        raise HTTPException(status_code=403, detail="غير مصرح لك بتعديل هذا المشروع")

    name = (file.filename or "").lower()
    ext = name.rsplit(".", 1)[-1] if "." in name else ""
    ctype = file.content_type or ""
    if not (ctype.startswith("image/") or ext in IMAGE_EXTS):
        raise HTTPException(status_code=400, detail="الملف يجب أن يكون صورة")

    if ext == "svg" or ctype == "image/svg+xml":
        raw = await file.read()
        if re.search(rb"<script|javascript:|\son\w+\s*=|<foreignObject", raw, re.IGNORECASE):
            raise HTTPException(status_code=400, detail="ملف SVG يحتوي على محتوى غير آمن")
        filename = f"{uuid.uuid4()}.svg"
        (LOGOS_DIR / filename).write_bytes(raw)
    else:
        filename = await process_and_save_image(file, LOGOS_DIR, max_size=(512, 512), quality=90)
    logo_url = f"/api/uploads/logos/{filename}"
    await db.projects.update_one(
        {"id": project_id},
        {"$set": {"logo_url": logo_url, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"message": "تم رفع شعار المشروع بنجاح", "logo_url": logo_url}


@router.post("/{project_id}/assign-admin")
async def assign_project_admin(
    project_id: str,
    admin: ProjectAdminAssign,
    current_user: dict = Depends(get_current_user)
):
    """إنشاء/تعيين مدير مشروع - للمالك فقط. المدير معزول تماماً بمشروعه."""
    if not user_is_enterprise_owner(current_user):
        raise HTTPException(status_code=403, detail="فقط مالك المؤسسة يمكنه تعيين مدراء المشاريع")

    db = get_database()
    tenant_id = get_user_tenant_id(current_user) or "default"

    project = await db.projects.find_one({"id": project_id, "tenant_id": tenant_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="المشروع غير موجود")

    # التحقق من حد المستخدمين للمشروع
    from .enterprise_config_routes import enforce_user_limit
    await enforce_user_limit(db, tenant_id, project_id)

    existing = await db.users.find_one(
        {"$or": [{"email": admin.email}, {"username": admin.username}]}
    )
    if existing:
        raise HTTPException(status_code=400, detail="البريد أو اسم المستخدم مستخدم مسبقاً")

    user_doc = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "project_id": project_id,
        "username": admin.username,
        "email": admin.email,
        "password": hash_password(admin.password),
        "full_name": admin.full_name,
        "phone": admin.phone,
        "role": EnterpriseRole.PROJECT_ADMIN,
        "branch_id": None,
        "permissions": [],
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": current_user.get("id"),
    }
    await db.users.insert_one(user_doc)

    await db.projects.update_one(
        {"id": project_id},
        {"$set": {"admin_user_id": user_doc["id"], "updated_at": datetime.now(timezone.utc).isoformat()}}
    )

    user_doc.pop("password", None)
    user_doc.pop("_id", None)
    wa_sent, wa_error = await _send_admin_welcome(tenant_id, project, admin)
    return {"message": "تم تعيين مدير المشروع بنجاح", "admin": user_doc,
            "whatsapp_sent": wa_sent, "whatsapp_error": wa_error}


async def _send_admin_welcome(tenant_id: str, project: dict, admin) -> tuple:
    """رسالة واتساب تجريبية لمدير المشروع الجديد تحتوي بيانات الدخول"""
    if not admin.phone:
        return False, "لا يوجد رقم هاتف"
    try:
        import os
        from server import _phone_to_e164, _wa_free
        e164 = await _phone_to_e164(admin.phone)
        url = os.environ.get("FRONTEND_URL", "")
        msg = (f"مرحباً {admin.full_name} 👋\n"
               f"تم تعيينك مديراً لمشروع *{project.get('name')}*.\n\n"
               f"👤 اسم المستخدم: {admin.username}\n"
               f"📧 البريد: {admin.email}\n"
               f"🔑 كلمة المرور: {admin.password}\n"
               + (f"🔗 رابط الدخول: {url}\n" if url else "")
               + "\nهذه رسالة تجريبية للتأكد من وصول تنبيهات المشروع إليك. يُنصح بتغيير كلمة المرور بعد أول دخول.")
        ok, err = await _wa_free.send_message(
            e164, msg, purpose="project_admin_welcome", tenant_id=tenant_id,
            title="🏢 بيانات دخول مدير المشروع", with_logo=True,
            project_name=project.get("name"), project_logo=project.get("logo_url"),
            project_activity=project.get("activity_type"),
        )
        errs = {"not_connected": "واتساب النظام غير مربوط — اربطه من إعدادات الواتساب",
                "invalid_number": "رقم الهاتف غير صالح"}
        return bool(ok), (None if ok else errs.get(str(err), str(err)))
    except Exception as e:
        logger.warning(f"project admin welcome WA failed: {e}")
        return False, str(e)


@router.get("/{project_id}/users")
async def list_project_users(
    project_id: str,
    current_user: dict = Depends(get_current_user)
):
    """قائمة مستخدمي مشروع محدد - للمالك أو مدير المشروع نفسه"""
    db = get_database()
    tenant_id = get_user_tenant_id(current_user)

    is_owner = user_is_enterprise_owner(current_user)
    is_project_admin = (
        current_user.get("role") in [EnterpriseRole.PROJECT_ADMIN, UserRole.MANAGER]
        and current_user.get("project_id") == project_id
    )
    if not (is_owner or is_project_admin):
        raise HTTPException(status_code=403, detail="غير مصرح")

    query = {"project_id": project_id}
    if tenant_id and current_user.get("role") != UserRole.SUPER_ADMIN:
        query["tenant_id"] = tenant_id

    users = await db.users.find(query, {"_id": 0, "password": 0}).to_list(length=None)
    return users


# ==================== MIGRATION ====================
async def run_enterprise_backfill_migration(db):
    """
    يحوّل النظام الحالي إلى Enterprise Mode:
    - لكل tenant موجود ينشئ مشروع افتراضي واحد
    - يربط كل branches, employees, products, orders, expenses, ... بالمشروع الافتراضي
    """
    logger.info("🏢 Starting Enterprise Mode backfill migration...")

    marker = await db.migrations.find_one({"name": "enterprise_mode_v1"})
    if marker and marker.get("applied"):
        logger.info("🟢 Migration enterprise_mode_v1 already applied, skipping")
        return {"skipped": True}

    # 1) جمع كل الـ tenants الموجودة من users + branches + orders
    tenant_ids = set()
    async for u in db.users.find({}, {"_id": 0, "tenant_id": 1}):
        if u.get("tenant_id"):
            tenant_ids.add(u["tenant_id"])
    async for b in db.branches.find({}, {"_id": 0, "tenant_id": 1}):
        if b.get("tenant_id"):
            tenant_ids.add(b["tenant_id"])
    if not tenant_ids:
        tenant_ids = {"default"}

    logger.info(f"🏢 Found {len(tenant_ids)} tenant(s): {tenant_ids}")

    # 2) لكل tenant، إنشاء مشروع افتراضي (إن لم يوجد)
    tenant_default_project = {}
    for tid in tenant_ids:
        existing = await db.projects.find_one({"tenant_id": tid, "is_default": True})
        if existing:
            tenant_default_project[tid] = existing["id"]
            continue

        pid = str(uuid.uuid4())
        # حاول جلب اسم/شعار من settings الحالية
        tenant_name = tid
        _tenant_logo = None
        settings = await db.settings.find_one({"tenant_id": tid, "type": "system_info"})
        if settings and settings.get("value"):
            _val = settings.get("value") or {}
            if _val.get("name"):
                tenant_name = _val["name"]
            # 🖼️ Feb 2026: اقتبس اللوجو من إعدادات المؤسسة إن وُجد
            _tenant_logo = _val.get("logoUrl") or _val.get("logo_url")

        await db.projects.insert_one({
            "id": pid,
            "tenant_id": tid,
            "name": tenant_name,
            "name_en": None,
            "activity_type": "restaurant",
            "logo_url": _tenant_logo,
            "currency": "IQD",
            "timezone": "Asia/Baghdad",
            "description": "المشروع الافتراضي - تم إنشاؤه تلقائياً",
            "is_active": True,
            "is_default": True,
            "admin_user_id": None,
            "created_by": "migration",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
        tenant_default_project[tid] = pid
        logger.info(f"   ✅ Created default project for tenant '{tid}' → {pid}")

    # 3) Backfill: إضافة project_id لكل الوثائق التي بدونها
    collections_to_backfill = [
        "branches", "users", "employees", "products", "orders", "expenses",
        "warehouses", "raw_materials", "customers", "suppliers", "purchases_new",
        "shifts", "cash_register_closings", "categories", "recipes", "tables",
        "reservations", "coupons", "attendance", "leave_requests", "payroll",
        "biometric_devices", "biometric_queue", "drivers", "call_logs",
    ]

    total_updated = 0
    for coll_name in collections_to_backfill:
        try:
            coll = db[coll_name]
            for tid, pid in tenant_default_project.items():
                res = await coll.update_many(
                    {"tenant_id": tid, "project_id": {"$exists": False}},
                    {"$set": {"project_id": pid}}
                )
                if res.modified_count:
                    total_updated += res.modified_count
                    logger.info(f"   🔗 {coll_name}[{tid}]: linked {res.modified_count} docs → {pid}")
                # وثائق بدون tenant_id → default project
                if tid == "default":
                    res2 = await coll.update_many(
                        {"tenant_id": {"$exists": False}, "project_id": {"$exists": False}},
                        {"$set": {"project_id": pid, "tenant_id": "default"}}
                    )
                    if res2.modified_count:
                        total_updated += res2.modified_count
                        logger.info(f"   🔗 {coll_name}[no-tenant]: linked {res2.modified_count} docs → {pid}")
        except Exception as e:
            logger.warning(f"   ⚠️ {coll_name}: {e}")

    # 4) وضع علامة انتهاء الـ migration
    await db.migrations.update_one(
        {"name": "enterprise_mode_v1"},
        {"$set": {
            "name": "enterprise_mode_v1",
            "applied": True,
            "applied_at": datetime.now(timezone.utc).isoformat(),
            "total_updated": total_updated,
            "tenants_processed": len(tenant_default_project),
        }},
        upsert=True,
    )

    logger.info(f"✅ Enterprise Mode migration complete: {total_updated} docs across {len(tenant_default_project)} tenant(s)")
    return {
        "success": True,
        "tenants_processed": len(tenant_default_project),
        "total_updated": total_updated,
        "default_projects": tenant_default_project,
    }


async def migrate_tenants_to_customer_tier_v1(db):
    """🔒 أكتوبر 2026 — ضبط افتراضي آمن لكل العملاء الحاليين على السيرفر الفعلي:
    - أي تينانت لا يملك حقل account_tier (قديم) → يُحوَّل إلى **customer** حصراً
      مع enterprise_enabled=False (إخفاء "إدارة المشاريع" حتى يفعّلها Super Admin يدوياً عبر زر 👑).
    - ❗ قرار المالك: لا يُسمَح بتحويل أي حساب موجود إلى **trial** تلقائياً على السيرفر —
      "تجريبي" يُنشأ فقط عبر Super Admin يدوياً من واجهة إنشاء التينانت. (أي حسابات is_demo
      قديمة مُسبقة التصنيف تبقى آمنة كـ customer حتى يرقّيها Super Admin يدوياً.)
    - لا يُمَس أي بيان (مشاريع، فروع، موظفين، طلبات، مصاريف) — تبقى كلها في DB كما هي.
      عند تفعيل المؤسسة لاحقاً من Super Admin، تظهر كل المشاريع القديمة ببياناتها كاملةً.
    idempotent — آمن لإعادة التشغيل في كل إقلاع."""
    marker = await db.migrations.find_one({"name": "migrate_tenants_to_customer_tier_v1"})
    if marker and marker.get("applied"):
        return {"skipped": True}
    try:
        now_iso = datetime.now(timezone.utc).isoformat()

        # كل تينانت بدون account_tier → customer (بدون أي استثناء)
        customer_result = await db.tenants.update_many(
            {"account_tier": {"$exists": False}},
            {"$set": {
                "account_tier": "customer",
                "enterprise_enabled": False,
                "is_enterprise": False,
                "max_projects": 1,
                "tier_migrated_at": now_iso,
                "tier_migrated_from": "legacy_auto",
            }}
        )
        customer_updated = customer_result.modified_count

        logger.info(
            f"🔒 migrate_tenants_to_customer_tier_v1: {customer_updated} legacy tenant(s) → customer "
            f"(data preserved, UI hidden until Super Admin activates). No auto-trial on server per owner policy."
        )

        await db.migrations.update_one(
            {"name": "migrate_tenants_to_customer_tier_v1"},
            {"$set": {
                "name": "migrate_tenants_to_customer_tier_v1",
                "applied": True,
                "applied_at": now_iso,
                "customer_updated": customer_updated,
                "trial_updated": 0,  # policy: never auto-mark trial on server
            }},
            upsert=True,
        )
        return {
            "success": True,
            "trial_updated": 0,
            "customer_updated": customer_updated,
        }
    except Exception as e:
        logger.warning(f"migrate_tenants_to_customer_tier_v1 failed: {e}")
        return {"success": False, "error": str(e)}


async def unmark_default_for_real_tenants_v1(db):
    """🏷️ أكتوبر 2026: يرفع علامة is_default=False عن مشاريع العملاء الفعليين.
    قاعدة العميل: "المشروع الرئيسي" يبقى فقط للحسابات التجريبية (trial/demo).
    idempotent — يعمل في كل إقلاع بأمان (update_many رخيصة)."""
    marker = await db.migrations.find_one({"name": "unmark_default_for_real_tenants_v1"})
    if marker and marker.get("applied"):
        return {"skipped": True}
    try:
        # اجلب كل العملاء الفعليين (ليس trial/demo وليس is_demo=True)
        real_tenants = await db.tenants.find(
            {
                "$and": [
                    {"$or": [{"is_demo": {"$ne": True}}, {"is_demo": {"$exists": False}}]},
                    {"subscription_type": {"$nin": ["trial", "demo"]}},
                ]
            },
            {"_id": 0, "id": 1}
        ).to_list(length=None)
        real_tenant_ids = [t["id"] for t in real_tenants if t.get("id")]
        if not real_tenant_ids:
            logger.info("🏷️ unmark_default_for_real_tenants_v1: no real tenants found")
            unmarked = 0
        else:
            result = await db.projects.update_many(
                {"tenant_id": {"$in": real_tenant_ids}, "is_default": True},
                {"$set": {"is_default": False, "updated_at": datetime.now(timezone.utc).isoformat()}}
            )
            unmarked = result.modified_count
            logger.info(f"🏷️ unmark_default_for_real_tenants_v1: unmarked {unmarked} project(s) in {len(real_tenant_ids)} real tenant(s)")
        await db.migrations.update_one(
            {"name": "unmark_default_for_real_tenants_v1"},
            {"$set": {
                "name": "unmark_default_for_real_tenants_v1",
                "applied": True,
                "applied_at": datetime.now(timezone.utc).isoformat(),
                "unmarked_count": unmarked,
            }},
            upsert=True,
        )
        return {"success": True, "unmarked": unmarked}
    except Exception as e:
        logger.warning(f"unmark_default_for_real_tenants_v1 failed: {e}")
        return {"success": False, "error": str(e)}


@router.post("/_migration/run", include_in_schema=False)
async def trigger_migration(current_user: dict = Depends(get_current_user)):
    """تشغيل migration Enterprise Mode يدوياً - Super Admin فقط"""
    if current_user.get("role") not in [UserRole.SUPER_ADMIN, UserRole.ADMIN]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    db = get_database()
    return await run_enterprise_backfill_migration(db)


async def fix_default_project_names_v1(db):
    """🩹 يُصحّح أسماء المشاريع الافتراضية التي صارت UUID (بسبب غياب settings وقت الترحيل).
    يستخدم مصادر متعددة لاستنتاج اسم المؤسسة الحقيقي:
    1) tenants.name
    2) settings.system_info.value.name
    3) settings.system_invoice_settings.value.business_name/restaurant_name
    4) users.restaurant_name (أول مستخدم admin في الـ tenant)
    idempotent — يعمل في الخلفية مرات متعددة بأمان.

    ⭐ أكتوبر 2026: يُصحّح أيضاً is_default=False لجميع العملاء الفعليين
    (ليس تجريبي). "المشروع الرئيسي" يبقى فقط للحسابات التجريبية التي لم تُفعّل بعد.
    """
    marker = await db.migrations.find_one({"name": "fix_default_project_names_v1"})
    if marker and marker.get("applied"):
        logger.info("🟢 Migration fix_default_project_names_v1 already applied, skipping")
        return {"skipped": True}

    logger.info("🩹 Starting fix_default_project_names_v1 migration...")
    fixed_count = 0
    unmarked_count = 0  # عدد المشاريع التي رُفعت عنها علامة "رئيسي"

    # اجلب كل المشاريع التي اسمها UUID (أي name == tenant_id)
    async for project in db.projects.find({}, {"_id": 0}):
        tid = project.get("tenant_id")
        pid = project.get("id")
        current_name = project.get("name") or ""
        if not tid or not pid:
            continue

        updates = {}

        # ━━━ 1) تصحيح الاسم إن كان UUID ━━━
        if current_name == tid:
            real_name = None

            # محاولة 1: tenants.name
            try:
                t = await db.tenants.find_one({"id": tid}, {"_id": 0, "name": 1, "name_ar": 1, "business_name": 1})
                if t:
                    real_name = t.get("name") or t.get("name_ar") or t.get("business_name")
            except Exception:
                pass

            # محاولة 2: settings.system_info
            if not real_name:
                try:
                    s = await db.settings.find_one({"tenant_id": tid, "type": "system_info"})
                    if s and s.get("value", {}).get("name"):
                        real_name = s["value"]["name"]
                except Exception:
                    pass

            # محاولة 3: settings.system_invoice_settings
            if not real_name:
                try:
                    s = await db.settings.find_one({"tenant_id": tid, "type": "system_invoice_settings"})
                    if s:
                        val = s.get("value", {})
                        real_name = val.get("business_name") or val.get("restaurant_name")
                except Exception:
                    pass

            # محاولة 4: users.restaurant_name (أول admin)
            if not real_name:
                try:
                    u = await db.users.find_one(
                        {"tenant_id": tid, "role": "admin"},
                        {"_id": 0, "restaurant_name": 1, "full_name": 1}
                    )
                    if u:
                        real_name = u.get("restaurant_name") or u.get("full_name")
                except Exception:
                    pass

            if real_name and real_name.strip() and real_name.strip() != tid:
                updates["name"] = real_name.strip()

        # ━━━ 2) رفع علامة is_default إن كان العميل فعلي (ليس تجريبي) ━━━
        # قاعدة العميل: "المشروع الرئيسي" يبقى فقط للحسابات التجريبية
        if project.get("is_default"):
            try:
                t = await db.tenants.find_one(
                    {"id": tid},
                    {"_id": 0, "is_demo": 1, "subscription_type": 1}
                )
                if t:
                    is_trial = (
                        bool(t.get("is_demo"))
                        or (t.get("subscription_type") in ("trial", "demo"))
                    )
                    if not is_trial:
                        updates["is_default"] = False
                        unmarked_count += 1
            except Exception:
                pass

        if updates:
            updates["updated_at"] = datetime.now(timezone.utc).isoformat()
            await db.projects.update_one({"id": pid}, {"$set": updates})
            if "name" in updates:
                fixed_count += 1
                logger.info(f"   ✅ Renamed project {pid[:8]}... → '{updates['name']}'")

    # وضع علامة الانتهاء
    await db.migrations.update_one(
        {"name": "fix_default_project_names_v1"},
        {"$set": {
            "name": "fix_default_project_names_v1",
            "applied": True,
            "applied_at": datetime.now(timezone.utc).isoformat(),
            "fixed_count": fixed_count,
            "unmarked_default_count": unmarked_count,
        }},
        upsert=True,
    )
    logger.info(f"✅ fix_default_project_names_v1 complete: {fixed_count} renamed, {unmarked_count} unmarked as default")
    return {"success": True, "fixed_count": fixed_count, "unmarked_default_count": unmarked_count}


async def cleanup_empty_template_categories_v1(db):
    """حذف الفئات النموذجية الفارغة التي أُنشئت تلقائياً للمشاريع (بدون sort_order وبدون منتجات)"""
    if await db.migrations.find_one({"name": "cleanup_empty_template_categories_v1"}):
        return
    from .enterprise_routes import ACTIVITY_TEMPLATES
    names = {c["name"] for t in ACTIVITY_TEMPLATES.values() for c in t.get("categories", [])}
    removed = 0
    async for c in db.categories.find({"name": {"$in": list(names)}, "sort_order": {"$exists": False},
                                       "project_id": {"$nin": [None, ""]}}, {"_id": 0, "id": 1}):
        if not await db.products.count_documents({"category_id": c["id"]}, limit=1):
            await db.categories.delete_one({"id": c["id"]})
            removed += 1
    await db.migrations.update_one(
        {"name": "cleanup_empty_template_categories_v1"},
        {"$set": {"name": "cleanup_empty_template_categories_v1", "applied": True, "removed": removed,
                  "applied_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    logger.info(f"🧹 cleanup_empty_template_categories_v1: removed {removed} empty template categories")


_INV_KINDS = {"raw": "raw_materials", "manufactured": "manufactured_products", "packaging": "packaging_materials"}


class MoveInventoryRequest(BaseModel):
    target_project_id: str
    kind: str
    item_ids: List[str]


class TransferStockRequest(BaseModel):
    target_project_id: str
    kind: str
    item_id: str
    quantity: float
    notes: Optional[str] = None


async def _inv_guard(current_user, target_project_id, kind):
    if not user_is_enterprise_owner(current_user):
        raise HTTPException(status_code=403, detail="غير مصرح")
    if kind not in _INV_KINDS:
        raise HTTPException(status_code=400, detail="نوع غير صالح")
    db = get_database()
    tenant_id = get_user_tenant_id(current_user)
    target = await db.projects.find_one({"id": target_project_id, "tenant_id": tenant_id,
                                         "deleted_at": {"$exists": False}}, {"_id": 0, "id": 1, "name": 1})
    if not target:
        raise HTTPException(status_code=404, detail="المشروع غير موجود")
    return db, tenant_id, target


@router.post("/inventory/move")
async def move_inventory_to_project(payload: MoveInventoryRequest, current_user: dict = Depends(get_current_user)):
    """نقل مواد (خام/مصنّعة/تغليف) نهائياً إلى مشروع آخر بكل كمياتها"""
    db, tenant_id, target = await _inv_guard(current_user, payload.target_project_id, payload.kind)
    coll = db[_INV_KINDS[payload.kind]]
    q = {"id": {"$in": payload.item_ids}}
    if tenant_id:
        q["tenant_id"] = tenant_id
    items = await coll.find(q, {"_id": 0, "id": 1, "name": 1, "project_id": 1}).to_list(length=None)
    res = await coll.update_many(q, {"$set": {"project_id": target["id"]}})
    now = datetime.now(timezone.utc).isoformat()
    await db.project_inventory_log.insert_one({
        "id": str(uuid.uuid4()), "tenant_id": tenant_id, "type": "move", "kind": payload.kind,
        "target_project_id": target["id"], "target_project_name": target["name"],
        "items": [{"id": i["id"], "name": i.get("name"), "from_project_id": i.get("project_id")} for i in items],
        "user_id": current_user.get("id"), "user_name": current_user.get("full_name") or current_user.get("username"),
        "created_at": now,
    })
    return {"message": f"تم نقل {res.modified_count} عنصر إلى مشروع {target['name']}", "moved": res.modified_count}


@router.post("/inventory/transfer")
async def transfer_stock_between_projects(payload: TransferStockRequest, current_user: dict = Depends(get_current_user)):
    """تحويل كمية من مادة بين مشروعين بسجل واضح (يخصم من المصدر ويضيف لنفس المادة في الهدف)"""
    db, tenant_id, target = await _inv_guard(current_user, payload.target_project_id, payload.kind)
    if payload.quantity <= 0:
        raise HTTPException(status_code=400, detail="الكمية يجب أن تكون أكبر من صفر")
    coll = db[_INV_KINDS[payload.kind]]
    q = {"id": payload.item_id}
    if tenant_id:
        q["tenant_id"] = tenant_id
    src = await coll.find_one(q, {"_id": 0})
    if not src:
        raise HTTPException(status_code=404, detail="المادة غير موجودة")
    if src.get("project_id") == target["id"]:
        raise HTTPException(status_code=400, detail="المادة موجودة أصلاً في هذا المشروع")
    if float(src.get("quantity") or 0) < payload.quantity:
        raise HTTPException(status_code=400, detail=f"الكمية المتوفرة {src.get('quantity') or 0} فقط")
    now = datetime.now(timezone.utc).isoformat()
    upd = await coll.update_one({**q, "quantity": {"$gte": payload.quantity}}, {"$inc": {"quantity": -payload.quantity}, "$set": {"updated_at": now}})
    if not upd.modified_count:
        raise HTTPException(status_code=409, detail="تغيّرت الكمية، أعد المحاولة")
    dst = await coll.find_one({"tenant_id": tenant_id, "project_id": target["id"], "name": src.get("name")}, {"_id": 0, "id": 1})
    if dst:
        await coll.update_one({"id": dst["id"]}, {"$inc": {"quantity": payload.quantity}, "$set": {"updated_at": now}})
        dst_id = dst["id"]
    else:
        dst_id = str(uuid.uuid4())
        await coll.insert_one({**src, "id": dst_id, "project_id": target["id"], "quantity": payload.quantity,
                               "created_at": now, "updated_at": now})
    src_proj = await db.projects.find_one({"id": src.get("project_id")}, {"_id": 0, "name": 1}) or {}
    log = {
        "id": str(uuid.uuid4()), "tenant_id": tenant_id, "type": "transfer", "kind": payload.kind,
        "item_name": src.get("name"), "unit": src.get("unit"), "quantity": payload.quantity,
        "cost_per_unit": src.get("cost_per_unit") or src.get("unit_cost"),
        "from_project_id": src.get("project_id"), "from_project_name": src_proj.get("name"),
        "from_item_id": src["id"], "target_project_id": target["id"], "target_project_name": target["name"],
        "to_item_id": dst_id, "notes": payload.notes,
        "user_id": current_user.get("id"), "user_name": current_user.get("full_name") or current_user.get("username"),
        "created_at": now,
    }
    await db.project_inventory_log.insert_one(dict(log))
    for pid, direction in ((src.get("project_id"), "out"), (target["id"], "in")):
        await db.inventory_movements.insert_one({
            "id": str(uuid.uuid4()), "tenant_id": tenant_id, "project_id": pid,
            "movement_type": "project_transfer_" + direction, "direction": direction,
            "item_type": payload.kind, "item_id": src["id"] if direction == "out" else dst_id,
            "item_name": src.get("name"), "quantity": payload.quantity, "unit": src.get("unit"),
            "notes": f"تحويل بين المشاريع: {log['from_project_name']} ← {target['name']}",
            "created_by": current_user.get("id"), "created_by_name": log["user_name"], "created_at": now,
        })
    return {"message": f"تم تحويل {payload.quantity} {src.get('unit') or ''} من {src.get('name')} إلى {target['name']}", "log": log}


@router.get("/inventory/log")
async def project_inventory_log(
    project_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """سجل نقل وتحويل المواد بين المشاريع"""
    if not user_is_enterprise_owner(current_user):
        raise HTTPException(status_code=403, detail="غير مصرح")
    db = get_database()
    await require_tenant_enterprise(db, current_user)
    tenant_id = get_user_tenant_id(current_user)
    q = {"tenant_id": tenant_id}
    if project_id and project_id != "all":
        q["$or"] = [{"from_project_id": project_id}, {"target_project_id": project_id},
                    {"items.from_project_id": project_id}]
    if start_date or end_date:
        q["created_at"] = {}
        if start_date:
            q["created_at"]["$gte"] = start_date
        if end_date:
            q["created_at"]["$lte"] = end_date + "T99"
    logs = await db.project_inventory_log.find(q, {"_id": 0}).sort("created_at", -1).to_list(length=1000)
    names = {p["id"]: p["name"] async for p in db.projects.find({"tenant_id": tenant_id}, {"_id": 0, "id": 1, "name": 1})}
    for lg in logs:
        if lg.get("type") == "move":
            for it in lg.get("items", []):
                it["from_project_name"] = names.get(it.get("from_project_id"), "—")
    return logs



@router.post("/stock-alerts/run")
async def run_stock_alerts_now(current_user: dict = Depends(get_current_user)):
    """تشغيل فحص نقص المخزون وإرسال التنبيهات الآن (للمالك)"""
    if not user_is_enterprise_owner(current_user):
        raise HTTPException(status_code=403, detail="غير مصرح")
    from .stock_alerts import run_stock_alerts
    await run_stock_alerts(tenant_id=get_user_tenant_id(current_user))
    return {"message": "تم فحص المخزون وإرسال التنبيهات"}
