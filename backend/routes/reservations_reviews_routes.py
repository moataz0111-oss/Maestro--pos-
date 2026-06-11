"""
Reservations & Reviews Routes - الحجوزات والتقييمات
Extracted from server.py for modular maintainability.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, timezone
import uuid
import logging

from .shared import get_current_user, get_user_tenant_id, build_tenant_query, get_database

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Reservations & Reviews"])

# lazy DB proxy: resolves the motor client at request time (correct event loop),
# avoiding a module-import-time client bind that breaks under production ASGI servers
class _LazyDB:
    def __getattr__(self, name):
        return getattr(get_database(), name)

db = _LazyDB()


class ReservationCreate(BaseModel):
    customer_name: str
    customer_phone: str
    customer_email: Optional[str] = None
    date: str  # YYYY-MM-DD
    time: str  # HH:MM
    guests: int
    table_id: Optional[str] = None
    notes: Optional[str] = None
    branch_id: Optional[str] = None

class ReservationUpdate(BaseModel):
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None
    customer_email: Optional[str] = None
    date: Optional[str] = None
    time: Optional[str] = None
    guests: Optional[int] = None
    table_id: Optional[str] = None
    status: Optional[str] = None  # pending, confirmed, cancelled, completed, no_show
    notes: Optional[str] = None

@router.get("/reservations")
async def get_reservations(
    date: Optional[str] = None,
    status: Optional[str] = None,
    branch_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """جلب قائمة الحجوزات"""
    query = build_tenant_query(current_user)
    
    if date:
        query["date"] = date
    if status:
        query["status"] = status
    if branch_id:
        query["branch_id"] = branch_id
    
    reservations = await db.reservations.find(query, {"_id": 0}).sort("date", -1).to_list(500)
    return reservations

@router.post("/reservations")
async def create_reservation(reservation: ReservationCreate, current_user: dict = Depends(get_current_user)):
    """إنشاء حجز جديد"""
    tenant_id = get_user_tenant_id(current_user)
    
    # إنشاء رقم الحجز
    last_reservation = await db.reservations.find_one(
        {"tenant_id": tenant_id} if tenant_id else {},
        {"_id": 0, "reservation_number": 1},
        sort=[("created_at", -1)]
    )
    res_num = 1
    if last_reservation and last_reservation.get("reservation_number"):
        try:
            res_num = int(last_reservation["reservation_number"].replace("RES-", "")) + 1
        except:
            res_num = 1
    
    reservation_doc = {
        "id": str(uuid.uuid4()),
        "reservation_number": f"RES-{str(res_num).zfill(4)}",
        **reservation.model_dump(),
        "status": "pending",
        "tenant_id": tenant_id,
        "created_by": current_user["id"],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.reservations.insert_one(reservation_doc)
    del reservation_doc["_id"]
    return reservation_doc

@router.put("/reservations/{reservation_id}")
async def update_reservation(reservation_id: str, update: ReservationUpdate, current_user: dict = Depends(get_current_user)):
    """تحديث حجز"""
    query = build_tenant_query(current_user, {"id": reservation_id})
    
    reservation = await db.reservations.find_one(query)
    if not reservation:
        raise HTTPException(status_code=404, detail="الحجز غير موجود")
    
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    if update_data:
        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.reservations.update_one({"id": reservation_id}, {"$set": update_data})
    
    return await db.reservations.find_one({"id": reservation_id}, {"_id": 0})

@router.delete("/reservations/{reservation_id}")
async def delete_reservation(reservation_id: str, current_user: dict = Depends(get_current_user)):
    """حذف حجز"""
    query = build_tenant_query(current_user, {"id": reservation_id})
    
    reservation = await db.reservations.find_one(query)
    if not reservation:
        raise HTTPException(status_code=404, detail="الحجز غير موجود")
    
    await db.reservations.delete_one({"id": reservation_id})
    return {"message": "تم حذف الحجز"}

@router.get("/reservations/stats")
async def get_reservations_stats(current_user: dict = Depends(get_current_user)):
    """إحصائيات الحجوزات"""
    query = build_tenant_query(current_user)
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    
    total = await db.reservations.count_documents(query)
    today_count = await db.reservations.count_documents({**query, "date": today})
    pending = await db.reservations.count_documents({**query, "status": "pending"})
    confirmed = await db.reservations.count_documents({**query, "status": "confirmed"})
    
    return {
        "total": total,
        "today": today_count,
        "pending": pending,
        "confirmed": confirmed
    }

# ==================== REVIEWS - التقييمات ====================

class ReviewCreate(BaseModel):
    customer_name: str
    customer_phone: Optional[str] = None
    rating: int  # 1-5
    food_rating: Optional[int] = None
    service_rating: Optional[int] = None
    cleanliness_rating: Optional[int] = None
    comment: Optional[str] = None
    order_id: Optional[str] = None
    branch_id: Optional[str] = None

class ReviewResponse(BaseModel):
    response: str

@router.get("/reviews")
async def get_reviews(
    rating: Optional[int] = None,
    branch_id: Optional[str] = None,
    responded: Optional[bool] = None,
    current_user: dict = Depends(get_current_user)
):
    """جلب قائمة التقييمات"""
    query = build_tenant_query(current_user)
    
    if rating:
        query["rating"] = rating
    if branch_id:
        query["branch_id"] = branch_id
    if responded is not None:
        if responded:
            query["response"] = {"$ne": None}
        else:
            query["response"] = None
    
    reviews = await db.reviews.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return reviews

@router.post("/reviews")
async def create_review(review: ReviewCreate, current_user: dict = Depends(get_current_user)):
    """إضافة تقييم جديد"""
    tenant_id = get_user_tenant_id(current_user)
    
    review_doc = {
        "id": str(uuid.uuid4()),
        **review.model_dump(),
        "response": None,
        "responded_at": None,
        "responded_by": None,
        "tenant_id": tenant_id,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.reviews.insert_one(review_doc)
    del review_doc["_id"]
    return review_doc

@router.put("/reviews/{review_id}/respond")
async def respond_to_review(review_id: str, response: ReviewResponse, current_user: dict = Depends(get_current_user)):
    """الرد على تقييم"""
    query = build_tenant_query(current_user, {"id": review_id})
    
    review = await db.reviews.find_one(query)
    if not review:
        raise HTTPException(status_code=404, detail="التقييم غير موجود")
    
    await db.reviews.update_one(
        {"id": review_id},
        {"$set": {
            "response": response.response,
            "responded_at": datetime.now(timezone.utc).isoformat(),
            "responded_by": current_user["id"]
        }}
    )
    
    return await db.reviews.find_one({"id": review_id}, {"_id": 0})

@router.delete("/reviews/{review_id}")
async def delete_review(review_id: str, current_user: dict = Depends(get_current_user)):
    """حذف تقييم"""
    query = build_tenant_query(current_user, {"id": review_id})
    
    review = await db.reviews.find_one(query)
    if not review:
        raise HTTPException(status_code=404, detail="التقييم غير موجود")
    
    await db.reviews.delete_one({"id": review_id})
    return {"message": "تم حذف التقييم"}

@router.get("/reviews/stats")
async def get_reviews_stats(current_user: dict = Depends(get_current_user)):
    """إحصائيات التقييمات"""
    query = build_tenant_query(current_user)
    
    reviews = await db.reviews.find(query, {"_id": 0, "rating": 1, "response": 1}).to_list(1000)
    
    total = len(reviews)
    if total == 0:
        return {
            "total": 0,
            "average_rating": 0,
            "five_star": 0,
            "four_star": 0,
            "three_star": 0,
            "two_star": 0,
            "one_star": 0,
            "responded": 0,
            "pending_response": 0
        }
    
    ratings = [r["rating"] for r in reviews]
    avg_rating = sum(ratings) / total
    
    return {
        "total": total,
        "average_rating": round(avg_rating, 1),
        "five_star": ratings.count(5),
        "four_star": ratings.count(4),
        "three_star": ratings.count(3),
        "two_star": ratings.count(2),
        "one_star": ratings.count(1),
        "responded": len([r for r in reviews if r.get("response")]),
        "pending_response": len([r for r in reviews if not r.get("response")])
    }
