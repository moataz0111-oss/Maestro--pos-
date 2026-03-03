# Inventory Models - نماذج المخزون والمشتريات
from pydantic import BaseModel, ConfigDict, EmailStr
from typing import List, Optional, Dict, Any

# ==================== INVENTORY MODELS ====================

class InventoryItemCreate(BaseModel):
    """نموذج إنشاء عنصر مخزون"""
    name: str
    name_en: Optional[str] = None
    unit: str
    quantity: float = 0.0
    min_quantity: float = 0.0
    cost_per_unit: float = 0.0
    branch_id: str
    item_type: str = "raw"  # raw or finished

class InventoryResponse(BaseModel):
    """نموذج استجابة المخزون"""
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    name_en: Optional[str] = None
    unit: str
    quantity: float
    min_quantity: float
    cost_per_unit: float
    branch_id: str
    item_type: str
    last_updated: str

class InventoryTransaction(BaseModel):
    """نموذج معاملة المخزون"""
    inventory_id: str
    transaction_type: str  # in or out
    quantity: float
    notes: Optional[str] = None

# ==================== PURCHASE MODELS ====================

class PurchaseCreate(BaseModel):
    """نموذج إنشاء مشتريات"""
    supplier_name: str
    invoice_number: Optional[str] = None
    items: List[Dict[str, Any]]
    total_amount: float
    payment_method: str = "cash"
    payment_status: str = "paid"
    notes: Optional[str] = None
    branch_id: str

class PurchaseResponse(BaseModel):
    """نموذج استجابة المشتريات"""
    model_config = ConfigDict(extra="ignore")
    id: str
    supplier_name: str
    invoice_number: Optional[str] = None
    items: List[Dict[str, Any]]
    total_amount: float
    payment_method: str
    payment_status: str
    notes: Optional[str] = None
    branch_id: str
    created_by: str
    created_at: str

# ==================== EXPENSE MODELS ====================

class ExpenseCreate(BaseModel):
    """نموذج إنشاء مصروف"""
    category: str
    description: str
    amount: float
    payment_method: str = "cash"
    reference_number: Optional[str] = None
    branch_id: str
    date: Optional[str] = None

class ExpenseResponse(BaseModel):
    """نموذج استجابة المصروف"""
    model_config = ConfigDict(extra="ignore")
    id: str
    category: str
    description: str
    amount: float
    payment_method: str
    reference_number: Optional[str] = None
    branch_id: str
    created_by: str
    date: str
    created_at: str

# ==================== OPERATING COST MODELS ====================

class OperatingCostCreate(BaseModel):
    """نموذج التكاليف التشغيلية"""
    name: str
    cost_type: str  # fixed or variable
    amount: float
    frequency: str  # daily, weekly, monthly
    branch_id: str

# ==================== INVENTORY TRANSFER MODELS ====================

class InventoryTransferCreate(BaseModel):
    """نموذج تحويل مخزون"""
    from_branch_id: str
    to_branch_id: str
    items: List[Dict[str, Any]]
    transfer_type: str = "warehouse_to_branch"
    notes: Optional[str] = None

class InventoryTransferResponse(BaseModel):
    """نموذج استجابة تحويل المخزون"""
    model_config = ConfigDict(extra="ignore")
    id: str
    transfer_number: int
    from_branch_id: str
    from_branch_name: Optional[str] = None
    to_branch_id: str
    to_branch_name: Optional[str] = None
    items: List[Dict[str, Any]]
    transfer_type: str
    status: str
    created_by: str
    created_at: str
    approved_by: Optional[str] = None
    approved_at: Optional[str] = None
    shipped_at: Optional[str] = None
    received_at: Optional[str] = None

# ==================== PURCHASE REQUEST MODELS ====================

class PurchaseRequestCreate(BaseModel):
    """نموذج طلب شراء"""
    branch_id: str
    items: List[Dict[str, Any]]
    notes: Optional[str] = None

class PurchaseRequestResponse(BaseModel):
    """نموذج استجابة طلب الشراء"""
    model_config = ConfigDict(extra="ignore")
    id: str
    request_number: int
    branch_id: str
    branch_name: Optional[str] = None
    items: List[Dict[str, Any]]
    status: str
    notes: Optional[str] = None
    created_by: str
    created_at: str
    approved_by: Optional[str] = None
    approved_at: Optional[str] = None

# ==================== SUPPLIER MODELS ====================

class SupplierCreate(BaseModel):
    """نموذج إنشاء مورد"""
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None

class SupplierUpdate(BaseModel):
    """نموذج تحديث مورد"""
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None

# ==================== RAW MATERIAL MODELS ====================

class RawMaterialCreate(BaseModel):
    """نموذج إنشاء مادة خام"""
    name: str
    name_en: Optional[str] = None
    unit: str
    category: Optional[str] = None
    cost_per_unit: float = 0.0
    min_quantity: float = 0.0
    supplier_id: Optional[str] = None
