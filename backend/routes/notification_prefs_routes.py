"""إعدادات الإشعارات + لوحة صحّة أجهزة البصمة (SuperAdmin/Admin)."""
from fastapi import APIRouter, Depends, HTTPException, Body
from typing import Optional
from datetime import datetime, timezone, timedelta
import uuid

from server import (  # noqa: F401,F403
    db, get_current_user, get_user_tenant_id, UserRole
)
from routes.shifts_routes import DEFAULT_NOTIFICATION_PREFS, _get_notification_prefs

router = APIRouter(tags=["Notifications & Biometric Health"])


def _require_admin(current_user: dict):
    if current_user.get("role") not in [UserRole.ADMIN, UserRole.GENERAL_MANAGER, UserRole.SUPER_ADMIN, UserRole.MANAGER, "branch_manager"]:
        raise HTTPException(status_code=403, detail="غير مصرح")


@router.get("/system/notification-preferences")
async def get_notification_preferences(current_user: dict = Depends(get_current_user)):
    """قراءة تفضيلات إشعارات المالك (شفت / فحص السلامة / …)."""
    _require_admin(current_user)
    tenant_id = get_user_tenant_id(current_user)
    prefs = await _get_notification_prefs(db, tenant_id)
    return {"preferences": prefs, "defaults": DEFAULT_NOTIFICATION_PREFS}


@router.put("/system/notification-preferences")
async def update_notification_preferences(body: dict = Body(...), current_user: dict = Depends(get_current_user)):
    """تحديث تفضيلات الإشعارات (per-tenant)."""
    _require_admin(current_user)
    tenant_id = get_user_tenant_id(current_user)
    # اقبل فقط المفاتيح المعروفة كـbool
    allowed = set(DEFAULT_NOTIFICATION_PREFS.keys())
    updates = {}
    for k, v in body.items():
        if k in allowed and isinstance(v, bool):
            updates[k] = v
    if not updates:
        raise HTTPException(status_code=400, detail="لا توجد مفاتيح صالحة للتحديث")
    q = {"id": "global"}
    if tenant_id:
        q["tenant_id"] = tenant_id
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    updates["updated_by"] = current_user.get("id")
    await db.notification_preferences.update_one(q, {"$set": {**q, **updates}}, upsert=True)
    prefs = await _get_notification_prefs(db, tenant_id)
    return {"success": True, "preferences": prefs}


@router.get("/system/messages-log")
async def unified_messages_log(
    channel: Optional[str] = None,     # whatsapp | email | bell | all
    category: Optional[str] = None,    # security | shift | expense | system | ...
    status: Optional[str] = None,      # sent | failed | delivered
    days: int = 7,
    limit: int = 200,
    current_user: dict = Depends(get_current_user),
):
    """سجل موحّد لكل الرسائل المُرسَلة (WhatsApp + Email + Bell) — للمالك.
    
    فلترة: channel/category/status/days.
    يُرجع قائمة موحّدة مرتبة زمنياً + إحصائيات إجمالية.
    """
    _require_admin(current_user)
    tenant_id = get_user_tenant_id(current_user)
    since_iso = (datetime.now(timezone.utc) - timedelta(days=max(1, int(days)))).isoformat()
    limit = max(1, min(int(limit), 500))
    
    items = []
    
    # === WhatsApp من db.wa_messages ===
    if not channel or channel in ("whatsapp", "all"):
        q = {"sent_at": {"$gte": since_iso}}
        if tenant_id:
            q["tenant_id"] = tenant_id
        if status:
            q["status"] = status
        if category:
            q["purpose"] = {"$regex": category, "$options": "i"}
        async for m in db.wa_messages.find(q, {"_id": 0}).sort("sent_at", -1).limit(limit):
            items.append({
                "id": m.get("id") or m.get("message_id") or str(uuid.uuid4()),
                "channel": "whatsapp",
                "to": m.get("phone") or m.get("to"),
                "subject": m.get("purpose") or "",
                "message": (m.get("message") or "")[:300],
                "status": m.get("status") or "sent",
                "error": m.get("error"),
                "sent_at": m.get("sent_at") or m.get("created_at"),
                "provider": "baileys",
                "purpose": m.get("purpose"),
            })
    
    # === Email من db.system_email_logs ===
    if not channel or channel in ("email", "all"):
        q = {"sent_at": {"$gte": since_iso}}
        if tenant_id:
            q["tenant_id"] = tenant_id
        if status:
            q["status"] = status
        if category:
            q["purpose"] = {"$regex": category, "$options": "i"}
        async for m in db.system_email_logs.find(q, {"_id": 0}).sort("sent_at", -1).limit(limit):
            _to = m.get("to")
            items.append({
                "id": m.get("id") or str(uuid.uuid4()),
                "channel": "email",
                "to": ", ".join(_to) if isinstance(_to, list) else str(_to or ""),
                "subject": m.get("subject") or "",
                "message": m.get("subject") or "",
                "status": m.get("status") or "sent",
                "error": m.get("error"),
                "sent_at": m.get("sent_at"),
                "provider": m.get("provider") or "smtp",
                "purpose": m.get("purpose"),
            })
    
    # === Bell من db.notifications ===
    if not channel or channel in ("bell", "all"):
        q = {"created_at": {"$gte": since_iso}}
        if tenant_id:
            q["tenant_id"] = tenant_id
        if category:
            q["category"] = category
        async for m in db.notifications.find(q, {"_id": 0}).sort("created_at", -1).limit(limit):
            items.append({
                "id": m.get("id") or str(uuid.uuid4()),
                "channel": "bell",
                "to": "الجرس",
                "subject": m.get("title") or m.get("type") or "",
                "message": (m.get("message") or "")[:300],
                "status": "sent",
                "error": None,
                "sent_at": m.get("created_at"),
                "provider": "internal",
                "purpose": m.get("category") or m.get("type"),
                "is_read": bool(m.get("is_read")),
                "severity": m.get("severity"),
            })
    
    # ترتيب موحد زمنياً (الأحدث أولاً) + قصّ لـ limit
    items.sort(key=lambda x: x.get("sent_at") or "", reverse=True)
    items = items[:limit]
    
    # الإحصائيات
    stats = {
        "total": len(items),
        "by_channel": {"whatsapp": 0, "email": 0, "bell": 0},
        "by_status": {"sent": 0, "failed": 0},
    }
    for it in items:
        stats["by_channel"][it["channel"]] = stats["by_channel"].get(it["channel"], 0) + 1
        stats["by_status"][it["status"]] = stats["by_status"].get(it["status"], 0) + 1
    
    return {"items": items, "stats": stats, "days": days, "limit": limit}


# ==================== BIOMETRIC HEALTH DASHBOARD ====================
@router.get("/biometric/health")
async def biometric_health_dashboard(
    branch_id: Optional[str] = None,
    offline_after_minutes: int = 15,
    current_user: dict = Depends(get_current_user),
):
    """لوحة صحّة أجهزة البصمة (per-tenant، أو per-branch لو مُرِّر).
    
    يُرجع لكل فرع:
    - devices_total / devices_active
    - last_sync (أحدث last_sync لأي جهاز في الفرع)
    - offline_devices (أجهزة بلا last_sync أو last_sync أقدم من offline_after_minutes)
    - queue: pending / processing / completed / failed (خلال آخر 24 ساعة)
    """
    _require_admin(current_user)
    tenant_id = get_user_tenant_id(current_user)
    dev_q = {}
    if tenant_id:
        dev_q["tenant_id"] = tenant_id
    if branch_id:
        dev_q["branch_id"] = branch_id
    devices = await db.biometric_devices.find(dev_q, {"_id": 0}).to_list(1000)
    
    branches_map = {}
    async for br in db.branches.find({} if not tenant_id else {"tenant_id": tenant_id}, {"_id": 0, "id": 1, "name": 1}):
        branches_map[br["id"]] = br.get("name", "")
    
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=int(offline_after_minutes))
    day_ago_iso = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    
    # جمّع حسب الفرع
    by_branch = {}
    for dev in devices:
        bid = dev.get("branch_id") or "_no_branch_"
        bucket = by_branch.setdefault(bid, {
            "branch_id": bid,
            "branch_name": branches_map.get(bid, dev.get("branch_name", "")),
            "devices_total": 0,
            "devices_active": 0,
            "devices_offline": 0,
            "last_sync": None,
            "devices": [],
        })
        bucket["devices_total"] += 1
        if dev.get("is_active", True):
            bucket["devices_active"] += 1
        
        last_sync_str = dev.get("last_sync") or ""
        is_offline = True
        if last_sync_str:
            try:
                ls = datetime.fromisoformat(last_sync_str.replace("Z", "+00:00"))
                if ls.tzinfo is None:
                    ls = ls.replace(tzinfo=timezone.utc)
                is_offline = ls < cutoff
                if bucket["last_sync"] is None or ls > datetime.fromisoformat(bucket["last_sync"].replace("Z", "+00:00")).replace(tzinfo=timezone.utc):
                    bucket["last_sync"] = last_sync_str
            except Exception:
                pass
        if is_offline:
            bucket["devices_offline"] += 1
        
        bucket["devices"].append({
            "id": dev.get("id"),
            "name": dev.get("name"),
            "ip_address": dev.get("ip_address"),
            "device_type": dev.get("device_type"),
            "model_name": dev.get("model_name"),
            "protocol": dev.get("protocol"),
            "last_sync": last_sync_str or None,
            "is_active": bool(dev.get("is_active", True)),
            "is_offline": is_offline,
        })
    
    # عدّاد الطابور per branch (آخر 24 ساعة)
    q_base = {"created_at": {"$gte": day_ago_iso}}
    if tenant_id:
        q_base["tenant_id"] = tenant_id
    
    async def _count(status, bid):
        q = dict(q_base)
        q["status"] = status
        if bid and bid != "_no_branch_":
            q["branch_id"] = bid
        return await db.biometric_queue.count_documents(q)
    
    for bid, bucket in by_branch.items():
        bucket["queue"] = {
            "pending": await _count("pending", bid),
            "processing": await _count("processing", bid),
            "completed": await _count("completed", bid),
            "failed": await _count("failed", bid),
        }
    
    # totals
    totals = {
        "devices_total": sum(b["devices_total"] for b in by_branch.values()),
        "devices_active": sum(b["devices_active"] for b in by_branch.values()),
        "devices_offline": sum(b["devices_offline"] for b in by_branch.values()),
        "pending": sum(b["queue"]["pending"] for b in by_branch.values()),
        "processing": sum(b["queue"]["processing"] for b in by_branch.values()),
        "completed": sum(b["queue"]["completed"] for b in by_branch.values()),
        "failed": sum(b["queue"]["failed"] for b in by_branch.values()),
    }
    
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "offline_after_minutes": offline_after_minutes,
        "totals": totals,
        "branches": sorted(by_branch.values(), key=lambda b: b.get("branch_name") or ""),
    }
