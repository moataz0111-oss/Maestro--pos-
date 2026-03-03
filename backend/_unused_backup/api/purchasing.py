"""
API مسارات المشتريات والموردين
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
import uuid

router = APIRouter(prefix="/api", tags=["Purchasing"])

# ==================== MODELS ====================

class SupplierCreate(BaseModel):
    name: str
    phone: str
    email: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None
    contact_person: Optional[str] = None
    payment_terms: str = "cash"  # cash, credit_7, credit_15, credit_30

class SupplierUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None
    contact_person: Optional[str] = None
    payment_terms: Optional[str] = None
    is_active: Optional[bool] = None

class PurchaseOrderCreate(BaseModel):
    supplier_id: str
    items: List[Dict[str, Any]]  # [{material_id, material_name, quantity, unit, unit_price, total}]
    expected_delivery: Optional[str] = None
    notes: Optional[str] = None
    branch_id: Optional[str] = None

class PurchaseOrderStatusUpdate(BaseModel):
    status: str  # pending, approved, ordered, shipped, delivered, cancelled
    notes: Optional[str] = None

class RawMaterialCreate(BaseModel):
    name: str
    name_en: Optional[str] = None
    unit: str  # كجم, لتر, قطعة
    category: Optional[str] = None
    min_stock: float = 0
    current_stock: float = 0
    price: float = 0
    supplier_id: Optional[str] = None
    branch_id: Optional[str] = None

# ==================== DEPENDENCY ====================

# تم استيرادها من server.py
db = None
get_current_user = None
get_user_tenant_id = None
build_tenant_query = None

def init_purchasing_routes(database, auth_dependency, tenant_id_func, tenant_query_func):
    """تهيئة المسارات مع قاعدة البيانات ودوال المصادقة"""
    global db, get_current_user, get_user_tenant_id, build_tenant_query
    db = database
    get_current_user = auth_dependency
    get_user_tenant_id = tenant_id_func
    build_tenant_query = tenant_query_func

# ==================== SUPPLIERS ROUTES ====================

@router.get("/suppliers")
async def get_suppliers(current_user: dict = Depends(lambda: get_current_user)):
    """جلب قائمة الموردين"""
    user = await get_current_user(current_user)
    query = build_tenant_query(user)
    suppliers = await db.suppliers.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return suppliers

@router.post("/suppliers")
async def create_supplier(supplier: SupplierCreate, current_user: dict = Depends(lambda: get_current_user)):
    """إضافة مورد جديد"""
    user = await get_current_user(current_user)
    tenant_id = get_user_tenant_id(user)
    
    supplier_doc = {
        "id": str(uuid.uuid4()),
        **supplier.model_dump(),
        "tenant_id": tenant_id,
        "is_active": True,
        "total_orders": 0,
        "total_amount": 0,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": user["id"]
    }
    
    await db.suppliers.insert_one(supplier_doc)
    del supplier_doc["_id"]
    return supplier_doc

@router.put("/suppliers/{supplier_id}")
async def update_supplier(supplier_id: str, update: SupplierUpdate, current_user: dict = Depends(lambda: get_current_user)):
    """تحديث بيانات مورد"""
    user = await get_current_user(current_user)
    query = build_tenant_query(user, {"id": supplier_id})
    
    supplier = await db.suppliers.find_one(query)
    if not supplier:
        raise HTTPException(status_code=404, detail="المورد غير موجود")
    
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    if update_data:
        await db.suppliers.update_one({"id": supplier_id}, {"$set": update_data})
    
    return await db.suppliers.find_one({"id": supplier_id}, {"_id": 0})

@router.delete("/suppliers/{supplier_id}")
async def delete_supplier(supplier_id: str, current_user: dict = Depends(lambda: get_current_user)):
    """حذف مورد"""
    user = await get_current_user(current_user)
    query = build_tenant_query(user, {"id": supplier_id})
    
    supplier = await db.suppliers.find_one(query)
    if not supplier:
        raise HTTPException(status_code=404, detail="المورد غير موجود")
    
    # تعطيل بدلاً من الحذف
    await db.suppliers.update_one({"id": supplier_id}, {"$set": {"is_active": False}})
    return {"message": "تم تعطيل المورد"}

# ==================== PURCHASE ORDERS ROUTES ====================

@router.get("/purchase-orders")
async def get_purchase_orders(
    status: Optional[str] = None,
    supplier_id: Optional[str] = None,
    branch_id: Optional[str] = None,
    current_user: dict = Depends(lambda: get_current_user)
):
    """جلب أوامر الشراء"""
    user = await get_current_user(current_user)
    query = build_tenant_query(user)
    
    if status:
        query["status"] = status
    if supplier_id:
        query["supplier_id"] = supplier_id
    if branch_id:
        query["branch_id"] = branch_id
    
    orders = await db.purchase_orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    
    # جلب أسماء الموردين
    for order in orders:
        supplier = await db.suppliers.find_one({"id": order.get("supplier_id")}, {"_id": 0, "name": 1})
        order["supplier"] = supplier
    
    return orders

@router.post("/purchase-orders")
async def create_purchase_order(order: PurchaseOrderCreate, current_user: dict = Depends(lambda: get_current_user)):
    """إنشاء أمر شراء جديد"""
    user = await get_current_user(current_user)
    tenant_id = get_user_tenant_id(user)
    
    # التحقق من وجود المورد
    supplier_query = build_tenant_query(user, {"id": order.supplier_id})
    supplier = await db.suppliers.find_one(supplier_query)
    if not supplier:
        raise HTTPException(status_code=404, detail="المورد غير موجود")
    
    # حساب الإجمالي
    total_amount = sum(item.get("total", item.get("quantity", 0) * item.get("unit_price", 0)) for item in order.items)
    
    # إنشاء رقم الأمر
    last_order = await db.purchase_orders.find_one(
        {"tenant_id": tenant_id} if tenant_id else {},
        {"_id": 0, "order_number": 1},
        sort=[("created_at", -1)]
    )
    order_num = 1
    if last_order and last_order.get("order_number"):
        try:
            order_num = int(last_order["order_number"].replace("PO-", "")) + 1
        except:
            order_num = 1
    
    order_doc = {
        "id": str(uuid.uuid4()),
        "order_number": f"PO-{str(order_num).zfill(4)}",
        "supplier_id": order.supplier_id,
        "items": order.items,
        "total_amount": total_amount,
        "status": "pending",
        "expected_delivery": order.expected_delivery,
        "notes": order.notes,
        "branch_id": order.branch_id or user.get("branch_id"),
        "tenant_id": tenant_id,
        "created_by": user["id"],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.purchase_orders.insert_one(order_doc)
    del order_doc["_id"]
    
    order_doc["supplier"] = {"id": supplier["id"], "name": supplier["name"]}
    return order_doc

@router.put("/purchase-orders/{order_id}/status")
async def update_purchase_order_status(order_id: str, update: PurchaseOrderStatusUpdate, current_user: dict = Depends(lambda: get_current_user)):
    """تحديث حالة أمر الشراء"""
    user = await get_current_user(current_user)
    query = build_tenant_query(user, {"id": order_id})
    
    order = await db.purchase_orders.find_one(query)
    if not order:
        raise HTTPException(status_code=404, detail="أمر الشراء غير موجود")
    
    update_data = {"status": update.status}
    
    if update.status == "approved":
        update_data["approved_by"] = user["id"]
        update_data["approved_at"] = datetime.now(timezone.utc).isoformat()
    elif update.status == "delivered":
        update_data["delivered_at"] = datetime.now(timezone.utc).isoformat()
        update_data["received_by"] = user["id"]
        
        # تحديث المخزون - إضافة الكميات المستلمة
        for item in order.get("items", []):
            material_id = item.get("material_id")
            quantity = item.get("quantity", 0)
            if material_id and quantity > 0:
                await db.raw_materials.update_one(
                    {"id": material_id},
                    {"$inc": {"current_stock": quantity}}
                )
        
        # تحديث إحصائيات المورد
        await db.suppliers.update_one(
            {"id": order["supplier_id"]},
            {
                "$inc": {
                    "total_orders": 1,
                    "total_amount": order.get("total_amount", 0)
                }
            }
        )
    
    if update.notes:
        update_data["status_notes"] = update.notes
    
    await db.purchase_orders.update_one({"id": order_id}, {"$set": update_data})
    return await db.purchase_orders.find_one({"id": order_id}, {"_id": 0})

@router.delete("/purchase-orders/{order_id}")
async def delete_purchase_order(order_id: str, current_user: dict = Depends(lambda: get_current_user)):
    """حذف أمر شراء (فقط إذا كان معلقاً)"""
    user = await get_current_user(current_user)
    query = build_tenant_query(user, {"id": order_id})
    
    order = await db.purchase_orders.find_one(query)
    if not order:
        raise HTTPException(status_code=404, detail="أمر الشراء غير موجود")
    
    if order["status"] not in ["pending", "cancelled"]:
        raise HTTPException(status_code=400, detail="لا يمكن حذف أمر شراء تمت معالجته")
    
    await db.purchase_orders.delete_one({"id": order_id})
    return {"message": "تم حذف أمر الشراء"}

# ==================== RAW MATERIALS ROUTES ====================

@router.get("/raw-materials")
async def get_raw_materials(
    branch_id: Optional[str] = None,
    category: Optional[str] = None,
    current_user: dict = Depends(lambda: get_current_user)
):
    """جلب المواد الخام"""
    user = await get_current_user(current_user)
    query = build_tenant_query(user)
    
    if branch_id:
        query["branch_id"] = branch_id
    if category:
        query["category"] = category
    
    materials = await db.raw_materials.find(query, {"_id": 0}).sort("name", 1).to_list(500)
    return materials

@router.post("/raw-materials")
async def create_raw_material(material: RawMaterialCreate, current_user: dict = Depends(lambda: get_current_user)):
    """إضافة مادة خام جديدة"""
    user = await get_current_user(current_user)
    tenant_id = get_user_tenant_id(user)
    
    material_doc = {
        "id": str(uuid.uuid4()),
        **material.model_dump(),
        "tenant_id": tenant_id,
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": user["id"]
    }
    
    await db.raw_materials.insert_one(material_doc)
    del material_doc["_id"]
    return material_doc

@router.put("/raw-materials/{material_id}")
async def update_raw_material(material_id: str, update: dict, current_user: dict = Depends(lambda: get_current_user)):
    """تحديث مادة خام"""
    user = await get_current_user(current_user)
    query = build_tenant_query(user, {"id": material_id})
    
    material = await db.raw_materials.find_one(query)
    if not material:
        raise HTTPException(status_code=404, detail="المادة غير موجودة")
    
    allowed_fields = ["name", "name_en", "unit", "category", "min_stock", "current_stock", "price", "supplier_id", "is_active"]
    update_data = {k: v for k, v in update.items() if k in allowed_fields and v is not None}
    
    if update_data:
        await db.raw_materials.update_one({"id": material_id}, {"$set": update_data})
    
    return await db.raw_materials.find_one({"id": material_id}, {"_id": 0})

@router.get("/inventory/low-stock-alerts")
async def get_low_stock_alerts(current_user: dict = Depends(lambda: get_current_user)):
    """جلب تنبيهات انخفاض المخزون"""
    user = await get_current_user(current_user)
    query = build_tenant_query(user)
    
    # جلب المواد التي مخزونها أقل من الحد الأدنى
    materials = await db.raw_materials.find(query, {"_id": 0}).to_list(500)
    
    alerts = []
    for material in materials:
        current_stock = material.get("current_stock", 0)
        min_stock = material.get("min_stock", 0)
        
        if current_stock < min_stock:
            alerts.append({
                "id": material["id"],
                "material_name": material["name"],
                "current_stock": current_stock,
                "min_stock": min_stock,
                "unit": material.get("unit", ""),
                "shortage": min_stock - current_stock,
                "price": material.get("price", 0)
            })
    
    # ترتيب حسب الأكثر نقصاً
    alerts.sort(key=lambda x: x["shortage"], reverse=True)
    return alerts
