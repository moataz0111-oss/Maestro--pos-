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
    """إضافة أمر طباعة لطابور الطباعة"""
    db = get_database()
    tenant_id = get_user_tenant_id(current_user)
    
    job = {
        "id": str(uuid.uuid4()),
        "tenant_id": tenant_id,
        "branch_id": job_data.get("branch_id"),
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
    return {"success": True, "job_id": job["id"]}


@router.get("/print-queue/pending")
async def get_pending_jobs(
    device_id: str = Query(default=""),
    branch_id: str = Query(default=""),
    agent_version: str = Query(default=""),
    limit: int = Query(default=20)
):
    """الوسيط يسحب أوامر الطباعة المعلقة + يسجل heartbeat"""
    db = get_database()
    
    # تسجيل heartbeat الوسيط (يثبت إنه شغال)
    if agent_version or device_id:
        await db.agent_heartbeats.update_one(
            {"device_id": device_id or "default"},
            {"$set": {
                "last_seen": datetime.now(timezone.utc).isoformat(),
                "version": agent_version,
                "status": "online"
            }},
            upsert=True
        )
    
    query = {"status": "pending"}
    if branch_id:
        query["branch_id"] = branch_id
    
    jobs = await db.print_queue.find(
        query, {"_id": 0}
    ).sort("created_at", 1).limit(limit).to_list(limit)
    
    return {"jobs": jobs, "count": len(jobs)}


@router.get("/print-queue/agent-status")
async def get_agent_status():
    """فحص حالة الوسيط الحقيقية من آخر heartbeat"""
    db = get_database()
    
    heartbeat = await db.agent_heartbeats.find_one(
        {}, {"_id": 0}, sort=[("last_seen", -1)]
    )
    
    if not heartbeat:
        return {"online": False, "version": None, "last_seen": None}
    
    last_seen = heartbeat.get("last_seen", "")
    try:
        from datetime import timedelta
        last_dt = datetime.fromisoformat(last_seen.replace("Z", "+00:00"))
        age = (datetime.now(timezone.utc) - last_dt).total_seconds()
        online = age < 30  # إذا آخر heartbeat أقل من 30 ثانية = شغال
    except Exception:
        online = False
    
    return {
        "online": online,
        "version": heartbeat.get("version"),
        "last_seen": last_seen
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
