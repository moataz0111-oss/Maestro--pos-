"""
Loyalty Program Routes
برنامج ولاء العملاء - نظام النقاط والمكافآت
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
import uuid

router = APIRouter(prefix="/loyalty", tags=["Loyalty Program"])

# ==================== MODELS ====================

class LoyaltyTier(BaseModel):
    """مستوى الولاء"""
    name: str  # برونزي، فضي، ذهبي، بلاتيني
    name_en: str  # Bronze, Silver, Gold, Platinum
    min_points: int
    discount_percent: float
    points_multiplier: float = 1.0  # مضاعف النقاط
    benefits: List[str] = []
    color: str = "#CD7F32"  # لون المستوى

class LoyaltyProgramSettings(BaseModel):
    """إعدادات برنامج الولاء"""
    is_enabled: bool = True
    points_per_currency: float = 1.0  # نقطة لكل دينار
    currency_per_point: float = 0.01  # قيمة النقطة بالدينار
    min_redeem_points: int = 100  # أقل عدد نقاط للاستبدال
    max_redeem_percent: float = 50  # أقصى نسبة خصم من الفاتورة
    points_expiry_days: int = 365  # صلاحية النقاط بالأيام
    welcome_bonus: int = 50  # نقاط الترحيب
    birthday_bonus: int = 100  # نقاط عيد الميلاد
    referral_bonus: int = 200  # نقاط الإحالة
    tiers: List[LoyaltyTier] = []

class LoyaltyMember(BaseModel):
    """عضو في برنامج الولاء"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    customer_id: str
    customer_name: str
    phone: str
    email: Optional[str] = None
    total_points: int = 0
    available_points: int = 0
    redeemed_points: int = 0
    current_tier: str = "bronze"
    lifetime_spending: float = 0
    total_orders: int = 0
    join_date: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    birthday: Optional[str] = None
    referral_code: str = Field(default_factory=lambda: str(uuid.uuid4())[:8].upper())
    referred_by: Optional[str] = None

class PointsTransaction(BaseModel):
    """معاملة نقاط"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    member_id: str
    order_id: Optional[str] = None
    transaction_type: str  # earn, redeem, bonus, expire, adjustment
    points: int  # موجب للكسب، سالب للاستهلاك
    description: str
    balance_after: int
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    expires_at: Optional[str] = None

class RedeemPointsRequest(BaseModel):
    """طلب استبدال نقاط"""
    member_id: str
    points_to_redeem: int
    order_id: str

class EarnPointsRequest(BaseModel):
    """طلب كسب نقاط"""
    member_id: str
    order_id: str
    order_total: float

# ==================== DEFAULT TIERS ====================

DEFAULT_TIERS = [
    LoyaltyTier(
        name="برونزي",
        name_en="Bronze",
        min_points=0,
        discount_percent=0,
        points_multiplier=1.0,
        benefits=["كسب نقطة لكل دينار"],
        color="#CD7F32"
    ),
    LoyaltyTier(
        name="فضي",
        name_en="Silver",
        min_points=500,
        discount_percent=5,
        points_multiplier=1.25,
        benefits=["خصم 5%", "1.25x نقاط", "توصيل مجاني مرة شهرياً"],
        color="#C0C0C0"
    ),
    LoyaltyTier(
        name="ذهبي",
        name_en="Gold",
        min_points=1500,
        discount_percent=10,
        points_multiplier=1.5,
        benefits=["خصم 10%", "1.5x نقاط", "توصيل مجاني", "عروض حصرية"],
        color="#FFD700"
    ),
    LoyaltyTier(
        name="بلاتيني",
        name_en="Platinum",
        min_points=5000,
        discount_percent=15,
        points_multiplier=2.0,
        benefits=["خصم 15%", "2x نقاط", "أولوية الطلبات", "هدايا مفاجئة"],
        color="#E5E4E2"
    )
]

DEFAULT_SETTINGS = LoyaltyProgramSettings(
    is_enabled=True,
    points_per_currency=1.0,
    currency_per_point=0.01,
    min_redeem_points=100,
    max_redeem_percent=50,
    points_expiry_days=365,
    welcome_bonus=50,
    birthday_bonus=100,
    referral_bonus=200,
    tiers=[t.model_dump() for t in DEFAULT_TIERS]
)

# ==================== HELPER FUNCTIONS ====================

def calculate_tier(total_points: int, tiers: List[Dict]) -> str:
    """حساب المستوى بناءً على النقاط"""
    current_tier = "bronze"
    for tier in sorted(tiers, key=lambda x: x.get("min_points", 0), reverse=True):
        if total_points >= tier.get("min_points", 0):
            current_tier = tier.get("name_en", "bronze").lower()
            break
    return current_tier

def get_tier_multiplier(tier_name: str, tiers: List[Dict]) -> float:
    """الحصول على مضاعف النقاط للمستوى"""
    for tier in tiers:
        if tier.get("name_en", "").lower() == tier_name.lower():
            return tier.get("points_multiplier", 1.0)
    return 1.0

def get_tier_discount(tier_name: str, tiers: List[Dict]) -> float:
    """الحصول على نسبة خصم المستوى"""
    for tier in tiers:
        if tier.get("name_en", "").lower() == tier_name.lower():
            return tier.get("discount_percent", 0)
    return 0
