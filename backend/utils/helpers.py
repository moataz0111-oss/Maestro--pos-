"""
Helper functions
"""
from typing import Optional

def get_tenant_id(user: dict) -> Optional[str]:
    """Get tenant_id from user, returns None for system admins"""
    if user.get("role") == "super_admin":
        return None
    return user.get("tenant_id")

def build_tenant_query(user: dict, base_query: dict = None) -> dict:
    """Build a query with tenant filtering"""
    query = base_query.copy() if base_query else {}
    tenant_id = get_tenant_id(user)
    
    if tenant_id:
        query["tenant_id"] = tenant_id
    elif user.get("role") != "super_admin":
        # For main system users (no tenant_id), filter for null tenant_id
        query["tenant_id"] = None
    # For super_admin, don't add tenant filter - can see all
    
    return query
