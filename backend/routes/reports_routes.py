"""
Reports Routes - تقارير المبيعات والمشتريات والمصروفات
"""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
from io import BytesIO
import logging

from .shared import (
    get_database, get_current_user, get_user_tenant_id, 
    build_tenant_query, build_branch_query,
    UserRole, OrderStatus
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/reports", tags=["Reports"])

# ==================== SALES REPORT ====================
@router.get("/sales")
async def get_sales_report(
    branch_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    db = get_database()
    tenant_id = get_user_tenant_id(current_user)
    
    # استبعاد الملغية والمرتجعة
    query = {"status": {"$nin": ["cancelled", "refunded"]}, "is_refunded": {"$ne": True}}
    
    if tenant_id:
        query["tenant_id"] = tenant_id
    else:
        query["$or"] = [{"tenant_id": {"$exists": False}}, {"tenant_id": None}]
    
    user_branch_id = current_user.get("branch_id")
    user_role = current_user.get("role")
    
    if user_branch_id and user_role not in [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER]:
        query["branch_id"] = user_branch_id
    elif branch_id:
        query["branch_id"] = branch_id
    
    if start_date:
        query["created_at"] = {"$gte": start_date}
    if end_date:
        query.setdefault("created_at", {})["$lte"] = end_date + "T23:59:59"
    
    # تحسين الأداء: استخدام projection لجلب الحقول المطلوبة فقط
    projection = {
        "_id": 0,
        "total": 1,
        "total_cost": 1,
        "profit": 1,
        "payment_method": 1,
        "payment_status": 1,
        "order_type": 1,
        "delivery_app": 1,
        "delivery_app_name": 1,
        "delivery_commission": 1,
        "is_delivery_company": 1,
        "driver_id": 1,
        "driver_name": 1,
        "packaging_cost": 1,
        "customer_name": 1,
        "created_at": 1,
        "items": 1
    }
    orders = await db.orders.find(query, projection).to_list(10000)
    
    delivery_apps = await db.delivery_apps.find({}, {"_id": 0}).to_list(100)
    app_names = {app["id"]: app["name"] for app in delivery_apps}
    
    def _sn(val):
        if val is None:
            return 0
        try:
            return float(val)
        except (TypeError, ValueError):
            return 0
    
    # فصل الطلبات المدفوعة/الآجلة عن المعلقة
    paid_orders = [o for o in orders if o.get("payment_status") in ["paid", "credit", None]]
    pending_orders = [o for o in orders if o.get("payment_status") == "pending"]
    
    total_sales = sum(_sn(o.get("total")) for o in paid_orders)
    total_cost = sum(_sn(o.get("total_cost")) for o in paid_orders)
    total_packaging_cost = sum(_sn(o.get("packaging_cost")) for o in paid_orders)
    total_materials_cost = total_cost - total_packaging_cost
    total_profit = sum(_sn(o.get("profit")) for o in paid_orders)
    total_orders = len(paid_orders)
    avg_order_value = total_sales / total_orders if total_orders > 0 else 0
    
    by_payment = {}
    by_type = {}
    by_app = {}
    by_date = {}
    by_product = {}
    
    # تحويل أسماء طرق الدفع للعربية
    payment_method_names = {
        "cash": "نقدي",
        "card": "بطاقة",
        "credit": "آجل",
    }
    
    # شركات التوصيل الافتراضية (للتحويل من المعرف للاسم)
    default_delivery_apps_names = {
        "toters": "توترز",
        "talabat": "طلبات",
        "baly": "بالي",
        "alsaree3": "عالسريع",
        "talabati": "طلباتي",
    }
    
    for o in paid_orders:
        pm = o.get("payment_method", "cash")
        order_total = _sn(o.get("total"))
        
        # التحقق إذا كان الطلب لشركة توصيل
        is_company = o.get("is_delivery_company", False) or o.get("delivery_app") or o.get("delivery_app_name")
        has_driver = o.get("driver_id") and o.get("order_type") == "delivery" and not is_company
        
        # تحديد اسم طريقة الدفع
        if pm == "credit" and is_company:
            # آجل شركات توصيل - يظهر باسم الشركة
            app_name = o.get("delivery_app_name")
            if not app_name and o.get("delivery_app"):
                app_name = default_delivery_apps_names.get(o.get("delivery_app"), app_names.get(o.get("delivery_app"), "شركات توصيل"))
            if not app_name:
                app_name = o.get("customer_name") or "شركات توصيل"
            pm_display = app_name
        elif pm == "credit" and has_driver:
            # توصيل سائقين عاديين (ليس شركة)
            pm_display = "توصيل سائقين"
        else:
            # طريقة دفع عادية
            pm_display = payment_method_names.get(pm, pm)
        
        by_payment[pm_display] = by_payment.get(pm_display, 0) + order_total
        
        ot = o.get("order_type", "unknown")
        by_type[ot] = by_type.get(ot, 0) + order_total
        
        if is_company:
            app_id = o.get("delivery_app")
            app_name = o.get("delivery_app_name")
            if not app_name and app_id:
                app_name = default_delivery_apps_names.get(app_id, app_names.get(app_id, app_id))
            if not app_name:
                app_name = o.get("customer_name") or "شركة توصيل"
            
            if app_name not in by_app:
                by_app[app_name] = {
                    "total_sales": 0, "total_commission": 0, "net_amount": 0,
                    "orders_count": 0, "paid_orders": 0, "credit_orders": 0
                }
            by_app[app_name]["total_sales"] += order_total
            by_app[app_name]["total_commission"] += _sn(o.get("delivery_commission"))
            by_app[app_name]["net_amount"] += order_total - _sn(o.get("delivery_commission"))
            by_app[app_name]["orders_count"] += 1
            if o.get("payment_status") == "paid":
                by_app[app_name]["paid_orders"] += 1
            else:
                by_app[app_name]["credit_orders"] += 1
        
        date = (o.get("created_at") or "")[:10]
        if date and date not in by_date:
            by_date[date] = {"sales": 0, "orders": 0, "profit": 0, "packaging_cost": 0}
        if date:
            by_date[date]["sales"] += order_total
            by_date[date]["orders"] += 1
            by_date[date]["profit"] += _sn(o.get("profit"))
            by_date[date]["packaging_cost"] += _sn(o.get("packaging_cost"))
        
        for item in o.get("items", []):
            pid = item.get("product_name") or item.get("name") or "غير معروف"
            if pid not in by_product:
                by_product[pid] = {"quantity": 0, "revenue": 0}
            by_product[pid]["quantity"] += item.get("quantity", 0)
            by_product[pid]["revenue"] += _sn(item.get("price")) * item.get("quantity", 0)
    
    # إضافة المعلقة كبند منفصل
    pending_total = sum(_sn(o.get("total")) for o in pending_orders)
    if pending_total > 0:
        by_payment["معلق"] = pending_total
    
    total_delivery_sales = sum(app["total_sales"] for app in by_app.values())
    total_delivery_commission = sum(app["total_commission"] for app in by_app.values())
    total_delivery_net = sum(app["net_amount"] for app in by_app.values())
    
    return {
        "total_sales": total_sales,
        "total_cost": total_cost,
        "total_materials_cost": total_materials_cost,  # تكلفة المواد
        "total_packaging_cost": total_packaging_cost,  # تكلفة التغليف
        "total_profit": total_profit,
        "profit_margin": (total_profit / total_sales * 100) if total_sales > 0 else 0,
        "total_orders": total_orders,
        "average_order_value": avg_order_value,
        "by_payment_method": by_payment,
        "by_order_type": by_type,
        "by_delivery_app": by_app,
        "delivery_summary": {
            "total_sales": total_delivery_sales,
            "total_commission": total_delivery_commission,
            "net_amount": total_delivery_net
        },
        "by_date": by_date,
        "top_products": dict(sorted(by_product.items(), key=lambda x: x[1]["revenue"], reverse=True)[:10])
    }

# ==================== PURCHASES REPORT ====================
@router.get("/purchases")
async def get_purchases_report(
    branch_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    db = get_database()
    tenant_id = get_user_tenant_id(current_user)
    query = {}
    
    if tenant_id:
        query["tenant_id"] = tenant_id
    
    user_branch_id = current_user.get("branch_id")
    user_role = current_user.get("role")
    
    if user_branch_id and user_role not in [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER]:
        query["branch_id"] = user_branch_id
    elif branch_id:
        query["branch_id"] = branch_id
    
    if start_date:
        query["created_at"] = {"$gte": start_date}
    if end_date:
        query.setdefault("created_at", {})["$lte"] = end_date + "T23:59:59"
    
    purchases = await db.purchases.find(query, {"_id": 0}).to_list(1000)
    
    total_purchases = sum(p["total_amount"] for p in purchases)
    by_supplier = {}
    by_date = {}
    by_payment_status = {"paid": 0, "pending": 0, "partial": 0}
    
    for p in purchases:
        supplier = p.get("supplier_name", "غير محدد")
        by_supplier[supplier] = by_supplier.get(supplier, 0) + p["total_amount"]
        
        date = p["created_at"][:10]
        by_date[date] = by_date.get(date, 0) + p["total_amount"]
        
        status = p.get("payment_status", "paid")
        by_payment_status[status] = by_payment_status.get(status, 0) + p["total_amount"]
    
    return {
        "total_purchases": total_purchases,
        "total_transactions": len(purchases),
        "by_supplier": by_supplier,
        "by_date": by_date,
        "by_payment_status": by_payment_status
    }

# ==================== INVENTORY REPORT ====================
@router.get("/inventory")
async def get_inventory_report(branch_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    db = get_database()
    tenant_id = get_user_tenant_id(current_user)
    query = {}
    
    if tenant_id:
        query["tenant_id"] = tenant_id
    else:
        query["$or"] = [{"tenant_id": {"$exists": False}}, {"tenant_id": None}]
    
    user_branch_id = current_user.get("branch_id")
    user_role = current_user.get("role")
    
    if user_branch_id and user_role not in [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER]:
        query["branch_id"] = user_branch_id
    elif branch_id:
        query["branch_id"] = branch_id
    
    items = await db.inventory.find(query, {"_id": 0}).to_list(1000)
    
    low_stock = [i for i in items if i["quantity"] <= i["min_quantity"]]
    raw_materials = [i for i in items if i.get("item_type") == "raw"]
    finished_products = [i for i in items if i.get("item_type") == "finished"]
    
    total_value = sum(i["quantity"] * i["cost_per_unit"] for i in items)
    raw_value = sum(i["quantity"] * i["cost_per_unit"] for i in raw_materials)
    finished_value = sum(i["quantity"] * i["cost_per_unit"] for i in finished_products)
    
    return {
        "total_items": len(items),
        "raw_materials_count": len(raw_materials),
        "finished_products_count": len(finished_products),
        "low_stock_count": len(low_stock),
        "low_stock_items": low_stock,
        "total_inventory_value": total_value,
        "raw_materials_value": raw_value,
        "finished_products_value": finished_value,
        "items": items
    }

# ==================== EXPENSES REPORT ====================
@router.get("/expenses")
async def get_expenses_report(
    branch_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    db = get_database()
    tenant_id = get_user_tenant_id(current_user)
    query = {}
    
    if tenant_id:
        query["tenant_id"] = tenant_id
    else:
        query["$or"] = [{"tenant_id": {"$exists": False}}, {"tenant_id": None}]
    
    user_branch_id = current_user.get("branch_id")
    user_role = current_user.get("role")
    
    if user_branch_id and user_role not in [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER]:
        query["branch_id"] = user_branch_id
    elif branch_id:
        query["branch_id"] = branch_id
    
    if start_date:
        query["date"] = {"$gte": start_date}
    if end_date:
        query.setdefault("date", {})["$lte"] = end_date
    
    expenses = await db.expenses.find(query, {"_id": 0}).to_list(1000)
    
    total_expenses = sum(e["amount"] for e in expenses)
    by_category = {}
    by_date = {}
    
    for e in expenses:
        cat = e.get("category", "other")
        by_category[cat] = by_category.get(cat, 0) + e["amount"]
        
        date = e.get("date", e["created_at"][:10])
        by_date[date] = by_date.get(date, 0) + e["amount"]
    
    return {
        "total_expenses": total_expenses,
        "total_transactions": len(expenses),
        "by_category": by_category,
        "by_date": by_date,
        "expenses": expenses
    }

# ==================== PROFIT/LOSS REPORT ====================
@router.get("/profit-loss")
async def get_profit_loss_report(
    branch_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    db = get_database()
    tenant_id = get_user_tenant_id(current_user)
    
    sales_query = {"status": {"$ne": OrderStatus.CANCELLED}}
    
    if tenant_id:
        sales_query["tenant_id"] = tenant_id
    else:
        sales_query["$or"] = [{"tenant_id": {"$exists": False}}, {"tenant_id": None}]
    
    user_branch_id = current_user.get("branch_id")
    user_role = current_user.get("role")
    
    if user_branch_id and user_role not in [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER]:
        sales_query["branch_id"] = user_branch_id
    elif branch_id:
        sales_query["branch_id"] = branch_id
    
    if start_date:
        sales_query["created_at"] = {"$gte": start_date}
    if end_date:
        sales_query.setdefault("created_at", {})["$lte"] = end_date + "T23:59:59"
    
    orders = await db.orders.find(sales_query, {"_id": 0}).to_list(10000)
    
    total_revenue = sum(o["total"] for o in orders)
    total_cost_of_goods = sum(o.get("total_cost", 0) for o in orders)
    delivery_commissions = sum(o.get("delivery_commission", 0) for o in orders)
    gross_profit = total_revenue - total_cost_of_goods - delivery_commissions
    
    # جلب المصاريف
    expense_query = {}
    if tenant_id:
        expense_query["tenant_id"] = tenant_id
    else:
        expense_query["$or"] = [{"tenant_id": {"$exists": False}}, {"tenant_id": None}]
    
    if user_branch_id and user_role not in [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER]:
        expense_query["branch_id"] = user_branch_id
    elif branch_id:
        expense_query["branch_id"] = branch_id
    
    if start_date:
        expense_query["date"] = {"$gte": start_date}
    if end_date:
        expense_query.setdefault("date", {})["$lte"] = end_date
    
    expenses = await db.expenses.find(expense_query, {"_id": 0}).to_list(1000)
    total_expenses = sum(e["amount"] for e in expenses)
    
    # ==================== حساب التكاليف التشغيلية ====================
    # جلب الفروع للحصول على التكاليف الثابتة
    branches_query = {"tenant_id": tenant_id, "is_active": {"$ne": False}}
    if branch_id:
        branches_query["id"] = branch_id
    elif user_branch_id and user_role not in [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER]:
        branches_query["id"] = user_branch_id
    
    branches = await db.branches.find(branches_query, {"_id": 0}).to_list(100)
    
    # حساب التكاليف الثابتة الشهرية
    total_rent = sum(b.get("rent_cost", 0) for b in branches)
    total_electricity = sum(b.get("electricity_cost", 0) for b in branches)
    total_water = sum(b.get("water_cost", 0) for b in branches)
    total_generator = sum(b.get("generator_cost", 0) for b in branches)
    total_fixed_costs = total_rent + total_electricity + total_water + total_generator
    
    # حساب الرواتب (لجميع الموظفين في الفروع المحددة)
    employees_query = {"tenant_id": tenant_id, "is_active": {"$ne": False}}
    if branch_id:
        employees_query["branch_id"] = branch_id
    elif user_branch_id and user_role not in [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER]:
        employees_query["branch_id"] = user_branch_id
    
    employees = await db.employees.find(employees_query, {"_id": 0, "salary": 1}).to_list(1000)
    total_salaries = sum(e.get("salary", 0) for e in employees)
    
    # حساب عدد الأيام في الفترة
    from datetime import datetime, timezone
    if start_date and end_date:
        try:
            start_dt = datetime.fromisoformat(start_date)
            end_dt = datetime.fromisoformat(end_date)
            days_in_period = (end_dt - start_dt).days + 1
        except Exception:
            days_in_period = 30
    else:
        days_in_period = 30
    
    # حساب التكاليف التشغيلية حسب الفترة
    if days_in_period > 0:
        daily_fixed_costs = total_fixed_costs / 30
        daily_salaries = total_salaries / 30
        period_fixed_costs = daily_fixed_costs * days_in_period
        period_salaries = daily_salaries * days_in_period
    else:
        period_fixed_costs = total_fixed_costs
        period_salaries = total_salaries
    
    total_operating_costs = period_fixed_costs + period_salaries + total_expenses
    
    # صافي الربح بعد كل التكاليف
    net_profit = gross_profit - total_operating_costs
    
    return {
        "revenue": {"total_sales": total_revenue, "order_count": len(orders)},
        "cost_of_goods_sold": {
            "total": total_cost_of_goods,
            "percentage": (total_cost_of_goods / total_revenue * 100) if total_revenue > 0 else 0
        },
        "delivery_commissions": delivery_commissions,
        "gross_profit": {
            "amount": gross_profit,
            "margin": (gross_profit / total_revenue * 100) if total_revenue > 0 else 0
        },
        "operating_expenses": {
            "total": total_expenses,
            "breakdown": {}
        },
        "fixed_costs": {
            "rent": {"monthly": total_rent, "period": period_fixed_costs * (total_rent / total_fixed_costs) if total_fixed_costs > 0 else 0},
            "electricity": {"monthly": total_electricity, "period": period_fixed_costs * (total_electricity / total_fixed_costs) if total_fixed_costs > 0 else 0},
            "water": {"monthly": total_water, "period": period_fixed_costs * (total_water / total_fixed_costs) if total_fixed_costs > 0 else 0},
            "generator": {"monthly": total_generator, "period": period_fixed_costs * (total_generator / total_fixed_costs) if total_fixed_costs > 0 else 0},
            "total_monthly": total_fixed_costs,
            "total_period": period_fixed_costs
        },
        "salaries": {
            "total_monthly": total_salaries,
            "total_period": period_salaries,
            "employees_count": len(employees)
        },
        "total_operating_costs": {
            "fixed_costs": period_fixed_costs,
            "salaries": period_salaries,
            "other_expenses": total_expenses,
            "total": total_operating_costs
        },
        "net_profit": {
            "amount": net_profit,
            "margin": (net_profit / total_revenue * 100) if total_revenue > 0 else 0
        },
        "period_days": days_in_period
    }

# ==================== DELIVERY CREDITS REPORT ====================
@router.get("/delivery-credits")
async def get_delivery_credits_report(
    delivery_app: Optional[str] = None,
    branch_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    db = get_database()
    tenant_id = get_user_tenant_id(current_user)
    
    # البحث عن جميع طلبات شركات التوصيل فقط (بدون السائقين العاديين)
    delivery_filter = {
        "$or": [
            {"delivery_app": {"$ne": None, "$exists": True}},
            {"delivery_app_name": {"$ne": None, "$exists": True}},
            {"is_delivery_company": True},
            {"delivery_commission": {"$gt": 0}}
        ]
    }
    
    query = {"$and": [delivery_filter]}
    # استبعاد الملغية والمرتجعة
    query["$and"].append({"status": {"$nin": ["cancelled", "refunded"]}})
    
    if tenant_id:
        query["$and"].append({"tenant_id": tenant_id})
    else:
        query["$and"].append({"$or": [{"tenant_id": {"$exists": False}}, {"tenant_id": None}]})
    
    user_branch_id = current_user.get("branch_id")
    user_role = current_user.get("role")
    
    if user_branch_id and user_role not in [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER]:
        query["branch_id"] = user_branch_id
    elif branch_id:
        query["branch_id"] = branch_id
    
    if delivery_app:
        query["delivery_app"] = delivery_app
    if start_date:
        query["created_at"] = {"$gte": start_date}
    if end_date:
        query.setdefault("created_at", {})["$lte"] = end_date + "T23:59:59"
    
    orders = await db.orders.find(query, {"_id": 0}).to_list(10000)
    
    delivery_apps_list = await db.delivery_apps.find({}, {"_id": 0}).to_list(100)
    app_names = {app["id"]: app["name"] for app in delivery_apps_list}
    app_rates = {app["id"]: app["commission_rate"] for app in delivery_apps_list}
    
    # جلب سجلات التحصيل للتوصيل
    collections_query = {"collection_type": "delivery"}
    if tenant_id:
        collections_query["tenant_id"] = tenant_id
    if start_date:
        collections_query["date"] = {"$gte": start_date}
    if end_date:
        collections_query.setdefault("date", {})["$lte"] = end_date
    
    delivery_collections = await db.delivery_collections.find(collections_query, {"_id": 0}).to_list(1000)
    
    # حساب المبالغ المحصلة لكل شركة توصيل
    collected_by_app = {}
    for c in delivery_collections:
        app_id = c.get("delivery_app_id")
        collected_by_app[app_id] = collected_by_app.get(app_id, 0) + c.get("amount", 0)
    
    # شركات التوصيل الافتراضية (للتحويل من المعرف للاسم)
    default_delivery_apps_names = {
        "toters": "توترز",
        "talabat": "طلبات",
        "baly": "بالي",
        "alsaree3": "عالسريع",
        "talabati": "طلباتي",
    }
    
    by_app = {}
    for o in orders:
        app_id = o.get("delivery_app")
        # استخدام الاسم المحفوظ أو تحويل المعرف للاسم
        app_name = o.get("delivery_app_name")
        if not app_name and app_id:
            app_name = default_delivery_apps_names.get(app_id, app_names.get(app_id, app_id))
        if not app_name:
            app_name = o.get("customer_name") or "شركة توصيل"
        
        if app_name not in by_app:
            by_app[app_name] = {
                "id": app_id, "commission_rate": app_rates.get(app_id, 0),
                "count": 0, "total": 0, "commission": 0, "net_amount": 0,
                "paid_count": 0, "credit_count": 0, "paid_amount": 0, "credit_amount": 0,
                "collected_amount": 0, "remaining_amount": 0,
                "orders": []
            }
        
        by_app[app_name]["count"] += 1
        by_app[app_name]["total"] += o["total"]
        by_app[app_name]["commission"] += o.get("delivery_commission", 0)
        by_app[app_name]["net_amount"] += o["total"] - o.get("delivery_commission", 0)
        
        # جميع طلبات التوصيل تعتبر آجلة حتى يتم تحصيلها
        is_collected = o.get("delivery_collected", False)
        if is_collected:
            by_app[app_name]["paid_count"] += 1
            by_app[app_name]["paid_amount"] += o["total"] - o.get("delivery_commission", 0)
        else:
            by_app[app_name]["credit_count"] += 1
            by_app[app_name]["credit_amount"] += o["total"] - o.get("delivery_commission", 0)
        
        by_app[app_name]["orders"].append({
            "id": o.get("id"),
            "order_number": o["order_number"],
            "total": o["total"],
            "commission": o.get("delivery_commission", 0),
            "net": o["total"] - o.get("delivery_commission", 0),
            "delivery_collected": is_collected,
            "created_at": o["created_at"]
        })
    
    # إضافة المبالغ المحصلة لكل شركة
    for app_name, data in by_app.items():
        app_id = data["id"]
        data["collected_amount"] = collected_by_app.get(app_id, 0)
        data["remaining_amount"] = data["net_amount"] - data["collected_amount"]
    
    total_all = sum(o["total"] for o in orders)
    total_commission = sum(o.get("delivery_commission", 0) for o in orders)
    total_net = total_all - total_commission
    total_collected = sum(collected_by_app.values())
    total_remaining = total_net - total_collected
    
    return {
        "total_sales": total_all,  # إجمالي المبيعات قبل الاستقطاع
        "total_commission": total_commission,  # العمولة المستقطعة
        "net_receivable": total_net,  # صافي المستحق (بعد الاستقطاع)
        "total_collected": total_collected,  # المبلغ المحصل
        "total_remaining": total_remaining,  # المتبقي للتحصيل
        "total_orders": len(orders),
        "by_delivery_app": by_app,
        "collections": delivery_collections
    }

# ==================== PRODUCTS REPORT ====================
@router.get("/products")
async def get_products_report(
    branch_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    db = get_database()
    tenant_id = get_user_tenant_id(current_user)
    
    product_query = {}
    if tenant_id:
        product_query["tenant_id"] = tenant_id
    else:
        product_query["$or"] = [{"tenant_id": {"$exists": False}}, {"tenant_id": None}]
    
    products = await db.products.find(product_query, {"_id": 0}).to_list(1000)
    
    order_query = {"status": {"$ne": OrderStatus.CANCELLED}}
    
    if tenant_id:
        order_query["tenant_id"] = tenant_id
    else:
        order_query["$or"] = [{"tenant_id": {"$exists": False}}, {"tenant_id": None}]
    
    user_branch_id = current_user.get("branch_id")
    user_role = current_user.get("role")
    
    if user_branch_id and user_role not in [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER]:
        order_query["branch_id"] = user_branch_id
    elif branch_id:
        order_query["branch_id"] = branch_id
    
    if start_date:
        order_query["created_at"] = {"$gte": start_date}
    if end_date:
        order_query.setdefault("created_at", {})["$lte"] = end_date + "T23:59:59"
    
    orders = await db.orders.find(order_query, {"_id": 0}).to_list(10000)
    
    product_sales = {}
    for o in orders:
        for item in o.get("items", []):
            pid = item.get("product_id")
            if pid not in product_sales:
                product_sales[pid] = {"quantity_sold": 0, "revenue": 0, "cost": 0, "profit": 0}
            qty = item.get("quantity", 0)
            product_sales[pid]["quantity_sold"] += qty
            product_sales[pid]["revenue"] += item.get("price", 0) * qty
            product_sales[pid]["cost"] += item.get("cost", 0)
    
    result = []
    for p in products:
        sales = product_sales.get(p["id"], {})
        result.append({
            "id": p["id"],
            "name": p["name"],
            "category_id": p.get("category_id"),
            "price": p.get("price", 0),
            "cost": p.get("cost", 0),
            "operating_cost": p.get("operating_cost", 0),
            "profit_per_unit": p.get("price", 0) - p.get("cost", 0) - p.get("operating_cost", 0),
            "quantity_sold": sales.get("quantity_sold", 0),
            "total_revenue": sales.get("revenue", 0),
            "total_cost": sales.get("cost", 0),
            "total_profit": sales.get("revenue", 0) - sales.get("cost", 0)
        })
    
    result.sort(key=lambda x: x["total_revenue"], reverse=True)
    
    return {
        "products": result,
        "total_products": len(products),
        "top_selling": result[:10],
        "low_selling": sorted(result, key=lambda x: x["quantity_sold"])[:10]
    }

# ==================== CANCELLATIONS REPORT ====================
@router.get("/cancellations")
async def get_cancellations_report(
    start_date: str,
    end_date: str,
    branch_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    db = get_database()
    tenant_id = get_user_tenant_id(current_user)
    
    query = {
        "status": "cancelled",
        "created_at": {"$gte": start_date, "$lte": end_date + "T23:59:59"}
    }
    
    if tenant_id:
        query["tenant_id"] = tenant_id
    else:
        query["$or"] = [{"tenant_id": {"$exists": False}}, {"tenant_id": None}]
    
    user_branch_id = current_user.get("branch_id")
    user_role = current_user.get("role")
    
    if user_branch_id and user_role not in [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER]:
        query["branch_id"] = user_branch_id
    elif branch_id:
        query["branch_id"] = branch_id
    
    cancelled_orders = await db.orders.find(query, {"_id": 0}).to_list(500)
    
    total_query = {"created_at": {"$gte": start_date, "$lte": end_date + "T23:59:59"}}
    if tenant_id:
        total_query["tenant_id"] = tenant_id
    else:
        total_query["$or"] = [{"tenant_id": {"$exists": False}}, {"tenant_id": None}]
    if user_branch_id and user_role not in [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER]:
        total_query["branch_id"] = user_branch_id
    elif branch_id:
        total_query["branch_id"] = branch_id
    total_orders = await db.orders.count_documents(total_query)
    
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    today_query = {"status": "cancelled", "created_at": {"$regex": f"^{today}"}}
    if tenant_id:
        today_query["tenant_id"] = tenant_id
    if user_branch_id and user_role not in [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER]:
        today_query["branch_id"] = user_branch_id
    elif branch_id:
        today_query["branch_id"] = branch_id
    today_cancelled = await db.orders.count_documents(today_query)
    
    total_value = sum(o.get("total", 0) for o in cancelled_orders)
    cancellation_rate = (len(cancelled_orders) / total_orders * 100) if total_orders > 0 else 0
    
    return {
        "total_cancelled": len(cancelled_orders),
        "total_value": total_value,
        "cancellation_rate": cancellation_rate,
        "today_cancelled": today_cancelled,
        "orders": cancelled_orders
    }

# ==================== DISCOUNTS REPORT ====================
@router.get("/discounts")
async def get_discounts_report(
    start_date: str,
    end_date: str,
    branch_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    db = get_database()
    tenant_id = get_user_tenant_id(current_user)
    
    query = {
        "discount": {"$gt": 0},
        "created_at": {"$gte": start_date, "$lte": end_date + "T23:59:59"}
    }
    
    if tenant_id:
        query["tenant_id"] = tenant_id
    else:
        query["$or"] = [{"tenant_id": {"$exists": False}}, {"tenant_id": None}]
    
    user_branch_id = current_user.get("branch_id")
    user_role = current_user.get("role")
    
    if user_branch_id and user_role not in [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER]:
        query["branch_id"] = user_branch_id
    elif branch_id:
        query["branch_id"] = branch_id
    
    orders = await db.orders.find(query, {"_id": 0}).to_list(500)
    
    sales_query = {"created_at": {"$gte": start_date, "$lte": end_date + "T23:59:59"}, "status": {"$ne": "cancelled"}}
    if tenant_id:
        sales_query["tenant_id"] = tenant_id
    else:
        sales_query["$or"] = [{"tenant_id": {"$exists": False}}, {"tenant_id": None}]
    if user_branch_id and user_role not in [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER]:
        sales_query["branch_id"] = user_branch_id
    elif branch_id:
        sales_query["branch_id"] = branch_id
    all_orders = await db.orders.find(sales_query, {"total": 1}).to_list(5000)
    total_sales = sum(o.get("total", 0) for o in all_orders)
    
    total_discounts = sum(o.get("discount", 0) for o in orders)
    discount_percentage = (total_discounts / total_sales * 100) if total_sales > 0 else 0
    average_discount = total_discounts / len(orders) if orders else 0
    
    return {
        "total_discounts": total_discounts,
        "orders_with_discount": len(orders),
        "average_discount": average_discount,
        "discount_percentage": discount_percentage,
        "orders": orders
    }

# ==================== CREDIT REPORT ====================
@router.get("/credit")
async def get_credit_report(
    start_date: str,
    end_date: str,
    branch_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    db = get_database()
    tenant_id = get_user_tenant_id(current_user)
    
    # استثناء طلبات شركات التوصيل من تقرير الآجل العادي
    # الآجل العادي = طلبات بدون شركة توصيل
    query = {
        "payment_method": "credit",
        "created_at": {"$gte": start_date, "$lte": end_date + "T23:59:59"},
        # استثناء طلبات شركات التوصيل
        "$or": [
            {"delivery_app": {"$exists": False}},
            {"delivery_app": None},
            {"delivery_app": ""}
        ],
        "is_delivery_company": {"$ne": True}
    }
    
    if tenant_id:
        query["tenant_id"] = tenant_id
    
    user_branch_id = current_user.get("branch_id")
    user_role = current_user.get("role")
    
    if user_branch_id and user_role not in [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER]:
        query["branch_id"] = user_branch_id
    elif branch_id:
        query["branch_id"] = branch_id
    
    orders = await db.orders.find(query, {"_id": 0}).to_list(500)
    
    # جلب سجلات التحصيل لهذه الطلبات
    order_ids = [o.get("id") for o in orders]
    collections = await db.credit_collections.find(
        {"order_id": {"$in": order_ids}}, {"_id": 0}
    ).to_list(1000)
    
    # حساب المبالغ المحصلة لكل طلب
    collected_by_order = {}
    for c in collections:
        order_id = c.get("order_id")
        collected_by_order[order_id] = collected_by_order.get(order_id, 0) + c.get("amount", 0)
    
    # إضافة معلومات التحصيل لكل طلب
    for o in orders:
        o["collected_amount"] = collected_by_order.get(o.get("id"), 0)
        o["remaining_amount"] = o.get("total", 0) - o["collected_amount"]
        o["is_fully_collected"] = o["remaining_amount"] <= 0
    
    total_credit = sum(o.get("total", 0) for o in orders)
    total_collected = sum(o.get("collected_amount", 0) for o in orders)
    remaining = total_credit - total_collected
    
    return {
        "total_credit": total_credit,
        "total_orders": len(orders),
        "collected_amount": total_collected,
        "remaining_amount": remaining,
        "orders": orders,
        "collections": collections
    }

# ==================== CREDIT COLLECTION (تحصيل الآجل) ====================
from pydantic import BaseModel

class CreditCollectionCreate(BaseModel):
    order_id: str
    amount: float
    collected_by: str  # اسم المستلم
    notes: Optional[str] = None

@router.post("/credit/collect")
async def collect_credit(
    collection: CreditCollectionCreate,
    current_user: dict = Depends(get_current_user)
):
    """تسجيل تحصيل مبلغ آجل"""
    db = get_database()
    tenant_id = get_user_tenant_id(current_user)
    
    # التحقق من وجود الطلب
    order_query = {"id": collection.order_id}
    if tenant_id:
        order_query["tenant_id"] = tenant_id
    
    order = await db.orders.find_one(order_query)
    if not order:
        raise HTTPException(status_code=404, detail="الطلب غير موجود")
    
    # إنشاء سجل التحصيل
    now = datetime.now(timezone.utc)
    collection_record = {
        "id": f"col_{now.strftime('%Y%m%d%H%M%S')}_{collection.order_id[-6:]}",
        "order_id": collection.order_id,
        "order_number": order.get("order_number"),
        "amount": collection.amount,
        "collected_by": collection.collected_by,
        "collected_by_user_id": current_user.get("id"),
        "collected_at": now.isoformat(),
        "date": now.strftime("%Y-%m-%d"),
        "time": now.strftime("%H:%M:%S"),
        "notes": collection.notes,
        "tenant_id": tenant_id,
        "branch_id": order.get("branch_id"),
        "customer_name": order.get("customer_name"),
        "customer_phone": order.get("customer_phone"),
        "collection_type": "credit"  # نوع التحصيل: credit أو delivery
    }
    
    await db.credit_collections.insert_one(collection_record)
    
    # تحديث حالة الطلب إذا تم تحصيل المبلغ بالكامل
    total_collected = await db.credit_collections.aggregate([
        {"$match": {"order_id": collection.order_id}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]).to_list(1)
    
    total_collected_amount = total_collected[0]["total"] if total_collected else 0
    
    if total_collected_amount >= order.get("total", 0):
        await db.orders.update_one(
            {"id": collection.order_id},
            {"$set": {"credit_collected": True, "credit_collected_at": now.isoformat()}}
        )
    
    # حذف _id من السجل قبل الإرجاع
    collection_record.pop("_id", None)
    
    return {
        "message": "تم تسجيل التحصيل بنجاح",
        "collection": collection_record,
        "total_collected": total_collected_amount,
        "remaining": order.get("total", 0) - total_collected_amount
    }

@router.get("/credit/collections")
async def get_credit_collections(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    order_id: Optional[str] = None,
    branch_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """جلب سجلات التحصيل"""
    db = get_database()
    tenant_id = get_user_tenant_id(current_user)
    
    query = {}
    if tenant_id:
        query["tenant_id"] = tenant_id
    
    if order_id:
        query["order_id"] = order_id
    
    user_branch_id = current_user.get("branch_id")
    user_role = current_user.get("role")
    
    if user_branch_id and user_role not in [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER]:
        query["branch_id"] = user_branch_id
    elif branch_id:
        query["branch_id"] = branch_id
    
    if start_date:
        query["date"] = {"$gte": start_date}
    if end_date:
        query.setdefault("date", {})["$lte"] = end_date
    
    collections = await db.credit_collections.find(query, {"_id": 0}).to_list(1000)
    
    return {
        "collections": collections,
        "total_collected": sum(c.get("amount", 0) for c in collections),
        "count": len(collections)
    }

# ==================== DELIVERY COLLECTION (تحصيل التوصيل) ====================
class DeliveryCollectionCreate(BaseModel):
    delivery_app_id: str
    delivery_app_name: str
    amount: float
    collected_by: str
    notes: Optional[str] = None
    order_ids: Optional[List[str]] = None  # قائمة الطلبات المحصلة (اختياري)

@router.post("/delivery/collect")
async def collect_delivery(
    collection: DeliveryCollectionCreate,
    current_user: dict = Depends(get_current_user)
):
    """تسجيل تحصيل من شركة توصيل"""
    db = get_database()
    tenant_id = get_user_tenant_id(current_user)
    
    now = datetime.now(timezone.utc)
    collection_record = {
        "id": f"del_{now.strftime('%Y%m%d%H%M%S')}",
        "delivery_app_id": collection.delivery_app_id,
        "delivery_app_name": collection.delivery_app_name,
        "amount": collection.amount,
        "collected_by": collection.collected_by,
        "collected_by_user_id": current_user.get("id"),
        "collected_at": now.isoformat(),
        "date": now.strftime("%Y-%m-%d"),
        "time": now.strftime("%H:%M:%S"),
        "notes": collection.notes,
        "order_ids": collection.order_ids or [],
        "tenant_id": tenant_id,
        "branch_id": current_user.get("branch_id"),
        "collection_type": "delivery"
    }
    
    await db.delivery_collections.insert_one(collection_record)
    
    # تحديث الطلبات كمحصلة إذا تم تحديدها
    if collection.order_ids:
        await db.orders.update_many(
            {"id": {"$in": collection.order_ids}},
            {"$set": {"delivery_collected": True, "delivery_collected_at": now.isoformat()}}
        )
    
    collection_record.pop("_id", None)
    
    return {
        "message": "تم تسجيل التحصيل بنجاح",
        "collection": collection_record
    }

@router.get("/delivery/collections")
async def get_delivery_collections(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    delivery_app_id: Optional[str] = None,
    branch_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """جلب سجلات تحصيل التوصيل"""
    db = get_database()
    tenant_id = get_user_tenant_id(current_user)
    
    query = {}
    if tenant_id:
        query["tenant_id"] = tenant_id
    
    if delivery_app_id:
        query["delivery_app_id"] = delivery_app_id
    
    user_branch_id = current_user.get("branch_id")
    user_role = current_user.get("role")
    
    if user_branch_id and user_role not in [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER]:
        query["branch_id"] = user_branch_id
    elif branch_id:
        query["branch_id"] = branch_id
    
    if start_date:
        query["date"] = {"$gte": start_date}
    if end_date:
        query.setdefault("date", {})["$lte"] = end_date
    
    collections = await db.delivery_collections.find(query, {"_id": 0}).to_list(1000)
    
    return {
        "collections": collections,
        "total_collected": sum(c.get("amount", 0) for c in collections),
        "count": len(collections)
    }


# ==================== CARD PAYMENTS REPORT (تقرير مبيعات البطاقة) ====================
@router.get("/card")
async def get_card_report(
    start_date: str,
    end_date: str,
    branch_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """جلب تقرير مبيعات البطاقة"""
    db = get_database()
    tenant_id = get_user_tenant_id(current_user)
    
    query = {
        "payment_method": "card",
        "created_at": {"$gte": start_date, "$lte": end_date + "T23:59:59"},
        "status": {"$ne": "cancelled"}
    }
    
    if tenant_id:
        query["tenant_id"] = tenant_id
    
    user_branch_id = current_user.get("branch_id")
    user_role = current_user.get("role")
    
    if user_branch_id and user_role not in [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER]:
        query["branch_id"] = user_branch_id
    elif branch_id:
        query["branch_id"] = branch_id
    
    orders = await db.orders.find(query, {"_id": 0}).to_list(500)
    
    # جلب سجلات التحصيل لهذه الطلبات
    order_ids = [o.get("id") for o in orders]
    collections = await db.card_collections.find(
        {"order_id": {"$in": order_ids}}, {"_id": 0}
    ).to_list(1000)
    
    # حساب المبالغ المحصلة لكل طلب
    collected_by_order = {}
    for c in collections:
        order_id = c.get("order_id")
        collected_by_order[order_id] = collected_by_order.get(order_id, 0) + c.get("amount", 0)
    
    # إضافة معلومات التحصيل لكل طلب
    total_card = 0
    collected_amount = 0
    for order in orders:
        order_id = order.get("id")
        order_total = order.get("total", 0)
        order_collected = collected_by_order.get(order_id, 0)
        order["collected_amount"] = order_collected
        order["remaining_amount"] = order_total - order_collected
        order["is_collected"] = order_collected >= order_total
        total_card += order_total
        collected_amount += order_collected
    
    return {
        "total_card": total_card,
        "total_orders": len(orders),
        "collected_amount": collected_amount,
        "remaining_amount": total_card - collected_amount,
        "orders": orders
    }


class CardCollectionCreate(BaseModel):
    order_id: str
    amount: float
    collected_by: str
    notes: Optional[str] = None


@router.post("/card/collect")
async def collect_card_payment(
    collection: CardCollectionCreate,
    current_user: dict = Depends(get_current_user)
):
    """تسجيل تحصيل مبيعات البطاقة (استلام من شركة البطاقات/البنك)"""
    db = get_database()
    tenant_id = get_user_tenant_id(current_user)
    
    # التحقق من وجود الطلب
    order = await db.orders.find_one({"id": collection.order_id})
    if not order:
        raise HTTPException(status_code=404, detail="الطلب غير موجود")
    
    # إنشاء سجل التحصيل
    now = datetime.now(timezone.utc)
    collection_record = {
        "id": f"card_{now.strftime('%Y%m%d%H%M%S')}_{collection.order_id[-6:]}",
        "order_id": collection.order_id,
        "order_number": order.get("order_number"),
        "amount": collection.amount,
        "collected_by": collection.collected_by,
        "collected_by_user_id": current_user.get("id"),
        "collected_at": now.isoformat(),
        "date": now.strftime("%Y-%m-%d"),
        "time": now.strftime("%H:%M:%S"),
        "notes": collection.notes,
        "tenant_id": tenant_id,
        "branch_id": order.get("branch_id"),
        "customer_name": order.get("customer_name"),
        "customer_phone": order.get("customer_phone"),
        "collection_type": "card"
    }
    
    await db.card_collections.insert_one(collection_record)
    
    # تحديث حالة الطلب إذا تم تحصيل المبلغ بالكامل
    total_collected = await db.card_collections.aggregate([
        {"$match": {"order_id": collection.order_id}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]).to_list(1)
    
    total_collected_amount = total_collected[0]["total"] if total_collected else 0
    
    if total_collected_amount >= order.get("total", 0):
        await db.orders.update_one(
            {"id": collection.order_id},
            {"$set": {"card_collected": True, "card_collected_at": now.isoformat()}}
        )
    
    # حذف _id من السجل قبل الإرجاع
    collection_record.pop("_id", None)
    
    return {
        "message": "تم تسجيل التحصيل بنجاح",
        "collection": collection_record,
        "total_collected": total_collected_amount,
        "remaining": order.get("total", 0) - total_collected_amount
    }


@router.get("/card/collections")
async def get_card_collections(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    order_id: Optional[str] = None,
    branch_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """جلب سجلات تحصيل البطاقة"""
    db = get_database()
    tenant_id = get_user_tenant_id(current_user)
    
    query = {}
    if tenant_id:
        query["tenant_id"] = tenant_id
    
    if order_id:
        query["order_id"] = order_id
    
    user_branch_id = current_user.get("branch_id")
    user_role = current_user.get("role")
    
    if user_branch_id and user_role not in [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER]:
        query["branch_id"] = user_branch_id
    elif branch_id:
        query["branch_id"] = branch_id
    
    if start_date:
        query["date"] = {"$gte": start_date}
    if end_date:
        query.setdefault("date", {})["$lte"] = end_date
    
    collections = await db.card_collections.find(query, {"_id": 0}).to_list(1000)
    
    return {
        "collections": collections,
        "total_collected": sum(c.get("amount", 0) for c in collections),
        "count": len(collections)
    }
