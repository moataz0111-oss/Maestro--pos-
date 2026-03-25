"""
نظام المخزون والمشتريات المتكامل
التدفق: المورد ← المشتريات ← المخزن (مواد خام) ← التصنيع ← الفروع ← الزبون
"""

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
import uuid
import os
import aiofiles
from pathlib import Path

router = APIRouter(prefix="/api", tags=["Inventory System"])

# ==================== MODELS ====================

# --- الموردين ---
class SupplierCreate(BaseModel):
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    company_name: Optional[str] = None
    notes: Optional[str] = None

class SupplierResponse(BaseModel):
    id: str
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    company_name: Optional[str] = None
    notes: Optional[str] = None
    total_purchases: float = 0.0
    is_active: bool = True
    created_at: str

# --- المشتريات ---
class PurchaseItemCreate(BaseModel):
    raw_material_id: Optional[str] = None  # إذا كان موجود في النظام
    name: str  # اسم المادة
    quantity: float
    unit: str
    cost_per_unit: float
    total_cost: float = 0.0

class PurchaseCreate(BaseModel):
    supplier_id: str
    invoice_number: Optional[str] = None
    items: List[PurchaseItemCreate]
    total_amount: float
    payment_method: str = "cash"  # cash, credit, transfer
    payment_status: str = "paid"  # paid, pending, partial
    notes: Optional[str] = None

class PurchaseResponse(BaseModel):
    id: str
    purchase_number: int
    supplier_id: str
    supplier_name: Optional[str] = None
    invoice_number: Optional[str] = None
    invoice_image_url: Optional[str] = None
    items: List[Dict[str, Any]]
    total_amount: float
    payment_method: str
    payment_status: str
    status: str  # pending, sent_to_warehouse, received
    notes: Optional[str] = None
    created_by: str
    created_at: str
    sent_to_warehouse_at: Optional[str] = None
    sent_to_warehouse_by: Optional[str] = None

# --- طلبات الشراء من المخزن ---
class PurchaseRequestCreate(BaseModel):
    items: List[Dict[str, Any]]  # [{name, quantity, unit, notes}]
    priority: str = "normal"  # urgent, high, normal, low
    notes: Optional[str] = None

class PurchaseRequestResponse(BaseModel):
    id: str
    request_number: int
    items: List[Dict[str, Any]]
    priority: str
    status: str  # pending, approved, purchased, cancelled
    notes: Optional[str] = None
    created_by: str
    created_at: str
    approved_by: Optional[str] = None
    approved_at: Optional[str] = None

# --- المخزن (المواد الخام) ---
class RawMaterialCreate(BaseModel):
    name: str
    name_en: Optional[str] = None
    unit: str
    quantity: float = 0.0
    min_quantity: float = 0.0
    cost_per_unit: float = 0.0
    waste_percentage: float = 0.0  # نسبة الهدر %
    category: Optional[str] = None

class RawMaterialResponse(BaseModel):
    id: str
    name: str
    name_en: Optional[str] = None
    unit: str
    quantity: float
    min_quantity: float
    cost_per_unit: float
    waste_percentage: float = 0.0  # نسبة الهدر %
    effective_cost_per_unit: float = 0.0  # التكلفة الفعلية بعد الهدر
    total_value: float = 0.0
    category: Optional[str] = None
    last_updated: str
    created_at: str

# --- تحويلات المخزن للتصنيع ---
class WarehouseToManufacturingCreate(BaseModel):
    items: List[Dict[str, Any]]  # [{raw_material_id, quantity}]
    notes: Optional[str] = None

class WarehouseTransferResponse(BaseModel):
    id: str
    transfer_number: int
    transfer_type: str  # warehouse_to_manufacturing, manufacturing_to_branch
    items: List[Dict[str, Any]]
    total_cost: float = 0.0
    status: str  # pending, approved, received
    notes: Optional[str] = None
    created_by: str
    created_at: str
    received_by: Optional[str] = None
    received_at: Optional[str] = None

# --- التصنيع (المنتجات النهائية) ---
class RecipeIngredient(BaseModel):
    raw_material_id: str
    raw_material_name: str
    quantity: float
    unit: str
    cost_per_unit: float = 0.0

class ManufacturedProductCreate(BaseModel):
    name: str
    name_en: Optional[str] = None
    unit: str = "قطعة"
    piece_weight: Optional[float] = None  # وزن القطعة (اختياري)
    piece_weight_unit: Optional[str] = "غرام"  # وحدة وزن القطعة
    recipe: List[RecipeIngredient]  # الوصفة
    quantity: float = 0.0  # الكمية المصنعة المتوفرة
    min_quantity: float = 0.0
    selling_price: float = 0.0
    category: Optional[str] = None

class ManufacturedProductResponse(BaseModel):
    id: str
    name: str
    name_en: Optional[str] = None
    unit: str
    piece_weight: Optional[float] = None  # وزن القطعة
    piece_weight_unit: Optional[str] = "غرام"
    recipe: List[Dict[str, Any]]
    quantity: float  # الكمية المتوفرة
    min_quantity: float
    raw_material_cost: float = 0.0  # تكلفة المواد الخام
    selling_price: float = 0.0
    profit_margin: float = 0.0
    category: Optional[str] = None
    last_updated: str
    created_at: str

# --- طلبات الفروع من التصنيع ---
class BranchOrderCreate(BaseModel):
    to_branch_id: str
    items: List[Dict[str, Any]]  # [{product_id, quantity}]
    priority: str = "normal"
    notes: Optional[str] = None

class BranchOrderResponse(BaseModel):
    id: str
    order_number: int
    to_branch_id: str
    to_branch_name: Optional[str] = None
    items: List[Dict[str, Any]]
    total_cost: float = 0.0
    status: str  # pending, approved, shipped, delivered, cancelled
    priority: str
    notes: Optional[str] = None
    created_by: str
    created_at: str
    approved_at: Optional[str] = None
    shipped_at: Optional[str] = None
    delivered_at: Optional[str] = None

# --- مخزون الفروع ---
class BranchInventoryResponse(BaseModel):
    id: str
    branch_id: str
    branch_name: Optional[str] = None
    product_id: str
    product_name: str
    quantity: float
    cost_per_unit: float = 0.0
    total_value: float = 0.0
    last_updated: str

# --- إعدادات المخزون ---
class InventorySettingsUpdate(BaseModel):
    inventory_mode: str  # centralized, per_branch
    auto_deduct_on_sale: bool = True
    low_stock_notifications: bool = True

# ==================== HELPER FUNCTIONS ====================

def get_db():
    """Get database instance from main app"""
    from server import db
    return db

async def get_current_user_from_token(token: str):
    """Get current user from token"""
    from server import get_current_user
    return await get_current_user(token)

# ==================== SUPPLIERS ROUTES ====================

@router.post("/suppliers", response_model=SupplierResponse)
async def create_supplier(supplier: SupplierCreate):
    """إضافة مورد جديد"""
    db = get_db()
    
    supplier_doc = {
        "id": str(uuid.uuid4()),
        **supplier.model_dump(),
        "total_purchases": 0.0,
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.suppliers.insert_one(supplier_doc)
    del supplier_doc["_id"]
    return supplier_doc

@router.get("/suppliers", response_model=List[SupplierResponse])
async def get_suppliers():
    """جلب جميع الموردين"""
    db = get_db()
    suppliers = await db.suppliers.find({"is_active": True}, {"_id": 0}).to_list(1000)
    return suppliers

@router.get("/suppliers/{supplier_id}", response_model=SupplierResponse)
async def get_supplier(supplier_id: str):
    """جلب مورد محدد"""
    db = get_db()
    supplier = await db.suppliers.find_one({"id": supplier_id}, {"_id": 0})
    if not supplier:
        raise HTTPException(status_code=404, detail="المورد غير موجود")
    return supplier

@router.put("/suppliers/{supplier_id}")
async def update_supplier(supplier_id: str, supplier: SupplierCreate):
    """تحديث بيانات المورد"""
    db = get_db()
    await db.suppliers.update_one(
        {"id": supplier_id},
        {"$set": supplier.model_dump()}
    )
    return await db.suppliers.find_one({"id": supplier_id}, {"_id": 0})

@router.delete("/suppliers/{supplier_id}")
async def delete_supplier(supplier_id: str):
    """حذف (تعطيل) المورد"""
    db = get_db()
    await db.suppliers.update_one(
        {"id": supplier_id},
        {"$set": {"is_active": False}}
    )
    return {"message": "تم حذف المورد"}

# ==================== PURCHASES ROUTES (المشتريات) ====================

@router.post("/purchases-new")
async def create_purchase(purchase: PurchaseCreate):
    """إنشاء فاتورة شراء جديدة"""
    db = get_db()
    
    # الحصول على رقم الفاتورة التسلسلي
    last_purchase = await db.purchases_new.find_one(
        sort=[("purchase_number", -1)]
    )
    purchase_number = (last_purchase.get("purchase_number", 0) if last_purchase else 0) + 1
    
    # جلب بيانات المورد
    supplier = await db.suppliers.find_one({"id": purchase.supplier_id}, {"_id": 0})
    
    # حساب إجمالي كل صنف
    items_with_totals = []
    for item in purchase.items:
        item_dict = item.model_dump()
        item_dict["total_cost"] = item.quantity * item.cost_per_unit
        items_with_totals.append(item_dict)
    
    purchase_doc = {
        "id": str(uuid.uuid4()),
        "purchase_number": purchase_number,
        "supplier_id": purchase.supplier_id,
        "supplier_name": supplier.get("name") if supplier else None,
        "invoice_number": purchase.invoice_number,
        "invoice_image_url": None,  # سيتم تحديثه عند رفع الصورة
        "items": items_with_totals,
        "total_amount": purchase.total_amount,
        "payment_method": purchase.payment_method,
        "payment_status": purchase.payment_status,
        "status": "pending",  # في انتظار الإرسال للمخزن
        "notes": purchase.notes,
        "created_by": "system",  # سيتم تحديثه من التوكن
        "created_at": datetime.now(timezone.utc).isoformat(),
        "sent_to_warehouse_at": None,
        "sent_to_warehouse_by": None
    }
    
    await db.purchases_new.insert_one(purchase_doc)
    
    # تحديث إجمالي مشتريات المورد
    if supplier:
        await db.suppliers.update_one(
            {"id": purchase.supplier_id},
            {"$inc": {"total_purchases": purchase.total_amount}}
        )
    
    del purchase_doc["_id"]
    return purchase_doc

@router.post("/purchases-new/{purchase_id}/upload-invoice")
async def upload_invoice_image(
    purchase_id: str,
    file: UploadFile = File(...)
):
    """رفع صورة الفاتورة"""
    db = get_db()
    
    purchase = await db.purchases_new.find_one({"id": purchase_id})
    if not purchase:
        raise HTTPException(status_code=404, detail="الفاتورة غير موجودة")
    
    # إنشاء مجلد الفواتير
    INVOICES_DIR = Path("/app/backend/uploads/invoices")
    INVOICES_DIR.mkdir(parents=True, exist_ok=True)
    
    # حفظ الصورة
    file_ext = file.filename.split(".")[-1] if "." in file.filename else "jpg"
    filename = f"invoice_{purchase_id}_{datetime.now().strftime('%Y%m%d%H%M%S')}.{file_ext}"
    file_path = INVOICES_DIR / filename
    
    async with aiofiles.open(file_path, 'wb') as out_file:
        content = await file.read()
        await out_file.write(content)
    
    # تحديث رابط الصورة في الفاتورة
    image_url = f"/uploads/invoices/{filename}"
    await db.purchases_new.update_one(
        {"id": purchase_id},
        {"$set": {"invoice_image_url": image_url}}
    )
    
    return {"message": "تم رفع الصورة بنجاح", "image_url": image_url}

@router.post("/purchases-new/{purchase_id}/send-to-warehouse")
async def send_purchase_to_warehouse(purchase_id: str):
    """إرسال المشتريات للمخزن"""
    db = get_db()
    
    purchase = await db.purchases_new.find_one({"id": purchase_id})
    if not purchase:
        raise HTTPException(status_code=404, detail="الفاتورة غير موجودة")
    
    if purchase.get("status") != "pending":
        raise HTTPException(status_code=400, detail="تم إرسال هذه الفاتورة مسبقاً")
    
    # التحقق من وجود صورة الفاتورة
    if not purchase.get("invoice_image_url"):
        raise HTTPException(status_code=400, detail="يجب رفع صورة الفاتورة أولاً")
    
    # إضافة المواد للمخزن
    for item in purchase.get("items", []):
        # البحث عن المادة الخام
        raw_material = await db.raw_materials.find_one({
            "name": item.get("name")
        })
        
        if raw_material:
            # تحديث الكمية والتكلفة
            new_quantity = raw_material.get("quantity", 0) + item.get("quantity", 0)
            # حساب متوسط التكلفة المرجح
            old_value = raw_material.get("quantity", 0) * raw_material.get("cost_per_unit", 0)
            new_value = item.get("quantity", 0) * item.get("cost_per_unit", 0)
            avg_cost = (old_value + new_value) / new_quantity if new_quantity > 0 else item.get("cost_per_unit", 0)
            
            await db.raw_materials.update_one(
                {"id": raw_material["id"]},
                {
                    "$set": {
                        "quantity": new_quantity,
                        "cost_per_unit": avg_cost,
                        "last_updated": datetime.now(timezone.utc).isoformat()
                    }
                }
            )
        else:
            # إنشاء مادة خام جديدة
            new_material = {
                "id": str(uuid.uuid4()),
                "name": item.get("name"),
                "name_en": None,
                "unit": item.get("unit", "كغم"),
                "quantity": item.get("quantity", 0),
                "min_quantity": 0,
                "cost_per_unit": item.get("cost_per_unit", 0),
                "category": None,
                "last_updated": datetime.now(timezone.utc).isoformat(),
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            await db.raw_materials.insert_one(new_material)
    
    # تحديث حالة الفاتورة
    await db.purchases_new.update_one(
        {"id": purchase_id},
        {
            "$set": {
                "status": "sent_to_warehouse",
                "sent_to_warehouse_at": datetime.now(timezone.utc).isoformat(),
                "sent_to_warehouse_by": "system"
            }
        }
    )
    
    # إنشاء سجل وارد للمخزن
    incoming_record = {
        "id": str(uuid.uuid4()),
        "type": "incoming",
        "source": "purchases",
        "source_id": purchase_id,
        "supplier_id": purchase.get("supplier_id"),
        "supplier_name": purchase.get("supplier_name"),
        "items": purchase.get("items"),
        "total_amount": purchase.get("total_amount"),
        "invoice_image_url": purchase.get("invoice_image_url"),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.warehouse_transactions.insert_one(incoming_record)
    
    return {"message": "تم إرسال المشتريات للمخزن بنجاح"}

@router.get("/purchases-new", response_model=List[PurchaseResponse])
async def get_purchases(status: Optional[str] = None):
    """جلب جميع المشتريات"""
    db = get_db()
    
    query = {}
    if status:
        query["status"] = status
    
    purchases = await db.purchases_new.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return purchases

@router.get("/purchases-new/{purchase_id}")
async def get_purchase(purchase_id: str):
    """جلب فاتورة شراء محددة"""
    db = get_db()
    purchase = await db.purchases_new.find_one({"id": purchase_id}, {"_id": 0})
    if not purchase:
        raise HTTPException(status_code=404, detail="الفاتورة غير موجودة")
    return purchase

# ==================== PURCHASE REQUESTS (طلبات الشراء من المخزن) ====================

@router.post("/warehouse-purchase-requests")
async def create_warehouse_purchase_request(request: PurchaseRequestCreate):
    """إنشاء طلب شراء من المخزن"""
    db = get_db()
    
    # رقم تسلسلي
    last_request = await db.warehouse_purchase_requests.find_one(sort=[("request_number", -1)])
    request_number = (last_request.get("request_number", 0) if last_request else 0) + 1
    
    request_doc = {
        "id": str(uuid.uuid4()),
        "request_number": request_number,
        "items": request.items,
        "priority": request.priority,
        "status": "pending",
        "notes": request.notes,
        "created_by": "warehouse",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "approved_by": None,
        "approved_at": None
    }
    
    await db.warehouse_purchase_requests.insert_one(request_doc)
    del request_doc["_id"]
    return request_doc

@router.get("/warehouse-purchase-requests")
async def get_warehouse_purchase_requests(status: Optional[str] = None):
    """جلب طلبات الشراء"""
    db = get_db()
    
    query = {}
    if status:
        query["status"] = status
    
    requests = await db.warehouse_purchase_requests.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return requests

@router.patch("/warehouse-purchase-requests/{request_id}/status")
async def update_warehouse_purchase_request_status(request_id: str, status: str):
    """تحديث حالة طلب الشراء"""
    db = get_db()
    
    update_data = {"status": status}
    if status == "approved":
        update_data["approved_at"] = datetime.now(timezone.utc).isoformat()
        update_data["approved_by"] = "system"
    
    await db.warehouse_purchase_requests.update_one(
        {"id": request_id},
        {"$set": update_data}
    )
    
    return {"message": "تم تحديث الحالة"}

# ==================== RAW MATERIALS (المواد الخام - المخزن) ====================

@router.post("/raw-materials-new")
async def create_raw_material(material: RawMaterialCreate):
    """إضافة مادة خام جديدة"""
    db = get_db()
    
    # حساب التكلفة الفعلية بعد الهدر
    waste_percentage = material.waste_percentage or 0
    effective_cost = material.cost_per_unit
    if waste_percentage > 0 and waste_percentage < 100:
        effective_cost = material.cost_per_unit / (1 - waste_percentage / 100)
    
    material_doc = {
        "id": str(uuid.uuid4()),
        **material.model_dump(),
        "effective_cost_per_unit": round(effective_cost, 2),
        "total_value": material.quantity * material.cost_per_unit,
        "last_updated": datetime.now(timezone.utc).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.raw_materials.insert_one(material_doc)
    del material_doc["_id"]
    return material_doc

@router.get("/raw-materials-new")
async def get_raw_materials():
    """جلب جميع المواد الخام"""
    db = get_db()
    materials = await db.raw_materials.find({}, {"_id": 0}).to_list(1000)
    
    # حساب القيمة الإجمالية والتكلفة الفعلية والإحصائيات لكل مادة
    for material in materials:
        material["total_value"] = material.get("quantity", 0) * material.get("cost_per_unit", 0)
        # حساب التكلفة الفعلية بعد الهدر إذا لم تكن موجودة
        waste_percentage = material.get("waste_percentage", 0)
        if waste_percentage > 0 and waste_percentage < 100 and not material.get("effective_cost_per_unit"):
            material["effective_cost_per_unit"] = round(material.get("cost_per_unit", 0) / (1 - waste_percentage / 100), 2)
        elif not material.get("effective_cost_per_unit"):
            material["effective_cost_per_unit"] = material.get("cost_per_unit", 0)
        
        # إحصائيات المخزون
        material["total_received"] = material.get("total_received", material.get("quantity", 0))
        material["transferred_to_manufacturing"] = material.get("transferred_to_manufacturing", 0)
        material["remaining_quantity"] = material.get("quantity", 0)
    
    return materials

@router.get("/raw-materials-new/{material_id}")
async def get_raw_material(material_id: str):
    """جلب مادة خام محددة"""
    db = get_db()
    material = await db.raw_materials.find_one({"id": material_id}, {"_id": 0})
    if not material:
        raise HTTPException(status_code=404, detail="المادة غير موجودة")
    material["total_value"] = material.get("quantity", 0) * material.get("cost_per_unit", 0)
    return material

@router.put("/raw-materials-new/{material_id}")
async def update_raw_material(material_id: str, material: RawMaterialCreate):
    """تحديث مادة خام"""
    db = get_db()
    
    # حساب التكلفة الفعلية بعد الهدر
    waste_percentage = material.waste_percentage or 0
    effective_cost = material.cost_per_unit
    if waste_percentage > 0 and waste_percentage < 100:
        effective_cost = material.cost_per_unit / (1 - waste_percentage / 100)
    
    update_data = material.model_dump()
    update_data["effective_cost_per_unit"] = round(effective_cost, 2)
    update_data["total_value"] = material.quantity * material.cost_per_unit
    update_data["last_updated"] = datetime.now(timezone.utc).isoformat()
    
    await db.raw_materials.update_one(
        {"id": material_id},
        {"$set": update_data}
    )
    
    return await db.raw_materials.find_one({"id": material_id}, {"_id": 0})


@router.post("/raw-materials-new/{material_id}/add-stock")
async def add_raw_material_stock(material_id: str, quantity: float = 1):
    """زيادة كمية المادة الخام مباشرة (للتعديل اليدوي)"""
    db = get_db()
    
    material = await db.raw_materials.find_one({"id": material_id})
    if not material:
        raise HTTPException(status_code=404, detail="المادة غير موجودة")
    
    if quantity <= 0:
        raise HTTPException(status_code=400, detail="الكمية يجب أن تكون أكبر من صفر")
    
    # زيادة الكمية وإجمالي الوارد
    await db.raw_materials.update_one(
        {"id": material_id},
        {
            "$inc": {
                "quantity": quantity,
                "total_received": quantity  # إجمالي الوارد
            },
            "$set": {"last_updated": datetime.now(timezone.utc).isoformat()}
        }
    )
    
    # تسجيل الحركة
    await db.inventory_movements.insert_one({
        "id": str(uuid.uuid4()),
        "type": "raw_material_stock_add",
        "material_id": material_id,
        "material_name": material.get("name"),
        "quantity": quantity,
        "notes": "إضافة يدوية للمخزون",
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    return {
        "message": f"تم إضافة {quantity} {material.get('unit')} إلى {material.get('name')}",
        "new_quantity": material.get("quantity", 0) + quantity
    }


# ==================== WAREHOUSE TO MANUFACTURING (تحويل من المخزن للتصنيع) ====================

@router.post("/warehouse-to-manufacturing")
async def transfer_to_manufacturing(transfer: WarehouseToManufacturingCreate):
    """تحويل مواد خام من المخزن لقسم التصنيع"""
    db = get_db()
    
    # رقم تسلسلي
    last_transfer = await db.warehouse_transfers.find_one(sort=[("transfer_number", -1)])
    transfer_number = (last_transfer.get("transfer_number", 0) if last_transfer else 0) + 1
    
    # التحقق من توفر المواد الخام
    items_with_details = []
    total_cost = 0
    insufficient = []
    
    for item in transfer.items:
        material = await db.raw_materials.find_one({"id": item.get("raw_material_id")}, {"_id": 0})
        if not material:
            raise HTTPException(status_code=404, detail=f"المادة الخام غير موجودة: {item.get('raw_material_id')}")
        
        requested_qty = item.get("quantity", 0)
        available_qty = material.get("quantity", 0)
        
        if available_qty < requested_qty:
            insufficient.append({
                "name": material.get("name"),
                "requested": requested_qty,
                "available": available_qty,
                "unit": material.get("unit")
            })
        else:
            item_cost = requested_qty * material.get("cost_per_unit", 0)
            items_with_details.append({
                "raw_material_id": material["id"],
                "raw_material_name": material.get("name"),
                "quantity": requested_qty,
                "unit": material.get("unit"),
                "cost_per_unit": material.get("cost_per_unit", 0),
                "total_cost": item_cost
            })
            total_cost += item_cost
    
    if insufficient:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "مواد خام غير كافية",
                "insufficient_materials": insufficient
            }
        )
    
    # إنشاء سجل التحويل
    transfer_doc = {
        "id": str(uuid.uuid4()),
        "transfer_number": transfer_number,
        "transfer_type": "warehouse_to_manufacturing",
        "items": items_with_details,
        "total_cost": total_cost,
        "status": "pending",
        "notes": transfer.notes,
        "created_by": "system",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "received_by": None,
        "received_at": None
    }
    
    await db.warehouse_transfers.insert_one(transfer_doc)
    
    # خصم المواد من المخزن وتحديث الإحصائيات
    for item in items_with_details:
        await db.raw_materials.update_one(
            {"id": item["raw_material_id"]},
            {
                "$inc": {
                    "quantity": -item["quantity"],
                    "transferred_to_manufacturing": item["quantity"]  # تتبع المحول للتصنيع
                },
                "$set": {"last_updated": datetime.now(timezone.utc).isoformat()}
            }
        )
    
    # إضافة للتصنيع (وارد)
    for item in items_with_details:
        existing = await db.manufacturing_inventory.find_one({"raw_material_id": item["raw_material_id"]})
        if existing:
            await db.manufacturing_inventory.update_one(
                {"raw_material_id": item["raw_material_id"]},
                {
                    "$inc": {"quantity": item["quantity"]},
                    "$set": {"last_updated": datetime.now(timezone.utc).isoformat()}
                }
            )
        else:
            await db.manufacturing_inventory.insert_one({
                "id": str(uuid.uuid4()),
                "raw_material_id": item["raw_material_id"],
                "raw_material_name": item["raw_material_name"],
                "quantity": item["quantity"],
                "unit": item["unit"],
                "cost_per_unit": item["cost_per_unit"],
                "last_updated": datetime.now(timezone.utc).isoformat(),
                "created_at": datetime.now(timezone.utc).isoformat()
            })
    
    del transfer_doc["_id"]
    return transfer_doc

@router.get("/warehouse-transfers")
async def get_warehouse_transfers(transfer_type: Optional[str] = None):
    """جلب تحويلات المخزن"""
    db = get_db()
    
    query = {}
    if transfer_type:
        query["transfer_type"] = transfer_type
    
    transfers = await db.warehouse_transfers.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return transfers

@router.post("/warehouse-transfers")
async def create_warehouse_transfer(transfer_data: dict):
    """إنشاء تحويل من التصنيع للفرع"""
    db = get_db()
    
    transfer_type = transfer_data.get("transfer_type")
    to_branch_id = transfer_data.get("to_branch_id")
    items = transfer_data.get("items", [])
    notes = transfer_data.get("notes", "")
    
    if transfer_type != "manufacturing_to_branch":
        raise HTTPException(status_code=400, detail="نوع التحويل غير مدعوم")
    
    if not to_branch_id:
        raise HTTPException(status_code=400, detail="يجب تحديد الفرع المستلم")
    
    if not items:
        raise HTTPException(status_code=400, detail="يجب إضافة منتجات للتحويل")
    
    # جلب معلومات الفرع
    branch = await db.branches.find_one({"id": to_branch_id}, {"_id": 0})
    if not branch:
        raise HTTPException(status_code=404, detail="الفرع غير موجود")
    
    # رقم تسلسلي
    last_transfer = await db.warehouse_transfers.find_one(sort=[("transfer_number", -1)])
    transfer_number = (last_transfer.get("transfer_number", 0) if last_transfer else 0) + 1
    
    # التحقق من توفر المنتجات المصنعة
    items_with_details = []
    insufficient = []
    
    for item in items:
        product_id = item.get("product_id")
        requested_qty = item.get("quantity", 0)
        
        # البحث في المنتجات المصنعة
        product = await db.manufactured_products.find_one({"id": product_id}, {"_id": 0})
        if not product:
            raise HTTPException(status_code=404, detail=f"المنتج غير موجود: {product_id}")
        
        available_qty = product.get("quantity", 0)
        
        if available_qty < requested_qty:
            insufficient.append({
                "name": product.get("name"),
                "requested": requested_qty,
                "available": available_qty,
                "unit": product.get("unit", "قطعة")
            })
        else:
            items_with_details.append({
                "product_id": product["id"],
                "product_name": product.get("name"),
                "quantity": requested_qty,
                "unit": product.get("unit", "قطعة"),
                "cost": product.get("raw_material_cost", 0) * requested_qty
            })
    
    if insufficient:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "كمية غير كافية",
                "insufficient_products": insufficient
            }
        )
    
    # إنشاء سجل التحويل
    transfer_doc = {
        "id": str(uuid.uuid4()),
        "transfer_number": transfer_number,
        "transfer_type": "manufacturing_to_branch",
        "to_branch_id": to_branch_id,
        "to_branch_name": branch.get("name"),
        "items": items_with_details,
        "total_cost": sum(item.get("cost", 0) for item in items_with_details),
        "status": "completed",
        "notes": notes,
        "created_by": "system",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.warehouse_transfers.insert_one(transfer_doc)
    
    # خصم الكمية من المنتجات المصنعة وزيادة المحول
    for item in items_with_details:
        await db.manufactured_products.update_one(
            {"id": item["product_id"]},
            {
                "$inc": {
                    "quantity": -item["quantity"],
                    "transferred_quantity": item["quantity"]  # الكمية المحولة للفروع
                },
                "$set": {"last_updated": datetime.now(timezone.utc).isoformat()}
            }
        )
    
    # إضافة الكمية لمخزون الفرع
    for item in items_with_details:
        # البحث عن المنتج في مخزون الفرع
        existing = await db.branch_inventory.find_one({
            "branch_id": to_branch_id,
            "product_id": item["product_id"]
        })
        
        if existing:
            await db.branch_inventory.update_one(
                {"branch_id": to_branch_id, "product_id": item["product_id"]},
                {
                    "$inc": {
                        "quantity": item["quantity"],
                        "received_quantity": item["quantity"]
                    },
                    "$set": {"last_updated": datetime.now(timezone.utc).isoformat()}
                }
            )
        else:
            await db.branch_inventory.insert_one({
                "id": str(uuid.uuid4()),
                "branch_id": to_branch_id,
                "product_id": item["product_id"],
                "product_name": item["product_name"],
                "quantity": item["quantity"],
                "received_quantity": item["quantity"],  # الكمية الواردة
                "sold_quantity": 0,  # الكمية المباعة
                "unit": item["unit"],
                "last_updated": datetime.now(timezone.utc).isoformat(),
                "created_at": datetime.now(timezone.utc).isoformat()
            })
    
    # تسجيل الحركة
    await db.inventory_movements.insert_one({
        "id": str(uuid.uuid4()),
        "type": "transfer_to_branch",
        "transfer_id": transfer_doc["id"],
        "from_location": "manufacturing",
        "to_location": to_branch_id,
        "to_location_name": branch.get("name"),
        "items": items_with_details,
        "notes": notes,
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    del transfer_doc["_id"]
    return transfer_doc

# ==================== BRANCH REQUESTS (طلبات الفروع من التصنيع) ====================

@router.post("/branch-requests")
async def create_branch_request(request_data: dict):
    """إنشاء طلب فرع من التصنيع"""
    db = get_db()
    
    to_branch_id = request_data.get("to_branch_id")
    items = request_data.get("items", [])
    priority = request_data.get("priority", "normal")
    notes = request_data.get("notes", "")
    requested_by = request_data.get("requested_by", "")
    requested_by_name = request_data.get("requested_by_name", "")
    
    if not to_branch_id:
        raise HTTPException(status_code=400, detail="يجب تحديد الفرع")
    
    if not items:
        raise HTTPException(status_code=400, detail="يجب إضافة منتجات للطلب")
    
    # جلب معلومات الفرع
    branch = await db.branches.find_one({"id": to_branch_id}, {"_id": 0})
    if not branch:
        raise HTTPException(status_code=404, detail="الفرع غير موجود")
    
    # رقم تسلسلي
    last_request = await db.branch_requests.find_one(sort=[("request_number", -1)])
    request_number = (last_request.get("request_number", 0) if last_request else 0) + 1
    
    # تفاصيل المنتجات
    items_with_details = []
    total_cost = 0
    
    for item in items:
        product_id = item.get("product_id")
        quantity = item.get("quantity", 0)
        
        # جلب المنتج المصنع
        product = await db.manufactured_products.find_one({"id": product_id}, {"_id": 0})
        if product:
            cost = product.get("raw_material_cost", 0) * quantity
            total_cost += cost
            items_with_details.append({
                "product_id": product_id,
                "product_name": product.get("name"),
                "quantity": quantity,
                "unit": product.get("unit", "قطعة"),
                "cost_per_unit": product.get("raw_material_cost", 0),
                "total_cost": cost,
                "available_quantity": product.get("quantity", 0)
            })
    
    # إنشاء سجل الطلب
    request_doc = {
        "id": str(uuid.uuid4()),
        "request_number": request_number,
        "to_branch_id": to_branch_id,
        "to_branch_name": branch.get("name"),
        "items": items_with_details,
        "total_cost": total_cost,
        "status": "pending",  # pending, approved, processing, shipped, delivered, cancelled
        "priority": priority,
        "notes": notes,
        "requested_by": requested_by,
        "requested_by_name": requested_by_name,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "approved_at": None,
        "shipped_at": None,
        "delivered_at": None
    }
    
    await db.branch_requests.insert_one(request_doc)
    del request_doc["_id"]
    return request_doc

@router.get("/branch-requests")
async def get_branch_requests(status: Optional[str] = None, branch_id: Optional[str] = None):
    """جلب طلبات الفروع"""
    db = get_db()
    
    query = {}
    if status:
        query["status"] = status
    if branch_id:
        query["to_branch_id"] = branch_id
    
    requests = await db.branch_requests.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return requests

@router.put("/branch-requests/{request_id}/status")
async def update_branch_request_status(request_id: str, status_data: dict):
    """تحديث حالة طلب الفرع"""
    db = get_db()
    
    new_status = status_data.get("status")
    valid_statuses = ["pending", "approved", "processing", "shipped", "delivered", "cancelled"]
    
    if new_status not in valid_statuses:
        raise HTTPException(status_code=400, detail="حالة غير صالحة")
    
    update_data = {"status": new_status}
    
    if new_status == "approved":
        update_data["approved_at"] = datetime.now(timezone.utc).isoformat()
    elif new_status == "shipped":
        update_data["shipped_at"] = datetime.now(timezone.utc).isoformat()
    elif new_status == "delivered":
        update_data["delivered_at"] = datetime.now(timezone.utc).isoformat()
    
    result = await db.branch_requests.update_one(
        {"id": request_id},
        {"$set": update_data}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="الطلب غير موجود")
    
    return {"message": "تم تحديث الحالة", "status": new_status}

@router.post("/branch-requests/{request_id}/fulfill")
async def fulfill_branch_request(request_id: str):
    """تنفيذ طلب الفرع (تحويل المنتجات)"""
    db = get_db()
    
    # جلب الطلب
    request = await db.branch_requests.find_one({"id": request_id}, {"_id": 0})
    if not request:
        raise HTTPException(status_code=404, detail="الطلب غير موجود")
    
    if request.get("status") not in ["pending", "approved", "processing"]:
        raise HTTPException(status_code=400, detail="لا يمكن تنفيذ هذا الطلب")
    
    # التحقق من توفر الكميات
    insufficient = []
    for item in request.get("items", []):
        product = await db.manufactured_products.find_one({"id": item.get("product_id")}, {"_id": 0})
        if not product or product.get("quantity", 0) < item.get("quantity", 0):
            insufficient.append({
                "name": item.get("product_name"),
                "requested": item.get("quantity"),
                "available": product.get("quantity", 0) if product else 0
            })
    
    if insufficient:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "كمية غير كافية في مخزون التصنيع",
                "insufficient_products": insufficient
            }
        )
    
    # تنفيذ التحويل
    to_branch_id = request.get("to_branch_id")
    branch = await db.branches.find_one({"id": to_branch_id}, {"_id": 0})
    
    for item in request.get("items", []):
        product_id = item.get("product_id")
        quantity = item.get("quantity")
        
        # خصم من المنتجات المصنعة وزيادة المحول
        await db.manufactured_products.update_one(
            {"id": product_id},
            {
                "$inc": {
                    "quantity": -quantity,
                    "transferred_quantity": quantity  # الكمية المحولة للفروع
                },
                "$set": {"last_updated": datetime.now(timezone.utc).isoformat()}
            }
        )
        
        # إضافة لمخزون الفرع
        existing = await db.branch_inventory.find_one({
            "branch_id": to_branch_id,
            "product_id": product_id
        })
        
        if existing:
            await db.branch_inventory.update_one(
                {"id": existing["id"]},
                {
                    "$inc": {
                        "quantity": quantity,
                        "received_quantity": quantity
                    },
                    "$set": {"last_updated": datetime.now(timezone.utc).isoformat()}
                }
            )
        else:
            await db.branch_inventory.insert_one({
                "id": str(uuid.uuid4()),
                "branch_id": to_branch_id,
                "product_id": product_id,
                "product_name": item.get("product_name"),
                "quantity": quantity,
                "received_quantity": quantity,
                "sold_quantity": 0,
                "unit": item.get("unit", "قطعة"),
                "cost_per_unit": item.get("cost_per_unit", 0),
                "last_updated": datetime.now(timezone.utc).isoformat(),
                "created_at": datetime.now(timezone.utc).isoformat()
            })
    
    # تحديث حالة الطلب
    await db.branch_requests.update_one(
        {"id": request_id},
        {"$set": {
            "status": "delivered",
            "shipped_at": datetime.now(timezone.utc).isoformat(),
            "delivered_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # تسجيل الحركة
    await db.inventory_movements.insert_one({
        "id": str(uuid.uuid4()),
        "type": "branch_request_fulfilled",
        "request_id": request_id,
        "from_location": "manufacturing",
        "to_location": to_branch_id,
        "to_location_name": branch.get("name") if branch else "",
        "items": request.get("items", []),
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    return {"message": "تم تنفيذ الطلب بنجاح", "request_id": request_id}

# ==================== MANUFACTURING REQUESTS (طلبات التصنيع من المخزن) ====================

@router.post("/manufacturing-requests")
async def create_manufacturing_request(request_data: dict):
    """إنشاء طلب من التصنيع للمخزن (لطلب مواد خام)"""
    db = get_db()
    
    items = request_data.get("items", [])
    priority = request_data.get("priority", "normal")
    notes = request_data.get("notes", "")
    requested_by = request_data.get("requested_by", "")
    requested_by_name = request_data.get("requested_by_name", "")
    
    if not items:
        raise HTTPException(status_code=400, detail="يجب إضافة مواد خام للطلب")
    
    # رقم تسلسلي
    last_request = await db.manufacturing_requests.find_one(sort=[("request_number", -1)])
    request_number = (last_request.get("request_number", 0) if last_request else 0) + 1
    
    # تفاصيل المواد
    items_with_details = []
    total_cost = 0
    
    for item in items:
        material_id = item.get("material_id")
        quantity = item.get("quantity", 0)
        
        # جلب المادة الخام
        material = await db.raw_materials.find_one({"id": material_id}, {"_id": 0})
        if material:
            cost = material.get("cost_per_unit", 0) * quantity
            total_cost += cost
            items_with_details.append({
                "material_id": material_id,
                "material_name": material.get("name"),
                "quantity": quantity,
                "unit": material.get("unit", "كغم"),
                "cost_per_unit": material.get("cost_per_unit", 0),
                "total_cost": cost,
                "available_quantity": material.get("quantity", 0)
            })
    
    # إنشاء سجل الطلب
    request_doc = {
        "id": str(uuid.uuid4()),
        "request_number": request_number,
        "request_type": "manufacturing_to_warehouse",
        "items": items_with_details,
        "total_cost": total_cost,
        "status": "pending",
        "priority": priority,
        "notes": notes,
        "requested_by": requested_by,
        "requested_by_name": requested_by_name,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "fulfilled_at": None
    }
    
    await db.manufacturing_requests.insert_one(request_doc)
    del request_doc["_id"]
    return request_doc

@router.get("/manufacturing-requests")
async def get_manufacturing_requests(status: Optional[str] = None):
    """جلب طلبات التصنيع من المخزن"""
    db = get_db()
    
    query = {}
    if status:
        query["status"] = status
    
    requests = await db.manufacturing_requests.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return requests

@router.post("/manufacturing-requests/{request_id}/fulfill")
async def fulfill_manufacturing_request(request_id: str):
    """تنفيذ طلب التصنيع (تحويل المواد من المخزن للتصنيع)"""
    db = get_db()
    
    # جلب الطلب
    request = await db.manufacturing_requests.find_one({"id": request_id}, {"_id": 0})
    if not request:
        raise HTTPException(status_code=404, detail="الطلب غير موجود")
    
    if request.get("status") != "pending":
        raise HTTPException(status_code=400, detail="لا يمكن تنفيذ هذا الطلب")
    
    # التحقق من توفر الكميات
    insufficient = []
    for item in request.get("items", []):
        material = await db.raw_materials.find_one({"id": item.get("material_id")}, {"_id": 0})
        if not material or material.get("quantity", 0) < item.get("quantity", 0):
            insufficient.append({
                "name": item.get("material_name"),
                "requested": item.get("quantity"),
                "available": material.get("quantity", 0) if material else 0
            })
    
    if insufficient:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "كمية غير كافية في المخزن",
                "insufficient_materials": insufficient
            }
        )
    
    # تنفيذ التحويل - خصم من المخزن وإضافة لمخزون التصنيع
    for item in request.get("items", []):
        material_id = item.get("material_id")
        quantity = item.get("quantity")
        
        # خصم من المواد الخام
        await db.raw_materials.update_one(
            {"id": material_id},
            {
                "$inc": {"quantity": -quantity},
                "$set": {"last_updated": datetime.now(timezone.utc).isoformat()}
            }
        )
        
        # إضافة لمخزون التصنيع
        existing = await db.manufacturing_inventory.find_one({"material_id": material_id})
        if existing:
            await db.manufacturing_inventory.update_one(
                {"material_id": material_id},
                {
                    "$inc": {"quantity": quantity},
                    "$set": {"last_updated": datetime.now(timezone.utc).isoformat()}
                }
            )
        else:
            material = await db.raw_materials.find_one({"id": material_id}, {"_id": 0})
            await db.manufacturing_inventory.insert_one({
                "id": str(uuid.uuid4()),
                "material_id": material_id,
                "material_name": item.get("material_name"),
                "quantity": quantity,
                "unit": item.get("unit"),
                "cost_per_unit": item.get("cost_per_unit", 0),
                "last_updated": datetime.now(timezone.utc).isoformat(),
                "created_at": datetime.now(timezone.utc).isoformat()
            })
    
    # تحديث حالة الطلب
    await db.manufacturing_requests.update_one(
        {"id": request_id},
        {"$set": {
            "status": "fulfilled",
            "fulfilled_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    # تسجيل الحركة
    await db.inventory_movements.insert_one({
        "id": str(uuid.uuid4()),
        "type": "warehouse_to_manufacturing",
        "request_id": request_id,
        "from_location": "warehouse",
        "to_location": "manufacturing",
        "items": request.get("items", []),
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    return {"message": "تم تنفيذ الطلب وتحويل المواد للتصنيع", "request_id": request_id}


@router.patch("/manufacturing-requests/{request_id}/status")
async def update_manufacturing_request_status(request_id: str, status: str):
    """تحديث حالة طلب التصنيع (رفض أو إلغاء)"""
    db = get_db()
    
    valid_statuses = ["pending", "fulfilled", "rejected", "cancelled"]
    if status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"حالة غير صالحة. الحالات المتاحة: {', '.join(valid_statuses)}")
    
    request = await db.manufacturing_requests.find_one({"id": request_id})
    if not request:
        raise HTTPException(status_code=404, detail="الطلب غير موجود")
    
    await db.manufacturing_requests.update_one(
        {"id": request_id},
        {"$set": {
            "status": status,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    
    return {"message": "تم تحديث حالة الطلب", "status": status}


# ==================== PURCHASE REQUESTS (طلبات الشراء) ====================

@router.post("/purchase-requests")
async def create_purchase_request(request_data: dict):
    """إنشاء طلب شراء من المخزن"""
    db = get_db()
    
    items = request_data.get("items", [])
    supplier = request_data.get("supplier", "")
    priority = request_data.get("priority", "normal")
    notes = request_data.get("notes", "")
    requested_by = request_data.get("requested_by", "")
    requested_by_name = request_data.get("requested_by_name", "")
    
    if not items:
        raise HTTPException(status_code=400, detail="يجب إضافة مواد للطلب")
    
    # رقم تسلسلي
    last_request = await db.purchase_requests.find_one(sort=[("request_number", -1)])
    request_number = (last_request.get("request_number", 0) if last_request else 0) + 1
    
    # تفاصيل المواد
    items_with_details = []
    total_cost = 0
    
    for item in items:
        cost = item.get("estimated_cost", 0) * item.get("quantity", 0)
        total_cost += cost
        items_with_details.append({
            "material_name": item.get("material_name"),
            "quantity": item.get("quantity", 0),
            "unit": item.get("unit", "كغم"),
            "estimated_cost": item.get("estimated_cost", 0),
            "total_cost": cost
        })
    
    # إنشاء سجل الطلب
    request_doc = {
        "id": str(uuid.uuid4()),
        "request_number": request_number,
        "request_type": "purchase",
        "items": items_with_details,
        "total_cost": total_cost,
        "supplier": supplier,
        "status": "pending",  # pending, approved, ordered, received, cancelled
        "priority": priority,
        "notes": notes,
        "requested_by": requested_by,
        "requested_by_name": requested_by_name,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "approved_at": None,
        "ordered_at": None,
        "received_at": None
    }
    
    await db.purchase_requests.insert_one(request_doc)
    del request_doc["_id"]
    return request_doc

@router.get("/purchase-requests")
async def get_purchase_requests(status: Optional[str] = None):
    """جلب طلبات الشراء"""
    db = get_db()
    
    query = {}
    if status:
        query["status"] = status
    
    requests = await db.purchase_requests.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return requests

@router.put("/purchase-requests/{request_id}/status")
async def update_purchase_request_status(request_id: str, status_data: dict):
    """تحديث حالة طلب الشراء"""
    db = get_db()
    
    new_status = status_data.get("status")
    valid_statuses = ["pending", "approved", "ordered", "received", "cancelled"]
    
    if new_status not in valid_statuses:
        raise HTTPException(status_code=400, detail="حالة غير صالحة")
    
    update_data = {"status": new_status}
    
    if new_status == "approved":
        update_data["approved_at"] = datetime.now(timezone.utc).isoformat()
    elif new_status == "ordered":
        update_data["ordered_at"] = datetime.now(timezone.utc).isoformat()
    elif new_status == "received":
        update_data["received_at"] = datetime.now(timezone.utc).isoformat()
    
    result = await db.purchase_requests.update_one(
        {"id": request_id},
        {"$set": update_data}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="الطلب غير موجود")
    
    return {"message": "تم تحديث الحالة", "status": new_status}


@router.post("/purchase-requests/{request_id}/receive")
async def receive_purchase_request(request_id: str, received_items: Optional[List[dict]] = None):
    """استلام طلب الشراء وإضافة المواد للمخزن"""
    db = get_db()
    
    request = await db.purchase_requests.find_one({"id": request_id})
    if not request:
        raise HTTPException(status_code=404, detail="الطلب غير موجود")
    
    if request.get("status") not in ["approved", "ordered"]:
        raise HTTPException(status_code=400, detail="يجب أن يكون الطلب معتمداً أو مطلوباً قبل الاستلام")
    
    # استخدام الكميات المستلمة أو الكميات المطلوبة
    items_to_receive = received_items or request.get("items", [])
    
    # إضافة المواد للمخزن
    for item in items_to_receive:
        material_name = item.get("material_name")
        quantity = item.get("received_quantity", item.get("quantity", 0))
        
        # البحث عن المادة في المخزن
        existing_material = await db.raw_materials.find_one({"name": material_name})
        
        if existing_material:
            # زيادة الكمية
            await db.raw_materials.update_one(
                {"id": existing_material["id"]},
                {
                    "$inc": {
                        "quantity": quantity,
                        "total_received": quantity
                    },
                    "$set": {"last_updated": datetime.now(timezone.utc).isoformat()}
                }
            )
        else:
            # إنشاء مادة جديدة
            await db.raw_materials.insert_one({
                "id": str(uuid.uuid4()),
                "name": material_name,
                "unit": item.get("unit", "كغم"),
                "quantity": quantity,
                "total_received": quantity,
                "transferred_to_manufacturing": 0,
                "min_quantity": 10,
                "cost_per_unit": item.get("estimated_cost", 0),
                "waste_percentage": 0,
                "effective_cost_per_unit": item.get("estimated_cost", 0),
                "created_at": datetime.now(timezone.utc).isoformat()
            })
    
    # تحديث حالة الطلب
    await db.purchase_requests.update_one(
        {"id": request_id},
        {"$set": {
            "status": "received",
            "received_at": datetime.now(timezone.utc).isoformat(),
            "received_items": items_to_receive
        }}
    )
    
    # تسجيل الحركة
    await db.inventory_movements.insert_one({
        "id": str(uuid.uuid4()),
        "type": "purchase_received",
        "request_id": request_id,
        "items": items_to_receive,
        "notes": f"استلام طلب شراء #{request.get('request_number')}",
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    return {"message": "تم استلام المشتريات وإضافتها للمخزن", "request_id": request_id}


@router.get("/warehouse-transactions")
async def get_warehouse_transactions(type: Optional[str] = None):
    """جلب حركات المخزن (واردات/صادرات)"""
    db = get_db()
    
    query = {}
    if type:
        query["type"] = type
    
    transactions = await db.warehouse_transactions.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return transactions

# ==================== MANUFACTURING INVENTORY (مخزون التصنيع) ====================

@router.get("/manufacturing-inventory")
async def get_manufacturing_inventory():
    """جلب مخزون قسم التصنيع (المواد الخام المستلمة)"""
    db = get_db()
    inventory = await db.manufacturing_inventory.find({}, {"_id": 0}).to_list(1000)
    return inventory

# ==================== MANUFACTURED PRODUCTS (المنتجات المصنعة) ====================

@router.post("/manufactured-products")
async def create_manufactured_product(product: ManufacturedProductCreate):
    """إنشاء منتج مصنع جديد (وصفة)"""
    db = get_db()
    
    # حساب تكلفة المواد الخام
    raw_material_cost = 0
    recipe_items = []
    
    for ingredient in product.recipe:
        raw_material_cost += ingredient.quantity * ingredient.cost_per_unit
        recipe_items.append(ingredient.model_dump())
    
    product_doc = {
        "id": str(uuid.uuid4()),
        "name": product.name,
        "name_en": product.name_en,
        "unit": product.unit,
        "recipe": recipe_items,
        "quantity": product.quantity,
        "min_quantity": product.min_quantity,
        "raw_material_cost": raw_material_cost,
        "selling_price": product.selling_price,
        "profit_margin": product.selling_price - raw_material_cost if product.selling_price > 0 else 0,
        "category": product.category,
        "last_updated": datetime.now(timezone.utc).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.manufactured_products.insert_one(product_doc)
    del product_doc["_id"]
    return product_doc

@router.get("/manufactured-products")
async def get_manufactured_products():
    """جلب جميع المنتجات المصنعة"""
    db = get_db()
    products = await db.manufactured_products.find({}, {"_id": 0}).to_list(1000)
    
    # إضافة الحقول الإحصائية
    for product in products:
        product["total_produced"] = product.get("total_produced", product.get("quantity", 0))
        product["transferred_quantity"] = product.get("transferred_quantity", 0)
        product["remaining_quantity"] = product.get("quantity", 0)
    
    return products

@router.get("/manufactured-products/{product_id}")
async def get_manufactured_product(product_id: str):
    """جلب منتج مصنع محدد"""
    db = get_db()
    product = await db.manufactured_products.find_one({"id": product_id}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="المنتج غير موجود")
    return product

@router.post("/manufactured-products/{product_id}/produce")
async def produce_product(product_id: str, quantity: int = 1):
    """تصنيع كمية من المنتج (خصم المواد الخام من مخزون التصنيع)"""
    db = get_db()
    
    product = await db.manufactured_products.find_one({"id": product_id})
    if not product:
        raise HTTPException(status_code=404, detail="المنتج غير موجود")
    
    # التحقق من توفر المواد الخام في مخزون التصنيع
    insufficient = []
    for ingredient in product.get("recipe", []):
        needed = ingredient.get("quantity", 0) * quantity
        
        manufacturing_item = await db.manufacturing_inventory.find_one({
            "raw_material_id": ingredient.get("raw_material_id")
        })
        
        available = manufacturing_item.get("quantity", 0) if manufacturing_item else 0
        
        if available < needed:
            insufficient.append({
                "name": ingredient.get("raw_material_name"),
                "needed": needed,
                "available": available,
                "unit": ingredient.get("unit")
            })
    
    if insufficient:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "مواد خام غير كافية في قسم التصنيع",
                "insufficient_materials": insufficient
            }
        )
    
    # خصم المواد الخام من مخزون التصنيع
    for ingredient in product.get("recipe", []):
        needed = ingredient.get("quantity", 0) * quantity
        await db.manufacturing_inventory.update_one(
            {"raw_material_id": ingredient.get("raw_material_id")},
            {
                "$inc": {"quantity": -needed},
                "$set": {"last_updated": datetime.now(timezone.utc).isoformat()}
            }
        )
    
    # زيادة كمية المنتج المصنع وإجمالي الإنتاج
    await db.manufactured_products.update_one(
        {"id": product_id},
        {
            "$inc": {
                "quantity": quantity,
                "total_produced": quantity  # إجمالي ما تم تصنيعه
            },
            "$set": {"last_updated": datetime.now(timezone.utc).isoformat()}
        }
    )
    
    return {
        "message": f"تم تصنيع {quantity} {product.get('unit')} من {product.get('name')}",
        "new_quantity": product.get("quantity", 0) + quantity
    }


@router.post("/manufactured-products/{product_id}/add-stock")
async def add_product_stock(product_id: str, quantity: float = 1):
    """زيادة كمية المنتج مباشرة (بدون خصم مواد خام) - للتعديل اليدوي"""
    db = get_db()
    
    product = await db.manufactured_products.find_one({"id": product_id})
    if not product:
        raise HTTPException(status_code=404, detail="المنتج غير موجود")
    
    if quantity <= 0:
        raise HTTPException(status_code=400, detail="الكمية يجب أن تكون أكبر من صفر")
    
    # زيادة الكمية فقط
    await db.manufactured_products.update_one(
        {"id": product_id},
        {
            "$inc": {
                "quantity": quantity,
                "total_produced": quantity
            },
            "$set": {"last_updated": datetime.now(timezone.utc).isoformat()}
        }
    )
    
    # تسجيل الحركة
    await db.inventory_movements.insert_one({
        "id": str(uuid.uuid4()),
        "type": "manual_stock_add",
        "product_id": product_id,
        "product_name": product.get("name"),
        "quantity": quantity,
        "notes": "إضافة يدوية للمخزون",
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    return {
        "message": f"تم إضافة {quantity} {product.get('unit')} إلى {product.get('name')}",
        "new_quantity": product.get("quantity", 0) + quantity
    }

# ==================== BRANCH ORDERS (طلبات الفروع من التصنيع) ====================

@router.post("/branch-orders-new")
async def create_branch_order(order: BranchOrderCreate):
    """إنشاء طلب فرع من قسم التصنيع"""
    db = get_db()
    
    # رقم تسلسلي
    last_order = await db.branch_orders_new.find_one(sort=[("order_number", -1)])
    order_number = (last_order.get("order_number", 0) if last_order else 0) + 1
    
    # جلب بيانات الفرع
    branch = await db.branches.find_one({"id": order.to_branch_id}, {"_id": 0})
    if not branch:
        raise HTTPException(status_code=404, detail="الفرع غير موجود")
    
    # التحقق من توفر المنتجات المصنعة
    items_with_details = []
    total_cost = 0
    insufficient = []
    
    for item in order.items:
        product = await db.manufactured_products.find_one({"id": item.get("product_id")}, {"_id": 0})
        if not product:
            raise HTTPException(status_code=404, detail=f"المنتج غير موجود: {item.get('product_id')}")
        
        requested_qty = item.get("quantity", 0)
        available_qty = product.get("quantity", 0)
        
        if available_qty < requested_qty:
            insufficient.append({
                "name": product.get("name"),
                "requested": requested_qty,
                "available": available_qty,
                "unit": product.get("unit")
            })
        else:
            item_cost = requested_qty * product.get("raw_material_cost", 0)
            items_with_details.append({
                "product_id": product["id"],
                "product_name": product.get("name"),
                "quantity": requested_qty,
                "unit": product.get("unit"),
                "cost_per_unit": product.get("raw_material_cost", 0),
                "total_cost": item_cost,
                "recipe": product.get("recipe", [])
            })
            total_cost += item_cost
    
    if insufficient:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "منتجات مصنعة غير كافية",
                "insufficient_products": insufficient
            }
        )
    
    order_doc = {
        "id": str(uuid.uuid4()),
        "order_number": order_number,
        "to_branch_id": order.to_branch_id,
        "to_branch_name": branch.get("name"),
        "items": items_with_details,
        "total_cost": total_cost,
        "status": "pending",
        "priority": order.priority,
        "notes": order.notes,
        "created_by": "system",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "approved_at": None,
        "shipped_at": None,
        "delivered_at": None
    }
    
    await db.branch_orders_new.insert_one(order_doc)
    del order_doc["_id"]
    return order_doc

@router.get("/branch-orders-new")
async def get_branch_orders(status: Optional[str] = None, branch_id: Optional[str] = None):
    """جلب طلبات الفروع"""
    db = get_db()
    
    query = {}
    if status:
        query["status"] = status
    if branch_id:
        query["to_branch_id"] = branch_id
    
    orders = await db.branch_orders_new.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return orders

@router.patch("/branch-orders-new/{order_id}/status")
async def update_branch_order_status(order_id: str, status: str):
    """تحديث حالة طلب الفرع"""
    db = get_db()
    
    order = await db.branch_orders_new.find_one({"id": order_id})
    if not order:
        raise HTTPException(status_code=404, detail="الطلب غير موجود")
    
    update_data = {"status": status}
    
    if status == "approved":
        update_data["approved_at"] = datetime.now(timezone.utc).isoformat()
    elif status == "shipped":
        update_data["shipped_at"] = datetime.now(timezone.utc).isoformat()
        
        # خصم المنتجات من قسم التصنيع
        for item in order.get("items", []):
            await db.manufactured_products.update_one(
                {"id": item.get("product_id")},
                {
                    "$inc": {"quantity": -item.get("quantity", 0)},
                    "$set": {"last_updated": datetime.now(timezone.utc).isoformat()}
                }
            )
    elif status == "delivered":
        update_data["delivered_at"] = datetime.now(timezone.utc).isoformat()
        
        # إضافة المنتجات لمخزون الفرع
        for item in order.get("items", []):
            existing = await db.branch_inventory.find_one({
                "branch_id": order.get("to_branch_id"),
                "product_id": item.get("product_id")
            })
            
            if existing:
                await db.branch_inventory.update_one(
                    {"id": existing["id"]},
                    {
                        "$inc": {"quantity": item.get("quantity", 0)},
                        "$set": {"last_updated": datetime.now(timezone.utc).isoformat()}
                    }
                )
            else:
                await db.branch_inventory.insert_one({
                    "id": str(uuid.uuid4()),
                    "branch_id": order.get("to_branch_id"),
                    "branch_name": order.get("to_branch_name"),
                    "product_id": item.get("product_id"),
                    "product_name": item.get("product_name"),
                    "quantity": item.get("quantity", 0),
                    "cost_per_unit": item.get("cost_per_unit", 0),
                    "recipe": item.get("recipe", []),
                    "last_updated": datetime.now(timezone.utc).isoformat(),
                    "created_at": datetime.now(timezone.utc).isoformat()
                })
    
    await db.branch_orders_new.update_one(
        {"id": order_id},
        {"$set": update_data}
    )
    
    return {"message": "تم تحديث الحالة"}

# ==================== BRANCH INVENTORY (مخزون الفروع) ====================

@router.get("/branch-inventory/{branch_id}")
async def get_branch_inventory(branch_id: str):
    """جلب مخزون فرع محدد"""
    db = get_db()
    inventory = await db.branch_inventory.find({"branch_id": branch_id}, {"_id": 0}).to_list(1000)
    
    # حساب القيمة الإجمالية وضمان وجود الحقول الجديدة
    for item in inventory:
        item["total_value"] = item.get("quantity", 0) * item.get("cost_per_unit", 0)
        item["received_quantity"] = item.get("received_quantity", item.get("quantity", 0))
        item["sold_quantity"] = item.get("sold_quantity", 0)
        item["remaining_quantity"] = item.get("quantity", 0)
    
    return inventory

@router.post("/branch-inventory/{branch_id}/sell")
async def sell_from_branch(branch_id: str, product_id: str, quantity: float = 1):
    """البيع من مخزون الفرع (خصم تلقائي)"""
    db = get_db()
    
    # البحث عن المنتج في مخزون الفرع
    inventory_item = await db.branch_inventory.find_one({
        "branch_id": branch_id,
        "product_id": product_id
    })
    
    if not inventory_item:
        raise HTTPException(status_code=404, detail="المنتج غير موجود في مخزون الفرع")
    
    if inventory_item.get("quantity", 0) < quantity:
        raise HTTPException(
            status_code=400,
            detail=f"الكمية غير كافية. متوفر: {inventory_item.get('quantity', 0)}"
        )
    
    # خصم الكمية وزيادة المباع
    await db.branch_inventory.update_one(
        {"id": inventory_item["id"]},
        {
            "$inc": {
                "quantity": -quantity,
                "sold_quantity": quantity
            },
            "$set": {"last_updated": datetime.now(timezone.utc).isoformat()}
        }
    )
    
    return {
        "message": f"تم البيع: {quantity} {inventory_item.get('product_name')}",
        "remaining": inventory_item.get("quantity", 0) - quantity,
        "sold": inventory_item.get("sold_quantity", 0) + quantity,
        "cost": quantity * inventory_item.get("cost_per_unit", 0)
    }

# ==================== INVENTORY SETTINGS ====================

@router.get("/inventory-settings")
async def get_inventory_settings():
    """جلب إعدادات المخزون"""
    db = get_db()
    settings = await db.settings.find_one({"type": "inventory_settings"}, {"_id": 0})
    
    if not settings:
        # إعدادات افتراضية
        settings = {
            "type": "inventory_settings",
            "inventory_mode": "centralized",  # centralized or per_branch
            "auto_deduct_on_sale": True,
            "low_stock_notifications": True
        }
        await db.settings.insert_one(settings)
    
    return settings

@router.put("/inventory-settings")
async def update_inventory_settings(settings: InventorySettingsUpdate):
    """تحديث إعدادات المخزون"""
    db = get_db()
    
    await db.settings.update_one(
        {"type": "inventory_settings"},
        {"$set": settings.model_dump()},
        upsert=True
    )
    
    return {"message": "تم تحديث الإعدادات"}

# ==================== STATISTICS ====================

@router.get("/inventory-stats")
async def get_inventory_statistics():
    """إحصائيات المخزون"""
    db = get_db()
    
    # إحصائيات المواد الخام
    raw_materials = await db.raw_materials.find({}, {"_id": 0}).to_list(1000)
    total_raw_value = sum(m.get("quantity", 0) * m.get("cost_per_unit", 0) for m in raw_materials)
    low_stock_raw = [m for m in raw_materials if m.get("quantity", 0) <= m.get("min_quantity", 0)]
    
    # إحصائيات التصنيع
    manufacturing = await db.manufacturing_inventory.find({}, {"_id": 0}).to_list(1000)
    total_manufacturing_value = sum(m.get("quantity", 0) * m.get("cost_per_unit", 0) for m in manufacturing)
    
    # إحصائيات المنتجات المصنعة
    products = await db.manufactured_products.find({}, {"_id": 0}).to_list(1000)
    total_products_value = sum(p.get("quantity", 0) * p.get("raw_material_cost", 0) for p in products)
    low_stock_products = [p for p in products if p.get("quantity", 0) <= p.get("min_quantity", 0)]
    
    # إحصائيات المشتريات
    purchases_count = await db.purchases_new.count_documents({})
    pending_purchases = await db.purchases_new.count_documents({"status": "pending"})
    
    # إحصائيات طلبات الفروع
    branch_orders_count = await db.branch_orders_new.count_documents({})
    pending_orders = await db.branch_orders_new.count_documents({"status": "pending"})
    
    return {
        "raw_materials": {
            "count": len(raw_materials),
            "total_value": total_raw_value,
            "low_stock_count": len(low_stock_raw),
            "low_stock_items": low_stock_raw[:5]  # أول 5 فقط
        },
        "manufacturing": {
            "count": len(manufacturing),
            "total_value": total_manufacturing_value
        },
        "manufactured_products": {
            "count": len(products),
            "total_value": total_products_value,
            "low_stock_count": len(low_stock_products),
            "low_stock_items": low_stock_products[:5]
        },
        "purchases": {
            "total": purchases_count,
            "pending": pending_purchases
        },
        "branch_orders": {
            "total": branch_orders_count,
            "pending": pending_orders
        }
    }


# ==================== تصفير البيانات (RESET DATA) ====================

class ResetDataRequest(BaseModel):
    reset_branch_orders: bool = False  # تصفير طلبات الفروع
    reset_purchases: bool = False  # تصفير طلبات الشراء
    reset_manufacturing: bool = False  # تصفير طلبات التصنيع
    reset_raw_materials_qty: bool = False  # تصفير كميات المواد الخام
    reset_manufactured_qty: bool = False  # تصفير كميات المنتجات المصنعة
    reset_branch_inventory: bool = False  # تصفير مخزون الفروع

@router.post("/inventory-reset")
async def reset_inventory_data(data: ResetDataRequest):
    """
    تصفير بيانات المخزون والمشتريات
    يستخدم بعد التجربة لتنظيف البيانات
    """
    db = get_db()
    results = {
        "reset_counts": {},
        "success": True,
        "message": "تم التصفير بنجاح"
    }
    
    try:
        # تصفير طلبات الفروع (المرسلة والمنفذة)
        if data.reset_branch_orders:
            deleted = await db.branch_orders_new.delete_many({})
            results["reset_counts"]["branch_orders"] = deleted.deleted_count
        
        # تصفير طلبات الشراء (المشتريات)
        if data.reset_purchases:
            # حذف فواتير الشراء
            deleted_purchases = await db.purchases_new.delete_many({})
            results["reset_counts"]["purchases"] = deleted_purchases.deleted_count
            
            # حذف طلبات الشراء المعلقة
            deleted_requests = await db.purchase_requests.delete_many({})
            results["reset_counts"]["purchase_requests"] = deleted_requests.deleted_count
        
        # تصفير سجلات التصنيع
        if data.reset_manufacturing:
            deleted = await db.manufacturing_records.delete_many({})
            results["reset_counts"]["manufacturing_records"] = deleted.deleted_count
            
            # حذف حركات المخزون المتعلقة بالتصنيع
            deleted_movements = await db.inventory_movements.delete_many({"type": {"$in": ["manufacturing", "transfer_to_manufacturing"]}})
            results["reset_counts"]["manufacturing_movements"] = deleted_movements.deleted_count
        
        # تصفير كميات المواد الخام (دون حذف المواد نفسها)
        if data.reset_raw_materials_qty:
            updated = await db.raw_materials.update_many(
                {},
                {"$set": {"quantity": 0, "last_updated": datetime.now(timezone.utc).isoformat()}}
            )
            results["reset_counts"]["raw_materials_qty_reset"] = updated.modified_count
            
            # تصفير مخزون التصنيع
            updated_mfg = await db.manufacturing_inventory.update_many(
                {},
                {"$set": {"quantity": 0, "last_updated": datetime.now(timezone.utc).isoformat()}}
            )
            results["reset_counts"]["manufacturing_inventory_reset"] = updated_mfg.modified_count
        
        # تصفير كميات المنتجات المصنعة
        if data.reset_manufactured_qty:
            updated = await db.manufactured_products.update_many(
                {},
                {"$set": {"quantity": 0, "last_updated": datetime.now(timezone.utc).isoformat()}}
            )
            results["reset_counts"]["manufactured_products_qty_reset"] = updated.modified_count
        
        # تصفير مخزون الفروع
        if data.reset_branch_inventory:
            deleted = await db.branch_inventory.delete_many({})
            results["reset_counts"]["branch_inventory"] = deleted.deleted_count
        
        # حذف جميع حركات المخزون إذا تم تصفير أي شيء
        if any([data.reset_branch_orders, data.reset_purchases, data.reset_manufacturing, 
                data.reset_raw_materials_qty, data.reset_manufactured_qty, data.reset_branch_inventory]):
            deleted_all_movements = await db.inventory_movements.delete_many({})
            results["reset_counts"]["inventory_movements"] = deleted_all_movements.deleted_count
        
        return results
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"خطأ في تصفير البيانات: {str(e)}")

