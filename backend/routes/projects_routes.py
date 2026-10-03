"""
Projects Routes - إدارة المشاريع (Enterprise Mode)
كل مشروع = كيان مستقل تماماً (خزينة، موارد بشرية، مخزون، مستخدمون، تقارير).
"""
from fastapi import APIRouter, Depends, HTTPException, Body
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

# ==================== MODELS ====================
class ProjectCreate(BaseModel):
    name: str
    name_en: Optional[str] = None
    activity_type: str = "restaurant"
    logo_url: Optional[str] = None
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
    currency: Optional[str] = None
    timezone: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None
    exchange_rate: Optional[float] = None

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

    projects = await db.projects.find(query, {"_id": 0}).sort("created_at", 1).to_list(length=None)
    return projects


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

    # التحقق من حد المشاريع + تفعيل وضع المؤسسة
    from .enterprise_config_routes import enforce_project_limit
    await enforce_project_limit(db, tenant_id)

    project_doc = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "name": project.name,
        "name_en": project.name_en,
        "activity_type": project.activity_type,
        "logo_url": project.logo_url,
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

    # تطبيق قوالب النشاط تلقائياً (تصنيفات نموذجية)
    try:
        from .enterprise_routes import ACTIVITY_TEMPLATES
        template = ACTIVITY_TEMPLATES.get(project.activity_type, {"categories": []})
        for cat in template.get("categories", []):
            await db.categories.insert_one({
                "id": str(uuid.uuid4()),
                "tenant_id": tenant_id,
                "project_id": project_doc["id"],
                "name": cat["name"],
                "icon": cat.get("icon", "📦"),
                "is_active": True,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "created_by": current_user.get("id"),
            })
    except Exception as e:
        logger.warning(f"Auto-template seed failed: {e}")

    return {"message": "تم إنشاء المشروع بنجاح", "project": project_doc}


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
        current_user.get("role") == EnterpriseRole.PROJECT_ADMIN
        and current_user.get("project_id") == project_id
    )
    if not (is_owner or is_project_admin):
        raise HTTPException(status_code=403, detail="غير مصرح لك بتعديل هذا المشروع")

    payload = {k: v for k, v in updates.dict().items() if v is not None}
    # لا يسمح بتغيير سعر الصرف مباشرة عبر PUT - لأنه يحتاج تسجيل سجل تاريخي
    payload.pop("exchange_rate", None)
    if payload:
        payload["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.projects.update_one({"id": project_id}, {"$set": payload})

    updated = await db.projects.find_one({"id": project_id}, {"_id": 0})
    return {"message": "تم تحديث المشروع بنجاح", "project": updated}


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

    # soft delete
    await db.projects.update_one(
        {"id": project_id},
        {"$set": {"is_active": False, "deleted_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"message": "تم تعطيل المشروع"}


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
    return {"message": "تم تعيين مدير المشروع بنجاح", "admin": user_doc}


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
        settings = await db.settings.find_one({"tenant_id": tid, "type": "system_info"})
        if settings and settings.get("value", {}).get("name"):
            tenant_name = settings["value"]["name"]

        await db.projects.insert_one({
            "id": pid,
            "tenant_id": tid,
            "name": tenant_name,
            "name_en": None,
            "activity_type": "restaurant",
            "logo_url": None,
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


@router.post("/_migration/run", include_in_schema=False)
async def trigger_migration(current_user: dict = Depends(get_current_user)):
    """تشغيل migration Enterprise Mode يدوياً - Super Admin فقط"""
    if current_user.get("role") not in [UserRole.SUPER_ADMIN, UserRole.ADMIN]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    db = get_database()
    return await run_enterprise_backfill_migration(db)
