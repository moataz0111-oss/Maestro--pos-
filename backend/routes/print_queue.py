"""
Print Queue - نظام طابور الطباعة
المتصفح يرسل أوامر الطباعة للسيرفر
الوسيط يسحب الأوامر من السيرفر ويطبعها
"""
from fastapi import APIRouter, Depends, Query
from datetime import datetime, timezone
import uuid

router = APIRouter()

# Import shared dependencies
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from routes.shared import get_database, get_current_user, get_user_tenant_id


@router.post("/print-queue")
async def add_print_job(job_data: dict, current_user: dict = Depends(get_current_user)):
    """إضافة أمر طباعة لطابور الطباعة.
    
    مهم: branch_id يُؤخذ تلقائياً من المستخدم الحالي إذا لم يُرسل،
    لضمان وصول الأمر لوسيط الفرع الصحيح.
    """
    db = get_database()
    tenant_id = get_user_tenant_id(current_user)
    
    # branch_id: من الطلب أولاً، ثم من المستخدم (عزل صارم بين الفروع)
    job_branch_id = job_data.get("branch_id") or current_user.get("branch_id") or ""
    
    job = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "branch_id": job_branch_id,
        "status": "pending",
        "printer_name": job_data.get("printer_name", ""),
        "printer_type": job_data.get("printer_type", "usb"),
        "usb_printer_name": job_data.get("usb_printer_name", ""),
        "ip_address": job_data.get("ip_address", ""),
        "port": job_data.get("port", 9100),
        "raw_data": job_data.get("raw_data", ""),
        "order_data": job_data.get("order_data"),
        "printer_config": job_data.get("printer_config"),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": current_user.get("id"),
        "device_id": job_data.get("device_id", ""),
    }
    
    await db.print_queue.insert_one(job)
    del job["_id"]
    return {"success": True, "job_id": job["id"], "branch_id": job_branch_id}


@router.get("/print-queue/pending")
async def get_pending_jobs(
    device_id: str = Query(default=""),
    branch_id: str = Query(default=""),
    agent_version: str = Query(default=""),
    limit: int = Query(default=20),
    wait: int = Query(default=0, description="Long-polling: max seconds to wait for new jobs (0 = no wait)")
):
    """الوسيط يسحب أوامر الطباعة المعلقة + يسجل heartbeat.
    
    دعم Long-Polling: إذا wait > 0، الـrequest يبقى مفتوحاً حتى يظهر job أو ينتهي الوقت.
    هذا يجعل الطباعة فورية (<200ms بدل 500ms polling delay).
    """
    import asyncio
    db = get_database()
    
    # تنظيف قيم الـ placeholder المُزعجة
    if branch_id and (branch_id.startswith("{{") or branch_id == "default"):
        branch_id = ""
    
    # تسجيل heartbeat
    if agent_version or device_id:
        hb_key = f"{device_id or 'default'}__{branch_id or 'nobranch'}"
        await db.agent_heartbeats.update_one(
            {"heartbeat_key": hb_key},
            {"$set": {
                "heartbeat_key": hb_key,
                "device_id": device_id or "default",
                "branch_id": branch_id,
                "last_seen": datetime.now(timezone.utc).isoformat(),
                "version": agent_version,
                "status": "online"
            }},
            upsert=True
        )
    
    # بناء الاستعلام
    if branch_id:
        query = {"status": "pending", "branch_id": branch_id}
    else:
        query = {"status": "pending"}
    
    # Long-polling loop: نتحقق كل 100ms حتى يظهر job أو ينتهي wait
    max_wait = max(0, min(int(wait or 0), 30))  # حد أقصى 30 ثانية
    check_interval = 0.1  # 100ms
    elapsed = 0.0
    
    while True:
        jobs = await db.print_queue.find(
            query, {"_id": 0}
        ).sort("created_at", 1).limit(limit).to_list(limit)
        
        if jobs or elapsed >= max_wait:
            return {"jobs": jobs, "count": len(jobs)}
        
        await asyncio.sleep(check_interval)
        elapsed += check_interval


@router.get("/print-queue/agent-status")
async def get_agent_status(branch_id: str = Query(default="")):
    """فحص حالة الوسيط الحقيقية من آخر heartbeat — مفلتر حسب الفرع إن مُرِّر"""
    db = get_database()
    
    hb_query = {}
    if branch_id:
        hb_query["branch_id"] = branch_id
    heartbeat = await db.agent_heartbeats.find_one(
        hb_query, {"_id": 0}, sort=[("last_seen", -1)]
    )
    
    if not heartbeat:
        return {"online": False, "version": None, "last_seen": None}
    
    last_seen = heartbeat.get("last_seen", "")
    try:
        from datetime import timedelta
        last_dt = datetime.fromisoformat(last_seen.replace("Z", "+00:00"))
        age = (datetime.now(timezone.utc) - last_dt).total_seconds()
        online = age < 30
    except Exception:
        online = False
    
    return {
        "online": online,
        "version": heartbeat.get("version"),
        "last_seen": last_seen,
        "branch_id": heartbeat.get("branch_id", "")
    }


@router.put("/print-queue/{job_id}/complete")
async def complete_print_job(job_id: str, result: dict = None):
    """الوسيط يبلّغ إن الطباعة خلصت"""
    db = get_database()
    
    update = {
        "status": "completed",
        "completed_at": datetime.now(timezone.utc).isoformat(),
    }
    if result:
        update["result"] = result.get("message", "OK")
    
    await db.print_queue.update_one(
        {"id": job_id},
        {"$set": update}
    )
    return {"success": True}


@router.put("/print-queue/{job_id}/failed")
async def fail_print_job(job_id: str, result: dict = None):
    """الوسيط يبلّغ إن الطباعة فشلت"""
    db = get_database()
    
    await db.print_queue.update_one(
        {"id": job_id},
        {"$set": {
            "status": "failed",
            "failed_at": datetime.now(timezone.utc).isoformat(),
            "error": result.get("error", "") if result else ""
        }}
    )
    return {"success": True}


@router.delete("/print-queue/cleanup")
async def cleanup_old_jobs(current_user: dict = Depends(get_current_user)):
    """حذف الأوامر القديمة (أكثر من ساعة)"""
    db = get_database()
    from datetime import timedelta
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    
    result = await db.print_queue.delete_many({
        "status": {"$in": ["completed", "failed"]},
        "created_at": {"$lt": cutoff}
    })
    return {"deleted": result.deleted_count}


@router.get("/print-queue/agents-monitor")
async def get_all_agents_status(current_user: dict = Depends(get_current_user)):
    """لوحة مراقبة الوسطاء: حالة كل agent في كل فرع مع آخر heartbeat + version.
    
    تُستخدم في Settings لعرض إعلام فوري عند انقطاع أي فرع.
    """
    from datetime import timedelta
    db = get_database()
    tenant_id = get_user_tenant_id(current_user)
    
    # جلب جميع الفروع للـ tenant
    branch_query = {}
    if tenant_id:
        branch_query["tenant_id"] = tenant_id
    branches = await db.branches.find(branch_query, {"_id": 0, "id": 1, "name": 1}).to_list(200)
    
    # جلب جميع heartbeats من آخر 24 ساعة
    now = datetime.now(timezone.utc)
    cutoff_24h = (now - timedelta(hours=24)).isoformat()
    heartbeats = await db.agent_heartbeats.find(
        {"last_seen": {"$gte": cutoff_24h}},
        {"_id": 0}
    ).to_list(1000)
    
    # مطابقة كل فرع بـ heartbeat
    result_agents = []
    seen_branches = set()
    
    for hb in heartbeats:
        hb_branch = hb.get("branch_id", "")
        if not hb_branch or hb_branch in seen_branches:
            continue
        seen_branches.add(hb_branch)
        last_seen_str = hb.get("last_seen", "")
        try:
            last_dt = datetime.fromisoformat(last_seen_str.replace("Z", "+00:00"))
            age_seconds = (now - last_dt).total_seconds()
            if age_seconds < 30:
                status = "online"
            elif age_seconds < 300:  # 5 minutes
                status = "warning"
            else:
                status = "offline"
        except Exception:
            status = "offline"
            age_seconds = None
        
        branch = next((b for b in branches if b.get("id") == hb_branch), None)
        result_agents.append({
            "branch_id": hb_branch,
            "branch_name": branch.get("name") if branch else "فرع محذوف",
            "device_id": hb.get("device_id", ""),
            "version": hb.get("version", "?"),
            "last_seen": last_seen_str,
            "age_seconds": int(age_seconds) if age_seconds is not None else None,
            "status": status
        })
    
    # إضافة الفروع التي ليس لها heartbeat أصلاً (وسيط غير مثبّت بعد)
    for b in branches:
        if b.get("id") not in seen_branches:
            result_agents.append({
                "branch_id": b.get("id"),
                "branch_name": b.get("name"),
                "device_id": "",
                "version": None,
                "last_seen": None,
                "age_seconds": None,
                "status": "not_installed"
            })
    
    # إحصائيات سريعة
    online_count = sum(1 for a in result_agents if a["status"] == "online")
    offline_count = sum(1 for a in result_agents if a["status"] == "offline")
    warning_count = sum(1 for a in result_agents if a["status"] == "warning")
    not_installed = sum(1 for a in result_agents if a["status"] == "not_installed")
    
    return {
        "agents": result_agents,
        "summary": {
            "total_branches": len(branches),
            "online": online_count,
            "offline": offline_count,
            "warning": warning_count,
            "not_installed": not_installed
        }
    }
