"""
Owner Wallet Routes - إدارة حساب المالك / الخزينة
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
import uuid

from .shared import get_database, get_current_user, get_user_tenant_id

router = APIRouter(prefix="/owner-wallet", tags=["owner-wallet"])

# ==================== MODELS ====================
class DepositCreate(BaseModel):
    amount: float
    date: str  # YYYY-MM-DD
    description: Optional[str] = None
    source: str = "cash_sales"  # cash_sales, card_sales, other
    branch_id: Optional[str] = None  # معرف الفرع
    branch_name: Optional[str] = None  # اسم الفرع

class WithdrawalCreate(BaseModel):
    amount: float
    date: str
    beneficiary: str  # اسم المستفيد
    description: Optional[str] = None
    category: str = "transfer"  # transfer, payment, personal

class ProfitTransferCreate(BaseModel):
    amount: float
    month: str  # YYYY-MM
    description: Optional[str] = None

class ProfitWithdrawalCreate(BaseModel):
    amount: float
    reason: Optional[str] = None

class MonthlyClosingCreate(BaseModel):
    month: str  # YYYY-MM
    total_sales: float
    total_expenses: float
    net_profit: float
    notes: Optional[str] = None

# ==================== APIs ====================

@router.get("/summary")
async def get_wallet_summary(current_user: dict = Depends(get_current_user)):
    """جلب ملخص حساب المالك"""
    db = get_database()
    tenant_id = get_user_tenant_id(current_user)
    
    query = {"tenant_id": tenant_id} if tenant_id else {}
    
    # إجمالي الإيداعات
    deposits = await db.owner_deposits.find(query, {"_id": 0}).to_list(1000)
    total_deposits = sum(d.get("amount", 0) for d in deposits)
    
    # إجمالي السحوبات
    withdrawals = await db.owner_withdrawals.find(query, {"_id": 0}).to_list(1000)
    total_withdrawals = sum(w.get("amount", 0) for w in withdrawals)
    
    # إجمالي تحويلات الأرباح للخزينة
    profit_transfers = await db.owner_profit_transfers.find(query, {"_id": 0}).to_list(1000)
    total_profit_transferred = sum(p.get("amount", 0) for p in profit_transfers)
    
    # إجمالي سحوبات الأرباح من الخزينة
    profit_withdrawals = await db.owner_profit_withdrawals.find(query, {"_id": 0}).to_list(1000)
    total_profit_withdrawn = sum(w.get("amount", 0) for w in profit_withdrawals)
    
    # الرصيد المتاح (الإيداعات - السحوبات)
    available_balance = total_deposits - total_withdrawals
    
    # رصيد الخزينة = الأرباح المحولة - الأرباح المسحوبة
    safe_balance = total_profit_transferred - total_profit_withdrawn
    
    # آخر 5 معاملات
    all_transactions = []
    for d in deposits[-5:]:
        all_transactions.append({**d, "type": "deposit"})
    for w in withdrawals[-5:]:
        all_transactions.append({**w, "type": "withdrawal"})
    for p in profit_transfers[-5:]:
        all_transactions.append({**p, "type": "profit_transfer"})
    for pw in profit_withdrawals[-5:]:
        all_transactions.append({**pw, "type": "profit_withdrawal"})
    
    # ترتيب حسب التاريخ
    all_transactions.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    
    return {
        "total_deposits": total_deposits,
        "total_withdrawals": total_withdrawals,
        "available_balance": available_balance,
        "safe_balance": safe_balance,  # رصيد الخزينة الشخصية (المحول - المسحوب)
        "total_profit_transferred": total_profit_transferred,
        "total_profit_withdrawn": total_profit_withdrawn,
        "deposits_count": len(deposits),
        "withdrawals_count": len(withdrawals),
        "recent_transactions": all_transactions[:10]
    }

@router.get("/deposits")
async def get_deposits(
    month: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """جلب الإيداعات"""
    db = get_database()
    tenant_id = get_user_tenant_id(current_user)
    
    query = {"tenant_id": tenant_id} if tenant_id else {}
    if month:
        query["date"] = {"$regex": f"^{month}"}
    
    deposits = await db.owner_deposits.find(query, {"_id": 0}).sort("date", -1).to_list(100)
    return deposits

@router.post("/deposits")
async def create_deposit(
    deposit: DepositCreate,
    current_user: dict = Depends(get_current_user)
):
    """إنشاء إيداع جديد"""
    db = get_database()
    tenant_id = get_user_tenant_id(current_user)
    
    # جلب اسم الفرع إذا كان معرف الفرع موجوداً
    branch_name = deposit.branch_name
    if deposit.branch_id and not branch_name:
        branch = await db.branches.find_one({"id": deposit.branch_id}, {"_id": 0, "name": 1})
        if branch:
            branch_name = branch.get("name")
    
    new_deposit = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "amount": deposit.amount,
        "date": deposit.date,
        "description": deposit.description,
        "source": deposit.source,
        "branch_id": deposit.branch_id,
        "branch_name": branch_name,
        "created_by": current_user.get("username") or current_user.get("full_name"),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.owner_deposits.insert_one(new_deposit)
    new_deposit.pop("_id", None)
    return new_deposit

@router.delete("/deposits/{deposit_id}")
async def delete_deposit(deposit_id: str, current_user: dict = Depends(get_current_user)):
    """حذف إيداع"""
    db = get_database()
    tenant_id = get_user_tenant_id(current_user)
    
    query = {"id": deposit_id}
    if tenant_id:
        query["tenant_id"] = tenant_id
    
    result = await db.owner_deposits.delete_one(query)
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="الإيداع غير موجود")
    return {"success": True}

@router.get("/withdrawals")
async def get_withdrawals(
    month: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """جلب السحوبات"""
    db = get_database()
    tenant_id = get_user_tenant_id(current_user)
    
    query = {"tenant_id": tenant_id} if tenant_id else {}
    if month:
        query["date"] = {"$regex": f"^{month}"}
    
    withdrawals = await db.owner_withdrawals.find(query, {"_id": 0}).sort("date", -1).to_list(100)
    return withdrawals

@router.post("/withdrawals")
async def create_withdrawal(
    withdrawal: WithdrawalCreate,
    current_user: dict = Depends(get_current_user)
):
    """إنشاء سحب جديد"""
    db = get_database()
    tenant_id = get_user_tenant_id(current_user)
    
    new_withdrawal = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "amount": withdrawal.amount,
        "date": withdrawal.date,
        "beneficiary": withdrawal.beneficiary,
        "description": withdrawal.description,
        "category": withdrawal.category,
        "created_by": current_user.get("username") or current_user.get("full_name"),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.owner_withdrawals.insert_one(new_withdrawal)
    new_withdrawal.pop("_id", None)
    return new_withdrawal

@router.delete("/withdrawals/{withdrawal_id}")
async def delete_withdrawal(withdrawal_id: str, current_user: dict = Depends(get_current_user)):
    """حذف سحب"""
    db = get_database()
    tenant_id = get_user_tenant_id(current_user)
    
    query = {"id": withdrawal_id}
    if tenant_id:
        query["tenant_id"] = tenant_id
    
    result = await db.owner_withdrawals.delete_one(query)
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="السحب غير موجود")
    return {"success": True}

@router.get("/profit-transfers")
async def get_profit_transfers(current_user: dict = Depends(get_current_user)):
    """جلب تحويلات الأرباح للخزينة"""
    db = get_database()
    tenant_id = get_user_tenant_id(current_user)
    
    query = {"tenant_id": tenant_id} if tenant_id else {}
    transfers = await db.owner_profit_transfers.find(query, {"_id": 0}).sort("month", -1).to_list(100)
    return transfers

@router.post("/profit-transfers")
async def create_profit_transfer(
    transfer: ProfitTransferCreate,
    current_user: dict = Depends(get_current_user)
):
    """تحويل أرباح للخزينة الشخصية"""
    db = get_database()
    tenant_id = get_user_tenant_id(current_user)
    
    # التحقق من عدم وجود تحويل لنفس الشهر
    existing = await db.owner_profit_transfers.find_one({
        "tenant_id": tenant_id,
        "month": transfer.month
    })
    
    if existing:
        raise HTTPException(status_code=400, detail="يوجد تحويل أرباح لهذا الشهر مسبقاً")
    
    new_transfer = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "amount": transfer.amount,
        "month": transfer.month,
        "description": transfer.description,
        "created_by": current_user.get("username") or current_user.get("full_name"),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.owner_profit_transfers.insert_one(new_transfer)
    new_transfer.pop("_id", None)
    return new_transfer

@router.post("/profit-withdrawals")
async def create_profit_withdrawal(
    withdrawal: ProfitWithdrawalCreate,
    current_user: dict = Depends(get_current_user)
):
    """سحب أرباح من الخزينة الشخصية"""
    db = get_database()
    tenant_id = get_user_tenant_id(current_user)
    
    # حساب رصيد الخزينة الحالي
    query = {"tenant_id": tenant_id} if tenant_id else {}
    
    # إجمالي الأرباح المحولة
    profit_transfers = await db.owner_profit_transfers.find(query, {"_id": 0}).to_list(1000)
    total_transferred = sum(p.get("amount", 0) for p in profit_transfers)
    
    # إجمالي الأرباح المسحوبة
    profit_withdrawals = await db.owner_profit_withdrawals.find(query, {"_id": 0}).to_list(1000)
    total_withdrawn = sum(w.get("amount", 0) for w in profit_withdrawals)
    
    # الرصيد المتاح
    available_balance = total_transferred - total_withdrawn
    
    if withdrawal.amount > available_balance:
        raise HTTPException(status_code=400, detail="المبلغ أكبر من الرصيد المتاح في الخزينة")
    
    new_withdrawal = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "amount": withdrawal.amount,
        "reason": withdrawal.reason,
        "date": datetime.now(timezone.utc).strftime('%Y-%m-%d'),
        "created_by": current_user.get("username") or current_user.get("full_name"),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.owner_profit_withdrawals.insert_one(new_withdrawal)
    new_withdrawal.pop("_id", None)
    return new_withdrawal

@router.get("/profit-withdrawals")
async def get_profit_withdrawals(current_user: dict = Depends(get_current_user)):
    """جلب سجل سحوبات الأرباح من الخزينة"""
    db = get_database()
    tenant_id = get_user_tenant_id(current_user)
    
    query = {"tenant_id": tenant_id} if tenant_id else {}
    withdrawals = await db.owner_profit_withdrawals.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    return withdrawals

@router.get("/monthly-closings")
async def get_monthly_closings(current_user: dict = Depends(get_current_user)):
    """جلب إغلاقات الأشهر"""
    db = get_database()
    tenant_id = get_user_tenant_id(current_user)
    
    query = {"tenant_id": tenant_id} if tenant_id else {}
    closings = await db.owner_monthly_closings.find(query, {"_id": 0}).sort("month", -1).to_list(24)
    return closings

@router.post("/monthly-closings")
async def create_monthly_closing(
    closing: MonthlyClosingCreate,
    current_user: dict = Depends(get_current_user)
):
    """إغلاق شهر"""
    db = get_database()
    tenant_id = get_user_tenant_id(current_user)
    
    # التحقق من عدم إغلاق الشهر مسبقاً
    existing = await db.owner_monthly_closings.find_one({
        "tenant_id": tenant_id,
        "month": closing.month
    })
    
    if existing:
        raise HTTPException(status_code=400, detail="هذا الشهر مغلق مسبقاً")
    
    new_closing = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "month": closing.month,
        "total_sales": closing.total_sales,
        "total_expenses": closing.total_expenses,
        "net_profit": closing.net_profit,
        "notes": closing.notes,
        "closed_by": current_user.get("username") or current_user.get("full_name"),
        "closed_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.owner_monthly_closings.insert_one(new_closing)
    new_closing.pop("_id", None)
    return new_closing

@router.get("/report/{month}")
async def get_monthly_report(month: str, current_user: dict = Depends(get_current_user)):
    """جلب تقرير شهري للمالك"""
    db = get_database()
    tenant_id = get_user_tenant_id(current_user)
    
    query = {"tenant_id": tenant_id} if tenant_id else {}
    date_query = {"$regex": f"^{month}"}
    
    # الإيداعات
    deposits = await db.owner_deposits.find({**query, "date": date_query}, {"_id": 0}).to_list(100)
    total_deposits = sum(d.get("amount", 0) for d in deposits)
    
    # السحوبات
    withdrawals = await db.owner_withdrawals.find({**query, "date": date_query}, {"_id": 0}).to_list(100)
    total_withdrawals = sum(w.get("amount", 0) for w in withdrawals)
    
    # تفاصيل السحوبات حسب الفئة
    withdrawals_by_category = {}
    for w in withdrawals:
        cat = w.get("category", "other")
        if cat not in withdrawals_by_category:
            withdrawals_by_category[cat] = 0
        withdrawals_by_category[cat] += w.get("amount", 0)
    
    # تحويل الأرباح
    profit_transfer = await db.owner_profit_transfers.find_one({**query, "month": month}, {"_id": 0})
    
    # إغلاق الشهر
    closing = await db.owner_monthly_closings.find_one({**query, "month": month}, {"_id": 0})
    
    return {
        "month": month,
        "deposits": {
            "items": deposits,
            "total": total_deposits,
            "count": len(deposits)
        },
        "withdrawals": {
            "items": withdrawals,
            "total": total_withdrawals,
            "count": len(withdrawals),
            "by_category": withdrawals_by_category
        },
        "profit_transfer": profit_transfer,
        "closing": closing,
        "net_flow": total_deposits - total_withdrawals
    }
