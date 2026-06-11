"""
Suppliers Routes - الموردون
Extracted from server.py for modular maintainability.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
import uuid
import logging

from .shared import get_current_user, get_user_tenant_id, build_tenant_query, get_database

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Suppliers"])

# lazy DB proxy: resolves the motor client at request time (correct event loop),
# avoiding a module-import-time client bind that breaks under production ASGI servers
class _LazyDB:
    def __getattr__(self, name):
        return getattr(get_database(), name)

db = _LazyDB()


class SupplierCreate(BaseModel):
    name: str
    phone: str
    email: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None
    contact_person: Optional[str] = None
    payment_terms: str = "cash"


class SupplierUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None
    contact_person: Optional[str] = None
    payment_terms: Optional[str] = None
    is_active: Optional[bool] = None


@router.get("/suppliers")
async def get_suppliers(current_user: dict = Depends(get_current_user)):
    """جلب قائمة الموردين"""
    query = build_tenant_query(current_user)
    suppliers = await db.suppliers.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return suppliers

@router.post("/suppliers")
async def create_supplier(supplier: SupplierCreate, current_user: dict = Depends(get_current_user)):
    """إضافة مورد جديد"""
    tenant_id = get_user_tenant_id(current_user)
    
    supplier_doc = {
        "id": str(uuid.uuid4()),
        **supplier.model_dump(),
        "tenant_id": tenant_id,
        "is_active": True,
        "total_orders": 0,
        "total_amount": 0,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": current_user["id"]
    }
    
    await db.suppliers.insert_one(supplier_doc)
    del supplier_doc["_id"]
    return supplier_doc

@router.put("/suppliers/{supplier_id}")
async def update_supplier(supplier_id: str, update: SupplierUpdate, current_user: dict = Depends(get_current_user)):
    """تحديث بيانات مورد"""
    query = build_tenant_query(current_user, {"id": supplier_id})
    
    supplier = await db.suppliers.find_one(query)
    if not supplier:
        raise HTTPException(status_code=404, detail="المورد غير موجود")
    
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    if update_data:
        await db.suppliers.update_one({"id": supplier_id}, {"$set": update_data})
    
    return await db.suppliers.find_one({"id": supplier_id}, {"_id": 0})

@router.delete("/suppliers/{supplier_id}")
async def delete_supplier(supplier_id: str, current_user: dict = Depends(get_current_user)):
    """حذف مورد"""
    query = build_tenant_query(current_user, {"id": supplier_id})
    
    supplier = await db.suppliers.find_one(query)
    if not supplier:
        raise HTTPException(status_code=404, detail="المورد غير موجود")
    
    await db.suppliers.update_one({"id": supplier_id}, {"$set": {"is_active": False}})
    return {"message": "تم تعطيل المورد"}
