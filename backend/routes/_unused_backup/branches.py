"""
Branch Routes - نقاط نهاية الفروع
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from datetime import datetime, timezone
import uuid

from core.database import db
from models.schemas import BranchCreate, BranchResponse
from utils.auth import get_current_user, build_tenant_query, get_user_tenant_id
from models.enums import UserRole

router = APIRouter(tags=["Branches"])


@router.post("/branches", response_model=BranchResponse)
async def create_branch(branch: BranchCreate, current_user: dict = Depends(get_current_user)):
    """إنشاء فرع جديد"""
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
    """جلب قائمة الفروع"""
    query = build_tenant_query(current_user)
    branches = await db.branches.find(query, {"_id": 0}).to_list(100)
    return branches


@router.get("/branches/{branch_id}", response_model=BranchResponse)
async def get_branch(branch_id: str, current_user: dict = Depends(get_current_user)):
    """جلب فرع محدد"""
    query = build_tenant_query(current_user, {"id": branch_id})
    branch = await db.branches.find_one(query, {"_id": 0})
    if not branch:
        raise HTTPException(status_code=404, detail="الفرع غير موجود")
    return branch


@router.put("/branches/{branch_id}")
async def update_branch(branch_id: str, branch: BranchCreate, current_user: dict = Depends(get_current_user)):
    """تحديث بيانات فرع"""
    if current_user["role"] not in [UserRole.ADMIN, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    query = build_tenant_query(current_user, {"id": branch_id})
    existing = await db.branches.find_one(query)
    if not existing:
        raise HTTPException(status_code=404, detail="الفرع غير موجود")
    
    await db.branches.update_one({"id": branch_id}, {"$set": branch.model_dump()})
    return await db.branches.find_one({"id": branch_id}, {"_id": 0})


@router.delete("/branches/{branch_id}")
async def delete_branch(branch_id: str, current_user: dict = Depends(get_current_user)):
    """حذف فرع"""
    if current_user["role"] not in [UserRole.ADMIN, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    query = build_tenant_query(current_user, {"id": branch_id})
    existing = await db.branches.find_one(query)
    if not existing:
        raise HTTPException(status_code=404, detail="الفرع غير موجود")
    
    await db.branches.update_one({"id": branch_id}, {"$set": {"is_active": False}})
    return {"message": "تم تعطيل الفرع"}
