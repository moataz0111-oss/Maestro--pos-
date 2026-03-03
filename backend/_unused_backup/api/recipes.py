"""
Recipe & Raw Materials System
نظام الوصفات والمواد الخام
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
import uuid

router = APIRouter(prefix="/recipes", tags=["Recipes & Raw Materials"])

# ==================== MODELS ====================

class RawMaterial(BaseModel):
    """مادة خام"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    name_en: Optional[str] = None
    unit: str  # كغ، لتر، حبة، علبة
    unit_cost: float  # سعر الوحدة
    current_stock: float = 0
    min_stock: float = 0  # حد التنبيه
    max_stock: float = 0
    supplier_id: Optional[str] = None
    category: str = "general"  # لحوم، خضار، توابل، مشروبات، تغليف
    branch_id: Optional[str] = None
    tenant_id: Optional[str] = None
    is_active: bool = True
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: Optional[str] = None

class RawMaterialCreate(BaseModel):
    """إنشاء مادة خام"""
    name: str
    name_en: Optional[str] = None
    unit: str
    unit_cost: float
    current_stock: float = 0
    min_stock: float = 0
    max_stock: float = 0
    supplier_id: Optional[str] = None
    category: str = "general"
    branch_id: Optional[str] = None

class RecipeIngredient(BaseModel):
    """مكون في الوصفة"""
    material_id: str
    material_name: str
    quantity: float
    unit: str
    unit_cost: float
    total_cost: float

class Recipe(BaseModel):
    """وصفة منتج"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    product_id: str
    product_name: str
    ingredients: List[RecipeIngredient] = []
    total_cost: float = 0  # تكلفة المواد الخام
    labor_cost: float = 0  # تكلفة العمالة
    overhead_cost: float = 0  # تكاليف إضافية
    final_cost: float = 0  # التكلفة النهائية
    selling_price: float = 0
    profit_margin: float = 0  # هامش الربح %
    portions: int = 1  # عدد الحصص من الوصفة
    preparation_time: int = 0  # وقت التحضير بالدقائق
    instructions: Optional[str] = None
    notes: Optional[str] = None
    branch_id: Optional[str] = None
    tenant_id: Optional[str] = None
    is_active: bool = True
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: Optional[str] = None

class RecipeCreate(BaseModel):
    """إنشاء وصفة"""
    product_id: str
    ingredients: List[Dict[str, Any]]  # [{material_id, quantity}]
    labor_cost: float = 0
    overhead_cost: float = 0
    portions: int = 1
    preparation_time: int = 0
    instructions: Optional[str] = None
    notes: Optional[str] = None

class StockAlert(BaseModel):
    """تنبيه مخزون"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    material_id: str
    material_name: str
    current_stock: float
    min_stock: float
    unit: str
    alert_type: str  # low_stock, out_of_stock, expiring
    severity: str  # warning, critical
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    is_resolved: bool = False

class StockMovement(BaseModel):
    """حركة مخزون"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    material_id: str
    material_name: str
    movement_type: str  # purchase, usage, adjustment, transfer, waste
    quantity: float
    unit: str
    unit_cost: float
    total_cost: float
    reference_id: Optional[str] = None  # order_id, purchase_id, etc.
    reference_type: Optional[str] = None
    notes: Optional[str] = None
    branch_id: Optional[str] = None
    tenant_id: Optional[str] = None
    created_by: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class CostAnalysis(BaseModel):
    """تحليل التكاليف"""
    product_id: str
    product_name: str
    recipe_cost: float
    selling_price: float
    profit: float
    profit_margin: float
    food_cost_percent: float  # نسبة تكلفة الطعام
    suggested_price: float  # السعر المقترح لهامش ربح معين

# ==================== RAW MATERIAL CATEGORIES ====================

MATERIAL_CATEGORIES = [
    {"id": "meat", "name": "لحوم ودواجن", "icon": "🥩"},
    {"id": "seafood", "name": "مأكولات بحرية", "icon": "🦐"},
    {"id": "vegetables", "name": "خضروات", "icon": "🥬"},
    {"id": "fruits", "name": "فواكه", "icon": "🍎"},
    {"id": "dairy", "name": "ألبان وبيض", "icon": "🥛"},
    {"id": "grains", "name": "حبوب ونشويات", "icon": "🌾"},
    {"id": "spices", "name": "توابل وبهارات", "icon": "🌶️"},
    {"id": "oils", "name": "زيوت ودهون", "icon": "🫒"},
    {"id": "beverages", "name": "مشروبات", "icon": "🥤"},
    {"id": "packaging", "name": "تغليف", "icon": "📦"},
    {"id": "cleaning", "name": "تنظيف", "icon": "🧹"},
    {"id": "general", "name": "عام", "icon": "📋"}
]

UNIT_TYPES = [
    {"id": "kg", "name": "كيلوغرام", "symbol": "كغ"},
    {"id": "g", "name": "غرام", "symbol": "غ"},
    {"id": "l", "name": "لتر", "symbol": "ل"},
    {"id": "ml", "name": "مليلتر", "symbol": "مل"},
    {"id": "piece", "name": "حبة", "symbol": "حبة"},
    {"id": "box", "name": "علبة", "symbol": "علبة"},
    {"id": "pack", "name": "باكيت", "symbol": "باكيت"},
    {"id": "bag", "name": "كيس", "symbol": "كيس"},
    {"id": "bottle", "name": "زجاجة", "symbol": "زجاجة"},
    {"id": "can", "name": "معلبة", "symbol": "معلبة"}
]

# ==================== HELPER FUNCTIONS ====================

def calculate_recipe_cost(ingredients: List[Dict], materials: Dict[str, Any]) -> float:
    """حساب تكلفة الوصفة"""
    total = 0
    for ing in ingredients:
        material = materials.get(ing.get("material_id"))
        if material:
            total += ing.get("quantity", 0) * material.get("unit_cost", 0)
    return round(total, 3)

def calculate_profit_margin(cost: float, price: float) -> float:
    """حساب هامش الربح"""
    if price <= 0:
        return 0
    return round(((price - cost) / price) * 100, 2)

def calculate_food_cost_percent(cost: float, price: float) -> float:
    """حساب نسبة تكلفة الطعام"""
    if price <= 0:
        return 0
    return round((cost / price) * 100, 2)

def suggest_price(cost: float, target_margin: float = 70) -> float:
    """اقتراح سعر بناءً على هامش ربح مستهدف"""
    if target_margin >= 100:
        target_margin = 70
    return round(cost / (1 - (target_margin / 100)), 2)
