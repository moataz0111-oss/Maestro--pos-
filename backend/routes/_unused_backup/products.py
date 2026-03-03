"""
Products Routes - نقاط نهاية المنتجات والفئات
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from datetime import datetime, timezone
import uuid

from core.database import db
from models.schemas import (
    CategoryCreate, CategoryResponse,
    ProductCreate, ProductResponse
)
from utils.auth import get_current_user, build_tenant_query, get_user_tenant_id
from models.enums import UserRole

router = APIRouter(tags=["Products & Categories"])


# ==================== الفئات ====================

@router.post("/categories", response_model=CategoryResponse)
async def create_category(category: CategoryCreate, current_user: dict = Depends(get_current_user)):
    """إنشاء فئة جديدة"""
    if current_user["role"] not in [UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    cat_doc = {
        "id": str(uuid.uuid4()),
        **category.model_dump(),
        "tenant_id": get_user_tenant_id(current_user),
        "is_active": True
    }
    await db.categories.insert_one(cat_doc)
    del cat_doc["_id"]
    return cat_doc


@router.get("/categories", response_model=List[CategoryResponse])
async def get_categories(current_user: dict = Depends(get_current_user)):
    """جلب قائمة الفئات"""
    query = build_tenant_query(current_user)
    categories = await db.categories.find(query, {"_id": 0}).sort("sort_order", 1).to_list(100)
    return categories


@router.put("/categories/{category_id}")
async def update_category(category_id: str, category: CategoryCreate, current_user: dict = Depends(get_current_user)):
    """تحديث فئة"""
    if current_user["role"] not in [UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    query = build_tenant_query(current_user, {"id": category_id})
    await db.categories.update_one(query, {"$set": category.model_dump()})
    return await db.categories.find_one({"id": category_id}, {"_id": 0})


@router.delete("/categories/{category_id}")
async def delete_category(category_id: str, current_user: dict = Depends(get_current_user)):
    """حذف فئة"""
    if current_user["role"] not in [UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    query = build_tenant_query(current_user, {"id": category_id})
    await db.categories.delete_one(query)
    return {"message": "تم الحذف"}


# ==================== المنتجات ====================

@router.post("/products", response_model=ProductResponse)
async def create_product(product: ProductCreate, current_user: dict = Depends(get_current_user)):
    """إنشاء منتج جديد"""
    if current_user["role"] not in [UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    profit = product.price - product.cost - product.operating_cost
    
    prod_doc = {
        "id": str(uuid.uuid4()),
        **product.model_dump(),
        "tenant_id": get_user_tenant_id(current_user),
        "profit": profit
    }
    await db.products.insert_one(prod_doc)
    del prod_doc["_id"]
    return prod_doc


@router.get("/products", response_model=List[ProductResponse])
async def get_products(category_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """جلب قائمة المنتجات"""
    query = build_tenant_query(current_user)
    if category_id:
        query["category_id"] = category_id
    
    products = await db.products.find(query, {"_id": 0}).to_list(1000)
    
    for p in products:
        p["profit"] = p.get("price", 0) - p.get("cost", 0) - p.get("operating_cost", 0)
    
    return products


@router.get("/products/{product_id}")
async def get_product(product_id: str, current_user: dict = Depends(get_current_user)):
    """جلب منتج محدد"""
    query = build_tenant_query(current_user, {"id": product_id})
    product = await db.products.find_one(query, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="المنتج غير موجود")
    
    product["profit"] = product.get("price", 0) - product.get("cost", 0) - product.get("operating_cost", 0)
    return product


@router.put("/products/{product_id}")
async def update_product(product_id: str, product: ProductCreate, current_user: dict = Depends(get_current_user)):
    """تحديث منتج"""
    if current_user["role"] not in [UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    profit = product.price - product.cost - product.operating_cost
    update_data = {**product.model_dump(), "profit": profit}
    
    query = build_tenant_query(current_user, {"id": product_id})
    await db.products.update_one(query, {"$set": update_data})
    return await db.products.find_one({"id": product_id}, {"_id": 0})


@router.delete("/products/{product_id}")
async def delete_product(product_id: str, current_user: dict = Depends(get_current_user)):
    """حذف منتج"""
    if current_user["role"] not in [UserRole.ADMIN, UserRole.MANAGER]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    await db.products.delete_one({"id": product_id})
    return {"message": "تم الحذف"}
