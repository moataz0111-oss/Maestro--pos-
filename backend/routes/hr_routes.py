"""HR Routes (extracted from server.py)"""
from fastapi import APIRouter
from server import *  # noqa: F401,F403
from server import (_resolve_business_date)

router = APIRouter()

# ==================== HR ROUTES - إدارة الموارد البشرية ====================

# --- الموظفين ---

@router.post("/employees", response_model=EmployeeResponse)
async def create_employee(employee: EmployeeCreate, current_user: dict = Depends(get_current_user)):
    """إنشاء موظف جديد + مزامنة تلقائية لكل أجهزة البصمة في فرعه.
    
    🔥 عند إنشاء موظف جديد بـ biometric_uid، تُنشأ جوبات push تلقائياً لكل أجهزة
    البصمة النشطة في فرعه (حتى لو كان هناك 100 جهاز — كلها تستلم الموظف الجديد)."""
    if current_user["role"] not in [UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    tenant_id = get_user_tenant_id(current_user)
    # قبول biometric_id كـ alias لـ biometric_uid (backwards compat)
    payload_dict = employee.model_dump()
    extra_bio = getattr(employee, 'biometric_id', None) if hasattr(employee, 'biometric_id') else None
    employee_doc = {
        "id": str(uuid.uuid4()),
        **payload_dict,
        "tenant_id": tenant_id,
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    if extra_bio and not employee_doc.get("biometric_uid"):
        employee_doc["biometric_uid"] = str(extra_bio)
    await db.employees.insert_one(employee_doc)
    del employee_doc["_id"]
    
    # 🔥 مزامنة تلقائية: كل جهاز نشط في فرع الموظف يحصل على جوب push
    try:
        bio_uid = employee_doc.get("biometric_uid") or employee_doc.get("biometric_id")
        branch_id = employee_doc.get("branch_id")
        if bio_uid and branch_id:
            devices_q = {"branch_id": branch_id, "is_active": True}
            if tenant_id:
                devices_q["tenant_id"] = tenant_id
            enqueued = 0
            async for dev in db.biometric_devices.find(devices_q, {"_id": 0}):
                _ip = dev.get("ip_address")
                _port = dev.get("port", 4370)
                _tmo = int(dev.get("timeout") or 10)
                _pw = dev.get("communication_password")
                job = {
                    "id": str(uuid.uuid4()),
                    "type": "zk-push-user",
                    "params": {
                        "device_id": dev["id"],
                        "device_ip": _ip, "ip": _ip,
                        "device_port": _port, "port": _port,
                        "device_type": dev.get("device_type") or "fingerprint",
                        "communication_password": _pw, "password": _pw,
                        "force_udp": bool(dev.get("force_udp") or False),
                        "timeout": _tmo, "timeout_ms": _tmo * 1000,
                        "firmware_version": dev.get("firmware_version"),
                        "model_name": dev.get("model_name"),
                        "protocol": dev.get("protocol") or "zk-standard",
                        "biometric_uid": str(bio_uid),
                        "biometric_id": str(bio_uid),
                        "uid": str(bio_uid),
                        "name": employee_doc.get("full_name") or employee_doc.get("name") or f"EMP-{bio_uid}",
                        "employee_id": employee_doc["id"],
                    },
                    "status": "pending",
                    "branch_id": branch_id,
                    "tenant_id": tenant_id,
                    "created_by": current_user.get("id"),
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "auto_generated": True,
                    "reason": "new_employee_auto_push",
                    "result": None,
                    "error": None,
                }
                await db.biometric_queue.insert_one(job)
                enqueued += 1
            if enqueued:
                logger.info(f"🔒 موظف جديد ({employee_doc.get('full_name') or employee_doc.get('name')}) — تم إنشاء {enqueued} جوب push لأجهزة البصمة")
    except Exception as _e:
        logger.warning(f"auto biometric push on employee create failed: {_e}")
    
    return employee_doc

@router.get("/employees", response_model=List[EmployeeResponse])
async def get_employees(
    branch_id: Optional[str] = None,
    department: Optional[str] = None,
    is_active: Optional[bool] = None,
    status: Optional[str] = None,  # "active" (افتراضي: نشط+منتهٍ مؤقت) | "archived" (المنتهية خدماتهم)
    current_user: dict = Depends(get_current_user)
):
    """جلب قائمة الموظفين"""
    # معالجة الإنهاء التلقائي (بعد 24س) والحذف من الأرشيف (بعد نهاية الشهر التالي)
    try:
        from routes.payroll_routes import process_terminations
        await process_terminations(db, get_user_tenant_id(current_user))
    except Exception as _e:
        logger.warning(f"process_terminations failed: {_e}")

    query = build_tenant_query(current_user)
    if branch_id:
        query["branch_id"] = branch_id
    if department:
        query["department"] = department
    if is_active is not None:
        query["is_active"] = is_active

    if status == "archived":
        query["employment_status"] = "terminated"
    else:
        # القائمة الافتراضية: تستثني المنتهية خدماتهم نهائياً (تبقى المنتهية مؤقتاً بخط أحمر)
        query["employment_status"] = {"$ne": "terminated"}

    employees = await db.employees.find(query, {"_id": 0}).to_list(1000)
    return employees

@router.get("/employees/{employee_id}", response_model=EmployeeResponse)
async def get_employee(employee_id: str, current_user: dict = Depends(get_current_user)):
    """جلب موظف محدد"""
    query = build_tenant_query(current_user, {"id": employee_id})
    employee = await db.employees.find_one(query, {"_id": 0})
    if not employee:
        raise HTTPException(status_code=404, detail="الموظف غير موجود")
    return employee

@router.put("/employees/{employee_id}")
async def update_employee(employee_id: str, update: EmployeeUpdate, current_user: dict = Depends(get_current_user)):
    """تحديث بيانات موظف — عند تغيير biometric_uid يُنشأ push لكل أجهزة الفرع تلقائياً."""
    if current_user["role"] not in [UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    query = build_tenant_query(current_user, {"id": employee_id})
    employee = await db.employees.find_one(query)
    if not employee:
        raise HTTPException(status_code=404, detail="الموظف غير موجود")
    
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    if update_data:
        await db.employees.update_one({"id": employee_id}, {"$set": update_data})
    
    updated = await db.employees.find_one({"id": employee_id}, {"_id": 0})
    
    # 🔥 auto-push عند تغيير biometric_uid أو تفعيل الموظف
    try:
        new_bio = (update_data.get("biometric_uid") or "").strip() if update_data.get("biometric_uid") else None
        old_bio = (employee.get("biometric_uid") or employee.get("biometric_id") or "").strip() or None
        bio_changed = new_bio and new_bio != old_bio
        if bio_changed:
            branch_id = updated.get("branch_id")
            tenant_id = get_user_tenant_id(current_user)
            if branch_id:
                devices_q = {"branch_id": branch_id, "is_active": True}
                if tenant_id:
                    devices_q["tenant_id"] = tenant_id
                enqueued = 0
                async for dev in db.biometric_devices.find(devices_q, {"_id": 0}):
                    _ip = dev.get("ip_address")
                    _port = dev.get("port", 4370)
                    _tmo = int(dev.get("timeout") or 10)
                    _pw = dev.get("communication_password")
                    job = {
                        "id": str(uuid.uuid4()),
                        "type": "zk-push-user",
                        "params": {
                            "device_id": dev["id"],
                            "device_ip": _ip, "ip": _ip,
                            "device_port": _port, "port": _port,
                            "device_type": dev.get("device_type") or "fingerprint",
                            "communication_password": _pw, "password": _pw,
                            "force_udp": bool(dev.get("force_udp") or False),
                            "timeout": _tmo, "timeout_ms": _tmo * 1000,
                            "firmware_version": dev.get("firmware_version"),
                            "model_name": dev.get("model_name"),
                            "protocol": dev.get("protocol") or "zk-standard",
                            "biometric_uid": str(new_bio),
                            "biometric_id": str(new_bio),
                            "uid": str(new_bio),
                            "name": updated.get("full_name") or updated.get("name") or f"EMP-{new_bio}",
                            "employee_id": employee_id,
                        },
                        "status": "pending",
                        "branch_id": branch_id,
                        "tenant_id": tenant_id,
                        "created_by": current_user.get("id"),
                        "created_at": datetime.now(timezone.utc).isoformat(),
                        "auto_generated": True,
                        "reason": "employee_update_push",
                        "result": None,
                        "error": None,
                    }
                    await db.biometric_queue.insert_one(job)
                    enqueued += 1
                if enqueued:
                    logger.info(f"🔄 موظف محدَّث ({updated.get('name')}) — تم إنشاء {enqueued} جوب push")
    except Exception as _e:
        logger.warning(f"auto biometric push on employee update failed: {_e}")
    
    return updated

@router.delete("/employees/{employee_id}")
async def delete_employee(employee_id: str, current_user: dict = Depends(get_current_user)):
    """حذف موظف نهائياً — يُنشئ delete-user job لكل أجهزة البصمة في فرعه إن كان لديه biometric_uid."""
    if current_user["role"] not in [UserRole.ADMIN, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    query = build_tenant_query(current_user, {"id": employee_id})
    employee = await db.employees.find_one(query)
    if not employee:
        raise HTTPException(status_code=404, detail="الموظف غير موجود")
    
    biometric_uid = employee.get("biometric_uid") or employee.get("biometric_id")
    branch_id = employee.get("branch_id")
    tenant_id = get_user_tenant_id(current_user)
    
    # حذف نهائي
    await db.employees.delete_one({"id": employee_id})
    
    # 🔥 delete-user jobs لكل أجهزة الفرع
    enqueued = 0
    try:
        if biometric_uid and branch_id:
            devices_q = {"branch_id": branch_id, "is_active": True}
            if tenant_id:
                devices_q["tenant_id"] = tenant_id
            async for dev in db.biometric_devices.find(devices_q, {"_id": 0}):
                _ip = dev.get("ip_address")
                _port = dev.get("port", 4370)
                _tmo = int(dev.get("timeout") or 10)
                _pw = dev.get("communication_password")
                job = {
                    "id": str(uuid.uuid4()),
                    "type": "zk-delete-user",
                    "params": {
                        "device_id": dev["id"],
                        "device_ip": _ip, "ip": _ip,
                        "device_port": _port, "port": _port,
                        "device_type": dev.get("device_type") or "fingerprint",
                        "communication_password": _pw, "password": _pw,
                        "force_udp": bool(dev.get("force_udp") or False),
                        "timeout": _tmo, "timeout_ms": _tmo * 1000,
                        "firmware_version": dev.get("firmware_version"),
                        "model_name": dev.get("model_name"),
                        "protocol": dev.get("protocol") or "zk-standard",
                        "biometric_uid": str(biometric_uid),
                        "biometric_id": str(biometric_uid),
                        "uid": str(biometric_uid),
                        "employee_id": employee_id,
                    },
                    "status": "pending",
                    "branch_id": branch_id,
                    "tenant_id": tenant_id,
                    "created_by": current_user.get("id"),
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "auto_generated": True,
                    "reason": "employee_delete_push",
                    "result": None,
                    "error": None,
                }
                await db.biometric_queue.insert_one(job)
                enqueued += 1
    except Exception as _e:
        logger.warning(f"auto biometric delete-user push failed: {_e}")
    
    return {"message": "تم حذف الموظف نهائياً", "biometric_uid": biometric_uid, "delete_jobs_enqueued": enqueued}

@router.post("/employees/{employee_id}/face-photo")
async def save_employee_face_photo(employee_id: str, request: Request, current_user: dict = Depends(get_current_user)):
    """حفظ صورة الوجه للموظف من جهاز البصمة"""
    if current_user["role"] not in [UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    query = build_tenant_query(current_user, {"id": employee_id})
    employee = await db.employees.find_one(query)
    if not employee:
        raise HTTPException(status_code=404, detail="الموظف غير موجود")
    
    body = await request.json()
    face_photo = body.get("face_photo", "")
    
    if not face_photo:
        raise HTTPException(status_code=400, detail="لا توجد صورة")
    
    await db.employees.update_one(
        {"id": employee_id},
        {"$set": {"face_photo": face_photo, "face_photo_updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    return {"message": "تم حفظ صورة الوجه", "success": True}


# --- الحضور والانصراف ---
# --- الحضور والانصراف ---

def _calc_worked_hours_hhmm(check_in, check_out, break_out=None, break_in=None):
    """حساب ساعات العمل من توقيتات HH:MM مع دعم الورديات الليلية وخصم الاستراحة."""
    try:
        def to_min(s):
            h, m = str(s).split(":")[:2]
            return int(h) * 60 + int(m)
        mins = to_min(check_out) - to_min(check_in)
        if mins < 0:
            mins += 24 * 60  # وردية ليلية (انصراف بعد منتصف الليل)
        if break_out and break_in:
            bmins = to_min(break_in) - to_min(break_out)
            if bmins < 0:
                bmins += 24 * 60
            if 0 < bmins < mins:
                mins -= bmins
        return round(mins / 60, 2)
    except Exception:
        return None



@router.post("/attendance", response_model=AttendanceResponse)
async def create_attendance(attendance: AttendanceCreate, current_user: dict = Depends(get_current_user)):
    """تسجيل حضور/انصراف"""
    if current_user["role"] not in [UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPERVISOR, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    # التحقق من وجود الموظف
    employee = await db.employees.find_one({"id": attendance.employee_id}, {"_id": 0})
    if not employee:
        raise HTTPException(status_code=404, detail="الموظف غير موجود")
    
    # حساب ساعات العمل إذا توفر وقت الحضور والانصراف
    worked_hours = None
    if attendance.check_in and attendance.check_out:
        worked_hours = _calc_worked_hours_hhmm(
            attendance.check_in, attendance.check_out,
            getattr(attendance, 'break_out', None), getattr(attendance, 'break_in', None)
        )
    
    attendance_doc = {
        "id": str(uuid.uuid4()),
        **attendance.model_dump(),
        "employee_name": employee.get("name"),
        "worked_hours": worked_hours,
        "tenant_id": get_user_tenant_id(current_user),
        "created_by": current_user["id"],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.attendance.insert_one(attendance_doc)
    del attendance_doc["_id"]
    return attendance_doc

@router.get("/attendance")
async def get_attendance(
    employee_id: Optional[str] = None,
    branch_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """جلب سجلات الحضور"""
    query = build_tenant_query(current_user)
    if employee_id:
        query["employee_id"] = employee_id
    if branch_id:
        # جلب الموظفين في الفرع
        employees = await db.employees.find({"branch_id": branch_id}, {"id": 1}).to_list(1000)
        emp_ids = [e["id"] for e in employees]
        query["employee_id"] = {"$in": emp_ids}
    if start_date:
        query["date"] = {"$gte": start_date}
    if end_date:
        query.setdefault("date", {})["$lte"] = end_date
    
    records = await db.attendance.find(query, {"_id": 0}).sort("date", -1).to_list(1000)
    
    # تحديث أسماء الموظفين من البيانات الحالية (لحل مشكلة الأسماء المشفرة)
    if records:
        emp_ids = list(set(r.get("employee_id") for r in records if r.get("employee_id")))
        if emp_ids:
            current_employees = await db.employees.find(
                {"id": {"$in": emp_ids}}, {"_id": 0, "id": 1, "name": 1}
            ).to_list(1000)
            emp_name_map = {e["id"]: e.get("name", "") for e in current_employees}
            for record in records:
                eid = record.get("employee_id")
                if eid and eid in emp_name_map:
                    record["employee_name"] = emp_name_map[eid]
    
    return records

@router.put("/attendance/{attendance_id}")
async def update_attendance(attendance_id: str, update: dict, current_user: dict = Depends(get_current_user)):
    """تحديث سجل حضور"""
    if current_user["role"] not in [UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPERVISOR, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    query = build_tenant_query(current_user, {"id": attendance_id})
    record = await db.attendance.find_one(query)
    if not record:
        raise HTTPException(status_code=404, detail="السجل غير موجود")
    
    # حساب ساعات العمل الجديدة
    check_in = update.get("check_in", record.get("check_in"))
    check_out = update.get("check_out", record.get("check_out"))
    worked_hours = record.get("worked_hours")
    
    if check_in and check_out:
        worked_hours = _calc_worked_hours_hhmm(
            check_in, check_out,
            update.get("break_out", record.get("break_out")),
            update.get("break_in", record.get("break_in"))
        )
    
    update["worked_hours"] = worked_hours
    await db.attendance.update_one({"id": attendance_id}, {"$set": update})
    return await db.attendance.find_one({"id": attendance_id}, {"_id": 0})

# --- السلف ---

@router.post("/advances", response_model=AdvanceResponse)
async def create_advance(advance: AdvanceCreate, current_user: dict = Depends(get_current_user)):
    """طلب سلفة"""
    if current_user["role"] not in [UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    employee = await db.employees.find_one({"id": advance.employee_id}, {"_id": 0})
    if not employee:
        raise HTTPException(status_code=404, detail="الموظف غير موجود")
    
    monthly_deduction = advance.amount / advance.deduction_months
    
    advance_tenant = get_user_tenant_id(current_user)
    advance_branch = employee.get("branch_id")
    advance_biz_date = await _resolve_business_date(advance_tenant, advance_branch)
    advance_doc = {
        "id": str(uuid.uuid4()),
        **advance.model_dump(),
        "employee_name": employee.get("name"),
        "remaining_amount": advance.amount,
        "deducted_amount": 0,
        "monthly_deduction": monthly_deduction,
        "status": "approved",  # يمكن إضافة workflow للموافقة
        "date": advance.date or datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "business_date": advance_biz_date,
        "tenant_id": advance_tenant,
        "created_by": current_user["id"],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    # السلفة تُصرف من خزينة المالك (مثل دفعات الراتب) — وليست مصروفاً نقدياً من شفت الكاشير.
    # تحقّق من رصيد الفرع المتاح في خزينة المالك (إيداعاته - سحوباته - تحويلاته).
    branch_name = None
    if advance_branch:
        _br = await db.branches.find_one({"id": advance_branch}, {"_id": 0, "name": 1})
        branch_name = (_br or {}).get("name")
        branch_q = {"branch_id": advance_branch}
        if advance_tenant:
            branch_q["tenant_id"] = advance_tenant
        _deps = await db.owner_deposits.find(branch_q, {"_id": 0}).to_list(5000)
        _wds = await db.owner_withdrawals.find(branch_q, {"_id": 0}).to_list(5000)
        _tfs = await db.owner_profit_transfers.find(branch_q, {"_id": 0}).to_list(5000)
        branch_balance = (
            sum(d.get("amount", 0) for d in _deps)
            - sum(w.get("amount", 0) for w in _wds)
            - sum(t.get("amount", 0) for t in _tfs)
        )
        if float(advance.amount) > branch_balance:
            raise HTTPException(
                status_code=400,
                detail=f"رصيد فرع \"{branch_name or advance_branch}\" غير كافٍ في خزينة المالك. المتاح: {branch_balance:,.0f} IQD، المطلوب: {float(advance.amount):,.0f} IQD"
            )

    # ربط السحب بالسلفة قبل الإدراج
    withdrawal_id = str(uuid.uuid4())
    advance_doc["linked_owner_withdrawal_id"] = withdrawal_id
    await db.advances.insert_one(advance_doc)

    # سحب موازٍ من خزينة المالك (مرتبط بالفرع لاستقطاع من إيداعاته) — بدل مصروف الكاشير النقدي
    withdrawal_doc = {
        "id": withdrawal_id,
        "tenant_id": advance_tenant,
        "amount": round(float(advance.amount), 2),
        "date": advance_doc["date"],
        "business_date": advance_biz_date,
        "beneficiary": f"سلفة: {employee.get('name')}",
        "description": f"سلفة للموظف {employee.get('name')}" + (f" — {advance.reason}" if advance.reason else ""),
        "category": "advance",
        "branch_id": advance_branch,
        "branch_name": branch_name,
        "employee_id": advance.employee_id,
        "advance_id": advance_doc["id"],
        "linked_advance_id": advance_doc["id"],
        "created_by": current_user.get("full_name") or current_user.get("username") or current_user["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.owner_withdrawals.insert_one(withdrawal_doc)

    del advance_doc["_id"]
    return advance_doc

@router.get("/advances")
async def get_advances(
    employee_id: Optional[str] = None,
    status: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """جلب قائمة السلف"""
    query = build_tenant_query(current_user)
    if employee_id:
        query["employee_id"] = employee_id
    if status:
        query["status"] = status
    
    advances = await db.advances.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    
    # تحديث أسماء الموظفين من البيانات الحالية
    if advances:
        emp_ids = list(set(a.get("employee_id") for a in advances if a.get("employee_id")))
        if emp_ids:
            emps = await db.employees.find({"id": {"$in": emp_ids}}, {"_id": 0, "id": 1, "name": 1}).to_list(500)
            name_map = {e["id"]: e.get("name", "") for e in emps}
            for a in advances:
                eid = a.get("employee_id")
                if eid and eid in name_map:
                    a["employee_name"] = name_map[eid]
    
    return advances

@router.post("/employees/{employee_id}/reset-advances")
async def reset_employee_advances(employee_id: str, current_user: dict = Depends(get_current_user)):
    """تصفير رصيد السلف لموظف (تسوية المتبقي إلى صفر) — يُستخدم لمسح أرصدة الشهور السابقة/التجريبية."""
    if current_user["role"] not in [UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    query = build_tenant_query(current_user)
    query["employee_id"] = employee_id
    query["remaining_amount"] = {"$gt": 0}
    advances = await db.advances.find(query, {"_id": 0}).to_list(1000)
    cleared_total = sum((a.get("remaining_amount", 0) or 0) for a in advances)
    res = await db.advances.update_many(
        {"id": {"$in": [a["id"] for a in advances]}},
        {"$set": {
            "remaining_amount": 0,
            "monthly_deduction": 0,
            "status": "settled",
            "settled_at": datetime.now(timezone.utc).isoformat(),
            "settled_by": current_user["id"]
        }}
    )
    return {"reset_count": res.modified_count, "cleared_amount": cleared_total,
            "message": f"تم تصفير رصيد {res.modified_count} سلفة بقيمة {cleared_total}"}

@router.post("/advances/reset-before-month")
async def reset_advances_before_month(month: str, current_user: dict = Depends(get_current_user)):
    """تصفير أرصدة جميع السلف المسجّلة قبل بداية الشهر المحدد (استثناء الأشهر التجريبية السابقة).
    يبدأ الاحتساب الدقيق من الشهر المحدد. month بصيغة YYYY-MM."""
    if current_user["role"] not in [UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    cutoff = f"{month}-01"
    query = build_tenant_query(current_user)
    query["remaining_amount"] = {"$gt": 0}
    # نفلتر حسب *تاريخ السلفة* (الأهم) مع تعويض created_at عند غياب التاريخ
    query["$or"] = [
        {"date": {"$lt": cutoff}},
        {"$and": [
            {"$or": [{"date": None}, {"date": ""}, {"date": {"$exists": False}}]},
            {"created_at": {"$lt": cutoff}}
        ]}
    ]
    advances = await db.advances.find(query, {"_id": 0}).to_list(5000)
    cleared_total = sum((a.get("remaining_amount", 0) or 0) for a in advances)
    res = await db.advances.update_many(
        {"id": {"$in": [a["id"] for a in advances]}},
        {"$set": {
            "remaining_amount": 0,
            "monthly_deduction": 0,
            "status": "settled",
            "settled_at": datetime.now(timezone.utc).isoformat(),
            "settled_by": current_user["id"],
            "settled_reason": f"تصفير أرصدة الأشهر السابقة - بدء الاحتساب من {month}"
        }}
    )
    return {"reset_count": res.modified_count, "cleared_amount": cleared_total,
            "message": f"تم تصفير {res.modified_count} سلفة من الأشهر السابقة (إجمالي {cleared_total}). الاحتساب يبدأ من {month}"}

