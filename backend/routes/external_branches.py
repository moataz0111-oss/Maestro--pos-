"""
نظام إدارة الفروع الخارجية/المباعة
External/Sold Branches Management System
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta
import uuid

router = APIRouter(prefix="/external-branches", tags=["External Branches"])

# ==================== MODELS ====================

class SoldBranchCreate(BaseModel):
    """نموذج إنشاء فرع مباع"""
    branch_id: str  # معرف الفرع الموجود
    buyer_name: str  # اسم المشتري
    buyer_phone: Optional[str] = None  # هاتف المشتري
    owner_percentage: float = 0.0  # نسبة المالك الأصلي من المبيعات (0-100)
    monthly_fee: float = 0.0  # رسوم شهرية ثابتة (اختياري)
    contract_start_date: Optional[str] = None  # تاريخ بدء العقد
    notes: Optional[str] = None

class SoldBranchUpdate(BaseModel):
    """نموذج تحديث فرع مباع"""
    buyer_name: Optional[str] = None
    buyer_phone: Optional[str] = None
    owner_percentage: Optional[float] = None
    monthly_fee: Optional[float] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None

class SoldBranchResponse(BaseModel):
    """نموذج استجابة الفرع المباع"""
    id: str
    branch_id: str
    branch_name: str
    buyer_name: str
    buyer_phone: Optional[str] = None
    owner_percentage: float
    monthly_fee: float = 0.0
    contract_start_date: Optional[str] = None
    notes: Optional[str] = None
    is_active: bool = True
    created_at: str
    # إحصائيات محسوبة
    total_sales: float = 0.0
    total_revenue: float = 0.0  # إجمالي العوائد للمالك
    total_materials_withdrawn: float = 0.0  # قيمة المواد المسحوبة
    pending_amount: float = 0.0  # المبلغ المستحق

# ==================== DEPENDENCY ====================

from .shared import get_database, get_current_user, get_user_tenant_id, UserRole

# ==================== API ROUTES ====================

@router.post("/register", response_model=SoldBranchResponse)
async def register_sold_branch(data: SoldBranchCreate, current_user: dict = Depends(get_current_user)):
    """تسجيل فرع كفرع مباع"""
    db = get_database()
    if current_user["role"] not in [UserRole.ADMIN, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    tenant_id = get_user_tenant_id(current_user)
    
    # التحقق من وجود الفرع
    branch = await db.branches.find_one({"id": data.branch_id, "tenant_id": tenant_id}, {"_id": 0})
    if not branch:
        raise HTTPException(status_code=404, detail="الفرع غير موجود")
    
    # التحقق من أن الفرع ليس مسجلاً مسبقاً كمباع
    existing = await db.sold_branches.find_one({"branch_id": data.branch_id, "is_active": True})
    if existing:
        raise HTTPException(status_code=400, detail="هذا الفرع مسجل بالفعل كفرع مباع")
    
    # إنشاء سجل الفرع المباع
    sold_branch_doc = {
        "id": str(uuid.uuid4()),
        "branch_id": data.branch_id,
        "branch_name": branch["name"],
        "buyer_name": data.buyer_name,
        "buyer_phone": data.buyer_phone,
        "owner_percentage": data.owner_percentage,
        "monthly_fee": data.monthly_fee,
        "contract_start_date": data.contract_start_date or datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "notes": data.notes,
        "is_active": True,
        "tenant_id": tenant_id,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.sold_branches.insert_one(sold_branch_doc)
    
    # تحديث الفرع ليُعلم أنه مباع
    await db.branches.update_one(
        {"id": data.branch_id},
        {"$set": {
            "is_sold": True,
            "sold_branch_id": sold_branch_doc["id"],
            "buyer_name": data.buyer_name,
            "owner_percentage": data.owner_percentage
        }}
    )
    
    del sold_branch_doc["_id"]
    return sold_branch_doc

@router.get("/", response_model=List[SoldBranchResponse])
async def get_sold_branches(
    current_user: dict = Depends(get_current_user),
    include_inactive: bool = False
):
    """جلب قائمة الفروع المباعة - تلقائياً من الفروع المعلمة كمباعة"""
    db = get_database()
    if current_user["role"] not in [UserRole.ADMIN, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    tenant_id = get_user_tenant_id(current_user)
    
    # جلب الفروع المعلمة كمباعة مباشرة من جدول الفروع
    branch_query = {"tenant_id": tenant_id, "is_sold_branch": True}
    if not include_inactive:
        branch_query["is_active"] = True
    
    sold_branches_from_branches = await db.branches.find(branch_query, {"_id": 0}).to_list(100)
    
    result = []
    for branch in sold_branches_from_branches:
        # حساب المبيعات الإجمالية
        sales_pipeline = [
            {"$match": {"branch_id": branch["id"], "status": {"$nin": ["cancelled"]}}},
            {"$group": {"_id": None, "total": {"$sum": "$total"}}}
        ]
        sales_result = await db.orders.aggregate(sales_pipeline).to_list(1)
        total_sales = sales_result[0]["total"] if sales_result else 0
        
        # حساب العوائد للمالك
        owner_percentage = branch.get("owner_percentage", 0)
        total_revenue = total_sales * (owner_percentage / 100)
        
        # حساب قيمة المواد المسحوبة (من تحويلات المخزون)
        materials_pipeline = [
            {"$match": {"to_branch_id": branch["id"], "status": "received"}},
            {"$unwind": "$items"},
            {"$group": {"_id": None, "total": {"$sum": {"$multiply": ["$items.quantity", {"$ifNull": ["$items.cost_per_unit", 0]}]}}}}
        ]
        materials_result = await db.inventory_transfers.aggregate(materials_pipeline).to_list(1)
        total_materials_withdrawn = materials_result[0]["total"] if materials_result else 0
        
        # المبلغ المستحق
        pending_amount = total_revenue + total_materials_withdrawn + branch.get("monthly_fee", 0)
        
        result.append({
            "id": branch["id"],
            "branch_id": branch["id"],
            "branch_name": branch["name"],
            "buyer_name": branch.get("buyer_name", ""),
            "buyer_phone": branch.get("buyer_phone"),
            "owner_percentage": owner_percentage,
            "monthly_fee": branch.get("monthly_fee", 0),
            "contract_start_date": branch.get("created_at", "")[:10],
            "notes": None,
            "is_active": branch.get("is_active", True),
            "created_at": branch.get("created_at", ""),
            "total_sales": total_sales,
            "total_revenue": total_revenue,
            "total_materials_withdrawn": total_materials_withdrawn,
            "pending_amount": pending_amount
        })
    
    return result

@router.get("/dashboard/stats")
async def get_external_branches_stats(
    current_user: dict = Depends(get_current_user)
):
    """إحصائيات الفروع الخارجية للداشبورد"""
    db = get_database()
    if current_user["role"] not in [UserRole.ADMIN, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    tenant_id = get_user_tenant_id(current_user)
    
    # عدد الفروع المباعة
    sold_count = await db.sold_branches.count_documents({"tenant_id": tenant_id, "is_active": True})
    
    # الشهر الحالي
    now = datetime.now(timezone.utc)
    start_date = datetime(now.year, now.month, 1, tzinfo=timezone.utc)
    if now.month == 12:
        end_date = datetime(now.year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        end_date = datetime(now.year, now.month + 1, 1, tzinfo=timezone.utc)
    
    # جلب الفروع المباعة
    sold_branches = await db.sold_branches.find(
        {"tenant_id": tenant_id, "is_active": True}, 
        {"_id": 0, "branch_id": 1, "owner_percentage": 1, "monthly_fee": 1}
    ).to_list(100)
    
    total_revenue = 0
    total_materials = 0
    
    for sb in sold_branches:
        # المبيعات
        sales_pipeline = [
            {
                "$match": {
                    "branch_id": sb["branch_id"],
                    "status": {"$nin": ["cancelled"]},
                    "created_at": {"$gte": start_date.isoformat(), "$lt": end_date.isoformat()}
                }
            },
            {"$group": {"_id": None, "total": {"$sum": "$total"}}}
        ]
        sales_result = await db.orders.aggregate(sales_pipeline).to_list(1)
        branch_sales = sales_result[0]["total"] if sales_result else 0
        total_revenue += branch_sales * (sb["owner_percentage"] / 100) + sb.get("monthly_fee", 0)
        
        # المواد
        materials_pipeline = [
            {
                "$match": {
                    "to_branch_id": sb["branch_id"],
                    "status": "received",
                    "received_at": {"$gte": start_date.isoformat(), "$lt": end_date.isoformat()}
                }
            },
            {"$unwind": "$items"},
            {"$group": {"_id": None, "total": {"$sum": {"$multiply": ["$items.quantity", {"$ifNull": ["$items.cost_per_unit", 0]}]}}}}
        ]
        materials_result = await db.inventory_transfers.aggregate(materials_pipeline).to_list(1)
        total_materials += materials_result[0]["total"] if materials_result else 0
    
    return {
        "sold_branches_count": sold_count,
        "current_month": f"{now.year}-{now.month:02d}",
        "monthly_revenue": total_revenue,
        "monthly_materials": total_materials,
        "total_monthly_due": total_revenue + total_materials
    }

@router.get("/reports/monthly")
async def get_monthly_revenue_report(
    month: Optional[str] = Query(None, description="الشهر بتنسيق YYYY-MM"),
    current_user: dict = Depends(get_current_user)
):
    """تقرير العوائد الشهرية من جميع الفروع المباعة"""
    db = get_database()
    if current_user["role"] not in [UserRole.ADMIN, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    tenant_id = get_user_tenant_id(current_user)
    
    # تحديد نطاق التاريخ
    if month:
        year, mon = map(int, month.split("-"))
    else:
        now = datetime.now(timezone.utc)
        year, mon = now.year, now.month
    
    start_date = datetime(year, mon, 1, tzinfo=timezone.utc)
    if mon == 12:
        end_date = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        end_date = datetime(year, mon + 1, 1, tzinfo=timezone.utc)
    
    # جلب جميع الفروع المباعة
    sold_branches = await db.sold_branches.find(
        {"tenant_id": tenant_id, "is_active": True}, 
        {"_id": 0}
    ).to_list(100)
    
    branches_data = []
    total_revenue = 0
    total_materials = 0
    total_due = 0
    
    for sb in sold_branches:
        # المبيعات
        sales_pipeline = [
            {
                "$match": {
                    "branch_id": sb["branch_id"],
                    "status": {"$nin": ["cancelled"]},
                    "created_at": {"$gte": start_date.isoformat(), "$lt": end_date.isoformat()}
                }
            },
            {"$group": {"_id": None, "total": {"$sum": "$total"}}}
        ]
        sales_result = await db.orders.aggregate(sales_pipeline).to_list(1)
        branch_sales = sales_result[0]["total"] if sales_result else 0
        
        # العائد من النسبة
        branch_revenue = branch_sales * (sb["owner_percentage"] / 100)
        
        # المواد المسحوبة
        materials_pipeline = [
            {
                "$match": {
                    "to_branch_id": sb["branch_id"],
                    "status": "received",
                    "received_at": {"$gte": start_date.isoformat(), "$lt": end_date.isoformat()}
                }
            },
            {"$unwind": "$items"},
            {"$group": {"_id": None, "total": {"$sum": {"$multiply": ["$items.quantity", {"$ifNull": ["$items.cost_per_unit", 0]}]}}}}
        ]
        materials_result = await db.inventory_transfers.aggregate(materials_pipeline).to_list(1)
        branch_materials = materials_result[0]["total"] if materials_result else 0
        
        branch_due = branch_revenue + branch_materials + sb.get("monthly_fee", 0)
        
        branches_data.append({
            "branch_id": sb["branch_id"],
            "branch_name": sb["branch_name"],
            "buyer_name": sb["buyer_name"],
            "total_sales": branch_sales,
            "owner_percentage": sb["owner_percentage"],
            "revenue_from_percentage": branch_revenue,
            "materials_withdrawn": branch_materials,
            "monthly_fee": sb.get("monthly_fee", 0),
            "total_due": branch_due
        })
        
        total_revenue += branch_revenue
        total_materials += branch_materials
        total_due += branch_due
    
    return {
        "month": f"{year}-{mon:02d}",
        "period_start": start_date.strftime("%Y-%m-%d"),
        "period_end": end_date.strftime("%Y-%m-%d"),
        "branches": branches_data,
        "total_revenue": total_revenue,
        "total_materials": total_materials,
        "total_due": total_due,
        "branches_count": len(branches_data)
    }

@router.get("/{sold_branch_id}", response_model=SoldBranchResponse)
async def get_sold_branch(sold_branch_id: str, current_user: dict = Depends(get_current_user)):
    """جلب تفاصيل فرع مباع"""
    db = get_database()
    if current_user["role"] not in [UserRole.ADMIN, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    tenant_id = get_user_tenant_id(current_user)
    sold_branch = await db.sold_branches.find_one(
        {"id": sold_branch_id, "tenant_id": tenant_id}, 
        {"_id": 0}
    )
    
    if not sold_branch:
        raise HTTPException(status_code=404, detail="الفرع المباع غير موجود")
    
    return sold_branch

@router.put("/{sold_branch_id}")
async def update_sold_branch(
    sold_branch_id: str, 
    data: SoldBranchUpdate, 
    current_user: dict = Depends(get_current_user)
):
    """تحديث بيانات فرع مباع"""
    db = get_database()
    if current_user["role"] not in [UserRole.ADMIN, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    tenant_id = get_user_tenant_id(current_user)
    
    update_data = {k: v for k, v in data.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="لا توجد بيانات للتحديث")
    
    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    result = await db.sold_branches.update_one(
        {"id": sold_branch_id, "tenant_id": tenant_id},
        {"$set": update_data}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="الفرع المباع غير موجود")
    
    # تحديث الفرع الأصلي أيضاً
    sold_branch = await db.sold_branches.find_one({"id": sold_branch_id}, {"_id": 0})
    if sold_branch:
        await db.branches.update_one(
            {"id": sold_branch["branch_id"]},
            {"$set": {
                "buyer_name": sold_branch.get("buyer_name"),
                "owner_percentage": sold_branch.get("owner_percentage")
            }}
        )
    
    return await db.sold_branches.find_one({"id": sold_branch_id}, {"_id": 0})

@router.delete("/{sold_branch_id}")
async def cancel_sold_branch(sold_branch_id: str, current_user: dict = Depends(get_current_user)):
    """إلغاء تسجيل فرع كمباع"""
    db = get_database()
    if current_user["role"] not in [UserRole.ADMIN, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    tenant_id = get_user_tenant_id(current_user)
    
    sold_branch = await db.sold_branches.find_one({"id": sold_branch_id, "tenant_id": tenant_id})
    if not sold_branch:
        raise HTTPException(status_code=404, detail="الفرع المباع غير موجود")
    
    # تعطيل السجل
    await db.sold_branches.update_one(
        {"id": sold_branch_id},
        {"$set": {"is_active": False, "cancelled_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    # إزالة علامة المباع من الفرع الأصلي
    await db.branches.update_one(
        {"id": sold_branch["branch_id"]},
        {"$set": {"is_sold": False}, "$unset": {"sold_branch_id": "", "buyer_name": "", "owner_percentage": ""}}
    )
    
    return {"message": "تم إلغاء تسجيل الفرع كمباع"}

@router.get("/{sold_branch_id}/summary")
async def get_sold_branch_summary(
    sold_branch_id: str,
    month: Optional[str] = Query(None, description="الشهر بتنسيق YYYY-MM"),
    current_user: dict = Depends(get_current_user)
):
    """جلب ملخص مالي للفرع المباع"""
    db = get_database()
    if current_user["role"] not in [UserRole.ADMIN, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    tenant_id = get_user_tenant_id(current_user)
    sold_branch = await db.sold_branches.find_one(
        {"id": sold_branch_id, "tenant_id": tenant_id}, 
        {"_id": 0}
    )
    
    if not sold_branch:
        raise HTTPException(status_code=404, detail="الفرع المباع غير موجود")
    
    # تحديد نطاق التاريخ
    if month:
        year, mon = map(int, month.split("-"))
        start_date = datetime(year, mon, 1, tzinfo=timezone.utc)
        if mon == 12:
            end_date = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
        else:
            end_date = datetime(year, mon + 1, 1, tzinfo=timezone.utc)
    else:
        # الشهر الحالي
        now = datetime.now(timezone.utc)
        start_date = datetime(now.year, now.month, 1, tzinfo=timezone.utc)
        if now.month == 12:
            end_date = datetime(now.year + 1, 1, 1, tzinfo=timezone.utc)
        else:
            end_date = datetime(now.year, now.month + 1, 1, tzinfo=timezone.utc)
    
    # حساب المبيعات
    sales_pipeline = [
        {
            "$match": {
                "branch_id": sold_branch["branch_id"],
                "status": {"$nin": ["cancelled"]},
                "created_at": {"$gte": start_date.isoformat(), "$lt": end_date.isoformat()}
            }
        },
        {"$group": {"_id": None, "total": {"$sum": "$total"}, "count": {"$sum": 1}}}
    ]
    sales_result = await db.orders.aggregate(sales_pipeline).to_list(1)
    total_sales = sales_result[0]["total"] if sales_result else 0
    orders_count = sales_result[0]["count"] if sales_result else 0
    
    # حساب العائد من النسبة
    revenue_from_percentage = total_sales * (sold_branch["owner_percentage"] / 100)
    
    # حساب المواد المسحوبة
    materials_pipeline = [
        {
            "$match": {
                "to_branch_id": sold_branch["branch_id"],
                "status": "received",
                "received_at": {"$gte": start_date.isoformat(), "$lt": end_date.isoformat()}
            }
        },
        {"$unwind": "$items"},
        {"$group": {"_id": None, "total": {"$sum": {"$multiply": ["$items.quantity", {"$ifNull": ["$items.cost_per_unit", 0]}]}}}}
    ]
    materials_result = await db.inventory_transfers.aggregate(materials_pipeline).to_list(1)
    materials_withdrawn = materials_result[0]["total"] if materials_result else 0
    
    # المبالغ المدفوعة
    payments_pipeline = [
        {
            "$match": {
                "sold_branch_id": sold_branch_id,
                "payment_date": {"$gte": start_date.strftime("%Y-%m-%d"), "$lt": end_date.strftime("%Y-%m-%d")}
            }
        },
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]
    payments_result = await db.sold_branch_payments.aggregate(payments_pipeline).to_list(1)
    paid_amount = payments_result[0]["total"] if payments_result else 0
    
    # إجمالي المستحق
    total_due = revenue_from_percentage + materials_withdrawn + sold_branch.get("monthly_fee", 0)
    remaining = total_due - paid_amount
    
    return {
        "branch_id": sold_branch["branch_id"],
        "branch_name": sold_branch["branch_name"],
        "buyer_name": sold_branch["buyer_name"],
        "period_start": start_date.strftime("%Y-%m-%d"),
        "period_end": end_date.strftime("%Y-%m-%d"),
        "total_sales": total_sales,
        "orders_count": orders_count,
        "owner_percentage": sold_branch["owner_percentage"],
        "revenue_from_percentage": revenue_from_percentage,
        "monthly_fee": sold_branch.get("monthly_fee", 0),
        "materials_withdrawn": materials_withdrawn,
        "total_due": total_due,
        "paid_amount": paid_amount,
        "remaining_amount": remaining
    }

@router.post("/{sold_branch_id}/payments")
async def record_payment(
    sold_branch_id: str,
    amount: float = Query(..., description="مبلغ الدفعة"),
    payment_date: Optional[str] = Query(None, description="تاريخ الدفعة"),
    notes: Optional[str] = Query(None, description="ملاحظات"),
    current_user: dict = Depends(get_current_user)
):
    """تسجيل دفعة من فرع مباع"""
    db = get_database()
    if current_user["role"] not in [UserRole.ADMIN, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    tenant_id = get_user_tenant_id(current_user)
    
    sold_branch = await db.sold_branches.find_one(
        {"id": sold_branch_id, "tenant_id": tenant_id}
    )
    if not sold_branch:
        raise HTTPException(status_code=404, detail="الفرع المباع غير موجود")
    
    payment_doc = {
        "id": str(uuid.uuid4()),
        "sold_branch_id": sold_branch_id,
        "branch_id": sold_branch["branch_id"],
        "amount": amount,
        "payment_date": payment_date or datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "notes": notes,
        "recorded_by": current_user["id"],
        "tenant_id": tenant_id,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.sold_branch_payments.insert_one(payment_doc)
    del payment_doc["_id"]
    
    return payment_doc

@router.get("/{sold_branch_id}/payments")
async def get_payments(
    sold_branch_id: str,
    current_user: dict = Depends(get_current_user)
):
    """جلب سجل المدفوعات للفرع المباع"""
    db = get_database()
    if current_user["role"] not in [UserRole.ADMIN, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    tenant_id = get_user_tenant_id(current_user)
    
    payments = await db.sold_branch_payments.find(
        {"sold_branch_id": sold_branch_id, "tenant_id": tenant_id},
        {"_id": 0}
    ).sort("payment_date", -1).to_list(100)
    
    return payments
