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
    
    query = {"status": {"$ne": OrderStatus.CANCELLED}}
    
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
    
    orders = await db.orders.find(query, {"_id": 0}).to_list(10000)
    
    delivery_apps = await db.delivery_apps.find({}, {"_id": 0}).to_list(100)
    app_names = {app["id"]: app["name"] for app in delivery_apps}
    
    total_sales = sum(o["total"] for o in orders)
    total_cost = sum(o.get("total_cost", 0) for o in orders)
    total_profit = sum(o.get("profit", 0) for o in orders)
    total_orders = len(orders)
    avg_order_value = total_sales / total_orders if total_orders > 0 else 0
    
    by_payment = {}
    by_type = {}
    by_app = {}
    by_date = {}
    by_product = {}
    
    for o in orders:
        pm = o["payment_method"]
        by_payment[pm] = by_payment.get(pm, 0) + o["total"]
        
        ot = o["order_type"]
        by_type[ot] = by_type.get(ot, 0) + o["total"]
        
        if o.get("delivery_app"):
            app_id = o["delivery_app"]
            app_name = o.get("delivery_app_name") or app_names.get(app_id, app_id)
            if app_name not in by_app:
                by_app[app_name] = {
                    "total_sales": 0, "total_commission": 0, "net_amount": 0,
                    "orders_count": 0, "paid_orders": 0, "credit_orders": 0
                }
            by_app[app_name]["total_sales"] += o["total"]
            by_app[app_name]["total_commission"] += o.get("delivery_commission", 0)
            by_app[app_name]["net_amount"] += o["total"] - o.get("delivery_commission", 0)
            by_app[app_name]["orders_count"] += 1
            if o.get("payment_status") == "paid":
                by_app[app_name]["paid_orders"] += 1
            else:
                by_app[app_name]["credit_orders"] += 1
        
        date = o["created_at"][:10]
        if date not in by_date:
            by_date[date] = {"sales": 0, "orders": 0, "profit": 0}
        by_date[date]["sales"] += o["total"]
        by_date[date]["orders"] += 1
        by_date[date]["profit"] += o.get("profit", 0)
        
        for item in o.get("items", []):
            pid = item.get("product_name", "Unknown")
            if pid not in by_product:
                by_product[pid] = {"quantity": 0, "revenue": 0}
            by_product[pid]["quantity"] += item.get("quantity", 0)
            by_product[pid]["revenue"] += item.get("price", 0) * item.get("quantity", 0)
    
    total_delivery_sales = sum(app["total_sales"] for app in by_app.values())
    total_delivery_commission = sum(app["total_commission"] for app in by_app.values())
    total_delivery_net = sum(app["net_amount"] for app in by_app.values())
    
    return {
        "total_sales": total_sales,
        "total_cost": total_cost,
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
        supplier = p.get("supplier_name", "Unknown")
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
    
    net_profit = gross_profit - total_expenses
    
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
        "operating_expenses": {"total": total_expenses, "breakdown": {}},
        "net_profit": {
            "amount": net_profit,
            "margin": (net_profit / total_revenue * 100) if total_revenue > 0 else 0
        }
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
    
    query = {"delivery_app": {"$ne": None, "$exists": True}}
    
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
    
    by_app = {}
    for o in orders:
        app_id = o.get("delivery_app")
        app_name = o.get("delivery_app_name") or app_names.get(app_id, app_id)
        
        if app_name not in by_app:
            by_app[app_name] = {
                "id": app_id, "commission_rate": app_rates.get(app_id, 0),
                "count": 0, "total": 0, "commission": 0, "net_amount": 0,
                "paid_count": 0, "credit_count": 0, "paid_amount": 0, "credit_amount": 0,
                "orders": []
            }
        
        by_app[app_name]["count"] += 1
        by_app[app_name]["total"] += o["total"]
        by_app[app_name]["commission"] += o.get("delivery_commission", 0)
        by_app[app_name]["net_amount"] += o["total"] - o.get("delivery_commission", 0)
        
        if o.get("payment_status") == "paid" or o.get("payment_method") != "credit":
            by_app[app_name]["paid_count"] += 1
            by_app[app_name]["paid_amount"] += o["total"]
        else:
            by_app[app_name]["credit_count"] += 1
            by_app[app_name]["credit_amount"] += o["total"]
        
        by_app[app_name]["orders"].append({
            "order_number": o["order_number"],
            "total": o["total"],
            "commission": o.get("delivery_commission", 0),
            "net": o["total"] - o.get("delivery_commission", 0),
            "payment_status": o.get("payment_status", "pending"),
            "created_at": o["created_at"]
        })
    
    total_all = sum(o["total"] for o in orders)
    total_commission = sum(o.get("delivery_commission", 0) for o in orders)
    total_credit = sum(o["total"] for o in orders if o.get("payment_method") == "credit")
    
    return {
        "total_sales": total_all,
        "total_credit": total_credit,
        "total_commission": total_commission,
        "net_receivable": total_all - total_commission,
        "total_orders": len(orders),
        "by_delivery_app": by_app
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
    
    query = {
        "payment_method": "credit",
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
    
    total_credit = sum(o.get("total", 0) for o in orders)
    collected = sum(o.get("total", 0) for o in orders if o.get("credit_collected"))
    remaining = total_credit - collected
    
    return {
        "total_credit": total_credit,
        "total_orders": len(orders),
        "collected_amount": collected,
        "remaining_amount": remaining,
        "orders": orders
    }
