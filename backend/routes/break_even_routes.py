"""
Break-Even Routes - نقطة التعادل اليومية/الشهرية
Extracted from server.py for modular maintainability.
"""
from fastapi import APIRouter, Depends, HTTPException
from typing import Optional
from datetime import datetime, timezone, timedelta
import logging

from .shared import get_current_user, get_user_tenant_id, get_database, UserRole

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Break Even"])

# lazy DB proxy: resolves the motor client at request time (correct event loop),
# avoiding a module-import-time client bind that breaks under production ASGI servers
class _LazyDB:
    def __getattr__(self, name):
        return getattr(get_database(), name)

db = _LazyDB()


def _sn(val, default=0):
    """Safe number: converts None to default for math ops."""
    if val is None:
        return default
    try:
        return float(val)
    except (TypeError, ValueError):
        return default


@router.get("/break-even/daily")
async def get_daily_break_even(
    branch_id: Optional[str] = None,
    date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """
    حساب نقطة التعادل اليومية
    - التكاليف الثابتة الشهرية (إيجار، ماء، كهرباء، مولدة) / 30 يوم
    - إجمالي رواتب الموظفين في الفرع / 30 يوم
    - مقارنة الأرباح اليومية بالهدف
    - بعد تغطية التكاليف، كل ربح إضافي = ربح صافي 100%
    """
    tenant_id = get_user_tenant_id(current_user)
    
    # تحديد التاريخ
    if date:
        target_date = datetime.fromisoformat(date).replace(tzinfo=timezone.utc)
    else:
        target_date = datetime.now(timezone.utc)
    
    start_of_day = target_date.replace(hour=0, minute=0, second=0, microsecond=0)
    end_of_day = target_date.replace(hour=23, minute=59, second=59, microsecond=999999)
    
    # جلب الفرع أو جميع الفروع — استبعاد الأقسام الإدارية (مطبخ مركزي/مخزن/مشتريات)
    # لأنها ليست فروع بيع، فقط الموارد البشرية تظهرها.
    NON_BRANCH_TYPES = ["central_kitchen", "warehouse", "purchasing"]
    branches_query = {"tenant_id": tenant_id, "is_active": {"$ne": False}}
    if branch_id:
        branches_query["id"] = branch_id
    else:
        # استبعد الأقسام الإدارية فقط عند طلب "جميع الفروع"
        branches_query["$or"] = [
            {"branch_type": {"$exists": False}},
            {"branch_type": "branch"},
            {"branch_type": None},
            {"branch_type": {"$nin": NON_BRANCH_TYPES}},
        ]
    
    branches = await db.branches.find(branches_query, {"_id": 0}).to_list(100)
    # ⭐ صفِّ الفروع الفعلية فقط (دفاع إضافي ضد أي بيانات قديمة)
    branches = [b for b in branches if (b.get("branch_type") or "branch") == "branch"]
    
    # ⭐ احسب رواتب موظفي الأقسام الإدارية (مطبخ مركزي/مخزن/مشتريات) لتوزيعها كـ
    # "رواتب خارجية" على كل فرع فعلي بالتساوي. هذا يضمن أن التكاليف الإدارية
    # تُحتسب ضمن break-even الفعلي.
    external_dept_branches = await db.branches.find({
        "tenant_id": tenant_id,
        "is_active": {"$ne": False},
        "branch_type": {"$in": NON_BRANCH_TYPES},
    }, {"_id": 0, "id": 1, "name": 1, "branch_type": 1}).to_list(50)
    external_dept_ids = [b["id"] for b in external_dept_branches]
    external_employees_docs = []
    if external_dept_ids:
        external_employees_docs = await db.employees.find({
            "tenant_id": tenant_id,
            "branch_id": {"$in": external_dept_ids},
            "is_active": {"$ne": False},
        }, {"_id": 0, "id": 1, "name": 1, "salary": 1, "branch_id": 1}).to_list(500)
    total_external_monthly_salaries = sum(_sn(e.get("salary")) for e in external_employees_docs)
    total_external_daily_salaries = total_external_monthly_salaries / 30
    # نصيب كل فرع فعلي بالتساوي
    num_active_branches = len([b for b in branches if (b.get("branch_type") or "branch") == "branch"]) or 1
    external_daily_per_branch = total_external_daily_salaries / num_active_branches if num_active_branches > 0 else 0
    # خريطة الأقسام {dept_id: name} لاستخدامها في breakdown
    external_dept_name_map = {b["id"]: b.get("name") or "" for b in external_dept_branches}
    # تجميع الموظفين الخارجيين مع أسماء أقسامهم لإظهار breakdown
    external_employees_summary = [
        {
            "id": e.get("id"),
            "name": e.get("name"),
            "department": external_dept_name_map.get(e.get("branch_id"), ""),
            "monthly_salary": _sn(e.get("salary")),
            "daily_salary": _sn(e.get("salary")) / 30,
            "share_per_branch_daily": (_sn(e.get("salary")) / 30) / num_active_branches if num_active_branches > 0 else 0,
        }
        for e in external_employees_docs
    ]
    
    if not branches:
        return {
            "date": target_date.strftime("%Y-%m-%d"),
            "branches": [],
            "total_daily_target": 0,
            "total_daily_profit": 0,
            "total_coverage_percentage": 0,
            "is_break_even_reached": False,
            "net_profit_after_break_even": 0,
            "external_salaries": {
                "total_monthly": total_external_monthly_salaries,
                "total_daily": total_external_daily_salaries,
                "per_branch_daily": external_daily_per_branch,
                "employees": external_employees_summary,
                "departments": [b.get("name") for b in external_dept_branches],
            },
        }
    
    result_branches = []
    total_daily_target = 0
    total_daily_profit = 0
    
    for branch in branches:
        branch_id_val = branch.get("id")
        
        # حساب التكاليف الثابتة اليومية للفرع
        rent_cost = _sn(branch.get("rent_cost")) / 30
        water_cost = _sn(branch.get("water_cost")) / 30
        electricity_cost = _sn(branch.get("electricity_cost")) / 30
        generator_cost = _sn(branch.get("generator_cost")) / 30
        fixed_costs_daily = rent_cost + water_cost + electricity_cost + generator_cost
        
        # حساب رواتب الموظفين في الفرع (شهرياً / 30)
        employees = await db.employees.find({
            "tenant_id": tenant_id,
            "branch_id": branch_id_val,
            "is_active": {"$ne": False}
        }, {"_id": 0, "salary": 1}).to_list(1000)
        
        total_monthly_salaries = sum(_sn(emp.get("salary")) for emp in employees)
        daily_salaries = total_monthly_salaries / 30
        
        # ⭐ المصاريف اليومية (من expenses collection — تُسجَّل يوماً بيوم، ليست شهرية)
        target_date_str = target_date.strftime("%Y-%m-%d")
        start_of_day = datetime.combine(target_date, datetime.min.time())
        end_of_day = datetime.combine(target_date, datetime.max.time())
        daily_expenses_docs = await db.expenses.find({
            "tenant_id": tenant_id,
            "branch_id": branch_id_val,
            "$or": [
                {"business_date": target_date_str},
                {
                    "business_date": {"$exists": False},
                    "date": {"$gte": start_of_day.isoformat(), "$lte": end_of_day.isoformat()},
                },
            ],
        }, {"_id": 0, "amount": 1}).to_list(10000)
        daily_other_expenses = sum(_sn(e.get("amount")) for e in daily_expenses_docs)
        
        # الهدف اليومي = التكاليف الثابتة + الرواتب + المصاريف اليومية + حصة الرواتب الخارجية
        daily_target = fixed_costs_daily + daily_salaries + daily_other_expenses + external_daily_per_branch
        
        # جلب الطلبات المكتملة لهذا اليوم في هذا الفرع
        # جلب الطلبات المكتملة في هذا اليوم باستخدام business_date (اليوم التشغيلي)
        target_date_str = target_date.strftime("%Y-%m-%d")
        orders_query = {
            "tenant_id": tenant_id,
            "branch_id": branch_id_val,
            "status": {"$in": ["delivered", "ready"]},
            "$or": [
                {"business_date": target_date_str},
                {
                    "business_date": {"$exists": False},
                    "created_at": {
                        "$gte": start_of_day.isoformat(),
                        "$lte": end_of_day.isoformat()
                    }
                }
            ]
        }
        
        orders = await db.orders.find(orders_query, {"_id": 0, "total": 1, "total_cost": 1, "profit": 1}).to_list(10000)
        
        # حساب الربح الإجمالي (من المواد الخام فقط)
        daily_gross_profit = sum(_sn(o.get("profit")) for o in orders)
        daily_sales = sum(_sn(o.get("total")) for o in orders)
        daily_material_cost = sum(_sn(o.get("total_cost")) for o in orders)
        
        # نسبة التغطية
        coverage_percentage = (daily_gross_profit / daily_target * 100) if daily_target > 0 else 0
        
        # هل تم الوصول لنقطة التعادل؟
        is_break_even_reached = daily_gross_profit >= daily_target
        
        # الربح الصافي بعد نقطة التعادل
        net_profit = max(0, daily_gross_profit - daily_target)
        
        # المتبقي من كل تكلفة
        remaining_to_cover = max(0, daily_target - daily_gross_profit)
        
        # توزيع المتبقي على التكاليف (بنسب متساوية أو حسب الأولوية)
        if remaining_to_cover > 0 and daily_target > 0:
            ratio = remaining_to_cover / daily_target
            remaining_rent = rent_cost * ratio
            remaining_water = water_cost * ratio
            remaining_electricity = electricity_cost * ratio
            remaining_generator = generator_cost * ratio
            remaining_salaries = daily_salaries * ratio
            remaining_other_expenses = daily_other_expenses * ratio
        else:
            remaining_rent = 0
            remaining_water = 0
            remaining_electricity = 0
            remaining_generator = 0
            remaining_salaries = 0
            remaining_other_expenses = 0
        
        # المبالغ المغطاة من كل تكلفة
        covered_amount = min(daily_gross_profit, daily_target)
        if daily_target > 0:
            covered_ratio = covered_amount / daily_target
            covered_rent = rent_cost * covered_ratio
            covered_water = water_cost * covered_ratio
            covered_electricity = electricity_cost * covered_ratio
            covered_generator = generator_cost * covered_ratio
            covered_salaries = daily_salaries * covered_ratio
            covered_other_expenses = daily_other_expenses * covered_ratio
        else:
            covered_rent = 0
            covered_water = 0
            covered_electricity = 0
            covered_generator = 0
            covered_salaries = 0
            covered_other_expenses = 0
        
        branch_result = {
            "branch_id": branch_id_val,
            "branch_name": branch.get("name"),
            "date": target_date.strftime("%Y-%m-%d"),
            
            # التكاليف الثابتة اليومية
            "fixed_costs": {
                "rent": {"monthly": _sn(branch.get("rent_cost")), "daily": rent_cost, "covered": covered_rent, "remaining": remaining_rent},
                "water": {"monthly": _sn(branch.get("water_cost")), "daily": water_cost, "covered": covered_water, "remaining": remaining_water},
                "electricity": {"monthly": _sn(branch.get("electricity_cost")), "daily": electricity_cost, "covered": covered_electricity, "remaining": remaining_electricity},
                "generator": {"monthly": _sn(branch.get("generator_cost")), "daily": generator_cost, "covered": covered_generator, "remaining": remaining_generator},
                "total_daily": fixed_costs_daily
            },
            
            # الرواتب
            "salaries": {
                "monthly_total": total_monthly_salaries,
                "daily": daily_salaries,
                "covered": covered_salaries,
                "remaining": remaining_salaries,
                "employees_count": len(employees)
            },
            
            # ⭐ مصاريف يومية أخرى (من expenses collection)
            "other_expenses": {
                "daily": daily_other_expenses,
                "covered": covered_other_expenses,
                "remaining": remaining_other_expenses,
                "count": len(daily_expenses_docs),
            },
            # ⭐ حصة الفرع من الرواتب الخارجية (المطبخ المركزي/المخزن/المشتريات)
            "external_salaries_share": {
                "daily": external_daily_per_branch,
                "monthly_equivalent": external_daily_per_branch * 30,
            },
            
            # الهدف والإنجاز
            "daily_target": daily_target,
            "daily_sales": daily_sales,
            "daily_material_cost": daily_material_cost,
            "daily_gross_profit": daily_gross_profit,
            "coverage_percentage": round(coverage_percentage, 1),
            "is_break_even_reached": is_break_even_reached,
            "remaining_to_break_even": max(0, daily_target - daily_gross_profit),
            "net_profit_after_break_even": net_profit,
            "orders_count": len(orders)
        }
        
        result_branches.append(branch_result)
        total_daily_target += daily_target
        total_daily_profit += daily_gross_profit
    
    # الإجمالي لجميع الفروع
    total_coverage = (total_daily_profit / total_daily_target * 100) if total_daily_target > 0 else 0
    
    return {
        "date": target_date.strftime("%Y-%m-%d"),
        "branches": result_branches,
        "total_daily_target": total_daily_target,
        "total_daily_profit": total_daily_profit,
        "total_coverage_percentage": round(total_coverage, 1),
        "is_break_even_reached": total_daily_profit >= total_daily_target,
        "net_profit_after_break_even": max(0, total_daily_profit - total_daily_target),
        "total_collected_towards_target": min(total_daily_profit, total_daily_target),
        # ⭐ رواتب موظفي الأقسام الإدارية، موزَّعة على الفروع الفعلية
        "external_salaries": {
            "total_monthly": total_external_monthly_salaries,
            "total_daily": total_external_daily_salaries,
            "per_branch_daily": external_daily_per_branch,
            "branches_count": num_active_branches,
            "employees": external_employees_summary,
            "departments": [b.get("name") for b in external_dept_branches],
        },
    }


@router.get("/break-even/daily-range")
async def get_daily_break_even_range(
    branch_id: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """
    حساب نقطة التعادل لنطاق تاريخ (من - إلى)
    - تجميع كل الأيام في النطاق المحدد
    - حساب إجمالي المستقطع من الأرباح لتغطية الأهداف
    """
    tenant_id = get_user_tenant_id(current_user)
    
    # تحديد التواريخ
    if date_from:
        start_date = datetime.fromisoformat(date_from).replace(tzinfo=timezone.utc, hour=0, minute=0, second=0, microsecond=0)
    else:
        start_date = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    
    if date_to:
        end_date = datetime.fromisoformat(date_to).replace(tzinfo=timezone.utc, hour=23, minute=59, second=59, microsecond=999999)
    else:
        end_date = datetime.now(timezone.utc).replace(hour=23, minute=59, second=59, microsecond=999999)
    
    # حساب عدد الأيام في النطاق
    days_count = (end_date.date() - start_date.date()).days + 1
    
    # جلب الفرع أو جميع الفروع — استبعاد الأقسام الإدارية (نفس منطق /break-even/daily)
    NON_BRANCH_TYPES = ["central_kitchen", "warehouse", "purchasing"]
    branches_query = {"tenant_id": tenant_id, "is_active": {"$ne": False}}
    if branch_id:
        branches_query["id"] = branch_id
    else:
        branches_query["$or"] = [
            {"branch_type": {"$exists": False}},
            {"branch_type": "branch"},
            {"branch_type": None},
            {"branch_type": {"$nin": NON_BRANCH_TYPES}},
        ]
    
    branches = await db.branches.find(branches_query, {"_id": 0}).to_list(100)
    branches = [b for b in branches if (b.get("branch_type") or "branch") == "branch"]
    
    # ⭐ رواتب الأقسام الإدارية للفترة، موزَّعة على الفروع الفعلية
    external_dept_branches_r = await db.branches.find({
        "tenant_id": tenant_id,
        "is_active": {"$ne": False},
        "branch_type": {"$in": NON_BRANCH_TYPES},
    }, {"_id": 0, "id": 1, "name": 1, "branch_type": 1}).to_list(50)
    external_dept_ids_r = [b["id"] for b in external_dept_branches_r]
    external_employees_docs_r = []
    if external_dept_ids_r:
        external_employees_docs_r = await db.employees.find({
            "tenant_id": tenant_id,
            "branch_id": {"$in": external_dept_ids_r},
            "is_active": {"$ne": False},
        }, {"_id": 0, "id": 1, "name": 1, "salary": 1, "branch_id": 1}).to_list(500)
    total_ext_monthly_r = sum(_sn(e.get("salary")) for e in external_employees_docs_r)
    total_ext_range_r = (total_ext_monthly_r / 30) * days_count
    num_real_branches_r = len(branches) or 1
    external_share_per_branch_range = total_ext_range_r / num_real_branches_r if num_real_branches_r > 0 else 0
    ext_dept_name_map_r = {b["id"]: b.get("name") or "" for b in external_dept_branches_r}
    external_employees_summary_r = [
        {
            "id": e.get("id"),
            "name": e.get("name"),
            "department": ext_dept_name_map_r.get(e.get("branch_id"), ""),
            "monthly_salary": _sn(e.get("salary")),
            "range_salary": (_sn(e.get("salary")) / 30) * days_count,
            "share_per_branch_range": ((_sn(e.get("salary")) / 30) * days_count) / num_real_branches_r if num_real_branches_r > 0 else 0,
        }
        for e in external_employees_docs_r
    ]
    
    if not branches:
        return {
            "date_from": start_date.strftime("%Y-%m-%d"),
            "date_to": end_date.strftime("%Y-%m-%d"),
            "days_count": days_count,
            "branches": [],
            "total_daily_target": 0,
            "total_daily_profit": 0,
            "total_coverage_percentage": 0,
            "is_break_even_reached": False,
            "net_profit_after_break_even": 0,
            "total_collected_towards_target": 0
        }
    
    result_branches = []
    total_target = 0
    total_profit = 0
    total_collected = 0
    total_monthly_target = 0
    total_monthly_profit = 0
    
    for branch in branches:
        branch_id_val = branch.get("id")
        
        # القيم الشهرية الأصلية للفرع
        rent_monthly = _sn(branch.get("rent_cost"))
        water_monthly = _sn(branch.get("water_cost"))
        electricity_monthly = _sn(branch.get("electricity_cost"))
        generator_monthly = _sn(branch.get("generator_cost"))
        
        # حساب التكاليف الثابتة للفترة (النطاق)
        rent_cost = (rent_monthly / 30) * days_count
        water_cost = (water_monthly / 30) * days_count
        electricity_cost = (electricity_monthly / 30) * days_count
        generator_cost = (generator_monthly / 30) * days_count
        fixed_costs = rent_cost + water_cost + electricity_cost + generator_cost
        
        # حساب رواتب الموظفين * عدد الأيام
        employees = await db.employees.find({
            "tenant_id": tenant_id,
            "branch_id": branch_id_val,
            "is_active": {"$ne": False}
        }, {"_id": 0, "salary": 1}).to_list(1000)
        
        total_monthly_salaries = sum(_sn(emp.get("salary")) for emp in employees)
        salaries_range = (total_monthly_salaries / 30) * days_count
        
        # ⭐ المصاريف اليومية الأخرى ضمن النطاق (من expenses collection)
        start_date_str = start_date.strftime("%Y-%m-%d")
        end_date_str = end_date.strftime("%Y-%m-%d")
        exp_docs = await db.expenses.find({
            "tenant_id": tenant_id,
            "branch_id": branch_id_val,
            "$or": [
                {"business_date": {"$gte": start_date_str, "$lte": end_date_str}},
                {
                    "business_date": {"$exists": False},
                    "date": {
                        "$gte": datetime.combine(start_date, datetime.min.time()).isoformat(),
                        "$lte": datetime.combine(end_date, datetime.max.time()).isoformat(),
                    },
                },
            ],
        }, {"_id": 0, "amount": 1}).to_list(20000)
        range_other_expenses = sum(_sn(e.get("amount")) for e in exp_docs)
        
        # الهدف الإجمالي للفترة (يشمل حصة الرواتب الخارجية)
        branch_target = fixed_costs + salaries_range + range_other_expenses + external_share_per_branch_range
        
        # الهدف الشهري الكامل (للعرض في monthly view)
        monthly_fixed_costs = rent_monthly + water_monthly + electricity_monthly + generator_monthly
        # متوسط مصاريف يومي × 30 للتقدير الشهري
        avg_daily_other = (range_other_expenses / days_count) if days_count > 0 else 0
        branch_monthly_target = monthly_fixed_costs + total_monthly_salaries + (avg_daily_other * 30)
        
        # جلب الطلبات المكتملة في النطاق لهذا الفرع
        # نستخدم business_date (اليوم التشغيلي) للسجلات الجديدة، و fallback لـ created_at للسجلات القديمة
        orders_query = {
            "tenant_id": tenant_id,
            "branch_id": branch_id_val,
            "status": {"$in": ["delivered", "ready"]},
            "$or": [
                {"business_date": {"$gte": start_date_str, "$lte": end_date_str}},
                {
                    "business_date": {"$exists": False},
                    "created_at": {
                        "$gte": start_date.isoformat(),
                        "$lte": end_date.isoformat()
                    }
                }
            ]
        }
        
        orders = await db.orders.find(orders_query, {"_id": 0, "total": 1, "total_cost": 1, "profit": 1}).to_list(10000)
        
        # حساب الأرباح والمبيعات
        branch_profit = sum(_sn(o.get("profit")) for o in orders)
        branch_sales = sum(_sn(o.get("total")) for o in orders)
        branch_material_cost = sum(_sn(o.get("total_cost")) for o in orders)
        
        # المستقطع من الربح لتغطية الهدف
        branch_collected = min(branch_profit, branch_target)
        
        # نسبة التغطية
        coverage_percentage = (branch_profit / branch_target * 100) if branch_target > 0 else 0
        
        # هل تم الوصول لنقطة التعادل؟
        is_break_even_reached = branch_profit >= branch_target
        
        # الربح الصافي بعد نقطة التعادل
        net_profit = max(0, branch_profit - branch_target)
        
        # المتبقي من كل تكلفة
        remaining_to_cover = max(0, branch_target - branch_profit)
        if remaining_to_cover > 0 and branch_target > 0:
            ratio = remaining_to_cover / branch_target
            remaining_rent = rent_cost * ratio
            remaining_water = water_cost * ratio
            remaining_electricity = electricity_cost * ratio
            remaining_generator = generator_cost * ratio
            remaining_salaries = salaries_range * ratio
        else:
            remaining_rent = remaining_water = remaining_electricity = remaining_generator = remaining_salaries = 0
        
        # المبالغ المغطاة من كل تكلفة
        covered_amount = min(branch_profit, branch_target)
        if branch_target > 0:
            covered_ratio = covered_amount / branch_target
            covered_rent = rent_cost * covered_ratio
            covered_water = water_cost * covered_ratio
            covered_electricity = electricity_cost * covered_ratio
            covered_generator = generator_cost * covered_ratio
            covered_salaries = salaries_range * covered_ratio
        else:
            covered_rent = covered_water = covered_electricity = covered_generator = covered_salaries = 0
        
        branch_result = {
            # مفاتيح المعرّف والاسم - يدعم frontend القديم والجديد
            "id": branch_id_val,
            "branch_id": branch_id_val,
            "name": branch.get("name", "فرع غير مسمى"),
            "branch_name": branch.get("name", "فرع غير مسمى"),
            
            # الأهداف
            "target": branch_target,
            "daily_target": branch_target,  # للنطاق اليومي (قد يكون متعدد الأيام)
            "monthly_target": branch_monthly_target,
            
            # الأرباح والمبيعات
            "profit": branch_profit,
            "daily_gross_profit": branch_profit,
            "monthly_gross_profit": branch_profit,  # نفس القيمة لأن النطاق هو ما تم طلبه
            "sales": branch_sales,
            "daily_sales": branch_sales,
            "monthly_sales": branch_sales,
            "daily_material_cost": branch_material_cost,
            "monthly_material_cost": branch_material_cost,
            
            # الإحصائيات
            "collected_towards_target": branch_collected,
            "coverage_percentage": round(coverage_percentage, 1),
            "is_break_even_reached": is_break_even_reached,
            "remaining_to_break_even": remaining_to_cover,
            "net_profit_after_break_even": net_profit,
            "net_profit_after_costs": net_profit,
            "orders_count": len(orders),
            
            # التكاليف الثابتة - بنية متداخلة كما يتوقعها الـ frontend
            "fixed_costs": {
                "rent": {
                    "monthly": rent_monthly, "daily": rent_cost,
                    "covered": covered_rent, "remaining": remaining_rent
                },
                "water": {
                    "monthly": water_monthly, "daily": water_cost,
                    "covered": covered_water, "remaining": remaining_water
                },
                "electricity": {
                    "monthly": electricity_monthly, "daily": electricity_cost,
                    "covered": covered_electricity, "remaining": remaining_electricity
                },
                "generator": {
                    "monthly": generator_monthly, "daily": generator_cost,
                    "covered": covered_generator, "remaining": remaining_generator
                },
                "total_daily": fixed_costs,
                "total": fixed_costs  # للتوافق مع الـ frontend القديم
            },
            
            # الرواتب - بنية متداخلة مع تفاصيل كاملة
            "salaries": {
                "monthly_total": total_monthly_salaries,
                "total": salaries_range,
                "daily": salaries_range,  # للنطاق
                "covered": covered_salaries,
                "remaining": remaining_salaries,
                "employees_count": len(employees)
            },
            # ⭐ مصاريف يومية أخرى (من expenses collection) ضمن النطاق
            "other_expenses": {
                "total": range_other_expenses,
                "daily": range_other_expenses,
                "monthly_estimate": avg_daily_other * 30,
                "count": len(exp_docs),
            }
        }
        
        result_branches.append(branch_result)
        total_target += branch_target
        total_profit += branch_profit
        total_collected += branch_collected
        total_monthly_target += branch_monthly_target
        total_monthly_profit += branch_profit
    
    # الإجمالي لجميع الفروع
    total_coverage = (total_profit / total_target * 100) if total_target > 0 else 0
    
    return {
        "date_from": start_date.strftime("%Y-%m-%d"),
        "date_to": end_date.strftime("%Y-%m-%d"),
        "days_count": days_count,
        "branches": result_branches,
        "total_daily_target": total_target,
        "total_monthly_target": total_monthly_target,
        "total_daily_profit": total_profit,
        "total_monthly_profit": total_monthly_profit,
        "total_coverage_percentage": round(total_coverage, 1),
        "is_break_even_reached": total_profit >= total_target,
        "net_profit_after_break_even": max(0, total_profit - total_target),
        "net_profit_after_costs": max(0, total_profit - total_target),
        "total_collected_towards_target": total_collected,
        # ⭐ رواتب الأقسام الإدارية للنطاق (Daily-Range)
        "external_salaries": {
            "total_monthly": total_ext_monthly_r,
            "total_range": total_ext_range_r,
            "per_branch_range": external_share_per_branch_range,
            "branches_count": num_real_branches_r,
            "employees": external_employees_summary_r,
            "departments": [b.get("name") for b in external_dept_branches_r],
        },
    }


@router.get("/break-even/monthly-summary")
async def get_monthly_break_even_summary(
    branch_id: Optional[str] = None,
    month: Optional[str] = None,  # YYYY-MM
    current_user: dict = Depends(get_current_user)
):
    """
    ملخص نقطة التعادل الشهرية
    - إجمالي التكاليف الثابتة والرواتب للشهر
    - إجمالي الأرباح الشهرية
    - عدد الأيام التي تم فيها تحقيق نقطة التعادل
    """
    tenant_id = get_user_tenant_id(current_user)
    
    # تحديد الشهر
    if month:
        year, m = map(int, month.split("-"))
        start_date = datetime(year, m, 1, tzinfo=timezone.utc)
    else:
        now = datetime.now(timezone.utc)
        start_date = datetime(now.year, now.month, 1, tzinfo=timezone.utc)
    
    # نهاية الشهر
    if start_date.month == 12:
        end_date = datetime(start_date.year + 1, 1, 1, tzinfo=timezone.utc) - timedelta(seconds=1)
    else:
        end_date = datetime(start_date.year, start_date.month + 1, 1, tzinfo=timezone.utc) - timedelta(seconds=1)
    
    days_in_month = (end_date - start_date).days + 1
    
    # جلب الفرع أو جميع الفروع — استبعاد الأقسام الإدارية
    NON_BRANCH_TYPES = ["central_kitchen", "warehouse", "purchasing"]
    branches_query = {"tenant_id": tenant_id, "is_active": {"$ne": False}}
    if branch_id:
        branches_query["id"] = branch_id
    else:
        branches_query["$or"] = [
            {"branch_type": {"$exists": False}},
            {"branch_type": "branch"},
            {"branch_type": None},
            {"branch_type": {"$nin": NON_BRANCH_TYPES}},
        ]
    
    branches = await db.branches.find(branches_query, {"_id": 0}).to_list(100)
    branches = [b for b in branches if (b.get("branch_type") or "branch") == "branch"]
    
    result_branches = []
    total_monthly_target = 0
    total_monthly_profit = 0
    
    for branch in branches:
        branch_id_val = branch.get("id")
        
        # التكاليف الثابتة الشهرية
        rent_cost = _sn(branch.get("rent_cost"))
        water_cost = _sn(branch.get("water_cost"))
        electricity_cost = _sn(branch.get("electricity_cost"))
        generator_cost = _sn(branch.get("generator_cost"))
        total_fixed_costs = rent_cost + water_cost + electricity_cost + generator_cost
        
        # رواتب الموظفين
        employees = await db.employees.find({
            "tenant_id": tenant_id,
            "branch_id": branch_id_val,
            "is_active": {"$ne": False}
        }, {"_id": 0, "salary": 1, "name": 1}).to_list(1000)
        
        total_salaries = sum(_sn(emp.get("salary")) for emp in employees)
        
        # الهدف الشهري
        monthly_target = total_fixed_costs + total_salaries
        
        # جلب الطلبات المكتملة لهذا الشهر
        orders_query = {
            "tenant_id": tenant_id,
            "branch_id": branch_id_val,
            "status": {"$in": ["delivered", "ready"]},
            "created_at": {
                "$gte": start_date.isoformat(),
                "$lte": end_date.isoformat()
            }
        }
        
        orders = await db.orders.find(orders_query, {"_id": 0}).to_list(100000)
        
        monthly_sales = sum(_sn(o.get("total")) for o in orders)
        monthly_material_cost = sum(_sn(o.get("total_cost")) for o in orders)
        monthly_gross_profit = sum(_sn(o.get("profit")) for o in orders)
        
        # نسبة التغطية
        coverage_percentage = (monthly_gross_profit / monthly_target * 100) if monthly_target > 0 else 0
        
        branch_result = {
            "branch_id": branch_id_val,
            "branch_name": branch.get("name"),
            "month": start_date.strftime("%Y-%m"),
            
            "fixed_costs": {
                "rent": rent_cost,
                "water": water_cost,
                "electricity": electricity_cost,
                "generator": generator_cost,
                "total": total_fixed_costs
            },
            
            "salaries": {
                "total": total_salaries,
                "employees_count": len(employees),
                "employees": [{"name": e.get("name"), "salary": e.get("salary")} for e in employees]
            },
            
            "monthly_target": monthly_target,
            "monthly_sales": monthly_sales,
            "monthly_material_cost": monthly_material_cost,
            "monthly_gross_profit": monthly_gross_profit,
            "coverage_percentage": round(coverage_percentage, 1),
            "is_break_even_reached": monthly_gross_profit >= monthly_target,
            "remaining_to_break_even": max(0, monthly_target - monthly_gross_profit),
            "net_profit_after_costs": max(0, monthly_gross_profit - monthly_target),
            "orders_count": len(orders)
        }
        
        result_branches.append(branch_result)
        total_monthly_target += monthly_target
        total_monthly_profit += monthly_gross_profit
    
    total_coverage = (total_monthly_profit / total_monthly_target * 100) if total_monthly_target > 0 else 0
    
    return {
        "month": start_date.strftime("%Y-%m"),
        "days_in_month": days_in_month,
        "branches": result_branches,
        "total_monthly_target": total_monthly_target,
        "total_monthly_profit": total_monthly_profit,
        "total_coverage_percentage": round(total_coverage, 1),
        "is_break_even_reached": total_monthly_profit >= total_monthly_target,
        "net_profit_after_costs": max(0, total_monthly_profit - total_monthly_target)
    }


@router.get("/break-even/alerts")
async def get_break_even_alerts(
    current_user: dict = Depends(get_current_user)
):
    """
    تنبيهات نقطة التعادل
    - تظهر فقط للمدير أو الأدمن أو صلاحية محددة
    - تنبيه عند الاقتراب من نقطة التعادل (80%+)
    - تنبيه عند تجاوز نقطة التعادل
    - تنبيه عند الخسارة الكبيرة
    """
    tenant_id = get_user_tenant_id(current_user)
    user_role = current_user.get("role")
    
    # التحقق من الصلاحية - المدير والأدمن فقط يرون التنبيهات
    if user_role not in [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.GENERAL_MANAGER, UserRole.MANAGER]:
        return {"alerts": [], "has_permission": False}
    
    # تحديد التاريخ الحالي
    target_date = datetime.now(timezone.utc)
    start_of_day = target_date.replace(hour=0, minute=0, second=0, microsecond=0)
    end_of_day = target_date.replace(hour=23, minute=59, second=59, microsecond=999999)
    
    # جلب جميع الفروع
    branches = await db.branches.find(
        {"tenant_id": tenant_id, "is_active": {"$ne": False}}, 
        {"_id": 0}
    ).to_list(100)
    
    alerts = []
    
    for branch in branches:
        branch_id = branch.get("id")
        branch_name = branch.get("name")
        
        # حساب التكاليف الثابتة اليومية
        rent_cost = _sn(branch.get("rent_cost")) / 30
        water_cost = _sn(branch.get("water_cost")) / 30
        electricity_cost = _sn(branch.get("electricity_cost")) / 30
        generator_cost = _sn(branch.get("generator_cost")) / 30
        fixed_costs_daily = rent_cost + water_cost + electricity_cost + generator_cost
        
        # حساب رواتب الموظفين اليومية
        employees = await db.employees.find({
            "tenant_id": tenant_id,
            "branch_id": branch_id,
            "is_active": {"$ne": False}
        }, {"_id": 0, "salary": 1}).to_list(1000)
        
        daily_salaries = sum(_sn(emp.get("salary")) for emp in employees) / 30
        
        # الهدف اليومي
        daily_target = fixed_costs_daily + daily_salaries
        
        # إذا لم يكن هناك تكاليف مُعدّة، تخطي هذا الفرع
        if daily_target <= 0:
            continue
        
        # جلب أرباح اليوم
        orders = await db.orders.find({
            "tenant_id": tenant_id,
            "branch_id": branch_id,
            "status": {"$in": ["delivered", "ready"]},
            "created_at": {
                "$gte": start_of_day.isoformat(),
                "$lte": end_of_day.isoformat()
            }
        }, {"_id": 0, "profit": 1}).to_list(10000)
        
        daily_profit = sum(_sn(o.get("profit")) for o in orders)
        coverage_percentage = (daily_profit / daily_target * 100) if daily_target > 0 else 0
        
        # إنشاء التنبيهات
        if coverage_percentage >= 100:
            # تم تجاوز نقطة التعادل! 🎉
            net_profit = daily_profit - daily_target
            alerts.append({
                "type": "success",
                "branch_id": branch_id,
                "branch_name": branch_name,
                "title": "تم تحقيق نقطة التعادل",
                "message": f"فرع {branch_name} حقق نقطة التعادل! صافي الربح: {net_profit:,.0f}",
                "coverage": round(coverage_percentage, 1),
                "daily_target": daily_target,
                "daily_profit": daily_profit,
                "net_profit": net_profit,
                "icon": "check-circle"
            })
        elif coverage_percentage >= 80:
            # اقتراب من نقطة التعادل
            remaining = daily_target - daily_profit
            alerts.append({
                "type": "warning",
                "branch_id": branch_id,
                "branch_name": branch_name,
                "title": "اقتراب من نقطة التعادل",
                "message": f"فرع {branch_name} على وشك تحقيق نقطة التعادل! المتبقي: {remaining:,.0f}",
                "coverage": round(coverage_percentage, 1),
                "daily_target": daily_target,
                "daily_profit": daily_profit,
                "remaining": remaining,
                "icon": "alert-triangle"
            })
        elif coverage_percentage >= 50:
            # في المسار الصحيح
            remaining = daily_target - daily_profit
            alerts.append({
                "type": "info",
                "branch_id": branch_id,
                "branch_name": branch_name,
                "title": "تقدم جيد",
                "message": f"فرع {branch_name} حقق {coverage_percentage:.0f}% من الهدف اليومي",
                "coverage": round(coverage_percentage, 1),
                "daily_target": daily_target,
                "daily_profit": daily_profit,
                "remaining": remaining,
                "icon": "trending-up"
            })
        elif coverage_percentage > 0:
            # بداية بطيئة
            remaining = daily_target - daily_profit
            alerts.append({
                "type": "low",
                "branch_id": branch_id,
                "branch_name": branch_name,
                "title": "تغطية منخفضة",
                "message": f"فرع {branch_name} حقق {coverage_percentage:.0f}% فقط من الهدف اليومي",
                "coverage": round(coverage_percentage, 1),
                "daily_target": daily_target,
                "daily_profit": daily_profit,
                "remaining": remaining,
                "icon": "alert-circle"
            })
    
    return {
        "alerts": alerts,
        "has_permission": True,
        "date": target_date.strftime("%Y-%m-%d"),
        "total_branches": len(branches),
        "branches_with_costs": len([b for b in branches if (_sn(b.get("rent_cost")) + _sn(b.get("electricity_cost")) + _sn(b.get("water_cost")) + _sn(b.get("generator_cost"))) > 0])
    }

