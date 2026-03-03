"""
Branch and Kitchen Section routes
"""
import uuid
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Depends

from core.database import db
from models.schemas import BranchCreate, BranchResponse, UserRole
from utils.auth import get_current_user, get_user_tenant_id, build_tenant_query

router = APIRouter(tags=["Branches"])


# ==================== BRANCH ROUTES ====================

@router.post("/branches", response_model=BranchResponse)
async def create_branch(branch: BranchCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in [UserRole.ADMIN, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    branch_doc = {
        "id": str(uuid.uuid4()),
        **branch.model_dump(),
        "tenant_id": get_user_tenant_id(current_user),
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.branches.insert_one(branch_doc)
    del branch_doc["_id"]
    return branch_doc


@router.get("/branches", response_model=List[BranchResponse])
async def get_branches(current_user: dict = Depends(get_current_user)):
    query = build_tenant_query(current_user)
    branches = await db.branches.find(query, {"_id": 0}).to_list(100)
    return branches


@router.get("/branches/{branch_id}", response_model=BranchResponse)
async def get_branch(branch_id: str, current_user: dict = Depends(get_current_user)):
    query = build_tenant_query(current_user, {"id": branch_id})
    branch = await db.branches.find_one(query, {"_id": 0})
    if not branch:
        raise HTTPException(status_code=404, detail="الفرع غير موجود")
    return branch


@router.put("/branches/{branch_id}")
async def update_branch(branch_id: str, branch: BranchCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in [UserRole.ADMIN, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    query = build_tenant_query(current_user, {"id": branch_id})
    await db.branches.update_one(query, {"$set": branch.model_dump()})
    return await db.branches.find_one({"id": branch_id}, {"_id": 0})


@router.delete("/branches/{branch_id}")
async def delete_branch(branch_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in [UserRole.ADMIN, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    users_count = await db.users.count_documents({"branch_id": branch_id})
    if users_count > 0:
        raise HTTPException(status_code=400, detail="لا يمكن حذف الفرع - يوجد مستخدمين مرتبطين به")
    await db.branches.update_one({"id": branch_id}, {"$set": {"is_active": False}})
    return {"message": "تم تعطيل الفرع"}


# ==================== KITCHEN SECTIONS ROUTES ====================

@router.post("/kitchen-sections")
async def create_kitchen_section(section: dict, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in [UserRole.ADMIN, UserRole.MANAGER]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    section_doc = {
        "id": str(uuid.uuid4()),
        "name": section.get("name"),
        "name_en": section.get("name_en"),
        "color": section.get("color", "#D4AF37"),
        "icon": section.get("icon", "🍳"),
        "printer_id": section.get("printer_id"),
        "branch_id": section.get("branch_id"),
        "sort_order": section.get("sort_order", 0),
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.kitchen_sections.insert_one(section_doc)
    del section_doc["_id"]
    return section_doc


@router.get("/kitchen-sections")
async def get_kitchen_sections(branch_id: Optional[str] = None):
    query = {"branch_id": branch_id} if branch_id else {}
    sections = await db.kitchen_sections.find(query, {"_id": 0}).sort("sort_order", 1).to_list(100)
    return sections


@router.put("/kitchen-sections/{section_id}")
async def update_kitchen_section(section_id: str, section: dict, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in [UserRole.ADMIN, UserRole.MANAGER]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    update_data = {k: v for k, v in section.items() if k != "id"}
    await db.kitchen_sections.update_one({"id": section_id}, {"$set": update_data})
    return await db.kitchen_sections.find_one({"id": section_id}, {"_id": 0})


@router.delete("/kitchen-sections/{section_id}")
async def delete_kitchen_section(section_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in [UserRole.ADMIN, UserRole.MANAGER]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    await db.kitchen_sections.delete_one({"id": section_id})
    return {"message": "تم الحذف"}
