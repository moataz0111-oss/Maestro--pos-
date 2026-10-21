"""📊 ملخص الإغلاق اليومي لمدير كل مشروع (وضع المؤسسة فقط) — واتساب، 9 صباحاً لليوم التشغيلي السابق."""
import logging
from datetime import datetime, timezone, timedelta

from .shared import get_database

logger = logging.getLogger(__name__)
SEND_HOUR = 9


def _n(v):
    return f"{float(v or 0):,.0f}"


async def build_project_summary(db, tenant_id: str, project: dict, date: str) -> str:
    pid = project["id"]
    bids = [b["id"] async for b in db.branches.find({"tenant_id": tenant_id, "project_id": pid}, {"_id": 0, "id": 1})]
    q = {"tenant_id": tenant_id, "business_date": date,
         "$or": [{"project_id": pid}, {"project_id": {"$in": [None, ""]}, "branch_id": {"$in": bids}}]}
    closings = await db.cash_register_closings.find(q, {"_id": 0}).to_list(length=None)
    tot = {k: sum(float(c.get(k) or 0) for c in closings)
           for k in ("total_sales", "cash_sales", "card_sales", "delivery_sales", "total_expenses", "difference")}
    orders = sum(int(c.get("orders_count") or 0) for c in closings)
    lines = [f"📅 اليوم التشغيلي: {date}", f"🔒 عدد الإغلاقات: {len(closings)}", f"🧾 عدد الطلبات: {orders}",
             f"💰 إجمالي المبيعات: {_n(tot['total_sales'])}",
             f"   • نقدي: {_n(tot['cash_sales'])} • بطاقة: {_n(tot['card_sales'])} • توصيل: {_n(tot['delivery_sales'])}",
             f"💸 المصاريف: {_n(tot['total_expenses'])}",
             f"📈 الصافي: {_n(tot['total_sales'] - tot['total_expenses'])}",
             f"⚖️ فروقات الصندوق: {_n(tot['difference'])}"]
    by_branch = {}
    for c in closings:
        k = c.get("branch_name") or "—"
        by_branch[k] = by_branch.get(k, 0) + float(c.get("total_sales") or 0)
    if by_branch:
        lines.append("\n🏪 حسب الفرع:")
        lines += [f"   • {k}: {_n(v)}" for k, v in by_branch.items()]
    if not closings:
        lines.append("\nلا توجد إغلاقات صندوق لهذا اليوم.")
    return "\n".join(lines)


async def run_project_daily_summaries(now=None, force_project_id=None):
    from server import _phone_to_e164, _wa_free
    db = get_database()
    now = now or datetime.now(timezone.utc)
    local = now + timedelta(hours=3)
    if not force_project_id and local.hour < SEND_HOUR:
        return 0
    date = (local - timedelta(days=1)).strftime("%Y-%m-%d")
    sent = 0
    async for t in db.tenants.find({"enterprise_enabled": True}, {"_id": 0, "id": 1}):
        pq = {"tenant_id": t["id"], "deleted_at": {"$exists": False}}
        if force_project_id:
            pq["id"] = force_project_id  # إرسال يدوي يتجاهل مفتاح الإيقاف
        else:
            pq["admin_daily_summary"] = {"$ne": False}
        async for p in db.projects.find(pq, {"_id": 0}):
            if not force_project_id and await db.project_daily_summary_state.find_one({"project_id": p["id"], "date": date}):
                continue
            admins = [u async for u in db.users.find(
                {"tenant_id": t["id"], "role": "project_admin", "project_id": p["id"], "is_active": {"$ne": False},
                 "phone": {"$type": "string", "$ne": ""}}, {"_id": 0, "phone": 1})]
            if not admins:
                continue
            msg = await build_project_summary(db, t["id"], p, date)
            sent_before = sent
            for a in admins:
                try:
                    e164 = await _phone_to_e164(a["phone"])
                    ok, _ = await _wa_free.send_message(
                        e164, msg, purpose="project_daily_summary", tenant_id=t["id"],
                        title=f"📊 ملخص الإغلاق اليومي — {p.get('name')}", with_logo=True,
                        project_name=p.get("name"), project_logo=p.get("logo_url"),
                        project_activity=p.get("activity_type"))
                    sent += 1 if ok else 0
                except Exception as e:
                    logger.warning(f"project daily summary WA failed: {e}")
            if force_project_id or sent == sent_before:
                continue  # لا يُعلَّم اليوم إلا عند نجاح الإرسال (يُعاد المحاولة لاحقاً)
            await db.project_daily_summary_state.update_one(
                {"project_id": p["id"], "date": date},
                {"$set": {"project_id": p["id"], "tenant_id": t["id"], "date": date, "sent_at": now.isoformat()}},
                upsert=True)
    return sent


async def _project_week_totals(db, tenant_id, pid, dates):
    """المبيعات من الورديات المغلقة + المصاريف من سجل المصاريف (كلها حسب المشروع/فروعه)"""
    bids = [b["id"] async for b in db.branches.find({"tenant_id": tenant_id, "project_id": pid}, {"_id": 0, "id": 1})]
    scope = {"$or": [{"project_id": pid}, {"project_id": {"$in": [None, ""]}, "branch_id": {"$in": bids}}]}
    shifts = await db.shifts.find({"tenant_id": tenant_id, "status": "closed", "business_date": {"$in": dates}, **scope},
                                  {"_id": 0, "total_sales": 1, "total_orders": 1}).to_list(length=None)
    exps = await db.expenses.find({"tenant_id": tenant_id, "category": {"$ne": "refund"},
                                   "$and": [scope, {"$or": [{"business_date": {"$in": dates}}, {"business_date": {"$exists": False}, "date": {"$in": dates}}]}]},
                                  {"_id": 0, "amount": 1}).to_list(length=None)
    return (sum(float(x.get("total_sales") or 0) for x in shifts), sum(float(x.get("amount") or 0) for x in exps),
            sum(int(x.get("total_orders") or 0) for x in shifts))


async def _project_closings(db, tenant_id, pid, dates):
    bids = [b["id"] async for b in db.branches.find({"tenant_id": tenant_id, "project_id": pid}, {"_id": 0, "id": 1})]
    q = {"tenant_id": tenant_id, "business_date": {"$in": dates},
         "$or": [{"project_id": pid}, {"project_id": {"$in": [None, ""]}, "branch_id": {"$in": bids}}]}
    return await db.cash_register_closings.find(q, {"_id": 0, "total_sales": 1, "total_expenses": 1, "orders_count": 1}).to_list(length=None)


async def _owner_phones(db, tenant_id):
    phones = []
    t = await db.tenants.find_one({"id": tenant_id}, {"_id": 0, "owner_phone": 1}) or {}
    if t.get("owner_phone"):
        phones.append(t["owner_phone"])
    async for u in db.users.find({"tenant_id": tenant_id, "role": {"$in": ["admin", "general_manager"]}, "is_active": {"$ne": False},
                                  "phone": {"$type": "string", "$ne": ""}}, {"_id": 0, "phone": 1}):
        phones.append(u["phone"])
    return list(dict.fromkeys(phones))


async def build_owner_weekly_summary(db, tenant_id, dates):
    rows = []
    async for p in db.projects.find({"tenant_id": tenant_id, "deleted_at": {"$exists": False}}, {"_id": 0, "id": 1, "name": 1, "currency": 1}):
        sales, exp, orders = await _project_week_totals(db, tenant_id, p["id"], dates)
        rows.append((p.get("name") or "—", sales, exp, orders, p.get("currency") or ""))
    rows.sort(key=lambda r: r[1], reverse=True)
    lines = [f"📆 الأسبوع: {dates[0]} ← {dates[-1]}", ""]
    medals = ["🥇", "🥈", "🥉"]
    for i, (name, sales, exp, orders, cur) in enumerate(rows):
        lines += [f"{medals[i] if i < 3 else '▫️'} {name}",
                  f"   💰 المبيعات: {_n(sales)} {cur} • 🧾 الطلبات: {orders}",
                  f"   💸 المصاريف: {_n(exp)} • 📈 الصافي: {_n(sales - exp)}"]
    if not rows:
        lines.append("لا توجد مشاريع.")
    return "\n".join(lines)


async def run_owner_weekly_summaries(now=None, force_tenant_id=None):
    """كل أحد 9 صباحاً (بغداد): مقارنة مبيعات ومصاريف كل المشاريع للأسبوع الماضي لمالك المؤسسة."""
    from server import _phone_to_e164, _wa_free
    db = get_database()
    now = now or datetime.now(timezone.utc)
    local = now + timedelta(hours=3)
    if not force_tenant_id and (local.weekday() != 6 or local.hour < SEND_HOUR):
        return 0
    dates = [(local - timedelta(days=d)).strftime("%Y-%m-%d") for d in range(7, 0, -1)]
    sent = 0
    tq = {"enterprise_enabled": True, **({"id": force_tenant_id} if force_tenant_id else {})}
    async for t in db.tenants.find(tq, {"_id": 0, "id": 1, "name": 1, "owner_weekly_summary": 1}):
        if not force_tenant_id and (t.get("owner_weekly_summary") is False or
                                    await db.owner_weekly_summary_state.find_one({"tenant_id": t["id"], "week_start": dates[0]})):
            continue
        phones = await _owner_phones(db, t["id"])
        if not phones:
            continue
        msg = await build_owner_weekly_summary(db, t["id"], dates)
        before = sent
        for ph in phones:
            try:
                ok, _ = await _wa_free.send_message(await _phone_to_e164(ph), msg, purpose="owner_weekly_summary",
                                                    tenant_id=t["id"], title="📊 الملخص الأسبوعي للمؤسسة", with_logo=True)
                sent += 1 if ok else 0
            except Exception as e:
                logger.warning(f"owner weekly summary WA failed: {e}")
        if not force_tenant_id and sent > before:
            await db.owner_weekly_summary_state.update_one(
                {"tenant_id": t["id"], "week_start": dates[0]},
                {"$set": {"tenant_id": t["id"], "week_start": dates[0], "sent_at": now.isoformat()}}, upsert=True)
    return sent


async def send_cash_diff_alert(rec: dict):
    """تنبيه فوري لمدير المشروع عند إغلاق وردية بفرق صندوق ≥ الحد (وضع المؤسسة فقط)."""
    from server import _phone_to_e164, _wa_free
    db = get_database()
    tid = rec.get("tenant_id")
    diff = float(rec.get("difference") or 0)
    if not tid or not diff:
        return 0
    t = await db.tenants.find_one({"id": tid}, {"_id": 0, "enterprise_enabled": 1})
    if not (t or {}).get("enterprise_enabled"):
        return 0
    pid = rec.get("project_id")
    if not pid and rec.get("branch_id"):
        pid = ((await db.branches.find_one({"id": rec["branch_id"]}, {"_id": 0, "project_id": 1})) or {}).get("project_id")
    p = await db.projects.find_one({"id": pid, "tenant_id": tid}, {"_id": 0}) if pid else None
    if not p:
        return 0
    threshold = p.get("cash_diff_alert_threshold")
    if threshold is None:
        threshold = 10000 if (p.get("currency") or "IQD") == "IQD" else 20
    if not threshold or abs(diff) < float(threshold):
        return 0
    admins = [u async for u in db.users.find({"tenant_id": tid, "role": "project_admin", "project_id": pid, "is_active": {"$ne": False},
                                              "phone": {"$type": "string", "$ne": ""}}, {"_id": 0, "phone": 1})]
    kind = "زيادة" if diff > 0 else "عجز"
    msg = "\n".join([f"⚠️ {kind} في الصندوق: {_n(abs(diff))} {p.get('currency') or ''}",
                     f"🏪 الفرع: {rec.get('branch_name') or '—'}", f"👤 الكاشير: {rec.get('cashier_name') or '—'}",
                     f"📅 اليوم التشغيلي: {rec.get('business_date') or '—'}",
                     f"💵 المتوقع: {_n(rec.get('expected_cash'))} • المعدود: {_n(rec.get('actual_cash'))}",
                     f"🔔 حد التنبيه: {_n(threshold)}"])
    sent = 0
    for a in admins:
        try:
            ok, _ = await _wa_free.send_message(await _phone_to_e164(a["phone"]), msg, purpose="cash_diff_alert", tenant_id=tid,
                                                title=f"🚨 تنبيه فرق الصندوق — {p.get('name')}", with_logo=True,
                                                project_name=p.get("name"), project_logo=p.get("logo_url"),
                                                project_activity=p.get("activity_type"))
            sent += 1 if ok else 0
        except Exception as e:
            logger.warning(f"cash diff alert WA failed: {e}")
    await db.cash_diff_alerts.insert_one({"tenant_id": tid, "project_id": pid, "shift_id": rec.get("shift_id"), "difference": diff,
                                          "threshold": threshold, "sent": sent, "created_at": datetime.now(timezone.utc).isoformat()})
    return sent
