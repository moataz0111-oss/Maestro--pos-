"""
Enterprise Dashboard + Marketplace + Activity Templates
- Dashboard: يعرض ملخصات كل مشاريع المؤسسة (طلبات، مبيعات، مصاريف)
- Marketplace: نمط "شركة توصيل" - تجار شركاء + عمولات
- Templates: قوالب جاهزة لكل نشاط (تصنيفات، منتجات نموذجية)
"""
from fastapi import APIRouter, Depends, HTTPException, Body
from typing import Optional, List
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel
import uuid
import logging

from .shared import (
    get_database, get_current_user, get_user_tenant_id, UserRole,
    build_tenant_query,
)
from .projects_routes import (
    user_is_enterprise_owner, user_allowed_projects, EnterpriseRole,
)

router = APIRouter(prefix="/enterprise", tags=["Enterprise Dashboard & Marketplace"])
logger = logging.getLogger(__name__)


# ==================== ACTIVITY TEMPLATES ====================
ACTIVITY_TEMPLATES = {
    "restaurant": {
        "categories": [
            {"name": "المقبلات", "icon": "🥗"},
            {"name": "الأطباق الرئيسية", "icon": "🍽️"},
            {"name": "المشروبات", "icon": "🥤"},
            {"name": "الحلويات", "icon": "🍰"},
        ],
    },
    "salon": {
        "categories": [
            {"name": "قص شعر", "icon": "✂️"},
            {"name": "صبغة وتلوين", "icon": "🎨"},
            {"name": "علاجات", "icon": "💆"},
            {"name": "منتجات العناية", "icon": "🧴"},
        ],
    },
    "clinic": {
        "categories": [
            {"name": "استشارات", "icon": "🩺"},
            {"name": "فحوصات", "icon": "🔬"},
            {"name": "أدوية", "icon": "💊"},
            {"name": "إجراءات", "icon": "🏥"},
        ],
    },
    "supermarket": {
        "categories": [
            {"name": "المواد الغذائية", "icon": "🥫"},
            {"name": "الخضار والفواكه", "icon": "🥦"},
            {"name": "منتجات الألبان", "icon": "🥛"},
            {"name": "منظفات ومستلزمات", "icon": "🧴"},
        ],
    },
    "delivery_company": {
        "categories": [
            {"name": "توصيل داخل المدينة", "icon": "🛵"},
            {"name": "توصيل بين المدن", "icon": "🚚"},
            {"name": "استلام وتغليف", "icon": "📦"},
        ],
    },
    "distribution": {
        "categories": [
            {"name": "منتجات جملة", "icon": "📦"},
            {"name": "طلبيات كبيرة", "icon": "🏭"},
        ],
    },
    "manufacturing": {
        "categories": [
            {"name": "مواد خام", "icon": "🧱"},
            {"name": "منتجات نهائية", "icon": "🏭"},
        ],
    },
    "retail": {
        "categories": [
            {"name": "ملابس", "icon": "👕"},
            {"name": "إكسسوارات", "icon": "👜"},
            {"name": "أحذية", "icon": "👟"},
        ],
    },
    "other": {"categories": []},
}


@router.get("/activity-templates/{activity_type}")
async def get_activity_template(activity_type: str, current_user: dict = Depends(get_current_user)):
    """جلب القوالب الجاهزة لنشاط معين"""
    if activity_type not in ACTIVITY_TEMPLATES:
        raise HTTPException(status_code=404, detail="نوع النشاط غير مدعوم")
    return ACTIVITY_TEMPLATES[activity_type]


@router.post("/projects/{project_id}/apply-template")
async def apply_activity_template(project_id: str, current_user: dict = Depends(get_current_user)):
    """
    تطبيق قوالب النشاط: ينشئ تلقائياً تصنيفات نموذجية للمشروع.
    - Owner + Project Admin فقط
    - يعمل مرة واحدة (idempotent - لا يكرر)
    """
    db = get_database()
    tenant_id = get_user_tenant_id(current_user)

    project = await db.projects.find_one({"id": project_id, "tenant_id": tenant_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="المشروع غير موجود")

    is_owner = user_is_enterprise_owner(current_user)
    is_project_admin = (
        current_user.get("role") == EnterpriseRole.PROJECT_ADMIN
        and current_user.get("project_id") == project_id
    )
    if not (is_owner or is_project_admin):
        raise HTTPException(status_code=403, detail="غير مصرح")

    template = ACTIVITY_TEMPLATES.get(project.get("activity_type"), {"categories": []})
    created = []
    for cat in template.get("categories", []):
        exists = await db.categories.find_one({
            "tenant_id": tenant_id,
            "project_id": project_id,
            "name": cat["name"],
        })
        if exists:
            continue
        doc = {
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "project_id": project_id,
            "name": cat["name"],
            "icon": cat.get("icon", "📦"),
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "created_by": current_user.get("id"),
        }
        await db.categories.insert_one(doc)
        doc.pop("_id", None)
        created.append(doc)

    return {"message": f"تم إنشاء {len(created)} تصنيف", "created": created}


# ==================== ENTERPRISE DASHBOARD ====================
@router.get("/dashboard")
async def enterprise_dashboard(
    period_days: int = 30,
    current_user: dict = Depends(get_current_user)
):
    """
    Dashboard المؤسسة: ملخصات كل المشاريع للمالك (طلبات، مبيعات، مصاريف).
    - Owner فقط
    """
    if not user_is_enterprise_owner(current_user):
        raise HTTPException(status_code=403, detail="لوحة المؤسسة للمالك فقط")

    db = get_database()
    tenant_id = get_user_tenant_id(current_user) or "default"

    start = datetime.now(timezone.utc) - timedelta(days=period_days)
    start_iso = start.isoformat()

    projects_cursor = db.projects.find({"tenant_id": tenant_id, "is_active": True}, {"_id": 0}).sort("created_at", 1)
    projects = await projects_cursor.to_list(length=None)

    result = []
    total_revenue = 0.0
    total_orders = 0
    total_expenses = 0.0

    for p in projects:
        pid = p["id"]

        # مبيعات وطلبات
        orders_query = {
            "tenant_id": tenant_id,
            "created_at": {"$gte": start_iso},
            "$or": [
                {"project_id": pid},
                {"project_id": {"$exists": False}} if p.get("is_default") else {"project_id": pid},
            ],
            "status": {"$nin": ["cancelled", "refunded"]},
        }
        # في الوثائق القديمة بدون project_id تُنسب للـ default
        if not p.get("is_default"):
            orders_query.pop("$or", None)
            orders_query["project_id"] = pid

        orders_count = await db.orders.count_documents(orders_query)

        # مبيعات
        pipeline = [
            {"$match": orders_query},
            {"$group": {"_id": None, "total": {"$sum": "$total"}}},
        ]
        agg = await db.orders.aggregate(pipeline).to_list(1)
        revenue = float(agg[0]["total"]) if agg else 0.0

        # مصاريف
        expenses_query = dict(orders_query)
        expenses_query.pop("status", None)
        expenses_count = await db.expenses.count_documents(expenses_query)
        exp_pipeline = [
            {"$match": expenses_query},
            {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
        ]
        exp_agg = await db.expenses.aggregate(exp_pipeline).to_list(1)
        expenses = float(exp_agg[0]["total"]) if exp_agg else 0.0

        # عدد الفروع والموظفين
        branches_query = {"tenant_id": tenant_id}
        if not p.get("is_default"):
            branches_query["project_id"] = pid
        else:
            branches_query["$or"] = [
                {"project_id": pid},
                {"project_id": {"$exists": False}},
            ]
        branches_count = await db.branches.count_documents(branches_query)
        employees_count = await db.employees.count_documents(branches_query)

        net = revenue - expenses
        total_revenue += revenue
        total_orders += orders_count
        total_expenses += expenses

        result.append({
            "id": pid,
            "name": p["name"],
            "activity_type": p["activity_type"],
            "logo_url": p.get("logo_url"),
            "currency": p.get("currency", "IQD"),
            "is_default": p.get("is_default", False),
            "revenue": round(revenue, 2),
            "expenses": round(expenses, 2),
            "net_profit": round(net, 2),
            "orders_count": orders_count,
            "expenses_count": expenses_count,
            "branches_count": branches_count,
            "employees_count": employees_count,
            "admin_user_id": p.get("admin_user_id"),
        })

    return {
        "period_days": period_days,
        "projects": result,
        "totals": {
            "projects_count": len(result),
            "revenue": round(total_revenue, 2),
            "expenses": round(total_expenses, 2),
            "net_profit": round(total_revenue - total_expenses, 2),
            "orders": total_orders,
        },
    }


# ==================== MARKETPLACE (Toters-Style) ====================
class PartnerMerchantCreate(BaseModel):
    name: str
    phone: str
    address: Optional[str] = None
    category: Optional[str] = None
    commission_rate: float = 15.0
    contact_person: Optional[str] = None


@router.get("/marketplace/partners")
async def list_marketplace_partners(
    project_id: str,
    current_user: dict = Depends(get_current_user)
):
    """قائمة التجار الشركاء لمشروع شركة توصيل"""
    db = get_database()
    tenant_id = get_user_tenant_id(current_user)

    project = await db.projects.find_one({"id": project_id, "tenant_id": tenant_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="المشروع غير موجود")
    if project.get("activity_type") != "delivery_company":
        raise HTTPException(status_code=400, detail="Marketplace متاح فقط لمشاريع نوع 'شركة توصيل'")

    allowed = user_allowed_projects(current_user)
    if allowed is not None and project_id not in allowed:
        raise HTTPException(status_code=403, detail="غير مصرح")

    partners = await db.marketplace_partners.find(
        {"tenant_id": tenant_id, "project_id": project_id},
        {"_id": 0}
    ).to_list(length=None)
    return partners


@router.post("/marketplace/partners")
async def create_marketplace_partner(
    project_id: str,
    partner: PartnerMerchantCreate,
    current_user: dict = Depends(get_current_user)
):
    """إضافة تاجر شريك"""
    db = get_database()
    tenant_id = get_user_tenant_id(current_user) or "default"

    project = await db.projects.find_one({"id": project_id, "tenant_id": tenant_id}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="المشروع غير موجود")
    if project.get("activity_type") != "delivery_company":
        raise HTTPException(status_code=400, detail="Marketplace متاح فقط لمشاريع نوع 'شركة توصيل'")

    allowed = user_allowed_projects(current_user)
    if allowed is not None and project_id not in allowed:
        raise HTTPException(status_code=403, detail="غير مصرح")

    doc = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "project_id": project_id,
        "name": partner.name,
        "phone": partner.phone,
        "address": partner.address,
        "category": partner.category,
        "commission_rate": partner.commission_rate,
        "contact_person": partner.contact_person,
        "is_active": True,
        "total_orders": 0,
        "total_commission": 0.0,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": current_user.get("id"),
    }
    await db.marketplace_partners.insert_one(doc)
    doc.pop("_id", None)
    return {"message": "تم إضافة التاجر الشريك", "partner": doc}


@router.get("/marketplace/summary")
async def marketplace_summary(
    project_id: str,
    period_days: int = 30,
    current_user: dict = Depends(get_current_user)
):
    """ملخص Marketplace: عدد تجار، عمولات، طلبات"""
    db = get_database()
    tenant_id = get_user_tenant_id(current_user)

    allowed = user_allowed_projects(current_user)
    if allowed is not None and project_id not in allowed:
        raise HTTPException(status_code=403, detail="غير مصرح")

    partners_count = await db.marketplace_partners.count_documents({
        "tenant_id": tenant_id, "project_id": project_id, "is_active": True,
    })
    active_partners = await db.marketplace_partners.find(
        {"tenant_id": tenant_id, "project_id": project_id},
        {"_id": 0, "name": 1, "total_orders": 1, "total_commission": 1}
    ).sort("total_commission", -1).limit(10).to_list(length=10)

    return {
        "partners_count": partners_count,
        "top_partners": active_partners,
        "period_days": period_days,
    }


# ==================== PROJECT ISOLATION HELPER ====================
async def scoped_query_for_user(user: dict, base: Optional[dict] = None) -> dict:
    """
    يبني query يحدد نطاق المستخدم:
    - tenant_id
    - project_id (إذا مقيد)
    استخدمه في كل endpoint يقرأ بيانات مشتركة (orders, expenses, employees, ...)
    """
    query = dict(base or {})
    tenant_id = get_user_tenant_id(user)
    if tenant_id and user.get("role") != UserRole.SUPER_ADMIN:
        query["tenant_id"] = tenant_id

    allowed = user_allowed_projects(user)
    if allowed is not None and allowed:
        query["project_id"] = {"$in": allowed}
    return query
