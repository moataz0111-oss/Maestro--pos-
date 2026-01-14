"""
Authentication utilities
"""
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta
from typing import Optional
from fastapi import HTTPException, Depends
from fastapi.security import HTTPBearer

from core.database import db
from core.config import JWT_SECRET, JWT_ALGORITHM, JWT_EXPIRATION_HOURS
from models.schemas import UserRole

security = HTTPBearer()


def hash_password(password: str) -> str:
    """Hash a password using bcrypt"""
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


def verify_password(password: str, hashed: str) -> bool:
    """Verify a password against its hash"""
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))


def create_token(user_id: str, role: str, branch_id: Optional[str] = None) -> str:
    """Create a JWT token"""
    payload = {
        "user_id": user_id,
        "role": role,
        "branch_id": branch_id,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


async def get_current_user(credentials = Depends(security)):
    """Get the current user from the token"""
    try:
        token = credentials.credentials
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user = await db.users.find_one({"id": payload["user_id"]}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=401, detail="المستخدم غير موجود")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="انتهت صلاحية الجلسة")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="رمز غير صالح")


def get_user_tenant_id(user: dict) -> Optional[str]:
    """الحصول على tenant_id للمستخدم - Super Admin لا يحتاج tenant_id"""
    if user.get("role") == UserRole.SUPER_ADMIN:
        return None
    return user.get("tenant_id")


def build_tenant_query(user: dict, base_query: dict = None) -> dict:
    """بناء query مع فلترة tenant_id"""
    query = base_query.copy() if base_query else {}
    tenant_id = get_user_tenant_id(user)
    
    if tenant_id:
        # المستخدم العميل يرى فقط بياناته
        query["tenant_id"] = tenant_id
    else:
        # المستخدم الرئيسي (بدون tenant_id) يرى فقط البيانات الرئيسية
        if user.get("role") != UserRole.SUPER_ADMIN:
            query["$or"] = [{"tenant_id": {"$exists": False}}, {"tenant_id": None}]
    
    return query
