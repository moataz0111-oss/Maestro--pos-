"""
Reports Routes - تقارير المبيعات والمشتريات والمصروفات
"""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone, timedelta
from io import BytesIO
import logging
import uuid

from .shared import (
    get_database, get_current_user, get_user_tenant_id, 
    build_tenant_query, build_branch_query,
    UserRole, OrderStatus
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/reports", tags=["Reports"])


# ==================== UNIFIED PER-PRODUCT COST RESOLVER ====================
async def _resolve_product_unit_cost(db, product: Dict[str, Any], mfg_cache: Optional[Dict[str, Any]] = None) -> Dict[str, float]:
    """يُرجع التكلفة الحقيقية لكل وحدة من المنتج، باستخدام نفس منطق POS:
    إذا كان المنتج مرتبطاً بمنتج مُصنّع (manufactured_links / manufactured_product_id)
    فيُحسب من unit_cost_after_waste × consumption_qty (مصدر الحقيقة).
    وإلا يستخدم product.cost الخام كـ fallback.

    Returns: {"unit_cost": float, "unit_pkg": float}
        unit_cost = تكلفة المواد الخام + التشغيل (لكل وحدة، بدون التغليف)
        unit_pkg  = تكلفة التغليف (لكل وحدة)
    """
    from routes.inventory_system import _enrich_unit_cost_fields  # late import

    def _f(x):
        try:
            return float(x or 0)
        except (TypeError, ValueError):
            return 0.0

    unit_pkg = _f(product.get("packaging_cost"))
    operating = _f(product.get("operating_cost"))

    # ⭐ المسار الأساسي: استخدام manufactured_links (نفس منطق POS)
    mfg_links = list(product.get("manufactured_links") or [])
    if not mfg_links and product.get("manufactured_product_id"):
        mfg_links = [{
            "manufactured_product_id": product.get("manufactured_product_id"),
            "consumption_qty": product.get("manufactured_consumption_qty") or 1,
            "consumption_unit": None,
        }]

    if mfg_links:
        links_unit_cost = 0.0
        for link in mfg_links:
            mp_id = link.get("manufactured_product_id")
            if not mp_id:
                continue
            # ⚡ مسار سريع: استخدم الذاكرة المؤقتة المُحضّرة مسبقاً (يلغي استعلامات N×M)
            if mfg_cache is not None:
                mfg_product = mfg_cache["by_id"].get(mp_id)
                if not mfg_product:
                    continue
                # المنتج مُخصّب مسبقاً (unit_cost_after_waste جاهز) — لا حاجة لاستعلام
            else:
                mfg_product = await db.manufactured_products.find_one(
                    {"id": mp_id},
                    {"_id": 0, "raw_material_cost": 1, "raw_material_cost_after_waste": 1,
                     "production_cost": 1, "recipe": 1, "unit": 1, "piece_weight": 1,
                     "piece_weight_unit": 1, "piece_def_value": 1, "piece_def_unit": 1,
                     "quantity": 1, "total_produced": 1, "cost_before_waste": 1, "id": 1},
                )
                if not mfg_product:
                    continue
                await _enrich_unit_cost_fields(db, mfg_product)
            unit_cost_after_waste = _f(mfg_product.get("unit_cost_after_waste"))
            consumption_qty = _f(link.get("consumption_qty")) or 1.0
            # تحويل الوحدة (kg→g أو piece) — نستخدم منطق server.py عبر import محلي
            try:
                from server import _convert_link_consumption_to_main
                consumption_qty = _convert_link_consumption_to_main(
                    consumption_qty,
                    link.get("consumption_unit") or mfg_product.get("unit") or "حبة",
                    mfg_product.get("unit") or "حبة",
                    _f(mfg_product.get("piece_weight")),
                    mfg_product.get("piece_weight_unit") or "",
                )
            except Exception:
                pass  # في حال فشل التحويل، نستخدم consumption_qty كما هو
            links_unit_cost += unit_cost_after_waste * consumption_qty
        if links_unit_cost > 0:
            return {"unit_cost": links_unit_cost + operating, "unit_pkg": unit_pkg}

    # ⛑️ Smart Fallback: لو المنتج غير مربوط بـ manufactured_links، نحاول
    # البحث عن منتج مُصنّع باسم مطابق أو يحتوي على اسم المنتج (case-insensitive).
    # يساعد المنتجات التي لم يُكتمل ربطها يدوياً في الإعدادات.
    name = (product.get("name") or "").strip()
    if name:
        tenant_id = product.get("tenant_id")
        # ⚡ مسار سريع: ابحث في الذاكرة المؤقتة بدل استعلامات قاعدة البيانات
        if mfg_cache is not None:
            mfg_match = mfg_cache["by_name"].get(name)
            if not mfg_match:
                _low = name.lower()
                for _mname, _m in mfg_cache["by_name"].items():
                    if _low in (_mname or "").lower():
                        mfg_match = _m
                        break
            if mfg_match:
                auto_cost = _f(mfg_match.get("unit_cost_after_waste"))
                if auto_cost > 0:
                    return {"unit_cost": auto_cost + operating, "unit_pkg": unit_pkg}
        else:
            # 1) محاولة مطابقة دقيقة
            match_q: Dict[str, Any] = {"name": name}
            if tenant_id:
                match_q["tenant_id"] = tenant_id
            mfg_match = await db.manufactured_products.find_one(match_q, {"_id": 0})
            # 2) إن فشلت، محاولة partial (المنتج المُصنّع يحتوي اسم البيع)
            if not mfg_match:
                import re as _re
                escaped = _re.escape(name)
                partial_q: Dict[str, Any] = {"name": {"$regex": escaped, "$options": "i"}}
                if tenant_id:
                    partial_q["tenant_id"] = tenant_id
                mfg_match = await db.manufactured_products.find_one(partial_q, {"_id": 0})
            if mfg_match:
                from routes.inventory_system import _enrich_unit_cost_fields
                await _enrich_unit_cost_fields(db, mfg_match)
                auto_cost = _f(mfg_match.get("unit_cost_after_waste"))
                if auto_cost > 0:
                    return {"unit_cost": auto_cost + operating, "unit_pkg": unit_pkg}

    # ⛑️ Last-resort Fallback: استخدم product.cost الخام
    raw_cost = _f(product.get("cost"))
    materials_only = max(0.0, raw_cost - unit_pkg)
    return {"unit_cost": materials_only + operating, "unit_pkg": unit_pkg}


async def _build_current_costs_map(db, tenant_id: Optional[str]) -> Dict[str, Dict[str, Any]]:
    """يبني خريطة {product_id: {unit_cost, unit_pkg, name}} و {name: ...} للجميع.
    يستخدم _resolve_product_unit_cost (مصدر الحقيقة الوحيد).

    ⚡ تحسين الأداء: بدلاً من استعلام قاعدة البيانات لكل منتج مُصنّع داخل الحلقة
    (تضخم N×M)، نجلب جميع المنتجات المُصنّعة ونُخصّبها (enrich) مرة واحدة فقط في
    ذاكرة مؤقتة، ثم نحلّ تكلفة كل منتج بيع من الذاكرة. هذا يجعل التقارير شبه فورية."""
    from routes.inventory_system import _enrich_unit_cost_fields

    products_q: Dict[str, Any] = {}
    if tenant_id:
        products_q["tenant_id"] = tenant_id

    # ⚡ الخطوة 1: جلب + تخصيب جميع المنتجات المُصنّعة مرة واحدة فقط
    mfg_q: Dict[str, Any] = {}
    if tenant_id:
        mfg_q["tenant_id"] = tenant_id
    mfg_list = await db.manufactured_products.find(mfg_q, {"_id": 0}).to_list(length=None)
    mfg_by_id: Dict[str, Any] = {}
    mfg_by_name: Dict[str, Any] = {}
    for mp in mfg_list:
        try:
            await _enrich_unit_cost_fields(db, mp)
        except Exception as e:
            logger.warning(f"Failed to enrich manufactured product {mp.get('name')}: {e}")
        if mp.get("id"):
            mfg_by_id[mp["id"]] = mp
        if mp.get("name"):
            mfg_by_name.setdefault(mp["name"], mp)
    mfg_cache = {"by_id": mfg_by_id, "by_name": mfg_by_name}

    # ⚡ الخطوة 2: حلّ تكلفة كل منتج بيع من الذاكرة (بدون استعلامات إضافية)
    by_id: Dict[str, Dict[str, Any]] = {}
    by_name: Dict[str, Dict[str, Any]] = {}
    cursor = db.products.find(products_q, {"_id": 0})
    async for p in cursor:
        try:
            resolved = await _resolve_product_unit_cost(db, p, mfg_cache=mfg_cache)
        except Exception as e:
            logger.warning(f"Failed to resolve cost for product {p.get('name')}: {e}")
            resolved = {"unit_cost": float(p.get("cost") or 0), "unit_pkg": float(p.get("packaging_cost") or 0)}
        entry = {"unit_cost": resolved["unit_cost"], "unit_pkg": resolved["unit_pkg"], "name": p.get("name", "")}
        if p.get("id"):
            by_id[p["id"]] = entry
        if p.get("name"):
            by_name[p["name"]] = entry
    return {"by_id": by_id, "by_name": by_name}




def _apply_business_date_filter(query: dict, start_date: Optional[str], end_date: Optional[str], legacy_field: str = "created_at") -> dict:
    """يُضيف فلتر business_date (مع fallback للحقل القديم للسجلات التي لا تملك business_date).
    يُعدّل الـ query بإضافة $or أو $and حسب السياق."""
    if not start_date and not end_date:
        return query
    biz_range = {}
    legacy_range = {}
    if start_date:
        biz_range["$gte"] = start_date[:10] if len(start_date) >= 10 else start_date
        legacy_range["$gte"] = start_date
    if end_date:
        end_iso = end_date + "T23:59:59" if "T" not in end_date else end_date
        biz_range["$lte"] = end_date[:10] if len(end_date) >= 10 else end_date
        legacy_range["$lte"] = end_iso
    date_or = [
        {"business_date": biz_range},
        {"business_date": {"$exists": False}, legacy_field: legacy_range}
    ]
    if "$or" in query and "$and" not in query:
        # دمج $or قديم مع $or الجديد عبر $and
        query["$and"] = [{"$or": query.pop("$or")}, {"$or": date_or}]
    elif "$and" in query:
        query["$and"].append({"$or": date_or})
    else:
        query["$or"] = date_or
    return query

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
    
    query = _apply_business_date_filter(query, start_date, end_date)
    
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

    # ⭐ خريطة موحّدة بالتكاليف الحالية (تستخدم نفس منطق POS عبر manufactured_links)
    _costs_map = await _build_current_costs_map(db, tenant_id)
    _by_id = _costs_map["by_id"]
    _by_name = _costs_map["by_name"]
    
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
    # ⭐ المجاميع تُحسب ديناميكياً من الـ unified costs map (لا من order.total_cost المخزّن)
    # السبب: order.total_cost قد يكون قديماً قبل إصلاحات التكلفة، وفي ذلك حالة عدم
    # اتساق بين البطاقة العليا و Dialog "تفصيل التكلفة لكل منتج". الآن الكل من
    # نفس المصدر.
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
        "delivery_company": "شركة توصيل (غير محددة)",
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
        is_company = o.get("is_delivery_company", False) or o.get("delivery_app") or o.get("delivery_app_name") or pm == "delivery_company"
        has_driver = o.get("driver_id") and o.get("order_type") == "delivery" and not is_company
        
        # تحديد اسم طريقة الدفع
        if is_company:
            # ⭐ طلب شركة توصيل (آجل أو delivery_company) — يُجمَّع باسم الشركة دائماً
            app_name = o.get("delivery_app_name")
            if not app_name and o.get("delivery_app"):
                app_name = default_delivery_apps_names.get(o.get("delivery_app"), app_names.get(o.get("delivery_app"), None))
            if not app_name and o.get("delivery_company_name"):
                app_name = o.get("delivery_company_name")
            if not app_name:
                # طلب لشركة لكن بلا اسم محدد → يحتاج توجيه من المالك
                app_name = "شركة توصيل (غير محددة)"
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
            pid_ref = item.get("product_id")
            if pid not in by_product:
                by_product[pid] = {"quantity": 0, "revenue": 0, "materials_cost": 0, "packaging_cost": 0}
            qty = item.get("quantity", 0)
            by_product[pid]["quantity"] += qty
            by_product[pid]["revenue"] += _sn(item.get("price")) * qty
            # ⭐ مصدر الحقيقة الوحيد: التكلفة المحسوبة عبر manufactured_links
            entry = _by_id.get(pid_ref) or _by_name.get(pid) or {"unit_cost": 0.0, "unit_pkg": 0.0}
            by_product[pid]["materials_cost"] += entry["unit_cost"] * qty
            by_product[pid]["packaging_cost"] += entry["unit_pkg"] * qty
    
    # ⚠️ الطلبات المعلقة لا تُحتسب كطريقة دفع (لم تُدفع بعد)
    # نعرضها كملخّص منفصل لتطابق تقرير إغلاق الصندوق (الذي يستثني المعلق)
    pending_total = sum(_sn(o.get("total")) for o in pending_orders)
    pending_count = len(pending_orders)
    
    total_delivery_sales = sum(app["total_sales"] for app in by_app.values())
    total_delivery_commission = sum(app["total_commission"] for app in by_app.values())
    total_delivery_net = sum(app["net_amount"] for app in by_app.values())

    # ⭐ المجاميع موحّدة مع cost_breakdown_by_product (مصدر واحد للحقيقة)
    total_materials_cost = sum(v.get("materials_cost", 0) for v in by_product.values())
    total_packaging_cost = sum(v.get("packaging_cost", 0) for v in by_product.values())
    total_cost = total_materials_cost + total_packaging_cost
    total_profit = total_sales - total_cost
    
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
        "top_products": dict(sorted(by_product.items(), key=lambda x: x[1]["revenue"], reverse=True)[:10]),
        # ⭐ تفصيل التكاليف لكل منتج + حساب الربحية (للـ Drill-down في الواجهة)
        "cost_breakdown_by_product": dict(
            sorted(
                {
                    name: {
                        **v,
                        "total_cost": (v.get("materials_cost", 0) + v.get("packaging_cost", 0)),
                        "profit": v.get("revenue", 0) - (v.get("materials_cost", 0) + v.get("packaging_cost", 0)),
                        "profit_margin": (
                            ((v.get("revenue", 0) - (v.get("materials_cost", 0) + v.get("packaging_cost", 0)))
                             / v.get("revenue", 1) * 100)
                            if v.get("revenue", 0) > 0 else 0
                        ),
                    }
                    for name, v in by_product.items()
                }.items(),
                key=lambda x: x[1].get("materials_cost", 0) + x[1].get("packaging_cost", 0),
                reverse=True,
            )
        ),
        # ⭐ ملخّص الطلبات المعلقة منفصل عن طرق الدفع (لتطابق تقرير إغلاق الصندوق)
        "pending_orders_summary": {
            "count": pending_count,
            "amount": pending_total,
        }
    }


# ==================== WEEKLY LOW-PROFIT ALERT ====================
@router.get("/weekly-low-profit")
async def get_weekly_low_profit_products(
    threshold: float = 10.0,
    branch_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    """يُرجع المنتجات ذات هامش ربح منخفض (< threshold%) في الأسبوع المنصرم (آخر 7 أيام).
    يُستخدم لتنبيه المدير بالمنتجات الخاسرة قبل أن تتراكم الخسارة.

    Response:
        {
            "week_id": "2026-W21",        # معرّف الأسبوع (للتجاهل لاحقاً في الواجهة)
            "threshold": 10.0,
            "from_date": "2026-05-17",
            "to_date": "2026-05-24",
            "products": [{"name", "revenue", "materials_cost", "packaging_cost",
                          "total_cost", "profit", "profit_margin", "quantity"}],
            "total_count": 5,
            "total_loss": 12340.50,
        }
    """
    db = get_database()
    now = datetime.now(timezone.utc)
    from_date = now - timedelta(days=7)
    query: Dict[str, Any] = {
        "status": {"$ne": OrderStatus.CANCELLED},
        "created_at": {"$gte": from_date.isoformat(), "$lte": now.isoformat()},
    }
    query = build_tenant_query(current_user, query)
    if branch_id:
        query = build_branch_query(branch_id, query)

    paid_orders = await db.orders.find(query, {"_id": 0}).to_list(length=10000)

    # ⭐ خريطة موحّدة بالتكاليف الحالية (تستخدم نفس منطق POS عبر manufactured_links)
    tenant_id = get_user_tenant_id(current_user)
    _costs_map = await _build_current_costs_map(db, tenant_id)
    _by_id = _costs_map["by_id"]
    _by_name = _costs_map["by_name"]

    by_product: Dict[str, Dict[str, float]] = {}
    for o in paid_orders:
        for item in o.get("items", []):
            pid = item.get("product_name") or item.get("name") or "غير معروف"
            pid_ref = item.get("product_id")
            if pid not in by_product:
                by_product[pid] = {"quantity": 0, "revenue": 0, "materials_cost": 0, "packaging_cost": 0}
            try:
                qty = float(item.get("quantity") or 0)
                price = float(item.get("price") or 0)
            except (TypeError, ValueError):
                continue
            entry = _by_id.get(pid_ref) or _by_name.get(pid) or {"unit_cost": 0.0, "unit_pkg": 0.0}
            by_product[pid]["quantity"] += qty
            by_product[pid]["revenue"] += price * qty
            by_product[pid]["materials_cost"] += entry["unit_cost"] * qty
            by_product[pid]["packaging_cost"] += entry["unit_pkg"] * qty

    low_profit: List[Dict[str, Any]] = []
    total_loss = 0.0
    for name, v in by_product.items():
        rev = v.get("revenue", 0)
        if rev <= 0:
            continue
        total_cost = v.get("materials_cost", 0) + v.get("packaging_cost", 0)
        profit = rev - total_cost
        margin = (profit / rev) * 100
        if margin < threshold:
            low_profit.append({
                "name": name,
                "quantity": v.get("quantity", 0),
                "revenue": round(rev, 2),
                "materials_cost": round(v.get("materials_cost", 0), 2),
                "packaging_cost": round(v.get("packaging_cost", 0), 2),
                "total_cost": round(total_cost, 2),
                "profit": round(profit, 2),
                "profit_margin": round(margin, 2),
            })
            if profit < 0:
                total_loss += abs(profit)

    # فرز تصاعدي حسب الهامش (الأسوأ أولاً)
    low_profit.sort(key=lambda x: x["profit_margin"])

    # week_id بصيغة ISO (السنة-W رقم_الأسبوع) — يستخدم في الواجهة لتجاهل الأسبوع الحالي
    iso_year, iso_week, _ = now.isocalendar()
    week_id = f"{iso_year}-W{iso_week:02d}"

    return {
        "week_id": week_id,
        "threshold": threshold,
        "from_date": from_date.date().isoformat(),
        "to_date": now.date().isoformat(),
        "products": low_profit,
        "total_count": len(low_profit),
        "total_loss": round(total_loss, 2),
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
    
    query = _apply_business_date_filter(query, start_date, end_date)
    
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
    cashier_id: Optional[str] = None,
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
    
    # فلترة حسب الكاشير المحدد
    if cashier_id:
        query["created_by"] = cashier_id
    
    # استبعاد المرتجعات من المصاريف نهائياً
    query["category"] = {"$ne": "refund"}
    # فلتر بالـ business_date مع fallback لـ date القديم
    query = _apply_business_date_filter(query, start_date, end_date, legacy_field="date")
    
    expenses = await db.expenses.find(query, {"_id": 0}).to_list(1000)
    
    total_expenses = sum(e["amount"] for e in expenses)
    by_category = {}
    by_date = {}
    by_cashier = {}
    
    for e in expenses:
        cat = e.get("category", "other")
        by_category[cat] = by_category.get(cat, 0) + e["amount"]
        
        date = e.get("date", e.get("created_at", "")[:10])
        by_date[date] = by_date.get(date, 0) + e["amount"]
        
        cashier = e.get("created_by_name") or "غير محدد"
        if cashier not in by_cashier:
            by_cashier[cashier] = {"total": 0, "count": 0, "by_category": {}, "items": []}
        by_cashier[cashier]["total"] += e["amount"]
        by_cashier[cashier]["count"] += 1
        by_cashier[cashier]["by_category"][cat] = by_cashier[cashier]["by_category"].get(cat, 0) + e["amount"]
        by_cashier[cashier]["items"].append({
            "id": e.get("id"),
            "description": e.get("description", ""),
            "amount": e["amount"],
            "category": cat,
            "date": e.get("date", "")
        })
    
    return {
        "total_expenses": total_expenses,
        "total_transactions": len(expenses),
        "by_category": by_category,
        "by_date": by_date,
        "by_cashier": by_cashier,
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
    
    sales_query = _apply_business_date_filter(sales_query, start_date, end_date)
    
    orders = await db.orders.find(sales_query, {"_id": 0}).to_list(10000)
    
    total_revenue = sum(o["total"] for o in orders)
    # ⭐ COGS يُحسب ديناميكياً من unified costs map (نفس منطق POS و sales report)
    # — لا من order.total_cost المخزّن (قد يكون قديماً قبل إصلاحات التكلفة).
    _costs_map = await _build_current_costs_map(db, tenant_id)
    _by_id = _costs_map["by_id"]
    _by_name = _costs_map["by_name"]
    total_cost_of_goods = 0.0
    for o in orders:
        for item in o.get("items", []):
            pid_ref = item.get("product_id")
            pid_name = item.get("product_name") or item.get("name") or ""
            entry = _by_id.get(pid_ref) or _by_name.get(pid_name) or {"unit_cost": 0.0, "unit_pkg": 0.0}
            try:
                qty = float(item.get("quantity") or 0)
            except (TypeError, ValueError):
                qty = 0
            total_cost_of_goods += (entry["unit_cost"] + entry["unit_pkg"]) * qty
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
    
    expense_query["category"] = {"$ne": "refund"}
    if start_date:
        expense_query["date"] = {"$gte": start_date}
    if end_date:
        expense_query.setdefault("date", {})["$lte"] = end_date
    
    expenses = await db.expenses.find(expense_query, {"_id": 0}).to_list(1000)
    total_expenses = sum(e["amount"] for e in expenses)
    
    # ==================== حساب التكاليف التشغيلية ====================
    # جلب الفروع للحصول على التكاليف الثابتة — استبعاد الأقسام الإدارية
    NON_BRANCH_TYPES = ["central_kitchen", "warehouse", "purchasing"]
    branches_query = {"tenant_id": tenant_id, "is_active": {"$ne": False}}
    if branch_id:
        branches_query["id"] = branch_id
    elif user_branch_id and user_role not in [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER]:
        branches_query["id"] = user_branch_id
    else:
        branches_query["$or"] = [
            {"branch_type": {"$exists": False}},
            {"branch_type": "branch"},
            {"branch_type": None},
            {"branch_type": {"$nin": NON_BRANCH_TYPES}},
        ]
    
    branches = await db.branches.find(branches_query, {"_id": 0}).to_list(100)
    # الفلتر الدفاعي: استبعاد أي قسم إداري قد يتسلل
    if not branch_id:
        branches = [b for b in branches if (b.get("branch_type") or "branch") == "branch"]
    
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
    query = _apply_business_date_filter(query, start_date, end_date)
    
    orders = await db.orders.find(query, {"_id": 0}).to_list(10000)
    
    # نِسَب العمولة محفوظة فعلياً في delivery_app_settings (مفتاحها app_id) — وليست في delivery_apps
    app_settings = await db.delivery_app_settings.find(build_tenant_query(current_user), {"_id": 0}).to_list(100)
    app_rates = {s["app_id"]: s.get("commission_rate", 0) for s in app_settings}
    app_names = {s["app_id"]: s.get("name") for s in app_settings if s.get("name")}
    # دمج مع الشركات الافتراضية لجلب الاسم عند عدم وجود إعداد
    delivery_apps_list = await db.delivery_apps.find({}, {"_id": 0}).to_list(100)
    for app in delivery_apps_list:
        app_names.setdefault(app.get("id"), app.get("name"))
        app_rates.setdefault(app.get("id"), app.get("commission_rate", 0))
    
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
        
        # إعادة حساب العمولة من النسبة الحالية للشركة (القيمة المخزّنة قد تكون محسوبة بنسبة قديمة)
        _rate = app_rates.get(app_id, 0) or 0
        _order_total = o.get("total", 0) or 0
        if _rate and _rate > 0:
            order_commission = round(_order_total * _rate / 100, 2)
        else:
            order_commission = o.get("delivery_commission", 0) or 0

        by_app[app_name]["count"] += 1
        by_app[app_name]["total"] += _order_total
        by_app[app_name]["commission"] += order_commission
        by_app[app_name]["net_amount"] += _order_total - order_commission
        
        # جميع طلبات التوصيل تعتبر آجلة حتى يتم تحصيلها
        is_collected = o.get("delivery_collected", False)
        if is_collected:
            by_app[app_name]["paid_count"] += 1
            by_app[app_name]["paid_amount"] += _order_total - order_commission
        else:
            by_app[app_name]["credit_count"] += 1
            by_app[app_name]["credit_amount"] += _order_total - order_commission
        
        # تفاصيل أصناف الفاتورة للعرض التفصيلي (drill-down)
        order_items = []
        for it in (o.get("items") or []):
            qty = it.get("quantity", it.get("qty", 1)) or 1
            unit_price = it.get("price", it.get("unit_price", 0)) or 0
            line_total = it.get("total", it.get("subtotal", unit_price * qty))
            order_items.append({
                "name": it.get("name") or it.get("product_name") or "صنف",
                "quantity": qty,
                "price": unit_price,
                "discount": it.get("discount", 0) or 0,
                "total": line_total,
                "notes": it.get("notes") or it.get("note")
            })

        by_app[app_name]["orders"].append({
            "id": o.get("id"),
            "order_number": o["order_number"],
            "total": o["total"],
            "subtotal": o.get("subtotal", o["total"]),
            "discount": o.get("discount", 0) or 0,
            "commission": order_commission,
            "net": _order_total - order_commission,
            "delivery_collected": is_collected,
            "customer_name": o.get("customer_name"),
            "payment_method": o.get("payment_method"),
            "created_at": o["created_at"],
            "items": order_items
        })
    
    # إضافة المبالغ المحصلة لكل شركة
    for app_name, data in by_app.items():
        app_id = data["id"]
        data["collected_amount"] = collected_by_app.get(app_id, 0)
        data["remaining_amount"] = data["net_amount"] - data["collected_amount"]
        # نسبة عرض فعّالة للشركات اليدوية (بلا إعداد نسبة) لتطابق العمولة المعروضة
        if (not data["commission_rate"]) and data["total"] > 0 and data["commission"] > 0:
            data["commission_rate"] = round(data["commission"] / data["total"] * 100, 1)
    
    # الإجماليات تُحسب من العمولة المُعاد حسابها (وليست المخزّنة)
    total_all = sum(d["total"] for d in by_app.values())
    total_commission = sum(d["commission"] for d in by_app.values())
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
    
    order_query = _apply_business_date_filter(order_query, start_date, end_date)
    
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


@router.get("/products-by-channel")
async def get_products_by_channel(
    branch_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """تقرير الأصناف المباعة مفصّلاً حسب طريقة الدفع/قناة البيع.
    
    يُرجع قاموس channels حيث المفتاح = اسم القناة بالعربية، والقيمة:
    - channel_key: مفتاح برمجي (cash/credit/delivery_app_<id>/delivery_driver/pending)
    - channel_label: اسم عربي
    - orders_count: عدد الطلبات في هذه القناة
    - total_revenue: إيرادات القناة
    - products: قائمة الأصناف المباعة في هذه القناة (مرتبة بالأكثر مبيعاً)
    """
    db = get_database()
    tenant_id = get_user_tenant_id(current_user)

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

    order_query = _apply_business_date_filter(order_query, start_date, end_date)

    orders = await db.orders.find(order_query, {"_id": 0}).to_list(20000)

    # جلب أسماء شركات التوصيل لعرضها
    delivery_apps = {}
    da_query = {"tenant_id": tenant_id} if tenant_id else {}
    async for da in db.delivery_apps.find(da_query, {"_id": 0, "id": 1, "name": 1}):
        delivery_apps[da["id"]] = da.get("name", "")

    def _classify(order):
        """يحدد قناة الطلب بأولوية واضحة:
        1) شركة توصيل (delivery_app) → قناة مستقلة لكل شركة
        2) سائق توصيل داخلي → "توصيل عن طريق السائقين"
        3) آجل → قناة آجل
        4) بطاقة → قناة بطاقة
        5) نقدي (الافتراضي) → يشمل السفري والصالة والتوصيل النقدي
        """
        pm = (order.get("payment_method") or "").lower()
        order_type = (order.get("order_type") or "").lower()
        delivery_app_id = order.get("delivery_app")
        is_company = bool(order.get("is_delivery_company") or delivery_app_id)
        driver_id = order.get("driver_id")

        # 1) طلب لشركة توصيل (آجل لها)
        if is_company and delivery_app_id:
            app_name = delivery_apps.get(delivery_app_id, order.get("delivery_app_name") or "شركة توصيل")
            return (f"delivery_app__{delivery_app_id}", f"توصيل {app_name}")

        # 2) طلب توصيل عن طريق سائق داخلي (ليس شركة توصيل)
        if order_type == "delivery" and driver_id and not is_company:
            return ("delivery_driver", "توصيل عن طريق السائقين")

        # 3) آجل
        if pm in ("credit", "آجل"):
            return ("credit", "آجل")

        # 4) بطاقة
        if pm in ("card", "بطاقة"):
            return ("card", "بطاقة")

        # 5) معلق (لم يُدفع بعد)
        if pm in ("pending", "معلق"):
            return ("pending", "معلق")

        # 6) نقدي — الافتراضي يشمل السفري والصالة والتوصيل النقدي
        return ("cash", "نقدي")

    # تجميع الأصناف حسب القناة
    channels = {}  # key → {channel_label, orders_count, total_revenue, items: {product_id: {...}}}
    for o in orders:
        ck, label = _classify(o)
        if ck not in channels:
            channels[ck] = {
                "channel_key": ck,
                "channel_label": label,
                "orders_count": 0,
                "total_revenue": 0.0,
                "_items": {},
            }
        channels[ck]["orders_count"] += 1
        channels[ck]["total_revenue"] += float(o.get("total") or 0)
        for it in o.get("items", []):
            pid = it.get("product_id") or it.get("name") or "unknown"
            qty = float(it.get("quantity") or 0)
            unit_price = float(it.get("price") or 0)
            rev = unit_price * qty
            store = channels[ck]["_items"]
            if pid not in store:
                store[pid] = {
                    "product_id": pid,
                    "name": it.get("name") or it.get("product_name") or "",
                    "quantity_sold": 0.0,
                    "revenue": 0.0,
                }
            store[pid]["quantity_sold"] += qty
            store[pid]["revenue"] += rev

    # تحويل items dict → list مرتبة بالأكثر مبيعاً
    out = []
    for ch in channels.values():
        items = list(ch["_items"].values())
        items.sort(key=lambda x: x["quantity_sold"], reverse=True)
        out.append({
            "channel_key": ch["channel_key"],
            "channel_label": ch["channel_label"],
            "orders_count": ch["orders_count"],
            "total_revenue": round(ch["total_revenue"], 2),
            "products": items,
            "products_count": len(items),
        })

    # ترتيب القنوات بالإيرادات تنازلياً
    out.sort(key=lambda x: x["total_revenue"], reverse=True)

    return {
        "channels": out,
        "total_orders": sum(c["orders_count"] for c in out),
        "total_revenue": round(sum(c["total_revenue"] for c in out), 2),
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
    # استثناء المرتجعات والملغية
    query = {
        "payment_method": "credit",
        "created_at": {"$gte": start_date, "$lte": end_date + "T23:59:59"},
        "status": {"$nin": ["cancelled", "refunded"]},  # استثناء المرتجعات والملغية
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
    amount: float  # المبلغ الفعلي المُحصّل (يُودَع في خزينة المالك)
    collected_by: str
    notes: Optional[str] = None
    order_ids: Optional[List[str]] = None  # قائمة الطلبات المحصلة (اختياري)
    expected_amount: Optional[float] = None  # صافي المستحق للفترة (قبل العروض)
    has_offers: bool = False  # هل يوجد عروض/خصومات مع الشركة
    period_start: Optional[str] = None  # بداية فترة التحصيل
    period_end: Optional[str] = None  # نهاية فترة التحصيل
    branch_id: Optional[str] = None
    branch_name: Optional[str] = None
    total_sales: Optional[float] = None  # إجمالي المبيعات قبل الاستقطاع (لإعادة الطباعة)
    commission: Optional[float] = None  # العمولة المستقطعة (لإعادة الطباعة)

@router.post("/delivery/collect")
async def collect_delivery(
    collection: DeliveryCollectionCreate,
    current_user: dict = Depends(get_current_user)
):
    """تسجيل تحصيل من شركة توصيل + إيداع الصافي في خزينة المالك"""
    db = get_database()
    tenant_id = get_user_tenant_id(current_user)
    
    now = datetime.now(timezone.utc)
    # ⭐ تاريخ التحصيل = نهاية فترة التحصيل (ليُحتسب ضمن الشهر الصحيح، مثلاً 31/5) وليس يوم التنفيذ
    collection_date = collection.period_end or now.strftime("%Y-%m-%d")

    # حساب قيمة ونسبة العرض (الفرق بين المستحق والمُحصّل فعلياً)
    expected = collection.expected_amount if collection.expected_amount is not None else collection.amount
    offer_amount = 0.0
    offer_percentage = 0.0
    if collection.has_offers and expected and expected > 0:
        offer_amount = round(expected - collection.amount, 2)
        offer_percentage = round((offer_amount / expected) * 100, 2)

    # اسم الفرع تلقائياً
    branch_id = collection.branch_id or current_user.get("branch_id")
    branch_name = collection.branch_name
    if branch_id and not branch_name:
        br = await db.branches.find_one({"id": branch_id}, {"_id": 0, "name": 1})
        if br:
            branch_name = br.get("name")

    period_label = ""
    if collection.period_start and collection.period_end:
        period_label = f" ({collection.period_start} → {collection.period_end})"

    collection_record = {
        "id": f"del_{now.strftime('%Y%m%d%H%M%S%f')}",
        "delivery_app_id": collection.delivery_app_id,
        "delivery_app_name": collection.delivery_app_name,
        "amount": collection.amount,  # المُحصّل فعلياً
        "expected_amount": expected,  # المستحق قبل العروض
        "total_sales": collection.total_sales,  # إجمالي المبيعات قبل الاستقطاع
        "commission": collection.commission,  # العمولة المستقطعة
        "has_offers": collection.has_offers,
        "offer_amount": offer_amount,
        "offer_percentage": offer_percentage,
        "period_start": collection.period_start,
        "period_end": collection.period_end,
        "collected_by": collection.collected_by,
        "collected_by_user_id": current_user.get("id"),
        "collected_at": now.isoformat(),
        "date": collection_date,
        "time": now.strftime("%H:%M:%S"),
        "notes": collection.notes,
        "order_ids": collection.order_ids or [],
        "tenant_id": tenant_id,
        "branch_id": branch_id,
        "branch_name": branch_name,
        "collection_type": "delivery"
    }

    # ⭐ تقسيم التحصيل حسب الفرع تلقائياً من طلبات الفترة (كل فرع يأخذ حصته من المُحصّل)
    # بما أن جميع الطلبات لنفس الشركة بنفس نسبة العمولة، فالحصة تتناسب مع إجمالي مبيعات كل فرع.
    branch_breakdown = []
    order_ids = collection.order_ids or []
    if order_ids:
        oq = {"id": {"$in": order_ids}}
        if tenant_id:
            oq["tenant_id"] = tenant_id
        ords = await db.orders.find(oq, {"_id": 0, "total": 1, "branch_id": 1, "branch_name": 1}).to_list(10000)
        per_branch = {}
        grand_total = 0.0
        for o in ords:
            t = o.get("total", 0) or 0
            bid = o.get("branch_id") or "__none__"
            pb = per_branch.setdefault(bid, {"branch_id": o.get("branch_id") or branch_id, "branch_name": o.get("branch_name") or branch_name, "total": 0.0})
            pb["total"] += t
            grand_total += t
        if grand_total > 0 and len(per_branch) >= 1:
            items = list(per_branch.values())
            assigned = 0.0
            for i, info in enumerate(items):
                if i < len(items) - 1:
                    share = round(collection.amount * (info["total"] / grand_total), 2)
                else:
                    share = round(collection.amount - assigned, 2)  # الباقي للأخير لتفادي فروق التقريب
                assigned += share
                branch_breakdown.append({"branch_id": info["branch_id"], "branch_name": info["branch_name"], "amount": share})
    collection_record["branch_breakdown"] = branch_breakdown

    await db.delivery_collections.insert_one(collection_record)

    # إيداع الصافي المُحصّل في خزينة المالك تلقائياً — مُقسّماً على الفروع إن أمكن
    deposit_desc = f"تحصيل توصيل - {collection.delivery_app_name}{period_label}"
    if collection.has_offers and offer_amount:
        deposit_desc += f" | عرض مخصوم: {offer_amount:,.0f} ({offer_percentage:.1f}%)"

    # قائمة الإيداعات: إيداع لكل فرع حسب حصته، أو إيداع واحد عند غياب التفصيل
    deposit_targets = branch_breakdown if branch_breakdown else [
        {"branch_id": branch_id, "branch_name": branch_name, "amount": collection.amount}
    ]
    for tgt in deposit_targets:
        if not tgt.get("amount"):
            continue
        await db.owner_deposits.insert_one({
            "id": str(uuid.uuid4()),
            "tenant_id": tenant_id,
            "amount": tgt["amount"],
            "date": collection_date,
            "description": deposit_desc + (f" | الفرع: {tgt.get('branch_name')}" if len(deposit_targets) > 1 and tgt.get("branch_name") else ""),
            "source": "delivery_collection",
            "branch_id": tgt.get("branch_id"),
            "branch_name": tgt.get("branch_name"),
            "external_source": None,
            "ref_collection_id": collection_record["id"],
            "delivery_app_name": collection.delivery_app_name,
            "created_by": collection.collected_by or current_user.get("username") or current_user.get("full_name"),
            "created_at": now.isoformat()
        })
    
    # تحديث الطلبات كمحصلة إذا تم تحديدها
    if collection.order_ids:
        await db.orders.update_many(
            {"id": {"$in": collection.order_ids}},
            {"$set": {"delivery_collected": True, "delivery_collected_at": now.isoformat()}}
        )
    
    collection_record.pop("_id", None)
    
    return {
        "message": "تم تسجيل التحصيل وإيداع المبلغ في خزينة المالك بنجاح",
        "collection": collection_record,
        "offer_amount": offer_amount,
        "offer_percentage": offer_percentage,
        "deposited_to_safe": collection.amount,
        "branch_breakdown": branch_breakdown
    }

class DeliveryResetCollections(BaseModel):
    delivery_app_id: Optional[str] = None  # معرّف الشركة
    delivery_app_name: Optional[str] = None  # اسم الشركة (احتياط للشركات اليدوية بلا معرّف)
    start_date: Optional[str] = None  # تصفير ضمن فترة (اختياري) — افتراضياً يُصفّر الكل
    end_date: Optional[str] = None

@router.post("/delivery/reset-collections")
async def reset_delivery_collections(
    payload: DeliveryResetCollections,
    current_user: dict = Depends(get_current_user)
):
    """تصفير تحصيلات شركة توصيل: حذف سجلات التحصيل + إلغاء إيداعاتها من خزينة المالك + إعادة الطلبات لحالة (غير محصّلة).
    للمالك/المدير فقط."""
    db = get_database()
    tenant_id = get_user_tenant_id(current_user)
    if current_user.get("role", "") not in ["admin", "super_admin", "manager", "branch_manager", "owner"]:
        raise HTTPException(status_code=403, detail="غير مصرح")

    if not payload.delivery_app_id and not payload.delivery_app_name:
        raise HTTPException(status_code=400, detail="يجب تحديد الشركة (المعرّف أو الاسم)")

    # مطابقة الشركة بالمعرّف أو بالاسم (للشركات اليدوية بلا معرّف)
    name_id_or = []
    if payload.delivery_app_id:
        name_id_or.append({"delivery_app_id": payload.delivery_app_id})
    if payload.delivery_app_name:
        name_id_or.append({"delivery_app_name": payload.delivery_app_name})

    query = {"collection_type": "delivery", "$or": name_id_or}
    if tenant_id:
        query["tenant_id"] = tenant_id
    if payload.start_date:
        query["date"] = {"$gte": payload.start_date}
    if payload.end_date:
        query.setdefault("date", {})["$lte"] = payload.end_date

    collections = await db.delivery_collections.find(query, {"_id": 0}).to_list(5000)
    if not collections:
        return {"deleted_collections": 0, "deleted_deposits": 0, "restored_orders": 0, "amount_reversed": 0,
                "message": "لا توجد تحصيلات لهذه الشركة"}

    collection_ids = [c["id"] for c in collections]
    amount_reversed = sum(c.get("amount", 0) or 0 for c in collections)
    # جمع الطلبات المرتبطة لإعادتها لحالة غير محصّلة
    order_ids = []
    for c in collections:
        order_ids.extend(c.get("order_ids") or [])

    # حذف الإيداعات المرتبطة من خزينة المالك
    dep_query = {"ref_collection_id": {"$in": collection_ids}}
    if tenant_id:
        dep_query["tenant_id"] = tenant_id
    dep_result = await db.owner_deposits.delete_many(dep_query)

    # حذف سجلات التحصيل
    col_result = await db.delivery_collections.delete_many({"id": {"$in": collection_ids}})

    # إعادة الطلبات لحالة غير محصّلة
    restored = 0
    if order_ids:
        oq = {"id": {"$in": list(set(order_ids))}}
        if tenant_id:
            oq["tenant_id"] = tenant_id
        ores = await db.orders.update_many(oq, {"$set": {"delivery_collected": False}, "$unset": {"delivery_collected_at": ""}})
        restored = ores.modified_count

    return {
        "deleted_collections": col_result.deleted_count,
        "deleted_deposits": dep_result.deleted_count,
        "restored_orders": restored,
        "amount_reversed": amount_reversed,
        "message": f"تم تصفير التحصيل: حُذف {col_result.deleted_count} سجل تحصيل وأُلغي {dep_result.deleted_count} إيداع بمبلغ {amount_reversed:,.0f} من خزينة المالك"
    }


# ==================== UNASSIGNED DELIVERY ORDERS (شركة توصيل غير محددة) ====================
# خريطة شركات التوصيل الافتراضية (نفس منطق تقرير المبيعات)
_DEFAULT_DELIVERY_APPS = {
    "toters": "توترز", "talabat": "طلبات", "baly": "بالي",
    "alsaree3": "عالسريع", "talabati": "طلباتي",
}

def _resolve_company_name(o, app_names):
    """يطابق منطق تقرير المبيعات بالضبط لتحديد اسم الشركة (أو None = غير محددة)."""
    app_name = o.get("delivery_app_name")
    if not app_name and o.get("delivery_app"):
        app_name = _DEFAULT_DELIVERY_APPS.get(o.get("delivery_app"), app_names.get(o.get("delivery_app"), None))
    if not app_name and o.get("delivery_company_name"):
        app_name = o.get("delivery_company_name")
    return app_name  # None → غير محددة

@router.get("/delivery/unassigned-orders")
async def get_unassigned_delivery_orders(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """قائمة طلبات التوصيل التي بلا شركة محددة (تظهر كـ 'شركة توصيل (غير محددة)' في تقرير المبيعات) — للتوجيه اليدوي.
    يطابق منطق التقرير تماماً: طلب لشركة توصيل لا يُحلّ اسمها من delivery_app_name/delivery_app/delivery_company_name."""
    db = get_database()
    tenant_id = get_user_tenant_id(current_user)

    # نفس قاعدة استبعاد التقرير بالضبط (بلا فلتر is_company في Mongo — نُطبّقه في Python لمطابقة التقرير 100%)
    query = {"status": {"$nin": ["cancelled", "refunded"]}, "is_refunded": {"$ne": True}}
    if tenant_id:
        query["tenant_id"] = tenant_id
    else:
        query["$or"] = [{"tenant_id": {"$exists": False}}, {"tenant_id": None}]
    query = _apply_business_date_filter(query, start_date, end_date)

    candidates = await db.orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(20000)
    delivery_apps = await db.delivery_apps.find({}, {"_id": 0}).to_list(100)
    app_names = {app["id"]: app["name"] for app in delivery_apps}

    is_company_count = 0
    paid_company_count = 0
    unassigned_inline = 0  # محسوب بمنطق التقرير الحرفي (للتشخيص)
    samples = []
    result = []
    for o in candidates:
        pm = o.get("payment_method", "cash")
        is_company = bool(o.get("is_delivery_company")) or o.get("delivery_app") or o.get("delivery_app_name") or pm == "delivery_company"
        if not is_company:
            continue
        is_company_count += 1
        # نفس فلتر التقرير: تُعرض المبيعات للطلبات paid/credit/None
        if o.get("payment_status") not in ["paid", "credit", None]:
            continue
        paid_company_count += 1

        # منطق التقرير الحرفي بالكامل (نفس get_sales_report) لتحديد "غير محددة"
        app_name = o.get("delivery_app_name")
        if not app_name and o.get("delivery_app"):
            app_name = _DEFAULT_DELIVERY_APPS.get(o.get("delivery_app"), app_names.get(o.get("delivery_app"), None))
        if not app_name and o.get("delivery_company_name"):
            app_name = o.get("delivery_company_name")
        is_unassigned = not app_name

        if len(samples) < 5:
            samples.append({
                "order_number": o.get("order_number"),
                "delivery_app": repr(o.get("delivery_app")),
                "delivery_app_name": repr(o.get("delivery_app_name")),
                "delivery_company_name": repr(o.get("delivery_company_name")),
                "payment_method": o.get("payment_method"),
                "is_delivery_company": repr(o.get("is_delivery_company")),
                "resolved": repr(app_name),
                "is_unassigned": is_unassigned,
            })

        if is_unassigned:
            unassigned_inline += 1
            result.append({
                "id": o.get("id"),
                "order_number": o.get("order_number"),
                "total": o.get("total", 0),
                "customer_name": o.get("customer_name"),
                "branch_name": o.get("branch_name"),
                "created_at": o.get("created_at"),
                "payment_status": o.get("payment_status"),
            })
    logger.info(f"[unassigned-debug] range={start_date}..{end_date} tenant={tenant_id} candidates={len(candidates)} company={is_company_count} paid={paid_company_count} unassigned={unassigned_inline} samples={samples}")
    return {
        "orders": result,
        "count": len(result),
        "total_amount": sum(o.get("total", 0) or 0 for o in result),
        "debug": {
            "candidates": len(candidates),
            "delivery_company_orders": is_company_count,
            "paid_company_orders": paid_company_count,
            "unassigned_inline": unassigned_inline,
            "start_date": start_date,
            "end_date": end_date,
            "tenant_id": tenant_id,
            "samples": samples,
        },
    }

class ReassignUnassignedPayload(BaseModel):
    order_ids: List[str]
    delivery_company_id: Optional[str] = None
    delivery_company_name: Optional[str] = None
    return_to_credit: bool = False  # إرجاع للآجل العادي بدل تعيين شركة

@router.post("/delivery/reassign-unassigned")
async def reassign_unassigned_delivery_orders(
    payload: ReassignUnassignedPayload,
    current_user: dict = Depends(get_current_user)
):
    """توجيه جماعي لطلبات 'شركة توصيل (غير محددة)': إمّا تعيينها لشركة محددة، أو إرجاعها للآجل العادي."""
    db = get_database()
    tenant_id = get_user_tenant_id(current_user)
    if current_user.get("role", "") not in ["admin", "super_admin", "manager", "branch_manager", "owner"]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    if not payload.order_ids:
        raise HTTPException(status_code=400, detail="لم تُحدَّد أي طلبات")

    oq = {"id": {"$in": payload.order_ids}}
    if tenant_id:
        oq["tenant_id"] = tenant_id
    now_iso = datetime.now(timezone.utc).isoformat()

    if payload.return_to_credit:
        # إرجاع للآجل العادي: إزالة كل وسوم شركة التوصيل
        update_set = {
            "customer_type": None,
            "is_delivery_company": False,
            "delivery_app": None,
            "delivery_app_name": None,
            "delivery_company_id": None,
            "delivery_company": None,
            "delivery_company_name": None,
            "delivery_commission": 0,
            "payment_method": "credit",
            "payment_status": "unpaid",
            "company_unassigned_at": now_iso,
            "updated_at": now_iso,
        }
        res = await db.orders.update_many(oq, {"$set": update_set})
        return {"updated": res.modified_count, "mode": "return_to_credit",
                "message": f"تم إرجاع {res.modified_count} طلب للآجل العادي — يمكنك الآن توجيهها يدوياً"}

    # تعيين لشركة محددة
    if not payload.delivery_company_id:
        raise HTTPException(status_code=400, detail="يجب اختيار الشركة")
    company_name = (payload.delivery_company_name or "").strip()
    if not company_name:
        app_doc = await db.delivery_apps.find_one({"id": payload.delivery_company_id}, {"_id": 0, "name": 1})
        company_name = (app_doc or {}).get("name") or payload.delivery_company_id

    # نسبة العمولة الحالية للشركة
    settings = await db.delivery_app_settings.find_one(
        {"app_id": payload.delivery_company_id, **({"tenant_id": tenant_id} if tenant_id else {})}, {"_id": 0})
    rate = (settings or {}).get("commission_rate", 0) or 0

    orders = await db.orders.find(oq, {"_id": 0, "id": 1, "total": 1}).to_list(5000)
    updated = 0
    for o in orders:
        commission = round((o.get("total", 0) or 0) * rate / 100, 2) if rate else 0
        await db.orders.update_one({"id": o["id"]}, {"$set": {
            "customer_type": "delivery_company",
            "delivery_company_id": payload.delivery_company_id,
            "delivery_company": company_name,
            "delivery_company_name": company_name,
            "delivery_app": payload.delivery_company_id,
            "delivery_app_name": company_name,
            "is_delivery_company": True,
            "delivery_commission": commission,
            "order_type": "delivery",
            "payment_method": "delivery_company",
            "company_assigned_at": now_iso,
            "company_assigned_by_name": current_user.get("full_name") or current_user.get("username"),
            "updated_at": now_iso,
        }})
        updated += 1
    return {"updated": updated, "mode": "assigned", "company_name": company_name,
            "message": f"تم توجيه {updated} طلب إلى شركة {company_name}"}




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
