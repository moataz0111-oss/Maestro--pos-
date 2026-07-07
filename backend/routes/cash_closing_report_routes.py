"""Cash Register Closing Report (extracted from server.py)"""
from fastapi import APIRouter
from server import *  # noqa: F401,F403
from server import (_sn)

router = APIRouter()

# ==================== تقرير إغلاق الصندوق ====================


def _cr_closing_business_day(c):
    """اليوم التشغيلي لسجل الإغلاق: business_date إن وُجد، وإلا تاريخ العراق من بداية/إغلاق الوردية."""
    bd = c.get("business_date")
    if bd:
        return str(bd)[:10]
    ref = c.get("shift_start") or c.get("closed_at") or c.get("shift_end")
    if ref:
        try:
            return iraq_date_from_utc(ref)
        except Exception:
            return str(ref)[:10]
    return "unknown"


def _cr_parse_iso(s):
    if not s:
        return None
    try:
        return datetime.fromisoformat(str(s).replace("Z", "+00:00"))
    except Exception:
        return None


def dedupe_shift_closings(closings):
    """إزالة صفوف إغلاق الوردية المكررة تلقائياً (منطقة محاسبية حساسة — لا تدخّل يدوي).

    السبب الجذري: باغ فتح ورديتين متزامنتين لنفس الكاشير (مُنِع مستقبلاً) خلّف سجلّي إغلاق
    لنفس الوردية الفعلية — أحدهما يضخّم المبيعات (يعدّ نفس الطلبات مرتين) فلا يطابق الإغلاق المبيعات.

    القاعدة (آمنة، لا تدمج الورديات المتتابعة المشروعة صباح/مساء):
    نعتبر سجلّين مكرَّرين فقط إذا كانا لنفس (الفرع + اسم الكاشير + اليوم التشغيلي) و:
      • تتداخل فترتاهما الزمنيتان [shift_start, shift_end] (كاشير واحد لا يفتح ورديتين متزامنتين)، أو
      • تطابقت بصمتهما تماماً (نفس المبيعات وعدد الطلبات والنقدي والبطاقة).
    عند التكرار نُبقي السجل الأصح = الأقل مبيعات (غير المضخّم) ونستبعد الأكبر من العرض والإحصائيات.
    لا يُحذف أي شيء من قاعدة البيانات — فقط يُستبعَد من التقرير (قابل للتدقيق دائماً)."""
    items = list(closings or [])
    if len(items) < 2:
        return items, []

    groups = {}
    for c in items:
        key = (
            c.get("branch_id") or "",
            (c.get("cashier_name") or "").strip().lower() or (c.get("cashier_id") or ""),
            _cr_closing_business_day(c),
        )
        groups.setdefault(key, []).append(c)

    kept, removed = [], []
    for group in groups.values():
        if len(group) < 2:
            kept.extend(group)
            continue
        used = [False] * len(group)
        for i in range(len(group)):
            if used[i]:
                continue
            si, ei = _cr_parse_iso(group[i].get("shift_start")), _cr_parse_iso(group[i].get("shift_end"))
            sig_i = (_sn(group[i].get("total_sales")), _sn(group[i].get("orders_count")),
                     _sn(group[i].get("cash_sales")), _sn(group[i].get("card_sales")))
            cluster = [group[i]]
            used[i] = True
            for j in range(i + 1, len(group)):
                if used[j]:
                    continue
                sj, ej = _cr_parse_iso(group[j].get("shift_start")), _cr_parse_iso(group[j].get("shift_end"))
                sig_j = (_sn(group[j].get("total_sales")), _sn(group[j].get("orders_count")),
                         _sn(group[j].get("cash_sales")), _sn(group[j].get("card_sales")))
                overlap = bool(si and ei and sj and ej and si < ej and sj < ei)
                identical = (sig_i == sig_j)
                if overlap or identical:
                    cluster.append(group[j])
                    used[j] = True
            if len(cluster) == 1:
                kept.append(cluster[0])
            else:
                cluster.sort(key=lambda r: (_sn(r.get("total_sales")), _sn(r.get("orders_count")), str(r.get("closed_at") or "")))
                kept.append(cluster[0])
                removed.extend(cluster[1:])

    kept.sort(key=lambda r: str(r.get("closed_at") or ""), reverse=True)
    return kept, removed


@router.get("/reports/cash-register-closing")
async def get_cash_register_closing_report(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    branch_id: Optional[str] = None,
    cashier_id: Optional[str] = None,
    shift_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """تقرير إغلاق الصندوق الشامل - يعرض المبيعات والمصروفات ومطابقة الصندوق"""
    query = build_tenant_query(current_user)
    
    if branch_id:
        query["branch_id"] = branch_id
    
    # تحديد الفترة الزمنية - استخدام business_date (اليوم التشغيلي) مع fallback للتواريخ القديمة
    date_filter_from = None
    date_filter_to = None
    if start_date:
        # استخراج الجزء التاريخي فقط
        date_filter_from = start_date[:10] if len(start_date) >= 10 else start_date
    if end_date:
        date_filter_to = end_date[:10] if len(end_date) >= 10 else end_date
    
    if date_filter_from or date_filter_to:
        biz_range = {}
        if date_filter_from:
            biz_range["$gte"] = date_filter_from
        if date_filter_to:
            biz_range["$lte"] = date_filter_to
        created_range = {}
        if start_date:
            created_range["$gte"] = start_date
        if end_date:
            created_range["$lte"] = end_date
        query["$or"] = [
            {"business_date": biz_range.copy()},
            {"business_date": {"$exists": False}, "created_at": created_range.copy()}
        ]
    
    # جلب الطلبات
    all_orders = await db.orders.find(query, {"_id": 0}).to_list(5000)
    
    # فصل الطلبات: نشطة / مرتجعة / ملغية
    orders = []          # طلبات نشطة (تحسب في المبيعات)
    refunded_orders = []  # مرتجعات (لا تحسب في المبيعات)
    cancelled_orders = [] # ملغية (لا تحسب في المبيعات)
    
    for o in all_orders:
        status = o.get("status", "")
        if status == "refunded":
            refunded_orders.append(o)
        elif status in ("cancelled", "canceled", "deleted"):
            cancelled_orders.append(o)
        else:
            orders.append(o)
    
    # حساب إجمالي المرتجعات
    total_refunds = sum(_sn(r.get("total")) for r in refunded_orders)
    refund_count = len(refunded_orders)
    
    # حساب إجمالي الإلغاءات
    total_cancellations = sum(_sn(c.get("total")) for c in cancelled_orders)
    cancellation_count = len(cancelled_orders)
    
    # جلب المصروفات (بدون المرتجعات)
    expenses_query = build_tenant_query(current_user)
    expenses_query["category"] = {"$ne": "refund"}
    if branch_id:
        expenses_query["branch_id"] = branch_id
    if date_filter_from or date_filter_to:
        biz_range_exp = {}
        if date_filter_from:
            biz_range_exp["$gte"] = date_filter_from
        if date_filter_to:
            biz_range_exp["$lte"] = date_filter_to
        expenses_query["$or"] = [
            {"business_date": biz_range_exp.copy()},
            {"business_date": {"$exists": False}, "date": biz_range_exp.copy()}
        ]
    
    expenses = await db.expenses.find(expenses_query, {"_id": 0}).to_list(1000)
    
    # جلب إغلاقات الصندوق
    closings_query = build_tenant_query(current_user)
    if branch_id:
        closings_query["branch_id"] = branch_id
    if cashier_id:
        closings_query["cashier_id"] = cashier_id
    if start_date:
        closings_query["closed_at"] = {"$gte": start_date}
    if end_date:
        if "closed_at" not in closings_query:
            closings_query["closed_at"] = {}
        closings_query["closed_at"]["$lte"] = end_date
    
    closings = await db.cash_register_closings.find(closings_query, {"_id": 0}).sort("closed_at", -1).to_list(100)
    # إزالة صفوف الإغلاق المكررة تلقائياً حتى يطابق تقرير الإغلاق المبيعات الحقيقية (منطقة حساسة — بلا حذف من القاعدة)
    closings, _dup_removed = dedupe_shift_closings(closings)
    
    # ==================== حساب المبيعات ====================
    
    # حسب نوع الطلب
    dine_in_total = sum(_sn(o.get("total")) for o in orders if o.get("order_type") == "dine_in")
    takeaway_total = sum(_sn(o.get("total")) for o in orders if o.get("order_type") == "takeaway")
    delivery_total = sum(_sn(o.get("total")) for o in orders if o.get("order_type") == "delivery" or o.get("delivery_app"))
    
    # حسب طريقة الدفع
    # cash_total: النقدي المباشر في المطعم فقط (لا يشمل نقدي التوصيل من السائقين)
    cash_total = sum(
        _sn(o.get("total")) for o in orders
        if o.get("payment_method") == "cash"
        and not o.get("delivery_app")
        and not (o.get("order_type") == "delivery" and o.get("driver_id"))
    )
    # driver_cash_total: نقدي محصّل من السائقين (سطر منفصل للتدقيق)
    driver_cash_total = sum(
        _sn(o.get("total")) for o in orders
        if o.get("payment_method") == "cash"
        and o.get("order_type") == "delivery"
        and o.get("driver_id")
        and not o.get("is_delivery_company")
        and not o.get("delivery_app")
        and not o.get("delivery_app_name")
    )
    card_total = sum(_sn(o.get("total")) for o in orders if o.get("payment_method") == "card")
    credit_total = sum(_sn(o.get("total")) for o in orders if o.get("payment_method") == "credit" and not o.get("delivery_app") and o.get("order_type") != "delivery")
    
    # خدمة التوصيل الداخلية: أجور التوصيل المحصلة (قيمها ضمن النقدي/توصيل داخلي أعلاه)
    internal_delivery_fees_total = sum(
        _sn(o.get("delivery_fee")) for o in orders
        if o.get("order_type") == "delivery"
        and o.get("driver_id")
        and not o.get("is_delivery_company")
        and not o.get("delivery_app")
        and not o.get("delivery_app_name")
    )
    
    # شركات التوصيل
    delivery_apps_total = {}
    for o in orders:
        app_name = o.get("delivery_app_name") or o.get("delivery_app")
        if app_name:
            if app_name not in delivery_apps_total:
                delivery_apps_total[app_name] = {"total": 0, "count": 0, "commission": 0}
            delivery_apps_total[app_name]["total"] += _sn(o.get("total"))
            delivery_apps_total[app_name]["count"] += 1
            delivery_apps_total[app_name]["commission"] += o.get("delivery_commission", 0)
    
    # ==================== حساب المصروفات ====================
    
    total_expenses = sum(_sn(e.get("amount")) for e in expenses)
    
    # تجميع المصروفات حسب الكاشير
    expenses_by_cashier = {}
    for e in expenses:
        cashier_name = e.get("created_by_name") or e.get("created_by") or "غير محدد"
        if cashier_name not in expenses_by_cashier:
            expenses_by_cashier[cashier_name] = {"total": 0, "count": 0, "items": []}
        expenses_by_cashier[cashier_name]["total"] += _sn(e.get("amount"))
        expenses_by_cashier[cashier_name]["count"] += 1
        expenses_by_cashier[cashier_name]["items"].append({
            "description": e.get("description"),
            "amount": _sn(e.get("amount")),
            "category": e.get("category"),
            "created_at": e.get("created_at")
        })
    
    # ==================== تجميع حسب الكاشير ====================
    
    # جلب أسماء المستخدمين لحل مشكلة "غير محدد"
    cashier_ids_set = set()
    for o in orders:
        cid = o.get("cashier_id") or o.get("created_by")
        if cid:
            cashier_ids_set.add(cid)
    
    users_lookup = {}
    if cashier_ids_set:
        cashier_users = await db.users.find(
            {"id": {"$in": list(cashier_ids_set)}},
            {"_id": 0, "id": 1, "full_name": 1, "username": 1, "email": 1}
        ).to_list(100)
        for u in cashier_users:
            users_lookup[u["id"]] = u.get("full_name") or u.get("username") or u.get("email", "")
    
    by_cashier = {}
    for o in orders:
        cashier_id = o.get("cashier_id") or o.get("created_by")
        cashier_name = o.get("cashier_name") or o.get("created_by_name") or ""
        
        # البحث في قاعدة المستخدمين إذا الاسم فارغ
        if (not cashier_name or cashier_name == "غير محدد") and cashier_id and cashier_id in users_lookup:
            cashier_name = users_lookup[cashier_id]
        
        if not cashier_name:
            cashier_name = "غير محدد"
        
        if cashier_id not in by_cashier:
            by_cashier[cashier_id] = {
                "cashier_name": cashier_name,
                "cashier_id": cashier_id,
                "total_sales": 0,
                "orders_count": 0,
                "cash": 0,
                "driver_cash": 0,
                "card": 0,
                "credit": 0,
                "delivery": 0,
                "dine_in": 0,
                "takeaway": 0
            }
        
        by_cashier[cashier_id]["total_sales"] += _sn(o.get("total"))
        by_cashier[cashier_id]["orders_count"] += 1
        
        # حسب طريقة الدفع
        is_driver_cash = (
            o.get("payment_method") == "cash"
            and o.get("order_type") == "delivery"
            and o.get("driver_id")
            and not o.get("is_delivery_company")
            and not o.get("delivery_app")
            and not o.get("delivery_app_name")
        )
        if is_driver_cash:
            by_cashier[cashier_id]["driver_cash"] += _sn(o.get("total"))
        elif o.get("payment_method") == "cash" and not o.get("delivery_app"):
            by_cashier[cashier_id]["cash"] += _sn(o.get("total"))
        elif o.get("payment_method") == "card":
            by_cashier[cashier_id]["card"] += _sn(o.get("total"))
        elif o.get("payment_method") == "credit" and not o.get("delivery_app"):
            by_cashier[cashier_id]["credit"] += _sn(o.get("total"))
        
        if o.get("delivery_app") or o.get("order_type") == "delivery":
            by_cashier[cashier_id]["delivery"] += _sn(o.get("total"))
        
        # حسب نوع الطلب
        if o.get("order_type") == "dine_in":
            by_cashier[cashier_id]["dine_in"] += _sn(o.get("total"))
        elif o.get("order_type") == "takeaway":
            by_cashier[cashier_id]["takeaway"] += _sn(o.get("total"))
    
    # ==================== تجميع حسب الفرع ====================
    
    by_branch = {}
    for o in orders:
        branch_id = o.get("branch_id") or "unknown"
        branch_name = o.get("branch_name") or branch_id
        
        if branch_id not in by_branch:
            by_branch[branch_id] = {
                "branch_name": branch_name,
                "branch_id": branch_id,
                "total_sales": 0,
                "orders_count": 0,
                "cash": 0,
                "driver_cash": 0,
                "card": 0,
                "credit": 0,
                "delivery": 0
            }
        
        by_branch[branch_id]["total_sales"] += _sn(o.get("total"))
        by_branch[branch_id]["orders_count"] += 1
        
        is_driver_cash = (
            o.get("payment_method") == "cash"
            and o.get("order_type") == "delivery"
            and o.get("driver_id")
            and not o.get("is_delivery_company")
            and not o.get("delivery_app")
            and not o.get("delivery_app_name")
        )
        if is_driver_cash:
            by_branch[branch_id]["driver_cash"] += _sn(o.get("total"))
        elif o.get("payment_method") == "cash" and not o.get("delivery_app"):
            by_branch[branch_id]["cash"] += _sn(o.get("total"))
        elif o.get("payment_method") == "card":
            by_branch[branch_id]["card"] += _sn(o.get("total"))
        elif o.get("payment_method") == "credit" and not o.get("delivery_app"):
            by_branch[branch_id]["credit"] += _sn(o.get("total"))
        if o.get("delivery_app") or o.get("order_type") == "delivery":
            by_branch[branch_id]["delivery"] += _sn(o.get("total"))
    
    # ==================== حساب مطابقة الصندوق ====================
    
    total_sales = sum(_sn(o.get("total")) for o in orders)
    # النقدي المتوقع في الدرج = نقدي المطعم + نقدي السائقين المحصّل - المصروفات
    expected_cash = cash_total + driver_cash_total - total_expenses
    
    # الإجمالي
    total_orders = len(orders)
    
    # الحقيقة المرجعية: مبيعات كل كاشير في كل يوم تشغيلي محسوبة من الطلبات الفعلية (بلا تكرار)
    # تُستخدَم في الواجهة لإزالة صفوف الإغلاق المكررة تلقائياً (يُبقى الصف المطابق للمبيعات، ويُستبعَد المضخّم)
    true_by_cashier_day = {}
    for o in orders:
        _cid = o.get("cashier_id") or o.get("created_by") or ""
        _cname = o.get("cashier_name") or o.get("created_by_name") or ""
        if (not _cname or _cname == "غير محدد") and _cid and _cid in users_lookup:
            _cname = users_lookup[_cid]
        _bd = o.get("business_date")
        if _bd:
            _bd = str(_bd)[:10]
        else:
            try:
                _bd = iraq_date_from_utc(o.get("created_at"))
            except Exception:
                _bd = str(o.get("created_at") or "")[:10]
        _val = _sn(o.get("total"))
        for _k in (f"id:{_cid}|{_bd}", f"name:{(_cname or '').strip().lower()}|{_bd}"):
            true_by_cashier_day[_k] = true_by_cashier_day.get(_k, 0) + _val

    # مرجع احتياطي على مستوى الفرع/اليوم (يُستخدَم عندما يختلف اسم/معرّف كاشير الوردية عن منشئ الطلبات)
    true_by_branch_day = {}
    for o in orders:
        _bid = o.get("branch_id") or "unknown"
        _bd2 = o.get("business_date")
        if _bd2:
            _bd2 = str(_bd2)[:10]
        else:
            try:
                _bd2 = iraq_date_from_utc(o.get("created_at"))
            except Exception:
                _bd2 = str(o.get("created_at") or "")[:10]
        _bk = f"{_bid}|{_bd2}"
        true_by_branch_day[_bk] = true_by_branch_day.get(_bk, 0) + _sn(o.get("total"))


    return {
        "period": {
            "start_date": start_date,
            "end_date": end_date
        },
        "summary": {
            "total_sales": total_sales,
            "total_orders": total_orders,
            "total_expenses": total_expenses,
            "total_refunds": total_refunds,
            "refund_count": refund_count,
            "total_cancellations": total_cancellations,
            "cancellation_count": cancellation_count,
            "expected_cash_in_drawer": expected_cash,
            "net_sales": total_sales - total_expenses - total_refunds
        },
        "by_order_type": {
            "dine_in": {"total": dine_in_total, "label": "داخلي"},
            "takeaway": {"total": takeaway_total, "label": "سفري"},
            "delivery": {"total": delivery_total, "label": "توصيل"}
        },
        "by_payment_method": {
            "cash": {"total": cash_total, "label": "نقدي"},
            "driver_cash": {"total": driver_cash_total, "label": "توصيل داخلي"},
            "internal_delivery_fees": {"total": internal_delivery_fees_total, "label": "خدمة توصيل داخلية"},
            "card": {"total": card_total, "label": "بطاقة"},
            "credit": {"total": credit_total, "label": "آجل"}
        },
        "delivery_apps": delivery_apps_total,
        "by_cashier": list(by_cashier.values()),
        "by_branch": list(by_branch.values()),
        "expenses": {
            "total": total_expenses,
            "by_cashier": expenses_by_cashier,
            "items": [{"description": e.get("description"), "amount": _sn(e.get("amount")), "category": e.get("category"), "created_by": e.get("created_by_name") or e.get("created_by"), "created_at": e.get("created_at")} for e in expenses]
        },
        "closings": closings,
        "true_by_cashier_day": true_by_cashier_day,
        "true_by_branch_day": true_by_branch_day
    }

@router.post("/reports/cash-register-closing")
async def create_cash_register_closing(
    data: dict,
    current_user: dict = Depends(get_current_user)
):
    """إنشاء سجل إغلاق صندوق جديد"""
    closing_id = str(uuid.uuid4())
    
    # احسب business_date بناءً على الوردية التي يُغلَق عليها (أو تاريخ العراق الحالي)
    biz_date = data.get("business_date")
    if not biz_date:
        # جرب جلبه من الشفت المرتبط
        shift_id = data.get("shift_id")
        if shift_id:
            _shift = await db.shifts.find_one({"id": shift_id}, {"_id": 0, "business_date": 1, "started_at": 1})
            if _shift:
                biz_date = _shift.get("business_date")
                if not biz_date and _shift.get("started_at"):
                    biz_date = iraq_date_from_utc(_shift["started_at"])
        if not biz_date and data.get("shift_start"):
            biz_date = iraq_date_from_utc(data["shift_start"])
        if not biz_date:
            biz_date = iraq_date_from_utc()
    
    closing_record = {
        "id": closing_id,
        "tenant_id": current_user.get("tenant_id"),
        "branch_id": data.get("branch_id"),
        "branch_name": data.get("branch_name"),
        "cashier_id": current_user.get("user_id"),
        "cashier_name": current_user.get("full_name") or current_user.get("email"),
        "shift_id": data.get("shift_id"),
        "shift_start": data.get("shift_start"),
        "shift_end": data.get("shift_end") or datetime.now(timezone.utc).isoformat(),
        "closed_at": datetime.now(timezone.utc).isoformat(),
        "business_date": biz_date,
        
        # المبيعات
        "total_sales": data.get("total_sales", 0),
        "cash_sales": data.get("cash_sales", 0),
        "card_sales": data.get("card_sales", 0),
        "credit_sales": data.get("credit_sales", 0),
        "delivery_sales": data.get("delivery_sales", 0),
        
        # حسب نوع الطلب
        "dine_in_sales": data.get("dine_in_sales", 0),
        "takeaway_sales": data.get("takeaway_sales", 0),
        
        # المصروفات
        "total_expenses": data.get("total_expenses", 0),
        
        # مطابقة الصندوق
        "expected_cash": data.get("expected_cash", 0),
        "actual_cash": data.get("actual_cash", 0),
        "difference": data.get("actual_cash", 0) - data.get("expected_cash", 0),
        "difference_type": "surplus" if data.get("actual_cash", 0) > data.get("expected_cash", 0) else "shortage" if data.get("actual_cash", 0) < data.get("expected_cash", 0) else "exact",
        
        # ملاحظات
        "notes": data.get("notes", ""),
        "orders_count": data.get("orders_count", 0)
    }
    
    await db.cash_register_closings.insert_one(closing_record)
    
    return {"message": "تم إغلاق الصندوق بنجاح", "closing": closing_record}

@router.get("/reports/cash-register-closings")
async def get_cash_register_closings_history(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    branch_id: Optional[str] = None,
    cashier_id: Optional[str] = None,
    limit: int = 50,
    current_user: dict = Depends(get_current_user)
):
    """سجل إغلاقات الصندوق السابقة"""
    query = build_tenant_query(current_user)
    
    if branch_id:
        query["branch_id"] = branch_id
    if cashier_id:
        query["cashier_id"] = cashier_id
    if start_date or end_date:
        # فلترة باليوم التشغيلي (business_date) أولاً — يضمن تطابق تقرير الإغلاق مع يوم الشفت
        biz_range = {}
        closed_range = {}
        if start_date:
            biz_range["$gte"] = start_date
            closed_range["$gte"] = start_date
        if end_date:
            biz_range["$lte"] = end_date
            closed_range["$lte"] = end_date + "T23:59:59"
        query["$or"] = [
            {"business_date": biz_range},
            {"business_date": {"$exists": False}, "closed_at": closed_range},
        ]
    
    closings = await db.cash_register_closings.find(query, {"_id": 0}).sort("closed_at", -1).to_list(limit)
    # إزالة صفوف الإغلاق المكررة تلقائياً (نفس الوردية سُجّلت مرتين بسبب باغ فتح شفتين متزامنين)
    # حتى يطابق النقد المعدود/المتوقع والمبيعات القيم الحقيقية. لا حذف من القاعدة — استبعاد من التقرير فقط.
    closings, dup_removed = dedupe_shift_closings(closings)
    
    # حساب الإحصائيات
    total_sales = sum(c.get("total_sales", 0) for c in closings)
    total_difference = sum(c.get("difference", 0) for c in closings)
    surplus_count = len([c for c in closings if c.get("difference_type") == "surplus"])
    shortage_count = len([c for c in closings if c.get("difference_type") == "shortage"])
    exact_count = len([c for c in closings if c.get("difference_type") == "exact"])
    
    return {
        "closings": closings,
        "stats": {
            "total_closings": len(closings),
            "total_sales": total_sales,
            "total_difference": total_difference,
            "surplus_count": surplus_count,
            "shortage_count": shortage_count,
            "exact_count": exact_count,
            "duplicates_removed": len(dup_removed)
        }
    }



@router.delete("/reports/cash-register-closing/{record_id}")
async def delete_cash_register_closing(record_id: str, current_user: dict = Depends(get_current_user)):
    """حذف صف إغلاق/شفت مكرر من التقرير — للمالك/المدير فقط.
    صفوف التقرير تأتي من مجموعة shifts (أو cash_register_closings كاحتياطي)، لذا نحذف من الاثنين حسب المعرّف،
    ونعكس أي إيداع خزينة مرتبط. الطلبات نفسها تبقى (لا تتأثر مبيعات التقرير المحسوبة من الطلبات)."""
    role = current_user.get("role")
    if role not in ["admin", "super_admin", "manager", "owner"]:
        raise HTTPException(status_code=403, detail="غير مصرح — حذف السجل للمالك/المدير فقط")

    tq = build_tenant_query(current_user)
    shift = await db.shifts.find_one({**tq, "id": record_id}, {"_id": 0})
    closing = await db.cash_register_closings.find_one({**tq, "id": record_id}, {"_id": 0})
    if not shift and not closing:
        raise HTTPException(status_code=404, detail="السجل غير موجود")

    src = shift or closing
    # لا نسمح بحذف شفت مفتوح/نشط (يجب إغلاقه أولاً)
    if shift and shift.get("status") == "open":
        raise HTTPException(status_code=400, detail="لا يمكن حذف وردية مفتوحة — أغلقها أولاً ثم احذفها")

    # عكس أي إيداع خزينة مرتبط بهذا السجل أو بشفته
    reversed_deposits = 0
    reversed_amount = 0.0
    dep_or = [{"ref_closing_id": record_id}]
    if src.get("received_deposit_id"):
        dep_or.append({"id": src.get("received_deposit_id")})
    async for dep in db.owner_deposits.find({"$or": dep_or}, {"_id": 0, "amount": 1}):
        reversed_amount += float(dep.get("amount") or 0)
        reversed_deposits += 1
    if reversed_deposits:
        await db.owner_deposits.delete_many({"$or": dep_or})

    # حذف السجل من المجموعتين حسب المعرّف
    await db.cash_register_closings.delete_many({"$or": [{"id": record_id}, {"shift_id": record_id}]})
    if shift:
        await db.shifts.delete_one({"id": record_id})

    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()),
        "action": "delete_shift_closing_record",
        "tenant_id": current_user.get("tenant_id"),
        "record_id": record_id,
        "source": "shift" if shift else "closing",
        "cashier_name": src.get("cashier_name"),
        "branch_name": src.get("branch_name"),
        "total_sales": src.get("total_sales"),
        "business_date": src.get("business_date"),
        "reversed_deposits": reversed_deposits,
        "reversed_amount": reversed_amount,
        "deleted_by": current_user.get("full_name") or current_user.get("username"),
        "deleted_at": datetime.now(timezone.utc).isoformat(),
    })

    return {
        "message": "تم حذف السجل المكرر بنجاح",
        "record_id": record_id,
        "reversed_deposits": reversed_deposits,
        "reversed_amount": reversed_amount,
    }


class PurgeShiftRequest(BaseModel):
    cashier_name: Optional[str] = None
    shift_id: Optional[str] = None
    dry_run: bool = True


@router.post("/reports/purge-shift")
async def purge_shift_completely(req: PurgeShiftRequest, current_user: dict = Depends(get_current_user)):
    """حذف نهائي لوردية اختبارية/دخيلة (مثل RW Probe) مع كل مبيعاتها المرتبطة.
    يبحث بالاسم و/أو المعرّف، ويحذف: الوردية + سجل الإغلاق + الطلبات المرتبطة (shift_id أو نفس اسم الكاشير)
    + يعكس أي إيداع خزينة مرتبط. للمالك/المدير فقط. يدعم dry_run للمعاينة قبل الحذف."""
    role = current_user.get("role")
    if role not in ["admin", "super_admin", "manager", "owner"]:
        raise HTTPException(status_code=403, detail="غير مصرح — الحذف النهائي للمالك/المدير فقط")

    name = (req.cashier_name or "").strip()
    if not name and not req.shift_id:
        raise HTTPException(status_code=400, detail="حدد اسم الكاشير أو معرّف الوردية")

    # نطاق المستأجر: super_admin بلا قيود؛ غيره ضمن مستأجره + سجلات فقدت tenant_id (سجلات الاختبار الدخيلة)
    if role == "super_admin":
        tenant_clause = {}
    else:
        tid = current_user.get("tenant_id")
        tenant_clause = {"$or": [
            {"tenant_id": tid},
            {"tenant_id": {"$in": [None, ""]}},
            {"tenant_id": {"$exists": False}},
        ]}

    match_ors = []
    if req.shift_id:
        match_ors.append({"id": req.shift_id})
    name_rx = None
    if name:
        name_rx = {"$regex": re.escape(name), "$options": "i"}
        match_ors.append({"cashier_name": name_rx})

    def _scoped(extra_or):
        base = dict(tenant_clause)
        if "$or" in base:
            return {"$and": [{"$or": base["$or"]}, {"$or": extra_or}]}
        return {**base, "$or": extra_or}

    # الورديات المطابقة
    shifts = await db.shifts.find(_scoped(match_ors), {"_id": 0}).to_list(500)
    shift_ids = [s["id"] for s in shifts if s.get("id")]

    # سجلات الإغلاق المطابقة (بالاسم/المعرّف أو المرتبطة بالورديات)
    closing_ors = list(match_ors)
    if shift_ids:
        closing_ors.append({"shift_id": {"$in": shift_ids}})
    closings = await db.cash_register_closings.find(_scoped(closing_ors), {"_id": 0}).to_list(500)
    closing_ids = [c["id"] for c in closings if c.get("id")]

    # الطلبات المطابقة: بالـ shift_id أو بنفس اسم الكاشير
    order_ors = []
    if shift_ids:
        order_ors.append({"shift_id": {"$in": shift_ids}})
    if name_rx is not None:
        order_ors.append({"cashier_name": name_rx})
    orders = []
    if order_ors:
        orders = await db.orders.find(_scoped(order_ors), {"_id": 0, "id": 1, "total": 1, "cashier_name": 1, "shift_id": 1}).to_list(20000)
    orders_total = sum(_sn(o.get("total")) for o in orders)

    preview = {
        "dry_run": req.dry_run,
        "shifts_matched": len(shifts),
        "closings_matched": len(closings),
        "orders_matched": len(orders),
        "orders_total": orders_total,
        "matched_names": sorted({(s.get("cashier_name") or "") for s in shifts} | {(o.get("cashier_name") or "") for o in orders}),
    }
    if req.dry_run:
        return preview

    # عكس أي إيداع خزينة مرتبط بهذه الورديات/الإغلاقات
    reversed_deposits = 0
    reversed_amount = 0.0
    dep_ids = [x for x in (shift_ids + closing_ids)]
    if dep_ids:
        dep_q = {"$or": [{"ref_closing_id": {"$in": dep_ids}}, {"shift_id": {"$in": dep_ids}}]}
        async for dep in db.owner_deposits.find(dep_q, {"_id": 0, "amount": 1}):
            reversed_amount += float(dep.get("amount") or 0)
            reversed_deposits += 1
        if reversed_deposits:
            await db.owner_deposits.delete_many(dep_q)

    deleted_orders = 0
    if order_ors:
        r = await db.orders.delete_many(_scoped(order_ors))
        deleted_orders = r.deleted_count
    deleted_shifts = 0
    if shift_ids:
        r = await db.shifts.delete_many(_scoped([{"id": {"$in": shift_ids}}]))
        deleted_shifts = r.deleted_count
    deleted_closings = 0
    if closing_ids:
        r = await db.cash_register_closings.delete_many(_scoped([{"id": {"$in": closing_ids}}]))
        deleted_closings = r.deleted_count

    await db.audit_logs.insert_one({
        "id": str(uuid.uuid4()),
        "action": "purge_probe_shift",
        "tenant_id": current_user.get("tenant_id"),
        "query": {"cashier_name": name, "shift_id": req.shift_id},
        "deleted_orders": deleted_orders,
        "deleted_shifts": deleted_shifts,
        "deleted_closings": deleted_closings,
        "orders_total_removed": orders_total,
        "reversed_deposits": reversed_deposits,
        "reversed_amount": reversed_amount,
        "deleted_by": current_user.get("full_name") or current_user.get("username"),
        "deleted_at": datetime.now(timezone.utc).isoformat(),
    })

    return {
        "message": f"تم الحذف النهائي: {deleted_shifts} وردية، {deleted_closings} إغلاق، {deleted_orders} طلب ({orders_total:,.0f} د.ع من المبيعات)",
        "deleted_orders": deleted_orders,
        "deleted_shifts": deleted_shifts,
        "deleted_closings": deleted_closings,
        "orders_total": orders_total,
        "reversed_deposits": reversed_deposits,
        "reversed_amount": reversed_amount,
    }



@router.get("/reports/delivery-credits")
async def get_delivery_credits_report(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    branch_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """تقرير آجل شركات التوصيل - فقط شركات التوصيل (بدون توصيل السائقين العاديين)"""
    query = build_tenant_query(current_user)
    
    # فقط طلبات التوصيل التي تنتمي لشركة توصيل
    query["order_type"] = "delivery"
    # استبعاد الملغية والمرتجعة
    query["status"] = {"$nin": ["cancelled", "refunded"]}
    
    # فقط شركات التوصيل: لديها delivery_app أو delivery_app_name أو is_delivery_company
    query["$or"] = [
        {"delivery_app": {"$exists": True, "$nin": [None, ""]}},
        {"delivery_app_name": {"$exists": True, "$nin": [None, ""]}},
        {"is_delivery_company": True},
        {"delivery_commission": {"$gt": 0}}
    ]
    
    if branch_id:
        query["branch_id"] = branch_id
    
    if start_date:
        query["created_at"] = {"$gte": start_date}
    if end_date:
        if "created_at" not in query:
            query["created_at"] = {}
        query["created_at"]["$lte"] = end_date
    
    orders = await db.orders.find(query, {"_id": 0}).to_list(1000)
    
    total_sales = sum(_sn(o.get("total")) for o in orders)
    total_commission = sum(o.get("delivery_commission", 0) for o in orders)
    net_receivable = total_sales - total_commission
    total_collected = sum(o.get("collected_amount", 0) for o in orders)
    total_remaining = net_receivable - total_collected
    
    # تجميع حسب شركة التوصيل
    by_delivery_app = {}
    for order in orders:
        app_name = order.get("delivery_app_name") or order.get("delivery_app") or "غير محدد"
        if app_name not in by_delivery_app:
            by_delivery_app[app_name] = {
                "total_sales": 0,
                "total_commission": 0,
                "net_receivable": 0,
                "orders_count": 0,
                "collected": 0
            }
        by_delivery_app[app_name]["total_sales"] += _sn(order.get("total"))
        by_delivery_app[app_name]["total_commission"] += order.get("delivery_commission", 0)
        by_delivery_app[app_name]["net_receivable"] += _sn(order.get("total")) - order.get("delivery_commission", 0)
        by_delivery_app[app_name]["orders_count"] += 1
        by_delivery_app[app_name]["collected"] += order.get("collected_amount", 0)
    
    # تحضير قائمة الطلبات
    order_list = []
    for order in orders:
        collected = order.get("collected_amount", 0)
        commission = order.get("delivery_commission", 0)
        net = _sn(order.get("total")) - commission
        remaining = net - collected
        order_list.append({
            "id": order.get("id"),
            "order_number": order.get("order_number"),
            "created_at": order.get("created_at"),
            "delivery_app_name": order.get("delivery_app_name") or order.get("delivery_app") or "غير محدد",
            "customer_name": order.get("customer_name"),
            "total": _sn(order.get("total")),
            "commission": commission,
            "net_amount": net,
            "collected_amount": collected,
            "remaining_amount": remaining,
            "is_fully_collected": remaining <= 0
        })
    
    return {
        "total_sales": total_sales,
        "total_commission": total_commission,
        "net_receivable": net_receivable,
        "total_collected": total_collected,
        "total_remaining": total_remaining,
        "total_orders": len(orders),
        "by_delivery_app": by_delivery_app,
        "orders": order_list
    }



@router.get("/smart-reports/products")
async def get_products_report(
    period: str = "month",
    branch_id: Optional[str] = None,
    limit: int = 10,
    current_user: dict = Depends(get_current_user)
):
    """تقرير المنتجات الأكثر مبيعاً"""
    query = build_tenant_query(current_user)
    
    if branch_id:
        query["branch_id"] = branch_id
    
    # تحديد الفترة
    now = datetime.now(timezone.utc)
    end_dt = None
    if period == "today":
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    elif period == "yesterday":
        y = now - timedelta(days=1)
        start = y.replace(hour=0, minute=0, second=0, microsecond=0)
        end_dt = y.replace(hour=23, minute=59, second=59, microsecond=999999)
    elif period == "week":
        start = now - timedelta(days=7)
    elif period == "month":
        start = now - timedelta(days=30)
    elif period == "last_month":
        first_of_this_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        end_dt = first_of_this_month - timedelta(microseconds=1)
        start = end_dt.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    elif period == "six_months":
        start = now - timedelta(days=180)
    elif period == "year":
        start = now - timedelta(days=365)
    else:
        start = now - timedelta(days=30)
    
    query["created_at"] = {"$gte": start.isoformat()}
    if end_dt:
        query["created_at"]["$lte"] = end_dt.isoformat()
    
    orders = await db.orders.find(query, {"_id": 0, "items": 1}).to_list(10000)
    
    # حساب المنتجات الأكثر مبيعاً
    product_sales = {}
    for order in orders:
        for item in order.get("items", []):
            product_id = item.get("product_id", item.get("name", "unknown"))
            product_name = item.get("name", "Unknown")
            quantity = item.get("quantity", 1)
            total = _sn(item.get("total"))
            
            if product_id not in product_sales:
                product_sales[product_id] = {
                    "name": product_name,
                    "quantity": 0,
                    "revenue": 0
                }
            
            product_sales[product_id]["quantity"] += quantity
            product_sales[product_id]["revenue"] += total
    
    # ترتيب حسب الكمية
    sorted_products = sorted(product_sales.items(), key=lambda x: x[1]["quantity"], reverse=True)[:limit]
    
    return {
        "period": period,
        "top_products": [
            {
                "product_id": p[0],
                "name": p[1]["name"],
                "quantity": p[1]["quantity"],
                "revenue": p[1]["revenue"]
            }
            for p in sorted_products
        ]
    }

@router.get("/smart-reports/hourly")
async def get_hourly_report(
    date: Optional[str] = None,
    branch_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """تقرير المبيعات حسب الساعة"""
    query = build_tenant_query(current_user)
    
    if branch_id:
        query["branch_id"] = branch_id
    
    if date:
        query["created_at"] = {"$regex": f"^{date}"}
    else:
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        query["created_at"] = {"$regex": f"^{today}"}
    
    orders = await db.orders.find(query, {"_id": 0, "created_at": 1, "total": 1}).to_list(10000)
    
    # تقسيم حسب الساعة
    hourly_data = {str(h).zfill(2): {"orders": 0, "sales": 0} for h in range(24)}
    
    for order in orders:
        try:
            created_at = order.get("created_at", "")
            if "T" in created_at:
                hour = created_at.split("T")[1][:2]
            else:
                hour = "00"
            
            if hour in hourly_data:
                hourly_data[hour]["orders"] += 1
                hourly_data[hour]["sales"] += _sn(order.get("total"))
        except:
            pass
    
    return {
        "date": date or datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "hourly": hourly_data
    }

