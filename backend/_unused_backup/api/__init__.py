"""
API Routes Package
All API routes are organized in separate files for better maintainability.
"""
from fastapi import APIRouter

# Main API router
router = APIRouter(prefix="/api")

# Import and include routers from separate files
# These will be added as we migrate routes from server.py

# from .auth import router as auth_router
# from .branches import router as branches_router
# from .products import router as products_router
# from .customers import router as customers_router
# from .orders import router as orders_router
# from .drivers import router as drivers_router
# from .shifts import router as shifts_router
# from .reports import router as reports_router
# from .settings import router as settings_router
# from .super_admin import router as super_admin_router
# from .call_center import router as call_center_router

# router.include_router(auth_router)
# router.include_router(branches_router)
# ... etc
