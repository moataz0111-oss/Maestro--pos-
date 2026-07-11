"""Biometric Device Routes (extracted from server.py)"""
from fastapi import APIRouter
from server import *  # noqa: F401,F403
from server import (_calc_worked_hours_hhmm)

router = APIRouter()

# ==================== BIOMETRIC DEVICE ROUTES ====================
# تكامل أجهزة البصمة ZKTeco

def _device_conn_params(device: dict) -> dict:
    """اجمع بارامترات الاتصال لكل موديلات ZKTeco (K/F/G/iFace/MB/SF/UA…) من وثيقة الجهاز.
    يُدمج كأنه spread داخل job["params"] ليُنفّذها الوكيل المحلي بالمُعدّلات الصحيحة.
    
    نُصدر الأسماء بصيغتين (device_ip/device_port والقديمتين ip/port) للتوافق التام
    مع النسخ القديمة من الوكيل المحلي (print_server.ps1)."""
    _ip = device.get("ip_address")
    _port = device.get("port", 4370)
    _timeout_sec = int(device.get("timeout") or 10)
    _password = device.get("communication_password")
    return {
        # الحقول الجديدة (الاسم الصريح)
        "device_ip": _ip,
        "device_port": _port,
        "device_type": device.get("device_type") or "fingerprint",
        "communication_password": _password,
        "force_udp": bool(device.get("force_udp") or False),
        "timeout": _timeout_sec,
        "firmware_version": device.get("firmware_version"),
        "model_name": device.get("model_name"),
        "protocol": device.get("protocol") or "zk-standard",
        # aliases للنسخ القديمة من الوكيل المحلي (يقرأ body.ip / body.port / body.password)
        "ip": _ip,
        "port": _port,
        "password": _password,
        "timeout_ms": _timeout_sec * 1000,
    }


class BiometricDeviceCreate(BaseModel):
    name: str
    ip_address: str
    port: int = 4370
    branch_id: str
    device_type: str = "fingerprint"  # fingerprint | face | palm | rfid | hybrid
    # 🔧 خيارات توسيع دعم كل موديلات ZKTeco (K40/K50/F18/F19/G3/SF400/UA300/MB360/…)
    communication_password: Optional[str] = None   # كلمة سر الاتصال (بعض الأجهزة تتطلبها)
    force_udp: bool = False                         # الموديلات القديمة UDP فقط
    timeout: int = 10                               # زيادة المهلة للأجهزة البطيئة
    firmware_version: Optional[str] = None          # اختياري (K/F/G/…) لمساعدة الوكيل
    model_name: Optional[str] = None                # مثل K40, iFace880, MB360
    protocol: Optional[str] = None                  # zk-standard | zk-push | pull-sdk


class BiometricDeviceUpdate(BaseModel):
    name: Optional[str] = None
    ip_address: Optional[str] = None
    port: Optional[int] = None
    branch_id: Optional[str] = None
    device_type: Optional[str] = None
    is_active: Optional[bool] = None
    communication_password: Optional[str] = None
    force_udp: Optional[bool] = None
    timeout: Optional[int] = None
    firmware_version: Optional[str] = None
    model_name: Optional[str] = None
    protocol: Optional[str] = None

class ZKTecoPushData(BaseModel):
    AuthToken: Optional[str] = None
    OperationID: Optional[str] = None
    CommandName: Optional[str] = None
    VerifyType: Optional[str] = None
    PIN: Optional[str] = None
    DateTime: Optional[str] = None
    DeviceSN: Optional[str] = None
    Status: Optional[int] = None

@router.get("/biometric/devices")
async def list_biometric_devices(branch_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """قائمة أجهزة البصمة"""
    query = {"tenant_id": current_user.get("tenant_id")}
    if branch_id:
        query["branch_id"] = branch_id
    
    devices = await db.biometric_devices.find(query, {"_id": 0}).to_list(100)
    return devices

@router.post("/biometric/devices")
async def create_biometric_device(device: BiometricDeviceCreate, current_user: dict = Depends(get_current_user)):
    """إضافة جهاز بصمة جديد + مزامنة تلقائية فورية لكل الموظفين في نفس الفرع.
    
    🔥 عند إضافة جهاز جديد لفرع:
    - تُنشأ حصراً جوبات push في `biometric_queue` لكل موظف نشط في ذلك الفرع.
    - يلتقطها الوكيل المحلي (localhost:9999) عبر polling ويُصدرها للجهاز.
    - يعمل حتى مع 100 جهاز — كل جهاز جديد يبدأ بمزامنة كاملة تلقائية.
    """
    tenant_id = current_user.get("tenant_id")
    device_id = str(uuid.uuid4())
    new_device = {
        "id": device_id,
        "name": device.name,
        "ip_address": device.ip_address,
        "port": device.port,
        "branch_id": device.branch_id,
        "device_type": device.device_type,
        # 🔧 خيارات دعم عام لكل ZKTeco (اختياري)
        "communication_password": device.communication_password,
        "force_udp": device.force_udp,
        "timeout": device.timeout,
        "firmware_version": device.firmware_version,
        "model_name": device.model_name,
        "protocol": device.protocol,
        "tenant_id": tenant_id,
        "is_active": True,
        "last_sync": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "created_by": current_user.get("id"),
    }
    
    await db.biometric_devices.insert_one(new_device)
    if "_id" in new_device:
        del new_device["_id"]
    
    # 🔥 مزامنة تلقائية فورية: كل موظف نشط في نفس الفرع يُوضع في طابور push
    enqueued = 0
    try:
        employee_query = {"branch_id": device.branch_id, "is_active": True}
        if tenant_id:
            employee_query["tenant_id"] = tenant_id
        # جلب الموظفين الذين لديهم biometric_uid (رقم فريد للجهاز)
        async for emp in db.employees.find(employee_query, {"_id": 0, "id": 1, "biometric_uid": 1, "biometric_id": 1, "full_name": 1, "name": 1}):
            bio_uid = emp.get("biometric_uid") or emp.get("biometric_id")
            if not bio_uid:
                continue  # لا يمكن الـ push بدون biometric_uid
            job = {
                "id": str(uuid.uuid4()),
                "type": "zk-push-user",
                "params": {
                    **_device_conn_params(new_device),
                    "device_id": device_id,
                    "biometric_uid": str(bio_uid),
                    "biometric_id": str(bio_uid),  # alias
                    "uid": str(bio_uid),
                    "name": emp.get("full_name") or emp.get("name") or f"EMP-{bio_uid}",
                    "employee_id": emp.get("id"),
                },
                "status": "pending",
                "branch_id": device.branch_id,
                "tenant_id": tenant_id,
                "created_by": current_user.get("id"),
                "created_by_name": current_user.get("full_name") or current_user.get("username"),
                "created_at": datetime.now(timezone.utc).isoformat(),
                "auto_generated": True,
                "reason": "new_device_initial_sync",
                "result": None,
                "error": None,
            }
            await db.biometric_queue.insert_one(job)
            enqueued += 1
    except Exception as e:
        logger.warning(f"Auto-sync enqueue on device create failed: {e}")
    
    return {
        "message": f"تم إضافة الجهاز بنجاح. سيتم مزامنة {enqueued} موظف تلقائياً عبر الوكيل المحلي.",
        "device": new_device,
        "auto_sync_enqueued": enqueued,
    }


@router.post("/biometric/devices/{device_id}/push-all-users")
async def push_all_users_to_device(device_id: str, current_user: dict = Depends(get_current_user)):
    """إعادة مزامنة كاملة لجهاز بصمة موجود — يُنشئ جوبات push لكل الموظفين في فرع الجهاز.
    
    مفيد عند: (1) استبدال جهاز، (2) بعد فورمات، (3) إضافة موظفين قبل ربط الوكيل."""
    tenant_id = current_user.get("tenant_id")
    device = await db.biometric_devices.find_one({"id": device_id, "tenant_id": tenant_id}, {"_id": 0})
    if not device:
        raise HTTPException(status_code=404, detail="الجهاز غير موجود")
    
    enqueued = 0
    async for emp in db.employees.find(
        {"branch_id": device["branch_id"], "tenant_id": tenant_id, "is_active": True},
        {"_id": 0, "id": 1, "biometric_uid": 1, "biometric_id": 1, "full_name": 1, "name": 1}
    ):
        bio_uid = emp.get("biometric_uid") or emp.get("biometric_id")
        if not bio_uid:
            continue
        job = {
            "id": str(uuid.uuid4()),
            "type": "zk-push-user",
            "params": {
                **_device_conn_params(device),
                "device_id": device_id,
                "biometric_uid": str(bio_uid),
                "biometric_id": str(bio_uid),  # alias
                "uid": str(bio_uid),
                "name": emp.get("full_name") or emp.get("name") or f"EMP-{bio_uid}",
                "employee_id": emp.get("id"),
            },
            "status": "pending",
            "branch_id": device["branch_id"],
            "tenant_id": tenant_id,
            "created_by": current_user.get("id"),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "auto_generated": True,
            "reason": "manual_push_all",
            "result": None,
            "error": None,
        }
        await db.biometric_queue.insert_one(job)
        enqueued += 1
    
    return {"success": True, "enqueued": enqueued, "device_id": device_id}


@router.post("/biometric/branches/{branch_id}/sync-all-devices")
async def sync_all_devices_in_branch(branch_id: str, current_user: dict = Depends(get_current_user)):
    """مزامنة شاملة لكل أجهزة البصمة داخل فرع واحد دفعة واحدة.
    
    - يمرّ على كل الأجهزة النشطة داخل الفرع.
    - لكل جهاز، يُنشئ push-user job لكل موظف نشط ببصمة داخل نفس الفرع.
    - مثالي بعد استعادة/تحديث أو ربط أجهزة إضافية للفرع (يعمل حتى مع 100 جهاز).
    """
    if current_user.get("role") not in ["admin", "super_admin", "manager", "branch_manager"]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    tenant_id = get_user_tenant_id(current_user)
    devices_q = {"branch_id": branch_id, "is_active": True}
    if tenant_id:
        devices_q["tenant_id"] = tenant_id
    devices = await db.biometric_devices.find(devices_q, {"_id": 0}).to_list(500)
    
    emp_q = {"branch_id": branch_id, "is_active": True,
             "$or": [{"biometric_uid": {"$nin": [None, ""]}}, {"biometric_id": {"$nin": [None, ""]}}]}
    if tenant_id:
        emp_q["tenant_id"] = tenant_id
    employees = await db.employees.find(emp_q, {"_id": 0, "id": 1, "biometric_uid": 1, "biometric_id": 1, "full_name": 1, "name": 1}).to_list(2000)
    
    total_enqueued = 0
    now_iso = datetime.now(timezone.utc).isoformat()
    for dev in devices:
        for emp in employees:
            bio_uid = emp.get("biometric_uid") or emp.get("biometric_id")
            if not bio_uid:
                continue
            job = {
                "id": str(uuid.uuid4()),
                "type": "zk-push-user",
                "params": {
                    **_device_conn_params(dev),
                    "device_id": dev["id"],
                    "biometric_uid": str(bio_uid),
                    "biometric_id": str(bio_uid),
                    "uid": str(bio_uid),
                    "name": emp.get("full_name") or emp.get("name") or f"EMP-{bio_uid}",
                    "employee_id": emp.get("id"),
                },
                "status": "pending",
                "branch_id": branch_id,
                "tenant_id": tenant_id,
                "created_by": current_user.get("id"),
                "created_at": now_iso,
                "auto_generated": True,
                "reason": "branch_bulk_sync",
                "result": None,
                "error": None,
            }
            await db.biometric_queue.insert_one(job)
            total_enqueued += 1
    
    return {
        "success": True,
        "branch_id": branch_id,
        "devices_count": len(devices),
        "employees_count": len(employees),
        "total_enqueued": total_enqueued,
    }


@router.get("/biometric/queue/status")
async def biometric_queue_status(branch_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """إحصائيات طابور جوبات البصمة (per branch إن مُرِّر)."""
    tenant_id = get_user_tenant_id(current_user)
    base_q = {}
    if tenant_id:
        base_q["tenant_id"] = tenant_id
    if branch_id:
        base_q["branch_id"] = branch_id
    
    async def _count(status):
        q = dict(base_q)
        q["status"] = status
        return await db.biometric_queue.count_documents(q)
    
    return {
        "branch_id": branch_id,
        "pending": await _count("pending"),
        "processing": await _count("processing"),
        "completed": await _count("completed"),
        "failed": await _count("failed"),
    }


@router.get("/biometric/devices/{device_id}/users")
async def export_device_users(device_id: str, current_user: dict = Depends(get_current_user)):
    """تصدير قائمة الموظفين المخصّصين لجهاز — يفيد لتصدير/طباعة/تدقيق كل موظف مسجّل على جهاز البصمة."""
    tenant_id = get_user_tenant_id(current_user)
    device = await db.biometric_devices.find_one({"id": device_id, "tenant_id": tenant_id}, {"_id": 0})
    if not device:
        raise HTTPException(status_code=404, detail="الجهاز غير موجود")
    
    emp_q = {"branch_id": device["branch_id"], "is_active": True,
             "$or": [{"biometric_uid": {"$nin": [None, ""]}}, {"biometric_id": {"$nin": [None, ""]}}]}
    if tenant_id:
        emp_q["tenant_id"] = tenant_id
    employees = await db.employees.find(emp_q, {"_id": 0, "id": 1, "biometric_uid": 1, "biometric_id": 1, "full_name": 1, "name": 1, "position": 1}).to_list(5000)
    users = []
    for e in employees:
        bio_uid = e.get("biometric_uid") or e.get("biometric_id")
        users.append({
            "employee_id": e.get("id"),
            "biometric_uid": str(bio_uid) if bio_uid else "",
            "name": e.get("full_name") or e.get("name") or "",
            "position": e.get("position") or "",
        })
    return {"device_id": device_id, "device_name": device.get("name"), "branch_id": device["branch_id"], "users_count": len(users), "users": users}


@router.post("/biometric/devices/{device_id}/test")
async def test_biometric_connection(device_id: str, current_user: dict = Depends(get_current_user)):
    """اختبار الاتصال بالجهاز — يُنشئ جوب zk-probe-device يتم تنفيذه من الوكيل المحلي داخل شبكة الفرع.
    
    الأسباب:
    - أجهزة ZKTeco على شبكة LAN داخل الفرع، غير قابلة للوصول من السحاب.
    - الوكيل هو المكوّن الوحيد الذي يستطيع الوصول للـIP الداخلي.
    - يدعم كل موديلات ZKTeco (K/F/G/iFace/MB/SF/UA…) عبر تمرير device_type, force_udp, communication_password.
    
    الواجهة تستفسر جوب النتيجة عبر GET /api/biometric-queue/{job_id}.
    """
    tenant_id = current_user.get("tenant_id")
    device = await db.biometric_devices.find_one(
        {"id": device_id, "tenant_id": tenant_id}, {"_id": 0}
    )
    if not device:
        raise HTTPException(status_code=404, detail="الجهاز غير موجود")
    
    job_id = str(uuid.uuid4())
    job = {
        "id": job_id,
        "type": "zk-probe-device",
        "params": {
            **_device_conn_params(device),
            "device_id": device_id,
        },
        "status": "pending",
        "branch_id": device["branch_id"],
        "tenant_id": tenant_id,
        "created_by": current_user.get("id"),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "auto_generated": False,
        "reason": "manual_connection_test",
        "result": None,
        "error": None,
    }
    await db.biometric_queue.insert_one(job)
    return {
        "success": True,
        "job_id": job_id,
        "message": "تم إنشاء جوب اختبار الاتصال — سيلتقطه الوكيل المحلي خلال ثوان",
        "poll_url": f"/api/biometric-queue/{job_id}",
    }


@router.put("/biometric/devices/{device_id}")
async def update_biometric_device(device_id: str, update: BiometricDeviceUpdate, current_user: dict = Depends(get_current_user)):
    """تحديث إعدادات جهاز البصمة (IP/Port/Password/Protocol/Firmware/…) — يعمل مع جميع موديلات ZKTeco."""
    if current_user.get("role") not in ["admin", "super_admin", "manager", "branch_manager"]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    tenant_id = current_user.get("tenant_id")
    existing = await db.biometric_devices.find_one({"id": device_id, "tenant_id": tenant_id})
    if not existing:
        raise HTTPException(status_code=404, detail="الجهاز غير موجود")
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    if update_data:
        update_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.biometric_devices.update_one({"id": device_id}, {"$set": update_data})
    return await db.biometric_devices.find_one({"id": device_id}, {"_id": 0})


@router.delete("/biometric/devices/{device_id}")
async def delete_biometric_device(device_id: str, current_user: dict = Depends(get_current_user)):
    """حذف جهاز بصمة (soft-disable) — يوقف كل الجوبات المعلقة الخاصة به."""
    if current_user.get("role") not in ["admin", "super_admin"]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    tenant_id = current_user.get("tenant_id")
    r = await db.biometric_devices.delete_one({"id": device_id, "tenant_id": tenant_id})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="الجهاز غير موجود")
    # ألغِ الجوبات المعلقة لهذا الجهاز
    cancelled = await db.biometric_queue.update_many(
        {"params.device_id": device_id, "status": "pending"},
        {"$set": {"status": "failed", "error": "device_deleted", "completed_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"success": True, "message": "تم حذف الجهاز بنجاح", "device_id": device_id, "cancelled_jobs": cancelled.modified_count}


@router.get("/biometric/devices/models")
async def list_supported_zk_models(_current_user: dict = Depends(get_current_user)):
    """قائمة موديلات ZKTeco المدعومة (مرجع للفرونت)."""
    return {
        "protocols": [
            {"id": "zk-standard", "label": "ZK Standard TCP (K/F/G/iFace/MB)", "port": 4370},
            {"id": "zk-push", "label": "ZK Push (Cloud/PUSH SDK)", "port": 8081},
            {"id": "pull-sdk", "label": "Pull SDK (SF/UA/SFace)", "port": 4370},
        ],
        "device_types": [
            {"id": "fingerprint", "label": "بصمة إصبع"},
            {"id": "face", "label": "بصمة وجه"},
            {"id": "palm", "label": "بصمة راحة اليد"},
            {"id": "rfid", "label": "كارت RFID"},
            {"id": "hybrid", "label": "متعدد (وجه + بصمة + كارت)"},
        ],
        "supported_models": [
            "K14", "K20", "K30", "K40", "K50", "K60", "K70",
            "F18", "F19", "F22", "TX628", "MB160", "MB360", "MB460", "MB560",
            "iFace402", "iFace702", "iFace880", "iFace990",
            "G3", "G4", "G5", "SpeedFace-V5L", "ProFaceX",
            "SF100", "SF200", "SF300", "SF400",
            "UA200", "UA300", "UA860",
        ],
    }


@router.post("/biometric/devices/{device_id}/sync")
async def sync_biometric_attendance(device_id: str, current_user: dict = Depends(get_current_user)):
    """مزامنة سجلات الحضور من جهاز البصمة"""
    device = await db.biometric_devices.find_one({
        "id": device_id,
        "tenant_id": current_user.get("tenant_id")
    }, {"_id": 0})
    
    if not device:
        raise HTTPException(status_code=404, detail="الجهاز غير موجود")
    
    synced_records = []
    
    try:
        from zk import ZK
        zk = ZK(device["ip_address"], port=device["port"], timeout=10)
        conn = zk.connect()
        
        if conn:
            attendance = zk.get_attendance()
            
            for record in attendance:
                att_record = {
                    "id": str(uuid.uuid4()),
                    "device_id": device_id,
                    "employee_code": str(record.user_id),
                    "punch_time": record.timestamp.isoformat() if record.timestamp else None,
                    "punch_type": "in" if record.status == 0 else "out",
                    "verify_type": "fingerprint",
                    "tenant_id": current_user.get("tenant_id"),
                    "synced_at": datetime.now(timezone.utc).isoformat()
                }
                synced_records.append(att_record)
            
            zk.disconnect()
            
            # حفظ السجلات في قاعدة البيانات
            if synced_records:
                await db.biometric_attendance.insert_many(synced_records)
            
            # تحديث وقت آخر مزامنة
            await db.biometric_devices.update_one(
                {"id": device_id},
                {"$set": {"last_sync": datetime.now(timezone.utc).isoformat()}}
            )
    except ImportError:
        # وضع المحاكاة
        pass
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"فشل المزامنة: {str(e)}")
    
    return {
        "message": "تمت المزامنة بنجاح",
        "records_count": len(synced_records)
    }


class SyncFromAgentRequest(BaseModel):
    records: list = []


@router.post("/biometric/devices/{device_id}/sync-from-agent")
async def sync_from_agent(device_id: str, request: SyncFromAgentRequest, current_user: dict = Depends(get_current_user)):
    """استقبال سجلات الحضور من الوكيل المحلي وحفظها"""
    device = await db.biometric_devices.find_one({
        "id": device_id,
        "tenant_id": current_user.get("tenant_id")
    }, {"_id": 0})
    
    if not device:
        raise HTTPException(status_code=404, detail="الجهاز غير موجود")
    
    synced_records = []
    tenant_id = current_user.get("tenant_id")
    
    for record in request.records:
        uid = str(record.get("uid", ""))
        timestamp = record.get("timestamp", "")
        punch_type = record.get("punch_type", "in")
        
        if not uid or not timestamp:
            continue
        
        existing = await db.biometric_attendance.find_one({
            "device_id": device_id,
            "employee_code": uid,
            "punch_time": timestamp,
            "tenant_id": tenant_id
        })
        
        if existing:
            continue
        
        att_record = {
            "id": str(uuid.uuid4()),
            "device_id": device_id,
            "employee_code": uid,
            "punch_time": timestamp,
            "punch_type": punch_type,
            "verify_type": "fingerprint",
            "tenant_id": tenant_id,
            "synced_at": datetime.now(timezone.utc).isoformat()
        }
        synced_records.append(att_record)
    
    if synced_records:
        await db.biometric_attendance.insert_many(synced_records)
    
    await db.biometric_devices.update_one(
        {"id": device_id},
        {"$set": {"last_sync": datetime.now(timezone.utc).isoformat()}}
    )
    
    # معالجة تلقائية للحضور بعد المزامنة
    auto_result = {"processed": 0}
    try:
        auto_result = await _auto_process_attendance_internal(current_user)
    except Exception as e:
        logging.error(f"Auto-process after sync failed: {e}")
    
    return {
        "message": "تمت المزامنة بنجاح",
        "records_count": len(synced_records),
        "total_received": len(request.records),
        "duplicates_skipped": len(request.records) - len(synced_records),
        "auto_processed": auto_result.get("processed", 0)
    }

@router.post("/biometric/import-device-users")
async def import_device_users(request: Request, current_user: dict = Depends(get_current_user)):
    """استيراد مستخدمي جهاز البصمة كموظفين في النظام"""
    body = await request.json()
    users = body.get("users", [])
    device_id = body.get("device_id", "")
    
    if not users:
        raise HTTPException(status_code=400, detail="لا يوجد مستخدمين للاستيراد")
    
    tenant_id = get_user_tenant_id(current_user)
    imported = 0
    skipped = 0
    
    for user in users:
        uid_num = user.get("uid_num") or user.get("uid")
        name = user.get("name", "").strip()
        privilege = user.get("privilege", 0)
        
        if not uid_num:
            continue
        
        uid_str = str(uid_num)
        
        # تحقق إذا الموظف موجود بالفعل (بنفس biometric_uid)
        existing = await db.employees.find_one({
            "biometric_uid": uid_str,
            "tenant_id": tenant_id
        })
        
        if existing:
            # تحديث الاسم إذا فاضي
            if not existing.get("name") and name:
                await db.employees.update_one(
                    {"id": existing["id"]},
                    {"$set": {"name": name}}
                )
            skipped += 1
            continue
        
        # إنشاء موظف جديد
        emp_doc = {
            "id": str(uuid.uuid4()),
            "name": name or f"موظف {uid_str}",
            "phone": "",
            "position": "",
            "department": "",
            "salary": 0,
            "salary_type": "monthly",
            "work_hours_per_day": 8,
            "biometric_uid": uid_str,
            "biometric_device_id": device_id,
            "is_active": True,
            "shift_start": "09:00",
            "shift_end": "17:00",
            "work_days": [0, 1, 2, 3, 4, 5],
            "hire_date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            "tenant_id": tenant_id or "",
            "branch_id": current_user.get("branch_id") or "",
            "created_by": current_user.get("id"),
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.employees.insert_one(emp_doc)
        imported += 1
    
    return {
        "message": f"تم استيراد {imported} موظف ({skipped} موجود مسبقاً)",
        "imported": imported,
        "skipped": skipped,
        "total": len(users)
    }



@router.post("/attendance/auto-process")
async def auto_process_attendance(current_user: dict = Depends(get_current_user)):
    """
    معالجة تلقائية: تحويل سجلات البصمة الخام إلى حضور/انصراف + خصومات
    """
    return await _auto_process_attendance_internal(current_user)


@router.get("/biometric/auto-sync")
async def get_auto_sync_status(current_user: dict = Depends(get_current_user)):
    tenant_id = get_user_tenant_id(current_user)
    query = {}
    if tenant_id:
        query["restaurant_id"] = tenant_id
    setting = await db.biometric_auto_sync.find_one(query, {"_id": 0})
    if not setting:
        return {"enabled": False}
    return {"enabled": setting.get("enabled", False), "enabled_at": setting.get("enabled_at"), "enabled_by": setting.get("enabled_by_name", "")}

@router.post("/biometric/auto-sync")
async def toggle_auto_sync(body: dict = Body(...), current_user: dict = Depends(get_current_user)):
    tenant_id = get_user_tenant_id(current_user)
    enabled = body.get("enabled", False)
    query = {}
    if tenant_id:
        query["restaurant_id"] = tenant_id
    from datetime import datetime, timezone
    await db.biometric_auto_sync.update_one(
        query,
        {"$set": {
            "enabled": enabled,
            "enabled_by": current_user.get("id", ""),
            "enabled_by_name": current_user.get("name", current_user.get("full_name", "")),
            "enabled_at": datetime.now(timezone.utc).isoformat(),
            "restaurant_id": tenant_id
        }},
        upsert=True
    )
    return {"success": True, "enabled": enabled}


async def _auto_process_attendance_internal(current_user: dict):
    """
    دالة داخلية للمعالجة التلقائية - تستدعى من auto-process و sync-from-agent
    """
    tenant_id = get_user_tenant_id(current_user)
    
    # 1. جلب جميع الموظفين النشطين مع أرقام البصمة
    emp_query = {"is_active": True, "biometric_uid": {"$ne": None, "$exists": True}}
    if tenant_id:
        emp_query["tenant_id"] = tenant_id
    employees = await db.employees.find(emp_query, {"_id": 0}).to_list(500)
    
    if not employees:
        return {"message": "لا يوجد موظفين مسجلين بالبصمة", "processed": 0}
    
    # خريطة biometric_uid → employee
    uid_to_emp = {}
    for emp in employees:
        uid_to_emp[str(emp.get("biometric_uid", ""))] = emp
    
    # 2. جلب سجلات البصمة غير المعالجة
    bio_query = {"processed": {"$ne": True}}
    if tenant_id:
        bio_query["tenant_id"] = tenant_id
    raw_records = await db.biometric_attendance.find(bio_query, {"_id": 0}).to_list(10000)
    
    if not raw_records:
        return {"message": "لا توجد سجلات جديدة للمعالجة", "processed": 0}
    
    # 3. تجميع السجلات حسب (employee_code, date)
    from collections import defaultdict
    daily_punches = defaultdict(list)

    def _to_min_helper(hhmm: str) -> int:
        try:
            h, m = hhmm.split(":")
            return int(h) * 60 + int(m)
        except Exception:
            return -1

    for rec in raw_records:
        uid = str(rec.get("employee_code", ""))
        if uid not in uid_to_emp:
            continue
        emp_for_punch = uid_to_emp[uid]
        # استخراج التاريخ والوقت
        ts = rec.get("punch_time", "")
        if "T" in ts:
            date_part = ts.split("T")[0]
            time_part = ts.split("T")[1][:5]  # HH:MM
        else:
            continue

        # احتفظ بالتاريخ التقويمي الحقيقي للبصمة لترتيب زمني صحيح لاحقاً
        orig_date = date_part

        # === دعم الشفت الليلي ===
        # لو shift_end < shift_start (مثل 22:00 → 06:00)، البصمات بعد منتصف الليل
        # وقبل (shift_end + ساعتين سماحية) تُنسب لـ business_date = اليوم السابق
        shift_start = emp_for_punch.get("shift_start")
        shift_end = emp_for_punch.get("shift_end")
        if shift_start and shift_end:
            try:
                ss_min = _to_min_helper(shift_start)
                se_min = _to_min_helper(shift_end)
                tp_min = _to_min_helper(time_part)
                if 0 <= ss_min and 0 <= se_min and 0 <= tp_min and se_min < ss_min:
                    # شفت ليلي: نحسب نطاق الانصراف الموسّع (شامل ساعتين سماحية)
                    if tp_min <= se_min + 120:
                        # البصمة بعد منتصف الليل ضمن نطاق الشفت الليلي → اليوم السابق
                        d = datetime.strptime(date_part, "%Y-%m-%d")
                        date_part = (d - timedelta(days=1)).strftime("%Y-%m-%d")
            except Exception:
                pass

        # نخزّن (التاريخ التقويمي الحقيقي، HH:MM) — مفتاح التجميع هو business_date
        daily_punches[(uid, date_part)].append((orig_date, time_part))

    # === فصل الشفتات + ترتيب زمني صحيح (Shift Separation) ===
    # نحوّل كل مجموعة إلى قائمة HH:MM مرتّبة زمنياً (بالاعتماد على التاريخ التقويمي
    # الحقيقي لكل بصمة، لا الترتيب النصي — هذا يصلح ترتيب الشفت الليلي 22:00→00:09).
    # ثم لو امتدّت بصمات يوم العمل أكثر من حدّ شفت واحد (16 ساعة) فهذا يعني شفتين
    # مدموجين (مثل انصراف 00:09 + حضور 23:57): نفصل عند أكبر فجوة ونُرحّل المجموعة
    # المبكرة (انصراف الليلة السابقة) إلى يوم العمل السابق.
    MAX_SHIFT_MINUTES = 16 * 60       # 16 ساعة كحد أقصى لشفت واحد
    SHIFT_GAP_MINUTES = 6 * 60        # فجوة ≥ 6 ساعات بين بصمتين = شفت منفصل

    def _entries_to_sorted_dts(entries):
        """يحوّل [(orig_date, HH:MM)] إلى datetimes حقيقية مرتّبة زمنياً."""
        dts = []
        for od, tp in entries:
            try:
                dts.append(datetime.strptime(f"{od} {tp}", "%Y-%m-%d %H:%M"))
            except Exception:
                continue
        dts.sort()
        return dts

    # المرور الأول: الفصل/الترحيل للمجموعات الممتدة أكثر من شفت
    for _key in list(daily_punches.keys()):
        _uid_k, _date_k = _key
        _dts = _entries_to_sorted_dts(daily_punches[_key])
        if not _dts:
            daily_punches[_key] = []
            continue
        if len(_dts) >= 2:
            _span_min = (_dts[-1] - _dts[0]).total_seconds() / 60.0
            if _span_min > MAX_SHIFT_MINUTES:
                # ابحث عن أكبر فجوة (نقطة الفصل بين الشفتين)
                _gap_idx, _gap_val = -1, -1.0
                for _i in range(1, len(_dts)):
                    _g = (_dts[_i] - _dts[_i - 1]).total_seconds() / 60.0
                    if _g > _gap_val:
                        _gap_val, _gap_idx = _g, _i
                if _gap_val >= SHIFT_GAP_MINUTES:
                    _early = _dts[:_gap_idx]   # انصراف الليلة السابقة
                    _late = _dts[_gap_idx:]    # شفت اليوم
                    try:
                        _prev_d = (datetime.strptime(_date_k, "%Y-%m-%d") - timedelta(days=1)).strftime("%Y-%m-%d")
                        daily_punches[(_uid_k, _prev_d)].extend(
                            [(dt.strftime("%Y-%m-%d"), dt.strftime("%H:%M")) for dt in _early]
                        )
                        daily_punches[_key] = [(dt.strftime("%Y-%m-%d"), dt.strftime("%H:%M")) for dt in _late]
                        continue
                    except Exception:
                        pass
        # خلاف ذلك: أعد التخزين كتواريخ/أوقات (سيُرتّب زمنياً في المرور الثاني)
        daily_punches[_key] = [(dt.strftime("%Y-%m-%d"), dt.strftime("%H:%M")) for dt in _dts]

    # المرور الثاني: تطبيع كل المجموعات إلى قوائم HH:MM مرتّبة زمنياً
    for _key in list(daily_punches.keys()):
        _dts = _entries_to_sorted_dts(daily_punches[_key])
        daily_punches[_key] = [dt.strftime("%H:%M") for dt in _dts]

    # 4. تحويل لسجلات حضور
    created_attendance = 0
    created_deductions = 0
    
    for (uid, date_str), times in daily_punches.items():
        emp = uid_to_emp.get(uid)
        if not emp:
            continue
        
        # === منطق توزيع البصمات الذكي (Feb 2026) ===
        # القواعد المعتمدة:
        #   - دمج البصمات المتقاربة (< 5 دقائق) — Double-tap على الجهاز
        #   - 1 بصمة = حضور فقط (لم يبصم انصراف)
        #   - 2 بصمات بفرق < 1 ساعة = دمج (خطأ تسجيل) → حضور فقط
        #   - 2 بصمات بفرق ≥ 1 ساعة = حضور + انصراف (شفت كامل بدون استراحة)
        #   - 3 بصمات = حضور + ذهاب استراحة + انصراف
        #   - 4+ بصمات = حضور + ذهاب استراحة + عودة + انصراف (الأولى/الثانية/قبل الأخيرة/الأخيرة)
        times.sort()

        def _to_min(hhmm: str) -> int:
            try:
                h, m = hhmm.split(":")
                return int(h) * 60 + int(m)
            except Exception:
                return -1

        def _order_shift_times(tlist):
            """ترتيب بصمات شفت واحد زمنياً مع دعم عبور منتصف الليل (الدوران عند أكبر فجوة)."""
            ts = sorted(set(tlist))
            if len(ts) < 2:
                return ts
            mins = [_to_min(t) for t in ts]
            best_i, best_gap = len(ts) - 1, -1
            for i in range(len(ts)):
                nxt = mins[(i + 1) % len(ts)] + (1440 if i + 1 == len(ts) else 0)
                gap = nxt - mins[i]
                if gap > best_gap:
                    best_gap, best_i = gap, i
            start = (best_i + 1) % len(ts)
            return ts[start:] + ts[:start]

        def _gap_after(prev_t, t):
            """فرق الدقائق من prev_t إلى t مع دوران منتصف الليل (دائماً 0..1439)."""
            return (_to_min(t) - _to_min(prev_t)) % 1440

        # 1) ترتيب زمني صحيح (يدعم الشفت الليلي) + دمج البصمات المتقاربة (≤ 5 دقائق)
        ordered = _order_shift_times(times)
        deduped = []
        for t in ordered:
            if not deduped:
                deduped.append(t)
                continue
            if _gap_after(deduped[-1], t) <= 5:
                continue  # تجاهل التكرار القريب
            deduped.append(t)
        times = deduped

        check_in = times[0] if times else None
        check_out = None
        break_out = None  # ذهاب للاستراحة
        break_in = None   # عودة من الاستراحة
        n = len(times)

        if n == 2:
            # تحقق من فرق الزمن — لو < 60 دقيقة نعتبرها بصمة دخول مكررة فقط
            diff = _gap_after(times[0], times[1])
            if diff >= 60:
                check_out = times[1]
            # وإلا: check_out يبقى None (الموظف بصم مرتين متتاليتين بالخطأ)
        elif n == 3:
            break_out = times[1]
            check_out = times[2]
        elif n >= 4:
            break_out = times[1]
            break_in = times[-2]
            check_out = times[-1]
        
        # التحقق من وجود سجل مسبق لنفس اليوم - إذا وُجد، ندمج البصمات الجديدة مع القديمة
        existing = await db.attendance.find_one({
            "employee_id": emp["id"],
            "date": date_str,
            "source": "fingerprint"
        })
        if existing:
            # دمج الأوقات المحفوظة سابقاً مع البصمات الجديدة
            existing_times = set()
            for fld in ("check_in", "break_out", "break_in", "check_out"):
                v = existing.get(fld)
                if v:
                    existing_times.add(v)
            # دمج مع times الجديدة وإعادة التوزيع (ترتيب زمني يدعم الشفت الليلي)
            all_times = _order_shift_times(set(times) | existing_times)

            # دمج البصمات المتقاربة (≤ 5 دقائق) بعد الدمج
            merged = []
            for tt in all_times:
                if not merged:
                    merged.append(tt)
                    continue
                if _gap_after(merged[-1], tt) <= 5:
                    continue
                merged.append(tt)
            times = merged

            # إعادة توزيع البصمات المدمجة
            check_in = times[0] if times else None
            check_out = None
            break_out = None
            break_in = None
            n = len(times)
            if n == 2:
                diff = _gap_after(times[0], times[1])
                if diff >= 60:
                    check_out = times[1]
            elif n == 3:
                break_out = times[1]
                check_out = times[2]
            elif n >= 4:
                break_out = times[1]
                break_in = times[-2]
                check_out = times[-1]
        
        # حساب ساعات العمل (يدعم الورديات الليلية + خصم الاستراحة)
        worked_hours = 0
        if check_in and check_out and check_in != check_out:
            # خصم استراحة فعلية من البصمات إن وُجدت، وإلا الاستراحة المجدولة للموظف
            b_out = break_out if (break_out and break_in) else emp.get("break_start")
            b_in = break_in if (break_out and break_in) else emp.get("break_end")
            calc = _calc_worked_hours_hhmm(check_in, check_out, b_out, b_in)
            worked_hours = calc if calc is not None else 0
        
        # حساب التأخير
        late_minutes = 0
        shift_start = emp.get("shift_start")
        shift_end = emp.get("shift_end")
        required_hours = emp.get("work_hours_per_day", 8)
        
        if shift_start and check_in:
            try:
                scheduled = datetime.strptime(shift_start, "%H:%M")
                actual = datetime.strptime(check_in, "%H:%M")
                if actual > scheduled:
                    late_minutes = (actual - scheduled).seconds // 60
            except:
                pass
        
        # حساب الخروج المبكر
        early_leave_minutes = 0
        if shift_end and check_out:
            try:
                scheduled_end = datetime.strptime(shift_end, "%H:%M")
                actual_end = datetime.strptime(check_out, "%H:%M")
                if actual_end < scheduled_end:
                    early_leave_minutes = (scheduled_end - actual_end).seconds // 60
            except:
                pass
        
        # تحديد الحالة
        status = "present"
        if late_minutes > 0:
            status = "late"
        
        # حساب الوقت الإضافي - يسجل كطلب بانتظار موافقة المدير
        overtime_hours = 0
        if worked_hours > required_hours:
            overtime_hours = round(worked_hours - required_hours, 2)
        
        # إنشاء أو تحديث سجل الحضور
        att_doc = {
            "employee_id": emp["id"],
            "employee_name": emp.get("name"),
            "date": date_str,
            "check_in": check_in,
            "check_out": check_out,
            "break_out": break_out,
            "break_in": break_in,
            "worked_hours": worked_hours,
            "late_minutes": late_minutes,
            "early_leave_minutes": early_leave_minutes,
            "overtime_hours": overtime_hours,
            "status": status,
            "source": "fingerprint",
            "tenant_id": tenant_id,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        if existing:
            # تحديث السجل الموجود
            await db.attendance.update_one(
                {"id": existing["id"]},
                {"$set": att_doc}
            )
        else:
            # إنشاء سجل جديد
            att_doc["id"] = str(uuid.uuid4())
            att_doc["notes"] = None
            att_doc["created_by"] = current_user["id"]
            att_doc["created_at"] = datetime.now(timezone.utc).isoformat()
            await db.attendance.insert_one(att_doc)
        created_attendance += 1
        
        # إنشاء طلب وقت إضافي بانتظار موافقة المدير (لا يُضاف للراتب تلقائياً)
        if overtime_hours > 0:
            existing_ot = await db.overtime_requests.find_one({
                "employee_id": emp["id"],
                "date": date_str
            })
            if not existing_ot:
                ot_doc = {
                    "id": str(uuid.uuid4()),
                    "employee_id": emp["id"],
                    "employee_name": emp.get("name"),
                    "date": date_str,
                    "business_date": date_str,
                    "hours": overtime_hours,
                    "status": "pending",
                    "approved_by": None,
                    "approved_at": None,
                    "notes": f"وقت إضافي {overtime_hours} ساعة - تلقائي من البصمة",
                    "tenant_id": tenant_id,
                    "created_at": datetime.now(timezone.utc).isoformat()
                }
                await db.overtime_requests.insert_one(ot_doc)
        
        # إنشاء خصم تلقائي للتأخير (أكثر من 15 دقيقة)
        if late_minutes > 15 and not emp.get("is_general_manager"):
            late_hours = round(late_minutes / 60, 2)
            hourly_rate = emp.get("salary", 0) / 30 / required_hours if required_hours > 0 else 0
            deduction_amount = round(hourly_rate * late_hours)
            
            if deduction_amount > 0:
                # 🟢 منع التكرار: حدّث الخصم التلقائي الموجود لنفس (موظف+يوم+نوع) بدل إدراج نسخة جديدة
                existing_ded = await db.deductions.find_one({
                    "employee_id": emp["id"],
                    "date": date_str,
                    "deduction_type": "late",
                    "created_by": "system",
                    "tenant_id": tenant_id
                })
                if existing_ded:
                    await db.deductions.update_one(
                        {"id": existing_ded["id"]},
                        {"$set": {
                            "amount": deduction_amount,
                            "hours": late_hours,
                            "reason": f"تأخير {late_minutes} دقيقة - تلقائي من البصمة",
                            "updated_at": datetime.now(timezone.utc).isoformat()
                        }}
                    )
                else:
                    ded_doc = {
                        "id": str(uuid.uuid4()),
                        "employee_id": emp["id"],
                        "employee_name": emp.get("name"),
                        "deduction_type": "late",
                        "amount": deduction_amount,
                        "hours": late_hours,
                        "days": None,
                        "reason": f"تأخير {late_minutes} دقيقة - تلقائي من البصمة",
                        "date": date_str,
                        "business_date": date_str,
                        "tenant_id": tenant_id,
                        "created_by": "system",
                        "created_at": datetime.now(timezone.utc).isoformat()
                    }
                    await db.deductions.insert_one(ded_doc)
                    created_deductions += 1
        
        # إنشاء خصم للخروج المبكر (أكثر من 15 دقيقة)
        if early_leave_minutes > 15 and not emp.get("is_general_manager"):
            el_hours = round(early_leave_minutes / 60, 2)
            hourly_rate = emp.get("salary", 0) / 30 / required_hours if required_hours > 0 else 0
            el_amount = round(hourly_rate * el_hours)
            
            if el_amount > 0:
                # 🟢 منع التكرار: حدّث خصم الخروج المبكر الموجود لنفس (موظف+يوم) بدل إدراج نسخة جديدة
                existing_el = await db.deductions.find_one({
                    "employee_id": emp["id"],
                    "date": date_str,
                    "deduction_type": "early_leave",
                    "created_by": "system",
                    "tenant_id": tenant_id
                })
                if existing_el:
                    await db.deductions.update_one(
                        {"id": existing_el["id"]},
                        {"$set": {
                            "amount": el_amount,
                            "hours": el_hours,
                            "reason": f"خروج مبكر {early_leave_minutes} دقيقة - تلقائي من البصمة",
                            "updated_at": datetime.now(timezone.utc).isoformat()
                        }}
                    )
                else:
                    ded_doc = {
                        "id": str(uuid.uuid4()),
                        "employee_id": emp["id"],
                        "employee_name": emp.get("name"),
                        "deduction_type": "early_leave",
                        "amount": el_amount,
                        "hours": el_hours,
                        "days": None,
                        "reason": f"خروج مبكر {early_leave_minutes} دقيقة - تلقائي من البصمة",
                        "date": date_str,
                        "business_date": date_str,
                        "tenant_id": tenant_id,
                        "created_by": "system",
                        "created_at": datetime.now(timezone.utc).isoformat()
                    }
                    await db.deductions.insert_one(ded_doc)
                    created_deductions += 1
    
    # 5. معالجة الغياب: فحص أيام العمل بدون بصمة
    today = datetime.now(timezone.utc)
    yesterday = (today - __import__('datetime').timedelta(days=1)).strftime("%Y-%m-%d")
    
    for emp in employees:
        # 👑 المدير العام/الأونر: لا يُسجَّل له غياب تلقائي
        if emp.get("is_general_manager"):
            continue
        work_days = emp.get("work_days")
        if not work_days:
            continue
        
        # فحص يوم أمس
        yesterday_dt = today - timedelta(days=1)
        day_of_week = yesterday_dt.weekday()  # 0=Monday
        # تحويل لصيغة 0=Sunday
        day_of_week_sun = (day_of_week + 1) % 7
        
        if day_of_week_sun not in work_days:
            continue  # يوم عطلة
        
        # هل يوجد حضور ليوم أمس؟
        existing = await db.attendance.find_one({
            "employee_id": emp["id"],
            "date": yesterday
        })
        if existing:
            continue
        
        # تسجيل غياب
        required_hours = emp.get("work_hours_per_day", 8)
        daily_rate = emp.get("salary", 0) / 30
        
        att_doc = {
            "id": str(uuid.uuid4()),
            "employee_id": emp["id"],
            "employee_name": emp.get("name"),
            "date": yesterday,
            "check_in": None,
            "check_out": None,
            "worked_hours": 0,
            "late_minutes": 0,
            "early_leave_minutes": 0,
            "overtime_hours": 0,
            "status": "absent",
            "source": "system",
            "notes": "غياب تلقائي - لم يتم تسجيل بصمة",
            "tenant_id": tenant_id,
            "created_by": "system",
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.attendance.insert_one(att_doc)
        created_attendance += 1
        
        # ملاحظة: لم نعد ننشئ خصم غياب تلقائي
        # لأن النظام الآن يستخدم pro-rata لحساب الراتب (earned_salary = daily_rate × worked_days)
        # وبالتالي أيام الغياب مخصومة تلقائياً من الراتب المستحق
        # إنشاء خصم غياب هنا يسبب خصماً مزدوجاً
        # (الخصومات المنشأة يدوياً من قبل المدير مثل التأخير/المخالفات لا تزال تُطبَّق)
    
    # 6. تحديث السجلات كمعالجة
    record_ids = [r.get("id") for r in raw_records if r.get("id")]
    if record_ids:
        await db.biometric_attendance.update_many(
            {"id": {"$in": record_ids}},
            {"$set": {"processed": True}}
        )
    
    return {
        "message": "تمت المعالجة التلقائية",
        "attendance_created": created_attendance,
        "deductions_created": created_deductions,
        "raw_records_processed": len(raw_records)
    }



