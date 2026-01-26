# Tenant Models - نماذج العملاء/المستأجرين
from pydantic import BaseModel, ConfigDict, EmailStr
from typing import List, Optional, Dict, Any

# ==================== TENANT MODELS ====================

class TenantCreate(BaseModel):
    """نموذج إنشاء عميل جديد"""
    name: str  # اسم المطعم/الكافيه
    name_ar: Optional[str] = None
    name_en: Optional[str] = None
    slug: str  # رابط فريد
    owner_name: str
    owner_email: EmailStr
    owner_phone: str
    subscription_type: str = "trial"  # trial, basic, premium, demo
    max_branches: int = 1
    max_users: int = 5
    logo_url: Optional[str] = None
    is_demo: bool = False  # هل هو حساب تجريبي

class TenantFeatures(BaseModel):
    """ميزات العميل المتاحة"""
    # الميزات الأساسية
    showPOS: bool = True
    showTables: bool = True
    showOrders: bool = True
    showExpenses: bool = True
    showInventory: bool = True
    showDelivery: bool = True
    showReports: bool = True
    showSettings: bool = True
    showKitchen: bool = False
    # الميزات المتقدمة
    showHR: bool = False
    showWarehouse: bool = False
    showCallLogs: bool = False
    showCallCenter: bool = False
    showLoyalty: bool = True
    showCoupons: bool = True
    showRecipes: bool = False
    showReservations: bool = True
    # ميزات إضافية
    showReviews: bool = True
    showSmartReports: bool = True
    showPurchasing: bool = False
    showBranchOrders: bool = False
    # خيارات الإعدادات
    settingsUsers: bool = True
    settingsCustomers: bool = True
    settingsBranches: bool = True
    settingsCategories: bool = True
    settingsProducts: bool = True
    settingsPrinters: bool = True
    settingsDeliveryCompanies: bool = True
    settingsCallCenter: bool = True
    settingsNotifications: bool = True

class TenantResponse(BaseModel):
    """نموذج استجابة العميل"""
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    name_ar: Optional[str] = None
    name_en: Optional[str] = None
    slug: str
    owner_name: str
    owner_email: str
    owner_phone: str
    subscription_type: str
    max_branches: int
    max_users: int
    is_active: bool
    created_at: str
    expires_at: Optional[str] = None
    logo_url: Optional[str] = None
