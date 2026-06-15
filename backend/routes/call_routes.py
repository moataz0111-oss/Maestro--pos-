"""
مكالمات صوتية داخل التطبيق (WebRTC) بين الزبون والسائق.
الإشارات (signaling) عبر HTTP polling مع تجميع ICE كامل (non-trickle) لتقليل التعقيد.
كل النقاط عامة (بدون JWT) لأن تطبيقي الزبون والسائق بلا مصادقة JWT.
"""
from fastapi import APIRouter, HTTPException, Body
from typing import Optional
from datetime import datetime, timezone, timedelta
import uuid
import logging

from routes.shared import get_database

router = APIRouter(prefix="/calls", tags=["calls"])
logger = logging.getLogger(__name__)

# مدة صلاحية الرنين (إن لم يُجَب خلالها يُعتبر فائتاً)
RING_TTL_SECONDS = 45


def _now():
    return datetime.now(timezone.utc)


def _iso(dt):
    return dt.isoformat()


def _serialize(call: dict) -> dict:
    if not call:
        return None
    call.pop("_id", None)
    return call


@router.post("/initiate")
async def initiate_call(payload: dict = Body(...)):
    """بدء مكالمة. caller: 'customer' أو 'driver'. offer = SDP عرض WebRTC كامل (مع ICE)."""
    db = get_database()
    order_id = payload.get("order_id")
    caller = payload.get("caller")  # customer | driver
    caller_name = payload.get("caller_name") or ""
    offer = payload.get("offer")

    if not order_id or caller not in ("customer", "driver") or not offer:
        raise HTTPException(status_code=400, detail="بيانات المكالمة ناقصة")

    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="الطلب غير موجود")

    driver_id = order.get("driver_id")
    customer_phone = order.get("customer_phone")
    callee = "driver" if caller == "customer" else "customer"

    if callee == "driver" and not driver_id:
        raise HTTPException(status_code=400, detail="لم يتم تعيين سائق لهذا الطلب بعد")

    # ألغِ أي مكالمات قديمة قيد الرنين لنفس الطلب
    await db.call_sessions.update_many(
        {"order_id": order_id, "status": "ringing"},
        {"$set": {"status": "ended", "ended_at": _iso(_now())}}
    )

    call_id = str(uuid.uuid4())
    doc = {
        "id": call_id,
        "order_id": order_id,
        "order_number": order.get("order_number"),
        "driver_id": driver_id,
        "driver_name": order.get("driver_name") or "",
        "customer_phone": customer_phone,
        "customer_name": order.get("customer_name") or "",
        "caller": caller,
        "caller_name": caller_name,
        "callee": callee,
        "status": "ringing",  # ringing | answered | rejected | ended
        "offer": offer,
        "answer": None,
        "created_at": _iso(_now()),
        "expires_at": _iso(_now() + timedelta(seconds=RING_TTL_SECONDS)),
    }
    await db.call_sessions.insert_one(doc)
    logger.info(f"📞 Call {call_id} initiated by {caller} for order {order_id}")

    # إشعار Web Push للطرف المستلِم ليرنّ هاتفه حتى لو كان التطبيق في الخلفية
    try:
        from server import send_push_notification  # late import لتجنّب الاستيراد الدائري
        if callee == "driver":
            drv = await db.drivers.find_one({"id": driver_id}, {"_id": 0, "phone": 1})
            target_phone = (drv or {}).get("phone") or order.get("driver_phone")
            target_type = "driver"
            who = order.get("customer_name") or "الزبون"
        else:
            target_phone = customer_phone
            target_type = "customer"
            who = order.get("driver_name") or "السائق"
        if target_phone:
            await send_push_notification(
                phone=target_phone,
                title="📞 مكالمة واردة",
                body=f"{who} يتصل بك بخصوص الطلب #{order.get('order_number', '')}",
                data={"type": "incoming_call", "call_id": call_id, "order_id": order_id},
                user_type=target_type,
                tag="incoming_call",
                require_interaction=True,
            )
    except Exception as _pe:
        logger.warning(f"call push notify failed: {_pe}")

    return {"call_id": call_id, "callee": callee}


@router.get("/incoming")
async def get_incoming_call(driver_id: Optional[str] = None, order_id: Optional[str] = None, phone: Optional[str] = None):
    """استطلاع مكالمة واردة قيد الرنين للمستلِم (سائق عبر driver_id، أو زبون عبر order_id/phone)."""
    db = get_database()
    query = {"status": "ringing", "expires_at": {"$gt": _iso(_now())}}
    if driver_id:
        query["callee"] = "driver"
        query["driver_id"] = driver_id
    elif order_id:
        query["callee"] = "customer"
        query["order_id"] = order_id
    elif phone:
        query["callee"] = "customer"
        query["customer_phone"] = phone
    else:
        return {"call": None}

    call = await db.call_sessions.find_one(query, sort=[("created_at", -1)])
    return {"call": _serialize(call)}


@router.get("/{call_id}")
async def get_call(call_id: str):
    """جلب حالة المكالمة (للطرف المُتصِل لاستلام الإجابة وحالة الإنهاء)."""
    db = get_database()
    call = await db.call_sessions.find_one({"id": call_id})
    if not call:
        raise HTTPException(status_code=404, detail="المكالمة غير موجودة")
    # انتهاء الرنين تلقائياً
    if call.get("status") == "ringing" and call.get("expires_at", "") <= _iso(_now()):
        await db.call_sessions.update_one({"id": call_id}, {"$set": {"status": "missed"}})
        call["status"] = "missed"
    return {"call": _serialize(call)}


@router.post("/{call_id}/answer")
async def answer_call(call_id: str, payload: dict = Body(...)):
    """قبول المكالمة وإرسال SDP الإجابة الكاملة."""
    db = get_database()
    answer = payload.get("answer")
    if not answer:
        raise HTTPException(status_code=400, detail="إجابة المكالمة ناقصة")
    call = await db.call_sessions.find_one({"id": call_id})
    if not call:
        raise HTTPException(status_code=404, detail="المكالمة غير موجودة")
    if call.get("status") not in ("ringing",):
        raise HTTPException(status_code=409, detail="المكالمة لم تعد قيد الرنين")
    await db.call_sessions.update_one(
        {"id": call_id},
        {"$set": {"status": "answered", "answer": answer, "answered_at": _iso(_now())}}
    )
    return {"success": True}


@router.post("/{call_id}/reject")
async def reject_call(call_id: str):
    db = get_database()
    await db.call_sessions.update_one(
        {"id": call_id}, {"$set": {"status": "rejected", "ended_at": _iso(_now())}}
    )
    return {"success": True}


@router.post("/{call_id}/end")
async def end_call(call_id: str):
    db = get_database()
    await db.call_sessions.update_one(
        {"id": call_id}, {"$set": {"status": "ended", "ended_at": _iso(_now())}}
    )
    return {"success": True}
