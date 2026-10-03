"""
Enterprise Config per Tenant - يُدار من Super Admin
Super Admin يفعّل/يعطّل وضع المؤسسة لكل عميل ويحدد الحدود
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, timezone

from .shared import get_database, get_current_user, verify_super_admin, UserRole

router = APIRouter(prefix="/enterprise-config", tags=["Enterprise Config (Super Admin)"])


class EnterpriseConfig(BaseModel):
    enterprise_enabled: bool = False
    max_projects: int = Field(default=1, ge=1, le=100)
    max_branches_per_project: int = Field(default=5, ge=1, le=100)
    max_users_per_project: int = Field(default=10, ge=1, le=1000)


@router.get("/tenant/{tenant_id}")
async def get_tenant_enterprise_config(
    tenant_id: str,
    current_user: dict = Depends(verify_super_admin)
):
    """Super Admin: جلب إعدادات المؤسسة لعميل"""
    db = get_database()
    tenant = await db.tenants.find_one({"id": tenant_id}, {"_id": 0})
    if not tenant:
        # Auto-create tenant record for default
        tenant = {
            "id": tenant_id,
            "name": tenant_id,
            "enterprise_enabled": False,
            "max_projects": 1,
            "max_branches_per_project": 5,
            "max_users_per_project": 10,
        }
        await db.tenants.insert_one({**tenant, "created_at": datetime.now(timezone.utc).isoformat()})
        tenant.pop("_id", None)
    return {
        "tenant_id": tenant_id,
        "enterprise_enabled": tenant.get("enterprise_enabled", False),
        "max_projects": tenant.get("max_projects", 1),
        "max_branches_per_project": tenant.get("max_branches_per_project", 5),
        "max_users_per_project": tenant.get("max_users_per_project", 10),
    }


@router.put("/tenant/{tenant_id}")
async def update_tenant_enterprise_config(
    tenant_id: str,
    config: EnterpriseConfig,
    current_user: dict = Depends(verify_super_admin)
):
    """Super Admin: تفعيل/تعطيل وضع المؤسسة + تحديد الحدود لعميل"""
    db = get_database()
    tenant = await db.tenants.find_one({"id": tenant_id})
    if not tenant:
        await db.tenants.insert_one({
            "id": tenant_id,
            "name": tenant_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })

    await db.tenants.update_one(
        {"id": tenant_id},
        {"$set": {
            "enterprise_enabled": config.enterprise_enabled,
            "max_projects": config.max_projects,
            "max_branches_per_project": config.max_branches_per_project,
            "max_users_per_project": config.max_users_per_project,
            "enterprise_updated_at": datetime.now(timezone.utc).isoformat(),
            "enterprise_updated_by": current_user.get("id"),
        }}
    )

    if not config.enterprise_enabled:
        # عند تعطيل وضع المؤسسة: soft-hide المشاريع غير الافتراضية
        await db.projects.update_many(
            {"tenant_id": tenant_id, "is_default": {"$ne": True}},
            {"$set": {"is_active": False}}
        )
    else:
        # عند تفعيل وضع المؤسسة: استعادة كل المشاريع السابقة
        await db.projects.update_many(
            {"tenant_id": tenant_id},
            {"$set": {"is_active": True}}
        )

    return {
        "message": f"تم تحديث إعدادات المؤسسة لـ '{tenant_id}'",
        "config": config.dict(),
    }


@router.get("/me")
async def get_my_enterprise_config(current_user: dict = Depends(get_current_user)):
    """أي مستخدم: جلب إعدادات المؤسسة الخاصة بمستأجره"""
    db = get_database()
    tenant_id = current_user.get("tenant_id")
    if not tenant_id or current_user.get("role") == UserRole.SUPER_ADMIN:
        return {
            "tenant_id": tenant_id,
            "enterprise_enabled": True,  # super admin دائماً enterprise
            "max_projects": 999,
            "max_branches_per_project": 999,
            "max_users_per_project": 9999,
        }
    tenant = await db.tenants.find_one({"id": tenant_id}, {"_id": 0})
    if not tenant:
        return {
            "tenant_id": tenant_id,
            "enterprise_enabled": False,
            "max_projects": 1,
            "max_branches_per_project": 5,
            "max_users_per_project": 10,
        }
    return {
        "tenant_id": tenant_id,
        "enterprise_enabled": tenant.get("enterprise_enabled", False),
        "max_projects": tenant.get("max_projects", 1),
        "max_branches_per_project": tenant.get("max_branches_per_project", 5),
        "max_users_per_project": tenant.get("max_users_per_project", 10),
    }


@router.get("/tenants-list")
async def list_all_tenants_with_config(current_user: dict = Depends(verify_super_admin)):
    """Super Admin: قائمة كل العملاء مع إعدادات المؤسسة + عدد المشاريع/الفروع/المستخدمين الحالي"""
    db = get_database()
    tenants = await db.tenants.find({}, {"_id": 0}).to_list(length=None)
    result = []
    for t in tenants:
        tid = t["id"]
        projects_count = await db.projects.count_documents({"tenant_id": tid, "is_active": True})
        branches_count = await db.branches.count_documents({"tenant_id": tid, "is_active": {"$ne": False}})
        users_count = await db.users.count_documents({"tenant_id": tid, "is_active": True})
        result.append({
            "id": tid,
            "name": t.get("name", tid),
            "enterprise_enabled": t.get("enterprise_enabled", False),
            "max_projects": t.get("max_projects", 1),
            "max_branches_per_project": t.get("max_branches_per_project", 5),
            "max_users_per_project": t.get("max_users_per_project", 10),
            "current_projects": projects_count,
            "current_branches": branches_count,
            "current_users": users_count,
            "expires_at": t.get("expires_at"),
            "created_at": t.get("created_at"),
        })
    return result


# ==================== LIMIT ENFORCEMENT HELPERS ====================
async def enforce_project_limit(db, tenant_id: str) -> None:
    """يتحقق من عدم تجاوز حد المشاريع - يستدعى قبل إنشاء مشروع جديد"""
    tenant = await db.tenants.find_one({"id": tenant_id}, {"_id": 0}) or {}
    if not tenant.get("enterprise_enabled", False):
        raise HTTPException(
            status_code=403,
            detail="وضع المؤسسة غير مفعّل لحسابك. تواصل مع المسؤول لتفعيله."
        )
    max_projects = tenant.get("max_projects", 1)
    current = await db.projects.count_documents({"tenant_id": tenant_id, "is_active": True})
    if current >= max_projects:
        raise HTTPException(
            status_code=403,
            detail=f"وصلت للحد الأقصى للمشاريع ({max_projects}). تواصل مع المسؤول لزيادته."
        )


async def enforce_branch_limit(db, tenant_id: str, project_id: Optional[str]) -> None:
    """يتحقق من عدم تجاوز حد الفروع للمشروع - يستدعى قبل إنشاء فرع"""
    tenant = await db.tenants.find_one({"id": tenant_id}, {"_id": 0}) or {}
    if not tenant.get("enterprise_enabled", False):
        return  # لا تُطبَّق الحدود بدون Enterprise Mode
    max_branches = tenant.get("max_branches_per_project", 5)
    q = {"tenant_id": tenant_id, "is_active": {"$ne": False}}
    if project_id:
        q["project_id"] = project_id
    current = await db.branches.count_documents(q)
    if current >= max_branches:
        raise HTTPException(
            status_code=403,
            detail=f"وصلت للحد الأقصى للفروع في هذا المشروع ({max_branches})."
        )


async def enforce_user_limit(db, tenant_id: str, project_id: Optional[str]) -> None:
    """يتحقق من عدم تجاوز حد المستخدمين للمشروع - يستدعى قبل إنشاء مستخدم"""
    tenant = await db.tenants.find_one({"id": tenant_id}, {"_id": 0}) or {}
    if not tenant.get("enterprise_enabled", False):
        return
    max_users = tenant.get("max_users_per_project", 10)
    q = {"tenant_id": tenant_id, "is_active": True}
    if project_id:
        q["project_id"] = project_id
    current = await db.users.count_documents(q)
    if current >= max_users:
        raise HTTPException(
            status_code=403,
            detail=f"وصلت للحد الأقصى للمستخدمين في هذا المشروع ({max_users})."
        )
