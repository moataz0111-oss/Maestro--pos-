"""
Routes Package - تجميع نقاط النهاية
ملاحظة: هذه الملفات جاهزة للاستخدام عند استبدال server.py
حالياً، server.py يحتوي على جميع الـ APIs الأساسية
الملفات الجديدة جاهزة للدمج التدريجي
"""
from fastapi import APIRouter

# Import route modules
try:
    from .auth import router as auth_router
except ImportError:
    auth_router = None

try:
    from .users import router as users_router
except ImportError:
    users_router = None

try:
    from .hr import router as hr_router
except ImportError:
    hr_router = None

try:
    from .branches import router as branches_router
except ImportError:
    branches_router = None

try:
    from .products import router as products_router
except ImportError:
    products_router = None

# New modular routes (Feb 2026)
try:
    from .auth_routes import router as auth_routes_router
except ImportError:
    auth_routes_router = None

try:
    from .user_routes import router as user_routes_router
except ImportError:
    user_routes_router = None

try:
    from .branch_routes import router as branch_routes_router
except ImportError:
    branch_routes_router = None

try:
    from .category_routes import router as category_routes_router
except ImportError:
    category_routes_router = None

try:
    from .product_routes import router as product_routes_router
except ImportError:
    product_routes_router = None

try:
    from .table_routes import router as table_routes_router
except ImportError:
    table_routes_router = None

try:
    from .expense_routes import router as expense_routes_router
except ImportError:
    expense_routes_router = None

try:
    from .shift_routes import router as shift_routes_router
except ImportError:
    shift_routes_router = None

try:
    from .customer_routes import router as customer_routes_router
except ImportError:
    customer_routes_router = None

try:
    from .order_notifications import router as notifications_router
except ImportError:
    notifications_router = None

try:
    from .reports_routes import router as reports_router
except ImportError:
    reports_router = None

try:
    from .external_branches import router as external_branches_router
except ImportError:
    external_branches_router = None

# Create main API router
api_router = APIRouter(prefix="/api")

# Include all available routers
if auth_router:
    api_router.include_router(auth_router)
if users_router:
    api_router.include_router(users_router)
if hr_router:
    api_router.include_router(hr_router)
if branches_router:
    api_router.include_router(branches_router)
if products_router:
    api_router.include_router(products_router)

__all__ = ["api_router"]
