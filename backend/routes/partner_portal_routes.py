"""
Partner Portal - بوابة التاجر الشريك (بدون تسجيل دخول)
- التاجر يستخدم partner_id + كود الوصول (access_code) لجلب طلباته وعمولاته
"""
from fastapi import APIRouter, HTTPException, Body
from typing import Optional
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel
import uuid
import secrets

from .shared import get_database

router = APIRouter(prefix="/partner-portal", tags=["Partner Portal"])


class PortalLoginRequest(BaseModel):
    partner_id: str
    access_code: str


async def _verify_partner(db, partner_id: str, access_code: str):
    partner = await db.marketplace_partners.find_one(
        {"id": partner_id, "access_code": access_code, "is_active": True},
        {"_id": 0}
    )
    if not partner:
        raise HTTPException(status_code=401, detail="بيانات الدخول غير صحيحة")
    return partner


@router.post("/generate-access-code/{partner_id}")
async def generate_partner_access_code(partner_id: str):
    """يولّد access_code جديد للتاجر - يستدعى من داخل النظام"""
    db = get_database()
    partner = await db.marketplace_partners.find_one({"id": partner_id}, {"_id": 0})
    if not partner:
        raise HTTPException(status_code=404, detail="التاجر غير موجود")

    code = secrets.token_urlsafe(8)
    await db.marketplace_partners.update_one(
        {"id": partner_id},
        {"$set": {"access_code": code, "access_code_updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"partner_id": partner_id, "access_code": code, "portal_url": f"/partner/{partner_id}"}


@router.post("/login")
async def portal_login(req: PortalLoginRequest):
    """تسجيل دخول التاجر بكود الوصول"""
    db = get_database()
    partner = await _verify_partner(db, req.partner_id, req.access_code)
    partner.pop("access_code", None)
    return {"partner": partner, "session_valid_hours": 24}


@router.get("/{partner_id}/dashboard")
async def partner_dashboard(partner_id: str, access_code: str, period_days: int = 30):
    """لوحة التاجر: ملخص الطلبات والعمولات"""
    db = get_database()
    partner = await _verify_partner(db, partner_id, access_code)

    start = (datetime.now(timezone.utc) - timedelta(days=period_days)).isoformat()
    orders_query = {
        "partner_id": partner_id,
        "tenant_id": partner["tenant_id"],
        "created_at": {"$gte": start},
    }
    total_orders = await db.partner_orders.count_documents(orders_query)
    completed = await db.partner_orders.count_documents({**orders_query, "status": "completed"})

    pipeline = [
        {"$match": orders_query},
        {"$group": {"_id": None,
                    "total_revenue": {"$sum": "$total"},
                    "total_commission": {"$sum": "$commission_amount"}}}
    ]
    agg = await db.partner_orders.aggregate(pipeline).to_list(1)
    revenue = float(agg[0]["total_revenue"]) if agg else 0.0
    commission = float(agg[0]["total_commission"]) if agg else 0.0

    return {
        "partner": {"id": partner["id"], "name": partner["name"], "commission_rate": partner["commission_rate"]},
        "period_days": period_days,
        "total_orders": total_orders,
        "completed_orders": completed,
        "total_revenue": round(revenue, 2),
        "total_commission": round(commission, 2),
        "net_to_partner": round(revenue - commission, 2),
    }


@router.get("/{partner_id}/orders")
async def partner_orders(partner_id: str, access_code: str, limit: int = 50):
    """قائمة طلبات التاجر"""
    db = get_database()
    partner = await _verify_partner(db, partner_id, access_code)
    orders = await db.partner_orders.find(
        {"partner_id": partner_id, "tenant_id": partner["tenant_id"]},
        {"_id": 0}
    ).sort("created_at", -1).to_list(length=limit)
    return orders
