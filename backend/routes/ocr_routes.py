"""OCR Invoice Extraction (extracted from server.py)"""
from fastapi import APIRouter
from server import *  # noqa: F401,F403
from server import (_sn)

router = APIRouter()

# ==================== OCR - استخراج بيانات الفاتورة ====================

class OCRRequest(BaseModel):
    image_data: str  # Base64 encoded image


# نماذج الرؤية: الأساسي Gemini + احتياطي OpenAI
_OCR_VISION_MODELS = [
    ("gemini", "gemini-3-flash-preview"),
    ("openai", "gpt-5.4-mini"),
]

_OCR_SYSTEM_MESSAGE = """أنت مساعد متخصص في استخراج بيانات فواتير المشتريات من الصور (غالباً بالعربية).
حلّل صورة الفاتورة بدقة واستخرج: رقم الفاتورة، اسم المورد/الشركة، قائمة الأصناف (الاسم، الكمية، الوحدة، سعر الوحدة)، المجموع الكلي، وأي ملاحظات.
أرجع النتيجة بصيغة JSON صالحة فقط، بدون أي نص أو شرح إضافي."""

_OCR_USER_PROMPT = """حلل صورة الفاتورة هذه واستخرج البيانات بصيغة JSON التالية حرفياً:
{
    "invoice_number": "رقم الفاتورة أو null",
    "supplier_name": "اسم المورد/الشركة أو null",
    "items": [
        {"name": "اسم الصنف", "quantity": رقم, "unit": "الوحدة", "unit_price": رقم}
    ],
    "total_amount": رقم,
    "notes": "ملاحظات أو null"
}
الأرقام يجب أن تكون أرقاماً (بلا فواصل آلاف ولا عملة). إذا تعذّر قراءة قيمة ضع null. أرجع JSON فقط."""


def _resize_invoice_image_b64(image_base64: str, max_side: int = 1600, quality: int = 80) -> str:
    """تصغير/ضغط صورة الفاتورة لتفادي رفض الموديل بسبب الحجم الكبير (صور الموبايل)."""
    import base64 as _b64
    from io import BytesIO
    from PIL import Image, ImageOps
    try:
        raw = _b64.b64decode(image_base64)
        img = Image.open(BytesIO(raw))
        # أول إطار فقط للصور المتحركة
        try:
            img.seek(0)
        except Exception:
            pass
        img = ImageOps.exif_transpose(img)  # تصحيح دوران الموبايل
        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")
        img.thumbnail((max_side, max_side), Image.LANCZOS)
        buf = BytesIO()
        img.convert("RGB").save(buf, format="JPEG", quality=quality, optimize=True)
        return _b64.b64encode(buf.getvalue()).decode("utf-8")
    except Exception as e:
        logging.warning(f"OCR image resize failed, using original: {e}")
        return image_base64


def _extract_json_from_text(text: str):
    """استخلاص JSON متين من رد الموديل (بلوك markdown أو أول كائن متوازن)."""
    import json
    import re
    if not text:
        return None
    s = text.strip()
    # 1) بلوك ```json ... ```
    m = re.search(r"```(?:json)?\s*(.*?)```", s, re.DOTALL | re.IGNORECASE)
    if m:
        candidate = m.group(1).strip()
        try:
            return json.loads(candidate)
        except Exception:
            s = candidate
    # 2) محاولة مباشرة
    try:
        return json.loads(s)
    except Exception:
        pass
    # 3) استخراج أول كائن { } متوازن
    start = s.find("{")
    if start != -1:
        depth = 0
        for i in range(start, len(s)):
            if s[i] == "{":
                depth += 1
            elif s[i] == "}":
                depth -= 1
                if depth == 0:
                    try:
                        return json.loads(s[start:i + 1])
                    except Exception:
                        break
    return None


@router.post("/purchase-invoices/ocr")
async def extract_invoice_data(request: OCRRequest, current_user: dict = Depends(get_current_user)):
    """استخراج بيانات الفاتورة من الصورة باستخدام AI (Gemini أساسي + OpenAI احتياطي، مع ضغط صورة وإعادة محاولة)."""
    from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

    api_key = os.environ.get('EMERGENT_LLM_KEY')
    if not api_key:
        raise HTTPException(status_code=500, detail="مفتاح API غير متوفر")

    # إزالة prefix من Base64 إذا وجد ثم تصغير/ضغط الصورة
    image_base64 = request.image_data or ""
    if ',' in image_base64:
        image_base64 = image_base64.split(',')[1]
    image_base64 = image_base64.strip()
    if not image_base64:
        raise HTTPException(status_code=400, detail="لا توجد صورة")
    image_base64 = await asyncio.to_thread(_resize_invoice_image_b64, image_base64)

    last_raw = ""
    last_error = ""
    # جرّب كل موديل (الأساسي ثم الاحتياطي)
    for provider, model_name in _OCR_VISION_MODELS:
        try:
            chat = LlmChat(
                api_key=api_key,
                session_id=f"ocr-{current_user['id']}-{uuid.uuid4()}",
                system_message=_OCR_SYSTEM_MESSAGE,
            ).with_model(provider, model_name)
            user_message = UserMessage(
                text=_OCR_USER_PROMPT,
                file_contents=[ImageContent(image_base64=image_base64)],
            )
            response = await chat.send_message(user_message)
            last_raw = response or ""
            extracted = _extract_json_from_text(last_raw)
            if extracted is not None and isinstance(extracted, dict):
                extracted.setdefault("items", [])
                return {"success": True, "data": extracted, "model": model_name}
            logging.warning(f"OCR JSON parse failed on {model_name}; trying next model")
        except Exception as e:
            last_error = str(e)
            logging.error(f"OCR error on {provider}/{model_name}: {e}")
            continue

    # فشلت كل المحاولات
    if last_raw:
        return {
            "success": False,
            "raw_response": last_raw,
            "message": "لم نتمكن من تحويل النتيجة إلى بيانات منظمة. حاول بصورة أوضح.",
        }
    raise HTTPException(status_code=500, detail=f"خطأ في تحليل الصورة: {last_error or 'تعذّر الاتصال بخدمة التحليل'}")

# Suppliers endpoints extracted to routes/suppliers_routes.py

@router.get("/purchase-orders")
async def get_purchase_orders(
    status: Optional[str] = None,
    supplier_id: Optional[str] = None,
    branch_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """جلب أوامر الشراء"""
    query = build_tenant_query(current_user)
    
    if status:
        query["status"] = status
    if supplier_id:
        query["supplier_id"] = supplier_id
    if branch_id:
        query["branch_id"] = branch_id
    
    orders = await db.purchase_orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    
    for order in orders:
        supplier = await db.suppliers.find_one({"id": order.get("supplier_id")}, {"_id": 0, "name": 1})
        order["supplier"] = supplier
    
    return orders

@router.post("/purchase-orders")
async def create_purchase_order(order: PurchaseOrderCreate, current_user: dict = Depends(get_current_user)):
    """إنشاء أمر شراء جديد"""
    tenant_id = get_user_tenant_id(current_user)
    
    supplier_query = build_tenant_query(current_user, {"id": order.supplier_id})
    supplier = await db.suppliers.find_one(supplier_query)
    if not supplier:
        raise HTTPException(status_code=404, detail="المورد غير موجود")
    
    total_amount = sum(item.get("total", _sn(item.get("quantity")) * item.get("unit_price", 0)) for item in order.items)
    
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
        "branch_id": order.branch_id or current_user.get("branch_id"),
        "tenant_id": tenant_id,
        "created_by": current_user["id"],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.purchase_orders.insert_one(order_doc)
    del order_doc["_id"]
    
    order_doc["supplier"] = {"id": supplier["id"], "name": supplier["name"]}
    return order_doc

@router.put("/purchase-orders/{order_id}/status")
async def update_purchase_order_status(order_id: str, update: PurchaseOrderStatusUpdate, current_user: dict = Depends(get_current_user)):
    """تحديث حالة أمر الشراء"""
    query = build_tenant_query(current_user, {"id": order_id})
    
    order = await db.purchase_orders.find_one(query)
    if not order:
        raise HTTPException(status_code=404, detail="أمر الشراء غير موجود")
    
    update_data = {"status": update.status}
    
    if update.status == "approved":
        update_data["approved_by"] = current_user["id"]
        update_data["approved_at"] = datetime.now(timezone.utc).isoformat()
    elif update.status == "delivered":
        update_data["delivered_at"] = datetime.now(timezone.utc).isoformat()
        update_data["received_by"] = current_user["id"]
        
        for item in order.get("items", []):
            material_id = item.get("material_id")
            quantity = _sn(item.get("quantity"))
            if material_id and quantity > 0:
                await db.raw_materials.update_one(
                    {"id": material_id},
                    {"$inc": {"current_stock": quantity}}
                )
        
        await db.suppliers.update_one(
            {"id": order["supplier_id"]},
            {"$inc": {"total_orders": 1, "total_amount": order.get("total_amount", 0)}}
        )
    
    if update.notes:
        update_data["status_notes"] = update.notes
    
    await db.purchase_orders.update_one({"id": order_id}, {"$set": update_data})
    return await db.purchase_orders.find_one({"id": order_id}, {"_id": 0})

@router.delete("/purchase-orders/{order_id}")
async def delete_purchase_order(order_id: str, current_user: dict = Depends(get_current_user)):
    """حذف أمر شراء"""
    query = build_tenant_query(current_user, {"id": order_id})
    
    order = await db.purchase_orders.find_one(query)
    if not order:
        raise HTTPException(status_code=404, detail="أمر الشراء غير موجود")
    
    if order["status"] not in ["pending", "cancelled"]:
        raise HTTPException(status_code=400, detail="لا يمكن حذف أمر شراء تمت معالجته")
    
    await db.purchase_orders.delete_one({"id": order_id})
    return {"message": "تم حذف أمر الشراء"}

@router.get("/raw-materials")
async def get_raw_materials(
    branch_id: Optional[str] = None,
    category: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """جلب المواد الخام من جدول raw_materials"""
    query = build_tenant_query(current_user)
    
    if branch_id:
        query["branch_id"] = branch_id
    if category:
        query["category"] = category
    
    # البحث في raw_materials أولاً (الجدول الصحيح)
    materials = await db.raw_materials.find(query, {"_id": 0}).sort("name", 1).to_list(500)
    
    # إذا لم نجد شيء، نبحث أيضاً في inventory بنوع raw (للتوافقية القديمة)
    if not materials:
        old_query = build_tenant_query(current_user, {"item_type": "raw"})
        if branch_id:
            old_query["branch_id"] = branch_id
        if category:
            old_query["category"] = category
        materials = await db.inventory.find(old_query, {"_id": 0}).sort("name", 1).to_list(500)
    
    return materials

@router.post("/raw-materials")
async def create_raw_material(material: RawMaterialCreate, current_user: dict = Depends(get_current_user)):
    """إضافة مادة خام جديدة"""
    tenant_id = get_user_tenant_id(current_user)
    
    material_doc = {
        "id": str(uuid.uuid4()),
        **material.model_dump(),
        "tenant_id": tenant_id,
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": current_user["id"]
    }
    
    await db.raw_materials.insert_one(material_doc)
    del material_doc["_id"]
    return material_doc

@router.put("/raw-materials/{material_id}")
async def update_raw_material(material_id: str, update: dict, current_user: dict = Depends(get_current_user)):
    """تحديث مادة خام"""
    query = build_tenant_query(current_user, {"id": material_id})
    
    material = await db.raw_materials.find_one(query)
    if not material:
        raise HTTPException(status_code=404, detail="المادة غير موجودة")
    
    allowed_fields = ["name", "name_en", "unit", "category", "min_stock", "current_stock", "price", "supplier_id", "is_active", "pack_quantity", "pack_unit", "waste_percentage"]
    update_data = {k: v for k, v in update.items() if k in allowed_fields and v is not None}
    
    if update_data:
        await db.raw_materials.update_one({"id": material_id}, {"$set": update_data})
    
    return await db.raw_materials.find_one({"id": material_id}, {"_id": 0})

@router.get("/inventory/low-stock-alerts")
async def get_low_stock_alerts(current_user: dict = Depends(get_current_user)):
    """جلب تنبيهات انخفاض المخزون"""
    query = build_tenant_query(current_user)
    
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
                "price": _sn(material.get("price"))
            })
    
    alerts.sort(key=lambda x: x["shortage"], reverse=True)
    return alerts

