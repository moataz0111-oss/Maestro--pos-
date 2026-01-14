"""
Customer routes
"""
import uuid
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Depends

from core.database import db
from models.schemas import CustomerCreate, CustomerResponse, UserRole
from utils.auth import get_current_user, get_user_tenant_id, build_tenant_query

router = APIRouter(prefix="/customers", tags=["Customers"])


@router.post("", response_model=CustomerResponse)
async def create_customer(customer: CustomerCreate, current_user: dict = Depends(get_current_user)):
    tenant_id = get_user_tenant_id(current_user)
    query = {"phone": customer.phone}
    if tenant_id:
        query["tenant_id"] = tenant_id
    existing = await db.customers.find_one(query)
    if existing:
        raise HTTPException(status_code=400, detail="رقم الهاتف موجود مسبقاً")
    
    customer_doc = {
        "id": str(uuid.uuid4()),
        **customer.model_dump(),
        "tenant_id": tenant_id,
        "total_orders": 0,
        "total_spent": 0.0,
        "last_order_date": None,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.customers.insert_one(customer_doc)
    del customer_doc["_id"]
    return customer_doc


@router.get("", response_model=List[CustomerResponse])
async def get_customers(search: Optional[str] = None, phone: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    query = build_tenant_query(current_user)
    if phone:
        query["$or"] = [{"phone": phone}, {"phone2": phone}]
    elif search:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"phone": {"$regex": search}},
            {"phone2": {"$regex": search}},
            {"area": {"$regex": search, "$options": "i"}}
        ]
    customers = await db.customers.find(query, {"_id": 0}).sort("name", 1).to_list(500)
    return customers


@router.get("/{customer_id}", response_model=CustomerResponse)
async def get_customer(customer_id: str, current_user: dict = Depends(get_current_user)):
    query = build_tenant_query(current_user, {"id": customer_id})
    customer = await db.customers.find_one(query, {"_id": 0})
    if not customer:
        raise HTTPException(status_code=404, detail="العميل غير موجود")
    return customer


@router.get("/by-phone/{phone}")
async def get_customer_by_phone(phone: str, current_user: dict = Depends(get_current_user)):
    """البحث عن عميل بالهاتف مع سجل الطلبات"""
    tenant_id = get_user_tenant_id(current_user)
    
    phone_conditions = [{"phone": phone}, {"phone2": phone}]
    
    if tenant_id:
        query = {"$and": [{"tenant_id": tenant_id}, {"$or": phone_conditions}]}
    elif current_user.get("role") == UserRole.SUPER_ADMIN:
        query = {"$or": phone_conditions}
    else:
        query = {"$and": [
            {"$or": [{"tenant_id": {"$exists": False}}, {"tenant_id": None}]},
            {"$or": phone_conditions}
        ]}
    
    customer = await db.customers.find_one(query, {"_id": 0})
    
    if not customer:
        return {"found": False, "customer": None, "orders": []}
    
    orders_query = build_tenant_query(current_user, {"customer_phone": phone})
    orders = await db.orders.find(orders_query, {"_id": 0}).sort("created_at", -1).limit(10).to_list(10)
    
    return {
        "found": True,
        "customer": customer,
        "orders": orders
    }


@router.put("/{customer_id}")
async def update_customer(customer_id: str, customer: CustomerCreate, current_user: dict = Depends(get_current_user)):
    query = build_tenant_query(current_user, {"id": customer_id})
    await db.customers.update_one(query, {"$set": customer.model_dump()})
    return await db.customers.find_one({"id": customer_id}, {"_id": 0})


@router.delete("/{customer_id}")
async def delete_customer(customer_id: str, current_user: dict = Depends(get_current_user)):
    await db.customers.delete_one({"id": customer_id})
    return {"message": "تم الحذف"}
