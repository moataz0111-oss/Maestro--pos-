"""
Sales Target Routes - هدف المبيعات اليومي
Extracted from server.py for modular maintainability.
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from datetime import datetime, timezone
import logging

from .shared import get_current_user, UserRole, OrderStatus, get_database

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/sales-target", tags=["Sales Target"])


def _sn(val, default=0):
    """Safe number: converts None to default for math ops."""
    if val is None:
        return default
    try:
        return float(val)
    except (TypeError, ValueError):
        return default


@router.post("")
async def set_sales_target(
    request: Request,
    current_user: dict = Depends(get_current_user)
):
    """تحديد هدف المبيعات اليومي - المدير أو المالك فقط"""
    db = get_database()
    user_role = current_user.get("role", "")
    if user_role not in [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.GENERAL_MANAGER, UserRole.MANAGER]:
        raise HTTPException(status_code=403, detail="فقط المدير أو المالك يمكنه تحديد الهدف")

    body = await request.json()
    target_amount = body.get("target_amount", 0)
    if target_amount <= 0:
        raise HTTPException(status_code=400, detail="يجب أن يكون الهدف أكبر من صفر")

    tenant_id = current_user.get("tenant_id", "default")
    today = datetime.now(timezone.utc).strftime('%Y-%m-%d')

    motivational_message = body.get("motivational_message", "").strip()

    update_data = {
        "tenant_id": tenant_id,
        "date": today,
        "target_amount": float(target_amount),
        "set_by": current_user.get("id"),
        "set_by_name": current_user.get("full_name") or current_user.get("username"),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    if motivational_message:
        update_data["motivational_message"] = motivational_message

    await db.sales_targets.update_one(
        {"tenant_id": tenant_id, "date": today},
        {"$set": update_data},
        upsert=True
    )

    return {"message": "تم تحديد الهدف بنجاح", "target_amount": target_amount, "date": today}


@router.get("")
async def get_sales_target(
    current_user: dict = Depends(get_current_user)
):
    """جلب هدف المبيعات اليومي مع التقدم الحالي"""
    db = get_database()
    tenant_id = current_user.get("tenant_id", "default")
    today = datetime.now(timezone.utc).strftime('%Y-%m-%d')

    target = await db.sales_targets.find_one(
        {"tenant_id": tenant_id, "date": today},
        {"_id": 0}
    )

    if not target:
        return {"has_target": False, "target_amount": 0, "current_sales": 0, "progress": 0, "achieved": False}

    # حساب المبيعات الحالية لليوم
    user_role = current_user.get("role", "")
    is_manager = user_role in [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.GENERAL_MANAGER, UserRole.MANAGER]

    sales_query = {
        "status": {"$nin": [OrderStatus.CANCELLED, "refunded"]},
        "created_at": {"$gte": today}
    }
    if tenant_id:
        sales_query["tenant_id"] = tenant_id

    # للمستخدمين غير المدراء - فقط مبيعاتهم
    if not is_manager:
        sales_query["cashier_id"] = current_user["id"]

    orders = await db.orders.find(sales_query, {"_id": 0, "total": 1}).to_list(10000)
    current_sales = sum(_sn(o.get("total")) for o in orders)

    target_amount = target.get("target_amount", 0)
    progress = min((current_sales / target_amount * 100), 100) if target_amount > 0 else 0
    achieved = current_sales >= target_amount

    return {
        "has_target": True,
        "target_amount": target_amount,
        "current_sales": current_sales,
        "progress": round(progress, 1),
        "achieved": achieved,
        "set_by_name": target.get("set_by_name"),
        "motivational_message": target.get("motivational_message", ""),
        "date": today
    }
