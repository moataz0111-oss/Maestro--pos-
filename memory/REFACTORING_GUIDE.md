# Maestro EGP - Code Refactoring Guide

## الهيكل الجديد (تم إنشاؤه)

```
/backend/
├── server.py              ← الملف الرئيسي (4220 سطر - يعمل)
├── server_backup.py       ← نسخة احتياطية
│
├── core/                  ✅ جاهز
│   ├── database.py        ← اتصال MongoDB
│   └── config.py          ← الإعدادات (JWT, SendGrid, etc.)
│
├── models/                ✅ جاهز
│   ├── schemas.py         ← جميع نماذج Pydantic
│   ├── enums.py           ← UserRole, OrderStatus, etc.
│   ├── user.py, order.py, etc.
│
├── utils/                 ✅ جاهز
│   ├── auth.py            ← hash_password, create_token, get_current_user
│   └── helpers.py         ← build_tenant_query, get_tenant_id
│
├── services/              ✅ جاهز
│   └── email.py           ← SendGrid email service
│
└── api/                   🔄 قيد التطوير
    ├── auth.py            ✅ (register, login, users)
    ├── branches.py        ✅ (branches, kitchen-sections)
    ├── products.py        ✅ (categories, products)
    ├── customers.py       ✅ (customers, by-phone)
    ├── orders.py          ⏳ (سيتم لاحقاً)
    ├── drivers.py         ⏳ (سيتم لاحقاً)
    ├── shifts.py          ⏳ (سيتم لاحقاً)
    ├── reports.py         ⏳ (سيتم لاحقاً)
    ├── settings.py        ⏳ (سيتم لاحقاً)
    ├── super_admin.py     ⏳ (سيتم لاحقاً)
    └── call_center.py     ⏳ (سيتم لاحقاً)
```

## كيفية النقل التدريجي

عند إضافة ميزة جديدة أو إصلاح خطأ:

### 1. إنشاء ملف API جديد
```python
# /api/new_feature.py
from fastapi import APIRouter, Depends
from core.database import db
from utils.auth import get_current_user

router = APIRouter(prefix="/new-feature", tags=["New Feature"])

@router.get("")
async def get_items(current_user: dict = Depends(get_current_user)):
    # ...
```

### 2. استيراده في server.py
```python
# في نهاية server.py
from api.new_feature import router as new_feature_router
api_router.include_router(new_feature_router)
```

### 3. حذف الكود القديم من server.py
بعد التأكد من أن الميزة تعمل من الملف الجديد.

## أقسام server.py الحالية (4220 سطر)

| السطر | القسم |
|-------|-------|
| 41 | Health Check |
| 59-487 | Models (Pydantic) |
| 488-540 | Auth Helpers |
| 541-591 | Email Service |
| 592-610 | Helper Functions |
| 611-655 | Auth Routes |
| 656-701 | User Routes |
| 702-752 | Branch Routes |
| 753-810 | Kitchen Sections |
| 811-849 | Category Routes |
| 850-908 | Product Routes |
| 909-969 | Inventory Routes |
| 970-1018 | Purchase Routes |
| 1019-1071 | Expense Routes |
| 1072-1093 | Operating Cost Routes |
| 1094-1140 | Table Routes |
| 1141-1236 | Customer Routes |
| 1237-1590 | Order Routes |
| 1591-1778 | Shift Routes |
| 1779-2088 | Cash Register Close |
| 2089-2312 | Driver Routes |
| 2313-2447 | Driver Portal APIs |
| 2448-2491 | Delivery App Settings |
| 2492-3027 | Reports |
| 3028-3090 | Cash Register Routes |
| 3091-3166 | Settings Routes |
| 3167-3195 | Printer Routes |
| 3196-3874 | Super Admin & Tenant |
| 3875-4104 | Call Center |
| 4105-4221 | Seed Data |
| 4222-4228 | Root |

## الأولوية للنقل

1. **عالية**: Orders, Drivers, Call Center (أكثر استخداماً)
2. **متوسطة**: Reports, Shifts, Super Admin
3. **منخفضة**: Settings, Inventory, Expenses
