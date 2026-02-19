"""
نظام إدارة الفروع الخارجية/المباعة
External/Sold Branches Management System
يعتمد على حقل is_sold_branch في جدول الفروع
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta
import uuid

router = APIRouter(prefix="/external-branches", tags=["External Branches"])

# ==================== MODELS ====================

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
        # حساب المبيعات الإجمالية وتكلفة المواد
        sales_pipeline = [
            {"$match": {"branch_id": branch["id"], "status": {"$nin": ["cancelled"]}}},
            {"$group": {"_id": None, "total_sales": {"$sum": "$total"}, "total_cost": {"$sum": {"$ifNull": ["$total_cost", 0]}}}}
        ]
        sales_result = await db.orders.aggregate(sales_pipeline).to_list(1)
        total_sales = sales_result[0]["total_sales"] if sales_result else 0
        total_materials_withdrawn = sales_result[0]["total_cost"] if sales_result else 0
        
        # حساب العوائد للمالك
        owner_percentage = branch.get("owner_percentage", 0)
        total_revenue = total_sales * (owner_percentage / 100)
        
        # المبلغ المستحق = عائد النسبة + تكلفة المواد + الرسوم الثابتة
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
    
    # جلب الفروع المعلمة كمباعة من جدول الفروع
    sold_branches = await db.branches.find(
        {"tenant_id": tenant_id, "is_sold_branch": True, "is_active": True}, 
        {"_id": 0, "id": 1, "owner_percentage": 1, "monthly_fee": 1}
    ).to_list(100)
    
    sold_count = len(sold_branches)
    
    # الشهر الحالي
    now = datetime.now(timezone.utc)
    start_date = datetime(now.year, now.month, 1, tzinfo=timezone.utc)
    if now.month == 12:
        end_date = datetime(now.year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        end_date = datetime(now.year, now.month + 1, 1, tzinfo=timezone.utc)
    
    total_revenue = 0
    total_materials = 0
    
    for sb in sold_branches:
        branch_id = sb["id"]
        owner_percentage = sb.get("owner_percentage", 0)
        
        # المبيعات وتكلفة المواد من الطلبات
        sales_pipeline = [
            {
                "$match": {
                    "branch_id": branch_id,
                    "status": {"$nin": ["cancelled"]},
                    "created_at": {"$gte": start_date.isoformat(), "$lt": end_date.isoformat()}
                }
            },
            {"$group": {"_id": None, "total_sales": {"$sum": "$total"}, "total_cost": {"$sum": {"$ifNull": ["$total_cost", 0]}}}}
        ]
        sales_result = await db.orders.aggregate(sales_pipeline).to_list(1)
        branch_sales = sales_result[0]["total_sales"] if sales_result else 0
        branch_materials = sales_result[0]["total_cost"] if sales_result else 0
        
        total_revenue += branch_sales * (owner_percentage / 100) + sb.get("monthly_fee", 0)
        total_materials += branch_materials
    
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
    
    # جلب جميع الفروع المباعة من جدول الفروع
    sold_branches = await db.branches.find(
        {"tenant_id": tenant_id, "is_sold_branch": True, "is_active": True}, 
        {"_id": 0}
    ).to_list(100)
    
    branches_data = []
    total_revenue = 0
    total_materials = 0
    total_due = 0
    
    for sb in sold_branches:
        branch_id = sb["id"]
        owner_percentage = sb.get("owner_percentage", 0)
        
        # المبيعات
        sales_pipeline = [
            {
                "$match": {
                    "branch_id": branch_id,
                    "status": {"$nin": ["cancelled"]},
                    "created_at": {"$gte": start_date.isoformat(), "$lt": end_date.isoformat()}
                }
            },
            {"$group": {"_id": None, "total_sales": {"$sum": "$total"}, "total_cost": {"$sum": {"$ifNull": ["$total_cost", 0]}}}}
        ]
        sales_result = await db.orders.aggregate(sales_pipeline).to_list(1)
        branch_sales = sales_result[0]["total_sales"] if sales_result else 0
        branch_materials = sales_result[0]["total_cost"] if sales_result else 0
        
        # العائد من النسبة
        branch_revenue = branch_sales * (owner_percentage / 100)
        
        branch_due = branch_revenue + branch_materials + sb.get("monthly_fee", 0)
        
        branches_data.append({
            "branch_id": branch_id,
            "branch_name": sb["name"],
            "buyer_name": sb.get("buyer_name", ""),
            "total_sales": branch_sales,
            "owner_percentage": owner_percentage,
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

@router.get("/{branch_id}/summary")
async def get_sold_branch_summary(
    branch_id: str,
    month: Optional[str] = Query(None, description="الشهر بتنسيق YYYY-MM"),
    current_user: dict = Depends(get_current_user)
):
    """جلب ملخص مالي للفرع المباع"""
    db = get_database()
    if current_user["role"] not in [UserRole.ADMIN, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    tenant_id = get_user_tenant_id(current_user)
    
    # جلب الفرع من جدول الفروع
    sold_branch = await db.branches.find_one(
        {"id": branch_id, "tenant_id": tenant_id, "is_sold_branch": True}, 
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
    
    owner_percentage = sold_branch.get("owner_percentage", 0)
    
    # حساب المبيعات
    sales_pipeline = [
        {
            "$match": {
                "branch_id": branch_id,
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
    revenue_from_percentage = total_sales * (owner_percentage / 100)
    
    # حساب المواد المسحوبة
    materials_pipeline = [
        {
            "$match": {
                "to_branch_id": branch_id,
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
                "branch_id": branch_id,
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
        "branch_id": branch_id,
        "branch_name": sold_branch["name"],
        "buyer_name": sold_branch.get("buyer_name", ""),
        "period_start": start_date.strftime("%Y-%m-%d"),
        "period_end": end_date.strftime("%Y-%m-%d"),
        "total_sales": total_sales,
        "orders_count": orders_count,
        "owner_percentage": owner_percentage,
        "revenue_from_percentage": revenue_from_percentage,
        "monthly_fee": sold_branch.get("monthly_fee", 0),
        "materials_withdrawn": materials_withdrawn,
        "total_due": total_due,
        "paid_amount": paid_amount,
        "remaining_amount": remaining
    }

@router.post("/{branch_id}/payments")
async def record_payment(
    branch_id: str,
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
    
    # التحقق من وجود الفرع المباع
    sold_branch = await db.branches.find_one(
        {"id": branch_id, "tenant_id": tenant_id, "is_sold_branch": True}
    )
    if not sold_branch:
        raise HTTPException(status_code=404, detail="الفرع المباع غير موجود")
    
    payment_doc = {
        "id": str(uuid.uuid4()),
        "branch_id": branch_id,
        "branch_name": sold_branch["name"],
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

@router.get("/{branch_id}/payments")
async def get_payments(
    branch_id: str,
    current_user: dict = Depends(get_current_user)
):
    """جلب سجل المدفوعات للفرع المباع"""
    db = get_database()
    if current_user["role"] not in [UserRole.ADMIN, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    tenant_id = get_user_tenant_id(current_user)
    
    payments = await db.sold_branch_payments.find(
        {"branch_id": branch_id, "tenant_id": tenant_id},
        {"_id": 0}
    ).sort("payment_date", -1).to_list(100)
    
    return payments
