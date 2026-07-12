"""Super Admin routes (extracted from server.py)"""
from fastapi import APIRouter
from server import *  # noqa: F401,F403
from server import (_client_ip, _load_email_config, _mask_phone, _phone_to_e164,
                    _refresh_blocked_ips, _refresh_security_config, _save_owner_ip, _sn,
                    _re_rbac, _twilio_verify, _wa_free, get_owner_recovery_emails)

router = APIRouter()

# ==================== SUPER ADMIN & TENANT MANAGEMENT ====================
# نظام إدارة المستأجرين - لوحة تحكم المالك الرئيسي

class SuperAdminLoginRequest(BaseModel):
    email: str
    password: str
    secret_key: str
    device_id: Optional[str] = None

@router.post("/super-admin/login")
async def super_admin_login(request: SuperAdminLoginRequest, http_request: Request):
    """تسجيل دخول Super Admin - محمي ضد التخمين"""
    _ip = _client_ip(http_request)
    _lockkey = f"salogin:{_ip}:{request.email}"
    await check_login_lock(_lockkey)
    user = await db.users.find_one({"email": request.email, "role": UserRole.SUPER_ADMIN})
    if not user:
        await record_login_fail(_lockkey, ip=_ip, request=http_request)
        await record_audit("superadmin.login.failed", http_request, details={"email": request.email, "reason": "not_found"}, status=401)
        raise HTTPException(status_code=401, detail="بيانات الدخول غير صحيحة")
    
    # التحقق من المفتاح السري (من قاعدة البيانات أو القيمة الافتراضية)
    stored_secret = user.get("secret_key") or user.get("super_admin_secret") or SUPER_ADMIN_SECRET
    if request.secret_key != stored_secret:
        await record_login_fail(_lockkey, ip=_ip, request=http_request)
        await record_audit("superadmin.login.failed", http_request, user=user, details={"reason": "bad_secret"}, status=403)
        raise HTTPException(status_code=403, detail="بيانات الدخول غير صحيحة")
    
    # التحقق من كلمة المرور (الحقل قد يكون password أو password_hash)
    password_field = user.get("password") or user.get("password_hash")
    if not password_field or not verify_password(request.password, password_field):
        await record_login_fail(_lockkey, ip=_ip, request=http_request)
        await record_audit("superadmin.login.failed", http_request, user=user, details={"reason": "wrong_password"}, status=401)
        raise HTTPException(status_code=401, detail="بيانات الدخول غير صحيحة")
    
    await clear_login_attempts(_lockkey)
    # عنوان المالك يُحفظ ولا يُحظر أبداً
    await _save_owner_ip(_ip, http_request)

    # ======== المصادقة الثنائية (جهاز موثوق) — المالك عبر البريد ========
    if await two_fa_enabled() and not await is_device_trusted("user", user["id"], request.device_id):
        _uname = user.get("full_name") or user.get("username") or user.get("email")
        resp2fa = await start_2fa_verification("user", user["id"], _uname, user.get("tenant_id"),
                                               "email", list(OWNER_RECOVERY_EMAILS), request.device_id,
                                               _ip, http_request, extra={"purpose": "super_admin_login"})
        await record_audit("superadmin.2fa.challenge", http_request, user=user, status=200)
        return resp2fa
    if await two_fa_enabled():
        await trust_device("user", user["id"], request.device_id, _ip,
                           http_request.headers.get("user-agent", ""), user.get("tenant_id"))

    await record_audit("superadmin.login.success", http_request, user=user, status=200)
    _sid = await issue_user_session(user["id"], user.get("role"))
    token = create_token(user["id"], user["role"], user.get("branch_id"), user.get("tenant_id"), session_id=_sid)
    
    return {
        "token": token,
        "user": {
            "id": user["id"],
            "email": user["email"],
            "full_name": user.get("full_name", user.get("username", "")),
            "role": user["role"]
        }
    }

class SuperAdminRegisterRequest(BaseModel):
    email: str
    password: str
    full_name: str
    secret_key: str

@router.post("/super-admin/register")
async def register_super_admin(request: SuperAdminRegisterRequest):
    """إنشاء حساب Super Admin (مرة واحدة فقط)"""
    if request.secret_key != SUPER_ADMIN_SECRET:
        raise HTTPException(status_code=403, detail="مفتاح السر غير صحيح")
    
    # التحقق من عدم وجود Super Admin
    existing = await db.users.find_one({"role": UserRole.SUPER_ADMIN})
    if existing:
        raise HTTPException(status_code=400, detail="يوجد Super Admin بالفعل")
    
    # التحقق من عدم وجود البريد
    email_exists = await db.users.find_one({"email": request.email})
    if email_exists:
        raise HTTPException(status_code=400, detail="البريد الإلكتروني مستخدم")
    
    user_doc = {
        "id": str(uuid.uuid4()),
        "username": "super_admin",
        "email": request.email,
        "password": hash_password(request.password),
        "password_vault": encrypt_plain_password(request.password),
        "full_name": request.full_name,
        "role": UserRole.SUPER_ADMIN,
        "branch_id": None,
        "tenant_id": None,
        "permissions": ["all", "super_admin"],
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.users.insert_one(user_doc)
    
    _sid = await issue_user_session(user_doc["id"], user_doc.get("role"))
    token = create_token(user_doc["id"], user_doc["role"], user_doc.get("branch_id"), user_doc.get("tenant_id"), session_id=_sid)
    
    return {
        "message": "تم إنشاء حساب Super Admin بنجاح",
        "token": token,
        "user": {
            "id": user_doc["id"],
            "email": user_doc["email"],
            "full_name": user_doc["full_name"],
            "role": user_doc["role"]
        }
    }

@router.get("/super-admin/tenants")
async def get_all_tenants(current_user: dict = Depends(verify_super_admin)):
    """جلب جميع العملاء (المستأجرين)"""
    tenants = await db.tenants.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    
    # إضافة إحصائيات لكل مستأجر
    for tenant in tenants:
        tenant["users_count"] = await db.users.count_documents({"tenant_id": tenant["id"]})
        tenant["branches_count"] = await db.branches.count_documents({"tenant_id": tenant["id"]})
        tenant["orders_count"] = await db.orders.count_documents({"tenant_id": tenant["id"]})
        # إضافة عدد الأجهزة المرخصة
        tenant["devices_count"] = await db.license_devices.count_documents({
            "tenant_id": tenant["id"],
            "is_active": True
        })
        # التأكد من وجود max_devices
        if "max_devices" not in tenant:
            tenant["max_devices"] = 5
    
    # إرجاع قائمة العملاء فقط (النظام الرئيسي هو المالك ولا يظهر كعميل)
    return tenants

@router.post("/super-admin/tenants")
async def create_tenant(tenant: TenantCreate, background_tasks: BackgroundTasks, current_user: dict = Depends(verify_super_admin)):
    """إنشاء مستأجر جديد (عميل جديد) مع إرسال بريد ترحيبي وإشعار"""
    
    # التحقق من عدم وجود slug مكرر
    existing = await db.tenants.find_one({"slug": tenant.slug})
    if existing:
        raise HTTPException(status_code=400, detail="الرابط المختصر مستخدم")
    
    # التحقق من عدم وجود البريد
    email_exists = await db.users.find_one({"email": tenant.owner_email})
    if email_exists:
        raise HTTPException(status_code=400, detail="البريد الإلكتروني مستخدم")
    
    tenant_id = str(uuid.uuid4())
    
    # تحديد تاريخ انتهاء الاشتراك بناءً على المدة المحددة
    subscription_duration = getattr(tenant, 'subscription_duration', 1)  # افتراضي شهر واحد
    
    if tenant.subscription_type == "trial":
        expires_at = (datetime.now(timezone.utc) + timedelta(days=14)).isoformat()
    elif tenant.subscription_type == "demo":
        expires_at = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()
    else:
        # استخدام مدة الاشتراك المحددة بالأشهر
        expires_at = (datetime.now(timezone.utc) + timedelta(days=30 * subscription_duration)).isoformat()
    
    tenant_doc = {
        "id": tenant_id,
        "name": tenant.name,
        "slug": tenant.slug,
        "owner_name": tenant.owner_name,
        "owner_email": tenant.owner_email,
        "owner_phone": tenant.owner_phone,
        "subscription_type": tenant.subscription_type,
        "subscription_duration": subscription_duration,
        "max_branches": tenant.max_branches,
        "max_users": tenant.max_users,
        "is_active": True,
        "is_demo": getattr(tenant, 'is_demo', False),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "expires_at": expires_at,
        "created_by": current_user["id"]
    }
    
    await db.tenants.insert_one(tenant_doc)
    
    # 🔑 كلمة مرور المالك: نستخدم المُدخَلة من الفورم إن وُجدت، وإلا نستعمل الافتراضية.
    # هذا يضمن أن رسالة الترحيب تحوي نفس الكلمة التي كتبها super_admin بالضبط.
    admin_password = (tenant.owner_password or "").strip() or f"{tenant.slug}123"
    admin_doc = {
        "id": str(uuid.uuid4()),
        "username": f"{tenant.slug}_admin",
        "email": tenant.owner_email,
        "phone": tenant.owner_phone,  # 🔄 يُنقَل تلقائياً من بيانات التينانت (طلب المالك)
        "password": hash_password(admin_password),
        "password_vault": encrypt_plain_password(admin_password),  # الأصل المشفَّر لإرسال الترحيب
        "full_name": tenant.owner_name,
        "role": UserRole.ADMIN,
        "branch_id": None,
        "tenant_id": tenant_id,
        "permissions": ["all"],
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.users.insert_one(admin_doc)
    
    # لا يتم إنشاء فرع افتراضي - العميل يُنشئ فروعه بنفسه من الإعدادات
    # هذا يمنع التداخل ويعطي العميل تحكماً كاملاً في فروعه
    
    # إنشاء فئات افتراضية للمستأجر الجديد
    default_categories = [
        {"id": str(uuid.uuid4()), "name": "المشروبات", "name_en": "Beverages", "icon": "☕", "color": "#8B4513", "sort_order": 1, "tenant_id": tenant_id, "is_active": True},
        {"id": str(uuid.uuid4()), "name": "الوجبات الرئيسية", "name_en": "Main Dishes", "icon": "🥘", "color": "#D4AF37", "sort_order": 2, "tenant_id": tenant_id, "is_active": True},
        {"id": str(uuid.uuid4()), "name": "المقبلات", "name_en": "Appetizers", "icon": "🧆", "color": "#228B22", "sort_order": 3, "tenant_id": tenant_id, "is_active": True},
        {"id": str(uuid.uuid4()), "name": "الحلويات", "name_en": "Desserts", "icon": "🍰", "color": "#FF69B4", "sort_order": 4, "tenant_id": tenant_id, "is_active": True},
    ]
    
    for cat in default_categories:
        await db.categories.insert_one(cat)
    
    del tenant_doc["_id"]
    
    # إرسال بريد ترحيبي تلقائياً
    background_tasks.add_task(
        send_welcome_email,
        recipient_email=tenant.owner_email,
        tenant_name=tenant.name,
        owner_name=tenant.owner_name,
        username=tenant.owner_email,
        password=admin_password
    )
    
    # إنشاء إشعار للمالك عن العميل الجديد
    notification_doc = {
        "id": str(uuid.uuid4()),
        "type": "new_tenant",
        "title": "عميل جديد 🎉",
        "message": f"تم إنشاء عميل جديد: {tenant.name} ({tenant.owner_name})",
        "tenant_id": tenant_id,
        "data": {
            "tenant_name": tenant.name,
            "owner_name": tenant.owner_name,
            "owner_email": tenant.owner_email,
            "subscription_type": tenant.subscription_type,
            "subscription_duration": subscription_duration,
            "expires_at": expires_at
        },
        "is_read": False,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.notifications.insert_one(notification_doc)
    
    return {
        "tenant": tenant_doc,
        "admin_credentials": {
            "email": tenant.owner_email,
            "password": admin_password,
            "message": "يرجى تغيير كلمة المرور فور تسجيل الدخول"
        },
        "access_url": f"/tenant/{tenant.slug}",
        "email_sent": True
    }

PUBLIC_DIR = "/app/frontend/public"

@router.get("/download/profile-pdf")
async def download_profile_pdf():
    """تحميل بروفايل PDF مباشرةً (يتجاوز الـ Service Worker)."""
    from fastapi.responses import FileResponse
    path = f"{PUBLIC_DIR}/Maestro-EGP-Profile.pdf"
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="الملف غير موجود")
    return FileResponse(path, media_type="application/pdf", filename="Maestro-EGP-Profile.pdf")


@router.get("/download/logo")
async def download_logo():
    """تحميل الشعار الموحّد الدائري."""
    from fastapi.responses import FileResponse
    path = f"{PUBLIC_DIR}/maestro-logo-circle.png"
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="الملف غير موجود")
    return FileResponse(path, media_type="image/png", filename="maestro-logo.png")


@router.get("/download/splash-video")
async def download_splash_video():
    """تحميل فيديو شاشة التحميل."""
    from fastapi.responses import FileResponse
    path = f"{PUBLIC_DIR}/maestro-splash.mp4"
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="الملف غير موجود")
    return FileResponse(path, media_type="video/mp4", filename="maestro-splash.mp4")


@router.get("/system/email-settings")
async def get_email_settings(current_user: dict = Depends(verify_super_admin)):
    """جلب إعدادات البريد (بدون كشف كلمة المرور) + قائمة بريد الاسترداد."""
    doc = await db.email_config.find_one({"id": "global"}) or {}
    cfg = await _load_email_config()
    recovery = await get_owner_recovery_emails()
    return {
        "smtp_host": doc.get("smtp_host", SMTP_HOST or "mail.privateemail.com"),
        "smtp_port": doc.get("smtp_port", SMTP_PORT or 465),
        "smtp_user": doc.get("smtp_user", SMTP_USER or ""),
        "from_name": doc.get("from_name", SMTP_FROM_NAME or "Maestro EGP"),
        "sender_email": doc.get("sender_email", SENDER_EMAIL or ""),
        "recovery_emails": recovery,  # بريد المالك الاحتياطي (يستلم رموز 2FA والإشعارات الحرجة)
        "password_set": bool(cfg.get("smtp_password")),
        "configured": bool((cfg.get("smtp_host") and cfg.get("smtp_user") and cfg.get("smtp_password")) or cfg.get("sendgrid_api_key")),
    }


@router.put("/system/email-settings")
async def update_email_settings(payload: dict, current_user: dict = Depends(verify_super_admin)):
    """حفظ إعدادات البريد + قائمة بريد الاسترداد في قاعدة البيانات (تبقى بعد النشر)."""
    update = {
        "id": "global",
        "smtp_host": (payload.get("smtp_host") or "mail.privateemail.com").strip(),
        "smtp_port": int(payload.get("smtp_port") or 465),
        "smtp_user": (payload.get("smtp_user") or "").strip(),
        "from_name": (payload.get("from_name") or "Maestro EGP").strip(),
        "sender_email": (payload.get("sender_email") or payload.get("smtp_user") or "").strip(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "updated_by": current_user.get("id"),
    }
    # كلمة المرور تُحدَّث فقط إذا أُرسلت (حتى لا تُمحى عند الحفظ بدون تغييرها)
    pwd = payload.get("smtp_password")
    if pwd:
        update["smtp_password"] = pwd
    
    # 📧 بريد الاسترداد (قائمة عناوين تستلم رموز 2FA وإشعارات المالك)
    if "recovery_emails" in payload:
        raw = payload.get("recovery_emails")
        if isinstance(raw, str):
            # قبول سلسلة مفصولة بفواصل أو أسطر جديدة
            raw = [e.strip() for e in raw.replace('\n', ',').split(',')]
        if isinstance(raw, list):
            valid_emails = []
            for e in raw:
                e = str(e).strip().lower()
                if e and "@" in e and "." in e.split("@")[-1] and len(e) <= 200:
                    if e not in valid_emails:
                        valid_emails.append(e)
            if not valid_emails:
                raise HTTPException(status_code=400, detail="يجب أن يحتوي بريد الاسترداد على عنوان صالح واحد على الأقل")
            if len(valid_emails) > 5:
                raise HTTPException(status_code=400, detail="بحد أقصى 5 عناوين بريد استرداد")
            update["recovery_emails"] = valid_emails
    
    await db.email_config.update_one({"id": "global"}, {"$set": update}, upsert=True)
    # حدّث الكاش المتزامن OWNER_RECOVERY_EMAILS
    await get_owner_recovery_emails()
    cfg = await _load_email_config()
    return {
        "success": True,
        "configured": bool(cfg.get("smtp_host") and cfg.get("smtp_user") and cfg.get("smtp_password")),
        "recovery_emails": await get_owner_recovery_emails(),
    }


def _fetch_inbox_messages(host, user, password, limit=25):
    """يجلب رسائل صندوق الوارد عبر IMAP (دالة متزامنة تُستدعى عبر to_thread)."""
    import imaplib, email, hashlib
    from email.header import decode_header
    from email.utils import parseaddr

    def _dec(val):
        if not val:
            return ""
        parts = decode_header(val)
        out = ""
        for txt, enc in parts:
            if isinstance(txt, bytes):
                try:
                    out += txt.decode(enc or "utf-8", errors="replace")
                except Exception:
                    out += txt.decode("utf-8", errors="replace")
            else:
                out += txt
        return out

    messages = []
    imap = imaplib.IMAP4_SSL(host, 993, timeout=25)
    try:
        imap.login(user, password)
        imap.select("INBOX")
        typ, data = imap.search(None, "ALL")
        ids = data[0].split()
        ids = ids[-max(1, min(int(limit), 50)):]
        for mid in reversed(ids):
            typ, msg_data = imap.fetch(mid, "(RFC822)")
            if typ != "OK" or not msg_data or not msg_data[0]:
                continue
            msg = email.message_from_bytes(msg_data[0][1])
            from_raw = _dec(msg.get("From"))
            from_name, from_addr = parseaddr(from_raw)
            subject = _dec(msg.get("Subject"))
            date = msg.get("Date", "")
            msg_id = (msg.get("Message-ID") or msg.get("Message-Id") or "").strip()
            if not msg_id:
                msg_id = hashlib.md5(f"{date}|{from_raw}|{subject}".encode("utf-8", "replace")).hexdigest()
            body_text, body_html = "", ""
            if msg.is_multipart():
                for part in msg.walk():
                    ctype = part.get_content_type()
                    disp = str(part.get("Content-Disposition") or "")
                    if "attachment" in disp:
                        continue
                    try:
                        payload = part.get_payload(decode=True)
                        if not payload:
                            continue
                        charset = part.get_content_charset() or "utf-8"
                        decoded = payload.decode(charset, errors="replace")
                    except Exception:
                        continue
                    if ctype == "text/plain" and not body_text:
                        body_text = decoded
                    elif ctype == "text/html" and not body_html:
                        body_html = decoded
            else:
                try:
                    payload = msg.get_payload(decode=True)
                    charset = msg.get_content_charset() or "utf-8"
                    decoded = payload.decode(charset, errors="replace") if payload else ""
                except Exception:
                    decoded = ""
                if msg.get_content_type() == "text/html":
                    body_html = decoded
                else:
                    body_text = decoded
            snippet = (body_text or "").strip().replace("\n", " ")[:140]
            messages.append({
                "message_id": msg_id,
                "from": from_addr or from_raw,
                "from_name": from_name or from_addr or from_raw,
                "subject": subject,
                "date": date,
                "snippet": snippet,
                "body_text": body_text[:20000],
                "body_html": body_html[:50000],
            })
        return messages
    finally:
        try:
            imap.logout()
        except Exception:
            pass


@router.get("/system/inbox")
async def get_inbox(limit: int = 25, current_user: dict = Depends(verify_super_admin)):
    """جلب آخر الرسائل الواردة من صندوق البريد عبر IMAP (Namecheap Private Email)."""
    import imaplib, socket
    cfg = await _load_email_config()
    host = cfg.get("smtp_host") or "mail.privateemail.com"
    user = cfg.get("smtp_user")
    password = cfg.get("smtp_password")
    if not (user and password):
        raise HTTPException(status_code=400, detail="لم يتم إعداد البريد بعد (أدخل البريد وكلمة المرور)")

    try:
        messages = await asyncio.to_thread(_fetch_inbox_messages, host, user, password, limit)
        return {"messages": messages, "count": len(messages)}
    except imaplib.IMAP4.error as e:
        logger.error(f"IMAP login/select failed: {e}")
        raise HTTPException(status_code=401, detail=f"فشل تسجيل الدخول إلى البريد عبر IMAP. تأكد أن كلمة المرور صحيحة وأن خدمة IMAP مُفعّلة في حساب privateemail.com. ({str(e)[:120]})")
    except (TimeoutError, socket.timeout) as e:
        logger.error(f"IMAP timeout: {e}")
        raise HTTPException(status_code=504, detail="انتهت مهلة الاتصال بخادم البريد (993). حاول مرة أخرى.")
    except Exception as e:
        logger.error(f"IMAP inbox fetch failed: {type(e).__name__}: {e}")
        raise HTTPException(status_code=502, detail=f"فشل الاتصال بصندوق البريد — {type(e).__name__}: {str(e)[:140]}")


@router.get("/system/inbox/sync")
async def sync_inbox(limit: int = 25, current_user: dict = Depends(verify_super_admin)):
    """يجلب الوارد ويُنشئ إشعاراً فورياً لكل رسالة جديدة (للتحديث التلقائي بدون تدخل)."""
    import imaplib, socket
    cfg = await _load_email_config()
    host = cfg.get("smtp_host") or "mail.privateemail.com"
    user = cfg.get("smtp_user")
    password = cfg.get("smtp_password")
    if not (user and password):
        # لا يوجد بريد مُعد بعد — أعد قائمة فارغة بهدوء (للتحديث التلقائي)
        return {"messages": [], "count": 0, "new_count": 0, "configured": False}

    try:
        messages = await asyncio.to_thread(_fetch_inbox_messages, host, user, password, limit)
    except Exception as e:
        logger.error(f"IMAP sync fetch failed: {type(e).__name__}: {e}")
        return {"messages": [], "count": 0, "new_count": 0, "error": str(e)[:140]}

    # حالة الوارد المحفوظة (المعرفات التي سبق رؤيتها)
    state = await db.email_inbox_state.find_one({"_id": "inbox"})
    current_ids = [m["message_id"] for m in messages]
    new_count = 0

    if not state:
        # أول مزامنة: علّم كل الرسائل الحالية كمرئية بدون إنشاء إشعارات (تجنّب الإغراق)
        await db.email_inbox_state.insert_one({"_id": "inbox", "seen_ids": current_ids[:300],
                                               "updated_at": datetime.now(timezone.utc).isoformat()})
    else:
        seen = set(state.get("seen_ids", []))
        # الرسائل بترتيب الأحدث أولاً؛ ننشئ إشعارات للجديدة (نعكس لإنشائها بالترتيب الزمني)
        new_msgs = [m for m in messages if m["message_id"] not in seen]
        for m in reversed(new_msgs):
            subj = m.get("subject") or "(بلا عنوان)"
            sender = m.get("from_name") or m.get("from") or ""
            snippet = (m.get("snippet") or "").strip()
            body_preview = subj if not snippet else f"{subj} — {snippet}"
            notif = {
                "id": str(uuid.uuid4()),
                "type": "new_email",
                "title": f"📧 رسالة جديدة من {sender}",
                "message": body_preview[:220],
                "tenant_id": None,
                "data": {
                    "from": m.get("from"),
                    "from_name": m.get("from_name"),
                    "subject": subj,
                    "date": m.get("date"),
                    "snippet": snippet,
                    "body_text": (m.get("body_text") or "")[:5000],
                },
                "is_read": False,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            await db.notifications.insert_one(notif)
            new_count += 1
        # حدّث المعرفات المرئية (آخر 300)
        merged = current_ids + [i for i in state.get("seen_ids", []) if i not in current_ids]
        await db.email_inbox_state.update_one(
            {"_id": "inbox"},
            {"$set": {"seen_ids": merged[:300], "updated_at": datetime.now(timezone.utc).isoformat()}}
        )

    return {"messages": messages, "count": len(messages), "new_count": new_count, "configured": True}


@router.post("/system/test-email")
async def send_test_email(payload: dict, current_user: dict = Depends(verify_super_admin)):
    """إرسال بريد اختباري للتحقق من إعدادات SMTP/SendGrid."""
    to = (payload or {}).get("email")
    if not to:
        raise HTTPException(status_code=400, detail="يرجى إدخال البريد الإلكتروني")
    cfg = await _load_email_config()
    transport = "SMTP" if (cfg.get("smtp_host") and cfg.get("smtp_user") and cfg.get("smtp_password")) else ("SendGrid" if cfg.get("sendgrid_api_key") else None)
    if not transport:
        raise HTTPException(status_code=400, detail="لم يتم إعداد أي خدمة بريد (SMTP/SendGrid)")
    html = build_branded_email_html(
        title="✅ اختبار بريد Maestro EGP",
        body_html=(
            f"<p style='margin:0 0 8px 0;color:#10B981;font-weight:bold;font-size:16px'>✅ تم إعداد البريد بنجاح!</p>"
            f"<p style='margin:0 0 8px 0;line-height:1.8'>هذه رسالة اختبارية للتأكد من أن نظامك يستطيع إرسال الإيميلات تلقائياً.</p>"
            f"<p style='margin:0;line-height:1.8'>عند إنشاء أي عميل جديد، ستُرسَل بيانات الدخول إليه تلقائياً.</p>"
            f"<p style='color:#6b7280;font-size:12px;margin-top:16px'>عبر {transport} — {datetime.now().strftime('%Y-%m-%d %H:%M')}</p>"
        ),
        severity="success",
    )
    ok = await send_system_email([to], "✅ اختبار بريد Maestro EGP", html, purpose="test")
    if not ok:
        raise HTTPException(status_code=502, detail="فشل إرسال البريد — تحقق من كلمة المرور وإعدادات الخادم")
    return {"success": ok, "transport": transport, "to": to}


@router.get("/super-admin/tenants/{tenant_id}")
async def get_tenant_details(tenant_id: str, current_user: dict = Depends(verify_super_admin)):
    """تفاصيل مستأجر معين"""
    
    # التحقق إذا كان النظام الرئيسي
    if tenant_id == "main-system":
        # استعلام النظام الرئيسي يشمل: بدون tenant_id أو tenant_id = null أو tenant_id = "default"
        main_system_query = {
            "$or": [
                {"tenant_id": {"$exists": False}}, 
                {"tenant_id": None},
                {"tenant_id": "default"}
            ]
        }
        
        # جلب مستخدمي النظام الرئيسي
        users = await db.users.find({
            **main_system_query,
            "role": {"$ne": UserRole.SUPER_ADMIN}
        }, {"_id": 0, "password": 0}).to_list(100)
        
        branches = await db.branches.find(main_system_query, {"_id": 0}).to_list(50)
        
        # إحصائيات المبيعات للنظام الرئيسي
        today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
        orders_today = await db.orders.count_documents({
            **main_system_query,
            "created_at": {"$gte": today}
        })
        
        total_sales_cursor = db.orders.aggregate([
            {"$match": {**main_system_query, "status": {"$ne": "cancelled"}}},
            {"$group": {"_id": None, "total": {"$sum": "$total"}}}
        ])
        total_sales_result = await total_sales_cursor.to_list(1)
        total_sales = total_sales_result[0]["total"] if total_sales_result else 0
        
        # إجمالي الطلبات
        total_orders = await db.orders.count_documents(main_system_query)
        
        return {
            "tenant": {
                "id": "main-system",
                "name": "🏠 النظام الرئيسي",
                "slug": "main",
                "owner_name": "المالك",
                "owner_email": "admin@maestroegp.com",
                "owner_phone": "",
                "subscription_type": "premium",
                "is_active": True,
                "is_main_system": True,
                "created_at": "2024-01-01T00:00:00"
            },
            "users": users,
            "branches": branches,
            "stats": {
                "users_count": len(users),
                "branches_count": len(branches),
                "orders_today": orders_today,
                "total_sales": total_sales,
                "total_orders": total_orders
            }
        }
    
    # للعملاء العاديين
    tenant = await db.tenants.find_one({"id": tenant_id}, {"_id": 0})
    if not tenant:
        raise HTTPException(status_code=404, detail="المستأجر غير موجود")
    
    # إحصائيات تفصيلية
    users = await db.users.find({"tenant_id": tenant_id}, {"_id": 0, "password": 0}).to_list(100)
    branches = await db.branches.find({"tenant_id": tenant_id}, {"_id": 0}).to_list(50)
    
    # جلب الأجهزة المرخصة
    devices = await db.license_devices.find({"tenant_id": tenant_id}, {"_id": 0}).to_list(100)
    
    # إحصائيات المبيعات
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    orders_today = await db.orders.count_documents({
        "tenant_id": tenant_id,
        "created_at": {"$gte": today}
    })
    
    total_sales_cursor = db.orders.aggregate([
        {"$match": {"tenant_id": tenant_id, "status": {"$ne": "cancelled"}}},
        {"$group": {"_id": None, "total": {"$sum": "$total"}}}
    ])
    total_sales_result = await total_sales_cursor.to_list(1)
    total_sales = total_sales_result[0]["total"] if total_sales_result else 0
    
    return {
        "tenant": tenant,
        "users": users,
        "branches": branches,
        "devices": devices,
        "stats": {
            "users_count": len(users),
            "branches_count": len(branches),
            "orders_today": orders_today,
            "total_sales": total_sales,
            "devices_count": len([d for d in devices if d.get("is_active")])
        }
    }

@router.put("/super-admin/tenants/{tenant_id}/features")
async def update_tenant_features(tenant_id: str, features: dict, current_user: dict = Depends(verify_super_admin)):
    """تحديث ميزات العميل المتاحة"""
    tenant = await db.tenants.find_one({"id": tenant_id})
    if not tenant:
        raise HTTPException(status_code=404, detail="المستأجر غير موجود")
    
    # قائمة الميزات المسموح بها
    allowed_features = [
        # الميزات الأساسية (جميع الإجراءات السريعة)
        "showPOS", "showTables", "showOrders", "showKitchen",
        "showReports", "showRatings", "showDelivery", "showInventoryReports",
        "showBranchOrders", "showWarehouse", "showPurchasing", "showExpenses",
        "showOwnerWallet", "showCoupons", "showLoyalty", "showCallLogs",
        "showHR", "showReservations", "showSettings", "showExternalBranches",
        # ميزات جديدة في الإجراءات السريعة
        "showCaptainsManagement", "showExternalPurchasesReport", "showPriceIncreaseReport",
        # ميزات إضافية
        "showInventory", "showCallCenter", "showRecipes", "showReviews",
        "showSmartReports", "showComprehensiveReport", "showBreakEvenReport",
        "showCustomerMenu",
        # خيارات الإعدادات
        "settingsAppearance", "settingsRestaurant", "settingsUsers",
        "settingsCustomers", "settingsBranches", "settingsCategories",
        "settingsProducts", "settingsPrinters", "settingsDeliveryCompanies",
        "settingsCallCenter", "settingsNotifications", "settingsInvoice",
        "settingsSystem", "settingsInventory", "settingsPayment",
        "settingsKitchenSections"
    ]
    
    # فلترة الميزات المرسلة
    enabled_features = {k: v for k, v in features.items() if k in allowed_features}
    
    # تحديث العميل
    await db.tenants.update_one(
        {"id": tenant_id},
        {"$set": {"enabled_features": enabled_features}}
    )
    
    return {"message": "تم تحديث ميزات العميل", "features": enabled_features}

@router.get("/super-admin/tenants/{tenant_id}/features")
async def get_tenant_features(tenant_id: str, current_user: dict = Depends(verify_super_admin)):
    """جلب ميزات العميل المتاحة"""
    tenant = await db.tenants.find_one({"id": tenant_id}, {"_id": 0, "enabled_features": 1, "name": 1})
    if not tenant:
        raise HTTPException(status_code=404, detail="المستأجر غير موجود")
    
    # الميزات الافتراضية للعميل الجديد
    default_features = {
        "showPOS": True,
        "showTables": True,
        "showOrders": True,
        "showExpenses": True,
        "showInventory": True,
        "showDelivery": True,
        "showReports": True,
        "showSettings": True,
        "showHR": False,
        "showWarehouse": False,
        "showCallLogs": False,
        "showCallCenter": False,
        "showKitchen": False,
        "showLoyalty": True,
        "showCoupons": True,
        "showRecipes": False,
        "showReservations": True,
        "showReviews": True,
        "showRatings": True,
        "showSmartReports": True,
        "showPurchasing": False,
        "showBranchOrders": False,
        "showCustomerMenu": True,
        # الميزات الجديدة
        "showOwnerWallet": True,
        "showExternalBranches": True,
        "showComprehensiveReport": True,
        # خيارات الإعدادات
        "settingsUsers": True,
        "settingsCustomers": True,
        "settingsBranches": True,
        "settingsCategories": True,
        "settingsProducts": True,
        "settingsPrinters": True,
        "settingsDeliveryCompanies": True,
        "settingsCallCenter": True,
        "settingsNotifications": True,
        "settingsRestaurant": True,
        "settingsAppearance": True,
        "settingsInvoice": True,
        "settingsSystem": True,
        "settingsInventory": True,
        "settingsPayment": True,
        "settingsKitchenSections": True,
        # التقارير
        "showBreakEvenReport": True,
        "showInventoryReports": True,
        # ميزات جديدة في الإجراءات السريعة
        "showCaptainsManagement": True,
        "showExternalPurchasesReport": True,
        "showPriceIncreaseReport": True
    }
    
    # دمج الميزات المحفوظة مع الافتراضية
    saved_features = tenant.get("enabled_features", {})
    features = {**default_features, **saved_features}
    
    return {"tenant_name": tenant.get("name"), "features": features}

@router.put("/super-admin/tenants/{tenant_id}")
async def update_tenant(tenant_id: str, updates: dict, background_tasks: BackgroundTasks, current_user: dict = Depends(verify_super_admin)):
    """تحديث بيانات مستأجر مع إرسال بريد إلكتروني تلقائي"""
    tenant = await db.tenants.find_one({"id": tenant_id})
    if not tenant:
        raise HTTPException(status_code=404, detail="المستأجر غير موجود")
    
    # قائمة الحقول المسموح بتحديثها
    allowed_updates = [
        "name", "name_en", "name_ar", "owner_name", "owner_email", "owner_phone", 
        "subscription_type", "subscription_end", "max_branches", "max_users", 
        "is_active", "expires_at", "logo_url"
    ]
    update_data = {k: v for k, v in updates.items() if k in allowed_updates}
    
    # 🔑 كلمة مرور المالك — لو أرسلها super_admin في form التعديل، نحدّثها في user + vault
    #     نستهدف المالك الفعلي (المطابق لـ tenant.owner_email أو أقدم admin) — ليس أي admin آخر
    new_owner_password = (updates.get("owner_password") or updates.get("password") or "").strip()
    if new_owner_password:
        # اعثر على المالك الحقيقي بنفس منطق زر الترحيب
        tenant_doc = await db.tenants.find_one({"id": tenant_id}, {"_id": 0, "owner_email": 1})
        _owner_email = (tenant_doc or {}).get("owner_email") or updates.get("owner_email")
        owner_query = {"tenant_id": tenant_id, "role": UserRole.ADMIN}
        if _owner_email:
            owner_query["email"] = _owner_email
        target_admin = await db.users.find_one(owner_query, {"_id": 0, "id": 1})
        if not target_admin:
            # fallback: أقدم admin في التينانت
            _cursor = db.users.find(
                {"tenant_id": tenant_id, "role": UserRole.ADMIN},
                {"_id": 0, "id": 1}
            ).sort("created_at", 1).limit(1)
            _list = [u async for u in _cursor]
            target_admin = _list[0] if _list else None
        if target_admin:
            await db.users.update_one(
                {"id": target_admin["id"]},
                {"$set": {
                    "password": hash_password(new_owner_password),
                    "password_vault": encrypt_plain_password(new_owner_password),
                    "must_change_password": False,
                }}
            )
            logger.info(f"🔑 owner password updated for tenant={tenant_id} user={target_admin['id']}")
    
    # معالجة تمديد الاشتراك
    extend_months = updates.get("extend_months", 0)
    if extend_months > 0:
        from datetime import datetime, timedelta
        # الحصول على تاريخ انتهاء الاشتراك الحالي أو تاريخ اليوم
        current_end = tenant.get("subscription_end")
        if current_end:
            if isinstance(current_end, str):
                try:
                    base_date = datetime.fromisoformat(current_end.replace('Z', '+00:00'))
                except:
                    base_date = datetime.now()
            else:
                base_date = current_end
            # إذا كان التاريخ في الماضي، نبدأ من اليوم
            if base_date < datetime.now():
                base_date = datetime.now()
        else:
            base_date = datetime.now()
        
        # حساب التاريخ الجديد
        new_end = base_date + timedelta(days=extend_months * 30)
        update_data["subscription_end"] = new_end.isoformat()
        logger.info(f"✅ تم تمديد اشتراك {tenant.get('name')} بـ {extend_months} شهر. ينتهي في: {new_end}")
    
    # التحقق من تغيير البريد الإلكتروني
    email_changed = False
    new_email = updates.get("owner_email")
    if new_email and new_email != tenant.get("owner_email"):
        # التحقق من عدم استخدام البريد من قبل
        existing = await db.users.find_one({"email": new_email})
        if existing:
            raise HTTPException(status_code=400, detail="البريد الإلكتروني مستخدم من قبل")
        email_changed = True
    
    if update_data:
        await db.tenants.update_one({"id": tenant_id}, {"$set": update_data})
    
    # تحديث حالة المستخدمين عند تغيير is_active
    if "is_active" in updates:
        await db.users.update_many(
            {"tenant_id": tenant_id},
            {"$set": {"is_active": updates["is_active"]}}
        )
    
    # تحديث بيانات المستخدم الأدمن إذا تم تغيير البريد أو الاسم أو الهاتف
    admin_update = {}
    if new_email and email_changed:
        admin_update["email"] = new_email
    if updates.get("owner_name"):
        admin_update["full_name"] = updates.get("owner_name")
    if updates.get("owner_phone"):
        admin_update["phone"] = updates.get("owner_phone")  # 🔄 يُنقَل هاتف المالك من التينانت للـuser
    
    if admin_update:
        await db.users.update_one(
            {"tenant_id": tenant_id, "role": UserRole.ADMIN},
            {"$set": admin_update}
        )
    
    # إرسال بريد إلكتروني إذا طُلب ذلك
    if updates.get("send_welcome_email"):
        admin = await db.users.find_one({"tenant_id": tenant_id, "role": UserRole.ADMIN}, {"_id": 0})
        if admin:
            # إعادة تعيين كلمة مرور مؤقتة للإرسال
            temp_password = updates.get("temp_password") or f"{tenant.get('slug')}123"
            await db.users.update_one(
                {"id": admin["id"]},
                {"$set": {"password": hash_password(temp_password),
                          "password_vault": encrypt_plain_password(temp_password)}}
            )
            
            # إرسال البريد في الخلفية
            background_tasks.add_task(
                send_welcome_email,
                recipient_email=admin.get("email"),
                tenant_name=update_data.get("name", tenant.get("name")),
                owner_name=update_data.get("owner_name", tenant.get("owner_name")),
                username=admin.get("email"),
                password=temp_password
            )
    
    updated = await db.tenants.find_one({"id": tenant_id}, {"_id": 0})
    return updated

@router.delete("/super-admin/tenants/{tenant_id}")
async def delete_tenant(tenant_id: str, permanent: bool = False, current_user: dict = Depends(verify_super_admin)):
    """حذف مستأجر (نهائي أو تعطيل) - متسامح: ينظّف أي حساب مرتبط بنفس المعرّف حتى لو لم يكن مستأجراً."""
    tenant = await db.tenants.find_one({"id": tenant_id})

    # إذا لم يوجد كمستأجر، قد يكون المعرّف لحساب مستخدم مزيّف (مثل حسابات الاختراق) — ننظّفه ونرجع نجاحاً
    if not tenant:
        deleted_user = await db.users.delete_one({"id": tenant_id})
        await db.customers.delete_one({"id": tenant_id})
        await db.drivers.delete_one({"id": tenant_id})
        await record_audit("admin.delete_orphan", user=current_user, details={"target_id": tenant_id, "deleted_user": deleted_user.deleted_count})
        return {"message": "تم حذف السجل المرتبط", "deleted": True}

    if permanent:
        # حذف نهائي - حذف جميع بيانات العميل
        await db.users.delete_many({"tenant_id": tenant_id})
        await db.branches.delete_many({"tenant_id": tenant_id})
        await db.categories.delete_many({"tenant_id": tenant_id})
        await db.products.delete_many({"tenant_id": tenant_id})
        await db.orders.delete_many({"tenant_id": tenant_id})
        await db.tables.delete_many({"tenant_id": tenant_id})
        await db.shifts.delete_many({"tenant_id": tenant_id})
        await db.inventory.delete_many({"tenant_id": tenant_id})
        await db.customers.delete_many({"tenant_id": tenant_id})
        await db.drivers.delete_many({"tenant_id": tenant_id})
        await db.suppliers.delete_many({"tenant_id": tenant_id})
        await db.recipes.delete_many({"tenant_id": tenant_id})
        await db.printers.delete_many({"tenant_id": tenant_id})
        await db.tenants.delete_one({"id": tenant_id})
        await record_audit("admin.delete_tenant", user=current_user, details={"tenant_id": tenant_id, "name": tenant.get("name")})

        return {"message": "تم حذف المستأجر نهائياً مع جميع بياناته"}
    else:
        # تعطيل بدلاً من الحذف
        await db.tenants.update_one({"id": tenant_id}, {"$set": {"is_active": False}})
        await db.users.update_many({"tenant_id": tenant_id}, {"$set": {"is_active": False}})
        
        return {"message": "تم تعطيل المستأجر وجميع مستخدميه"}

@router.get("/super-admin/system-users")
async def list_system_users(current_user: dict = Depends(verify_super_admin)):
    """قائمة كل حسابات النظام (super_admin/admin/manager) — لاكتشاف وحذف أي حساب مشبوه/مخترَق."""
    users = await db.users.find(
        {"role": {"$in": [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.GENERAL_MANAGER, UserRole.MANAGER]}},
        {"_id": 0, "password": 0, "password_hash": 0, "secret_key": 0, "super_admin_secret": 0}
    ).sort("created_at", -1).to_list(1000)
    # تمييز الحساب الحالي حتى لا يحذف نفسه
    for u in users:
        u["is_current"] = (u.get("id") == current_user.get("id"))
    return users

@router.delete("/super-admin/system-users/{user_id}")
async def delete_system_user(user_id: str, current_user: dict = Depends(verify_super_admin)):
    """حذف حساب نظام مشبوه/مخترَق (super_admin/admin/manager) — متسامح وغير قابل لحذف الذات."""
    if user_id == current_user.get("id"):
        raise HTTPException(status_code=400, detail="لا يمكنك حذف حسابك الحالي")
    target = await db.users.find_one({"id": user_id}, {"_id": 0, "password": 0})
    # حذف أي توكنات سائق مرتبطة + الحساب نفسه (idempotent)
    result = await db.users.delete_one({"id": user_id})
    await record_audit("admin.delete_system_user", user=current_user,
                       details={"target_id": user_id, "target_name": (target or {}).get("full_name") or (target or {}).get("username"),
                                "target_role": (target or {}).get("role"), "deleted": result.deleted_count})
    if result.deleted_count == 0:
        return {"message": "الحساب غير موجود (تم تنظيفه مسبقاً)", "deleted": False}
    return {"message": "تم حذف الحساب بنجاح", "deleted": True}

@router.get("/super-admin/audit-logs")
async def get_audit_logs(event: Optional[str] = None, limit: int = 200, current_user: dict = Depends(verify_super_admin)):
    """سجل التدقيق الأمني: عمليات الدخول/الفشل/تغيير الصلاحيات/محاولات الوصول المرفوضة مع IP."""
    q = {}
    if event:
        q["event"] = event
    logs = await db.audit_logs.find(q, {"_id": 0, "ts": 0}).sort("created_at", -1).to_list(min(limit, 500))
    return logs

@router.put("/super-admin/tenants/{tenant_id}/reactivate")
async def reactivate_tenant(tenant_id: str, current_user: dict = Depends(verify_super_admin)):
    """إعادة تفعيل مستأجر معطل"""
    tenant = await db.tenants.find_one({"id": tenant_id})
    if not tenant:
        raise HTTPException(status_code=404, detail="المستأجر غير موجود")
    
    # إعادة التفعيل
    await db.tenants.update_one({"id": tenant_id}, {"$set": {"is_active": True}})
    await db.users.update_many({"tenant_id": tenant_id}, {"$set": {"is_active": True}})
    
    # إنشاء إشعار عن التفعيل
    notification_doc = {
        "id": str(uuid.uuid4()),
        "type": "tenant_activated",
        "title": "تم تفعيل عميل ✅",
        "message": f"تم إعادة تفعيل العميل: {tenant.get('name', 'Unknown')}",
        "tenant_id": tenant_id,
        "data": {
            "tenant_name": tenant.get("name"),
            "owner_name": tenant.get("owner_name"),
            "action": "activated"
        },
        "is_read": False,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.notifications.insert_one(notification_doc)
    
    return {"message": "تم إعادة تفعيل المستأجر وجميع مستخدميه"}

@router.put("/super-admin/tenants/{tenant_id}/deactivate")
async def deactivate_tenant(tenant_id: str, current_user: dict = Depends(verify_super_admin)):
    """تعطيل مستأجر"""
    tenant = await db.tenants.find_one({"id": tenant_id})
    if not tenant:
        raise HTTPException(status_code=404, detail="المستأجر غير موجود")
    
    # التعطيل
    await db.tenants.update_one({"id": tenant_id}, {"$set": {"is_active": False}})
    await db.users.update_many({"tenant_id": tenant_id}, {"$set": {"is_active": False}})
    
    # إنشاء إشعار عن التعطيل
    notification_doc = {
        "id": str(uuid.uuid4()),
        "type": "tenant_deactivated",
        "title": "تم تعطيل عميل ⚠️",
        "message": f"تم تعطيل العميل: {tenant.get('name', 'Unknown')}",
        "tenant_id": tenant_id,
        "data": {
            "tenant_name": tenant.get("name"),
            "owner_name": tenant.get("owner_name"),
            "action": "deactivated"
        },
        "is_read": False,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.notifications.insert_one(notification_doc)
    
    return {"message": "تم تعطيل المستأجر وجميع مستخدميه"}


@router.post("/super-admin/tenants/{tenant_id}/reset-password")
async def reset_tenant_admin_password(tenant_id: str, new_password: str, current_user: dict = Depends(verify_super_admin)):
    """إعادة تعيين كلمة مرور مدير المستأجر"""
    
    # التحقق إذا كان النظام الرئيسي
    if tenant_id == "main-system":
        # البحث عن admin النظام الرئيسي
        admin = await db.users.find_one({
            "$or": [{"tenant_id": {"$exists": False}}, {"tenant_id": None}],
            "role": UserRole.ADMIN
        })
        if not admin:
            raise HTTPException(status_code=404, detail="مدير النظام الرئيسي غير موجود")
        
        import uuid as _uuid_ms
        _new_hash_ms = hash_password(new_password)
        _now_ts_ms = datetime.now(timezone.utc).timestamp()
        await db.users.update_one(
            {"id": admin["id"]},
            {"$set": {
                "password": _new_hash_ms,
                "password_hash": _new_hash_ms,  # ✅ login يفحص password_hash أولاً
                "password_vault": encrypt_plain_password(new_password),
                "password_changed_at": _now_ts_ms,  # ✅ إبطال التوكنات
                "active_session_id": f"invalidated-{_uuid_ms.uuid4()}",  # ✅ خروج قسري
            }}
        )
        
        return {"message": "تم إعادة تعيين كلمة مرور مدير النظام الرئيسي", "email": admin["email"], "force_logout": True}
    
    # للعملاء العاديين
    tenant = await db.tenants.find_one({"id": tenant_id})
    if not tenant:
        raise HTTPException(status_code=404, detail="المستأجر غير موجود")
    
    # البحث عن admin المستأجر
    admin = await db.users.find_one({"tenant_id": tenant_id, "role": UserRole.ADMIN})
    if not admin:
        raise HTTPException(status_code=404, detail="مدير المستأجر غير موجود")
    
    import uuid as _uuid_ta
    new_hash = hash_password(new_password)
    _now_ts_ta = datetime.now(timezone.utc).timestamp()
    await db.users.update_one(
        {"id": admin["id"]},
        {"$set": {
            "password": new_hash,
            "password_hash": new_hash,
            "password_vault": encrypt_plain_password(new_password),
            "password_changed_at": _now_ts_ta,  # ✅ إبطال التوكنات
            "active_session_id": f"invalidated-{_uuid_ta.uuid4()}",  # ✅ خروج قسري
        }}
    )
    
    return {"message": "تم إعادة تعيين كلمة المرور", "email": admin["email"], "force_logout": True}

# إعدادات المالك
@router.get("/super-admin/owner-settings")
async def get_owner_settings(current_user: dict = Depends(verify_super_admin)):
    """جلب إعدادات المالك"""
    owner = await db.users.find_one({"role": "super_admin"}, {"_id": 0, "email": 1, "username": 1})
    return owner or {}

@router.put("/super-admin/owner-settings")
async def update_owner_settings(
    settings: dict,
    current_user: dict = Depends(verify_super_admin)
):
    """تحديث إعدادات المالك (كلمة المرور والمفتاح السري) — يُرسل تلقائياً بعد الحفظ."""
    try:
        update_data = {}
        plain_pw = None
        plain_secret = None
        
        if settings.get("password"):
            plain_pw = settings["password"]
            hashed_password = bcrypt.hashpw(plain_pw.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
            update_data["password"] = hashed_password
            update_data["password_hash"] = hashed_password  # ✅ login يفحص password_hash أولاً
            update_data["password_vault"] = encrypt_plain_password(plain_pw)  # حفظ الأصل مشفَّراً
        
        if settings.get("secret_key"):
            plain_secret = settings["secret_key"]
            update_data["secret_key"] = plain_secret
            update_data["super_admin_secret"] = plain_secret
            update_data["secret_key_vault"] = encrypt_plain_password(plain_secret)
        
        if not update_data:
            raise HTTPException(status_code=400, detail="لم يتم تقديم أي بيانات للتحديث")
        
        # 🔒 إبطال جميع الجلسات الحالية فور تغيير كلمة المرور أو المفتاح السري
        # - password_changed_at → يبطل توكنات JWT عبر فحص iat في get_current_user
        # - active_session_id → توكن مسموم لضمان الخروج القسري حتى لو كان النظام يعتمد على sid
        import uuid as _uuid_owner
        _now_ts_owner = datetime.now(timezone.utc).timestamp()
        update_data["password_changed_at"] = _now_ts_owner
        update_data["active_session_id"] = f"invalidated-{_uuid_owner.uuid4()}"
        
        result = await db.users.update_one(
            {"role": "super_admin"},
            {"$set": update_data}
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="لم يتم العثور على حساب المالك")
        
        # 🔥 إرسال تلقائي (بلا زر) — يخصّ مالك النظام فقط بعد تعديل كلمة المرور و/أو المفتاح
        auto_send_result = {"email_sent": False, "whatsapp_sent": False, "sms_sent": False}
        try:
            recovery_emails = await get_owner_recovery_emails()
            owner_user = await db.users.find_one({"role": "super_admin"}, {"_id": 0}) or {}
            owner_phone = owner_user.get("phone") or os.environ.get("OWNER_ALERT_PHONE", "")
            
            # بناء محتوى الرسالة
            _lines_pw = f"🔑 كلمة المرور الجديدة: {plain_pw}\n" if plain_pw else ""
            _lines_sk = f"🗝️ المفتاح السري: {plain_secret}\n" if plain_secret else ""
            email_title = "🔐 تحديث بيانات دخول مالك النظام"
            email_body_html = (
                f"<p style='margin:0 0 12px 0'>تم تحديث بيانات دخولك بنجاح على منصة Maestro EGP.</p>"
                f"<div style='background:#eff6ff;border:1px solid #3B82F6;padding:16px;border-radius:10px;font-family:monospace;color:#111'>"
                + (f"<div>🔑 كلمة المرور الجديدة: <b>{plain_pw}</b></div>" if plain_pw else "")
                + (f"<div style='margin-top:8px'>🗝️ المفتاح السري: <b>{plain_secret}</b></div>" if plain_secret else "")
                + f"</div>"
                f"<p style='margin-top:14px;color:#64748b;font-size:13px'>⚠️ احتفظ بهذه البيانات في مكان آمن.</p>"
            )
            html = build_branded_email_html(email_title, email_body_html, severity="info")
            wa_body = (
                f"تم تحديث بيانات دخول مالك النظام على Maestro EGP.\n\n"
                f"{_lines_pw}{_lines_sk}\n"
                f"⚠️ احتفظ بهذه البيانات في مكان آمن."
            )
            
            # بريد + واتساب متزامنان
            async def _email():
                if not recovery_emails:
                    return False
                return await send_system_email(
                    recovery_emails, "[Maestro EGP] " + email_title, html,
                    purpose="owner_credentials_update",
                )
            async def _wa():
                if not owner_phone:
                    return False, "no_phone"
                if not await _wa_free.is_connected():
                    return False, "wa_not_connected"
                e164 = await _phone_to_e164(owner_phone)
                if not e164:
                    return False, "invalid_phone"
                ok, err = await _wa_free.send_message(
                    e164, wa_body, purpose="owner_credentials_update",
                    title=email_title, with_logo=True,
                )
                return ok, err
            
            _e_res, _w_res = await asyncio.gather(_email(), _wa(), return_exceptions=True)
            if isinstance(_e_res, bool):
                auto_send_result["email_sent"] = _e_res
            if isinstance(_w_res, tuple):
                auto_send_result["whatsapp_sent"] = bool(_w_res[0])
            
            # SMS fallback إن فشل الواتساب
            if not auto_send_result["whatsapp_sent"] and owner_phone:
                try:
                    from twilio_verify import send_sms, _sms_configured
                    if _sms_configured():
                        e164 = await _phone_to_e164(owner_phone)
                        if e164:
                            sms_body = f"Maestro EGP - تحديث دخول:\n" + (f"Password: {plain_pw}\n" if plain_pw else "") + (f"Secret: {plain_secret}" if plain_secret else "")
                            ok_sms, _ = await send_sms(e164, sms_body)
                            auto_send_result["sms_sent"] = bool(ok_sms)
                except Exception:
                    pass
        except Exception as _auto_err:
            logger.warning(f"auto-send after owner credentials update failed: {_auto_err}")
        
        return {
            "message": "تم تحديث إعدادات المالك بنجاح",
            "auto_delivery": auto_send_result,
            "force_logout": True,  # ✅ الفرونت يجب أن يخرج المالك ويعيد توجيهه لتسجيل الدخول
            "require_2fa": True,   # ✅ الدخول الجديد سيتطلب OTP كالعادة
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating owner settings: {str(e)}")
        raise HTTPException(status_code=500, detail=f"خطأ في التحديث: {str(e)}")

@router.get("/super-admin/stats")
async def get_super_admin_stats(current_user: dict = Depends(verify_super_admin)):
    """إحصائيات شاملة للـ Super Admin"""
    
    # إجمالي العملاء (بدون الحسابات التجريبية)
    total_tenants = await db.tenants.count_documents({"is_demo": {"$ne": True}})
    active_tenants = await db.tenants.count_documents({"is_active": True, "is_demo": {"$ne": True}})
    
    # عدد الحسابات التجريبية
    demo_tenants = await db.tenants.count_documents({"$or": [{"is_demo": True}, {"subscription_type": "demo"}]})
    
    # جلب IDs جميع العملاء الموجودين
    all_tenants = await db.tenants.find({}, {"id": 1}).to_list(1000)
    valid_tenant_ids = [t["id"] for t in all_tenants]
    
    # استبعاد مستخدمي النظام الرئيسي (super_admin و admin و default) والحسابات التجريبية
    # جلب IDs الحسابات التجريبية
    demo_tenant_ids = await db.tenants.find(
        {"$or": [{"is_demo": True}, {"subscription_type": "demo"}]},
        {"id": 1}
    ).to_list(100)
    demo_ids = [t["id"] for t in demo_tenant_ids]
    
    total_users = await db.users.count_documents({
        "role": {"$nin": [UserRole.SUPER_ADMIN, UserRole.ADMIN]},
        "tenant_id": {"$exists": True, "$ne": None, "$ne": "default", "$nin": demo_ids}
    })
    
    # حساب الطلبات فقط للعملاء الموجودين فعلاً (استبعاد الطلبات اليتيمة)
    total_orders = await db.orders.count_documents({
        "tenant_id": {"$in": valid_tenant_ids, "$nin": demo_ids}
    })
    
    # المبيعات الإجمالية - فقط للعملاء الموجودين فعلاً
    sales_cursor = db.orders.aggregate([
        {"$match": {
            "status": {"$ne": "cancelled"}, 
            "tenant_id": {"$in": valid_tenant_ids, "$nin": demo_ids}
        }},
        {"$group": {"_id": None, "total": {"$sum": "$total"}}}
    ])
    sales_result = await sales_cursor.to_list(1)
    total_sales = sales_result[0]["total"] if sales_result else 0
    
    # المستأجرين حسب نوع الاشتراك (بدون التجريبي)
    subscription_stats = await db.tenants.aggregate([
        {"$match": {"is_demo": {"$ne": True}}},
        {"$group": {"_id": "$subscription_type", "count": {"$sum": 1}}}
    ]).to_list(10)
    
    # أحدث المستأجرين
    recent_tenants = await db.tenants.find({}, {"_id": 0}).sort("created_at", -1).limit(5).to_list(5)
    
    return {
        "total_tenants": total_tenants,
        "active_tenants": active_tenants,
        "inactive_tenants": total_tenants - active_tenants,
        "demo_tenants": demo_tenants,
        "total_users": total_users,
        "total_orders": total_orders,
        "total_sales": total_sales,
        "subscription_stats": {item["_id"]: item["count"] for item in subscription_stats},
        "recent_tenants": recent_tenants
    }

# ==================== نقاط نهاية الإشعارات ====================

@router.get("/super-admin/notifications")
async def get_notifications(
    current_user: dict = Depends(verify_super_admin),
    unread_only: bool = False,
    limit: int = 50
):
    """جلب إشعارات المالك"""
    query = {}
    if unread_only:
        query["is_read"] = False
    
    notifications = await db.notifications.find(
        query, {"_id": 0}
    ).sort("created_at", -1).limit(limit).to_list(limit)
    
    # عدد الإشعارات غير المقروءة
    unread_count = await db.notifications.count_documents({"is_read": False})
    
    return {
        "notifications": notifications,
        "unread_count": unread_count
    }

@router.put("/super-admin/notifications/{notification_id}/read")
async def mark_notification_read(notification_id: str, current_user: dict = Depends(verify_super_admin)):
    """تعليم إشعار كمقروء"""
    result = await db.notifications.update_one(
        {"id": notification_id},
        {"$set": {"is_read": True}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="الإشعار غير موجود")
    return {"message": "تم تعليم الإشعار كمقروء"}

@router.put("/super-admin/notifications/read-all")
async def mark_all_notifications_read(current_user: dict = Depends(verify_super_admin)):
    """تعليم جميع الإشعارات كمقروءة"""
    await db.notifications.update_many(
        {"is_read": False},
        {"$set": {"is_read": True}}
    )
    return {"message": "تم تعليم جميع الإشعارات كمقروءة"}

@router.delete("/super-admin/notifications/{notification_id}")
async def delete_notification(notification_id: str, current_user: dict = Depends(verify_super_admin)):
    """حذف إشعار"""
    result = await db.notifications.delete_one({"id": notification_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="الإشعار غير موجود")
    return {"message": "تم حذف الإشعار"}

@router.delete("/super-admin/notifications")
async def clear_all_notifications(current_user: dict = Depends(verify_super_admin)):
    """حذف جميع الإشعارات"""
    await db.notifications.delete_many({})
    return {"message": "تم حذف جميع الإشعارات"}

# ==================== إعدادات الإشعارات ====================

@router.get("/super-admin/notification-settings")
async def get_notification_settings(current_user: dict = Depends(verify_super_admin)):
    """جلب إعدادات الإشعارات"""
    settings = await db.settings.find_one({"type": "notification_settings"}, {"_id": 0})
    
    if not settings:
        # إعدادات افتراضية
        default_settings = {
            "type": "notification_settings",
            "value": {
                "days_before_expiry": 15,
                "email_notifications": False,
                "push_notifications": True,
                "notify_new_tenant": True,
                "notify_tenant_status": True
            }
        }
        await db.settings.insert_one(default_settings)
        return default_settings["value"]
    
    return settings.get("value", {})

@router.put("/super-admin/notification-settings")
async def update_notification_settings(settings: NotificationSettings, current_user: dict = Depends(verify_super_admin)):
    """تحديث إعدادات الإشعارات"""
    await db.settings.update_one(
        {"type": "notification_settings"},
        {"$set": {"value": settings.model_dump()}},
        upsert=True
    )
    return {"message": "تم حفظ إعدادات الإشعارات", "settings": settings.model_dump()}

# ==================== فحص الاشتراكات المنتهية ====================

@router.get("/super-admin/expiring-subscriptions")
async def get_expiring_subscriptions(current_user: dict = Depends(verify_super_admin)):
    """جلب الاشتراكات القريبة من الانتهاء"""
    
    # جلب إعدادات الإشعارات
    settings = await db.settings.find_one({"type": "notification_settings"}, {"_id": 0})
    days_before = 15
    if settings and settings.get("value"):
        days_before = settings["value"].get("days_before_expiry", 15)
    
    # حساب التاريخ المستهدف
    target_date = (datetime.now(timezone.utc) + timedelta(days=days_before)).isoformat()
    now = datetime.now(timezone.utc).isoformat()
    
    # جلب الاشتراكات القريبة من الانتهاء
    expiring = await db.tenants.find({
        "is_active": True,
        "expires_at": {"$lte": target_date, "$gte": now}
    }, {"_id": 0}).to_list(100)
    
    # جلب الاشتراكات المنتهية بالفعل
    expired = await db.tenants.find({
        "is_active": True,
        "expires_at": {"$lt": now}
    }, {"_id": 0}).to_list(100)
    
    return {
        "expiring_soon": expiring,
        "already_expired": expired,
        "days_before_alert": days_before
    }

# ==================== السجل الأمني للمالك الأعلى (Security Log) ====================

@router.get("/super-admin/security-log")
async def get_security_log(current_user: dict = Depends(verify_super_admin), limit: int = 100):
    """السجل الأمني — خاص بمالك النظام الأعلى فقط (ليس للعملاء):
    أحداث الدخول/الخروج/الانتحال، حالة العملاء (نشط/معطل)، وتنبيهات الاشتراك (المتبقي)."""
    now = datetime.now(timezone.utc)

    # أحداث الأمان من سجل المراقبة (عبر كل العملاء)
    events = await db.audit_logs.find({}, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
    tenant_ids = list({e.get("tenant_id") for e in events if e.get("tenant_id")})
    tdocs = await db.tenants.find(
        {"id": {"$in": tenant_ids}}, {"_id": 0, "id": 1, "name": 1, "name_ar": 1, "slug": 1}
    ).to_list(2000)
    tmap = {t["id"]: (t.get("name") or t.get("name_ar") or t.get("slug")) for t in tdocs}
    for e in events:
        e["tenant_name"] = tmap.get(e.get("tenant_id")) or e.get("tenant_id") or "—"

    # ملخص حالة العملاء
    all_tenants = await db.tenants.find(
        {}, {"_id": 0, "id": 1, "name": 1, "name_ar": 1, "slug": 1, "is_active": 1,
             "expires_at": 1, "subscription_type": 1, "is_demo": 1}
    ).to_list(5000)
    active = [t for t in all_tenants if t.get("is_active")]
    disabled = [t for t in all_tenants if not t.get("is_active")]

    # تنبيهات الاشتراك (المتبقي / المنتهي)
    settings = await db.settings.find_one({"type": "notification_settings"}, {"_id": 0})
    days_before = (settings or {}).get("value", {}).get("days_before_expiry", 15) if settings else 15
    expiring, expired = [], []
    for t in active:
        exp = t.get("expires_at")
        if not exp:
            continue
        try:
            expdt = datetime.fromisoformat(str(exp).replace("Z", "+00:00"))
        except Exception:
            continue
        days_left = (expdt.date() - now.date()).days
        rec = {
            "id": t["id"],
            "name": t.get("name") or t.get("name_ar") or t.get("slug"),
            "expires_at": exp,
            "days_left": days_left,
            "subscription_type": t.get("subscription_type"),
        }
        if days_left < 0:
            expired.append(rec)
        elif days_left <= days_before:
            expiring.append(rec)
    expiring.sort(key=lambda x: x["days_left"])
    expired.sort(key=lambda x: x["days_left"])

    return {
        "events": events,
        "summary": {
            "total": len(all_tenants),
            "active": len(active),
            "disabled": len(disabled),
            "expiring_soon": len(expiring),
            "expired": len(expired),
        },
        "expiring_soon": expiring,
        "expired": expired,
    }



# ==================== حظر عناوين IP من السجل الأمني ====================

@router.get("/super-admin/blocked-ips")
async def list_blocked_ips(current_user: dict = Depends(verify_super_admin)):
    """قائمة عناوين IP المحظورة"""
    docs = await db.blocked_ips.find({}, {"_id": 0}).sort("blocked_at", -1).to_list(1000)
    return {"blocked": docs}


@router.post("/super-admin/block-ip")
async def block_ip(payload: dict = Body(...), request: Request = None, current_user: dict = Depends(verify_super_admin)):
    """حظر عنوان IP — يُمنع من الوصول للنظام نهائياً"""
    ip = sanitize_text(payload.get("ip"), 64)
    if not ip:
        raise HTTPException(status_code=400, detail="عنوان IP مطلوب")
    # التحقق من صحة صيغة عنوان IP (منع إدخال قيم غير صالحة)
    import ipaddress as _ipaddr
    try:
        _ipaddr.ip_address(ip)
    except ValueError:
        raise HTTPException(status_code=400, detail="عنوان IP غير صالح")
    # منع حظر عنوان المالك الحالي (تجنّب قفل النفس خارج النظام)
    own_ip = _client_ip(request) if request else None
    if ip == own_ip:
        raise HTTPException(status_code=400, detail="لا يمكنك حظر عنوانك الحالي")
    await db.blocked_ips.update_one(
        {"ip": ip},
        {"$set": {
            "ip": ip,
            "reason": sanitize_text(payload.get("reason"), 200),
            "blocked_by": current_user.get("name") or current_user.get("email"),
            "blocked_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )
    await _refresh_blocked_ips(force=True)
    try:
        await record_audit("security.ip_blocked", request=request, user=current_user, details={"ip": ip})
    except Exception:
        pass
    return {"success": True, "ip": ip}


@router.post("/super-admin/unblock-ip")
async def unblock_ip(payload: dict = Body(...), request: Request = None, current_user: dict = Depends(verify_super_admin)):
    """إلغاء حظر عنوان IP"""
    ip = sanitize_text(payload.get("ip"), 64)
    if not ip:
        raise HTTPException(status_code=400, detail="عنوان IP مطلوب")
    await db.blocked_ips.delete_one({"ip": ip})
    # مسح عدّاد محاولات الدخول المرتبطة بهذا العنوان (إعادة ضبط كاملة)
    try:
        await db.login_attempts.delete_many({"ip": ip})
    except Exception:
        pass
    await _refresh_blocked_ips(force=True)
    try:
        await record_audit("security.ip_unblocked", request=request, user=current_user, details={"ip": ip})
    except Exception:
        pass
    return {"success": True, "ip": ip}


# ==================== إدارة أمان المصادقة الثنائية (للمالك) ====================

@router.get("/super-admin/trusted-devices")
async def list_trusted_devices(current_user: dict = Depends(verify_super_admin)):
    """قائمة الأجهزة الموثوقة (موظفون/سائقون/زبائن) مع بيانات مالكيها."""
    docs = await db.trusted_devices.find({"revoked": {"$ne": True}}, {"_id": 0}).sort("last_seen_at", -1).to_list(2000)
    # إثراء بالاسم
    for d in docs:
        st = d.get("subject_type")
        sid = d.get("subject_id")
        try:
            if st == "user":
                u = await db.users.find_one({"id": sid}, {"_id": 0, "full_name": 1, "email": 1, "role": 1})
                if u:
                    d["owner_name"] = u.get("full_name") or u.get("email")
                    d["owner_role"] = u.get("role")
            elif st == "driver":
                dr = await db.drivers.find_one({"id": sid}, {"_id": 0, "name": 1, "phone": 1})
                if dr:
                    d["owner_name"] = dr.get("name")
            elif st == "customer":
                d["owner_name"] = sid
        except Exception:
            pass
    return {"devices": docs, "count": len(docs)}

@router.post("/super-admin/revoke-device")
async def revoke_trusted_device(payload: dict = Body(...), request: Request = None, current_user: dict = Depends(verify_super_admin)):
    """إلغاء توثيق جهاز واحد — سيُطلب التحقق مجدداً عند الدخول التالي."""
    device_id = sanitize_text(payload.get("device_id"), 128)
    subject_id = payload.get("subject_id")
    q = {}
    if device_id:
        q["device_id"] = device_id
    if subject_id:
        q["subject_id"] = str(subject_id)
    if not q:
        raise HTTPException(status_code=400, detail="معرّف الجهاز أو المستخدم مطلوب")
    res = await db.trusted_devices.delete_many(q)
    await record_audit("security.device_revoked", request=request, user=current_user, details=q)
    return {"success": True, "removed": res.deleted_count}

@router.get("/super-admin/pending-2fa-codes")
async def list_pending_2fa_codes(current_user: dict = Depends(verify_super_admin)):
    """رموز التحقق المعلّقة (عند تعذّر الإرسال عبر SMS/واتساب/البريد) — يظهرها المالك مؤقتاً."""
    now = datetime.now(timezone.utc).isoformat()
    docs = await db.verification_sessions.find(
        {"pending_delivery": True, "consumed": False, "expires_at": {"$gt": now}},
        {"_id": 0, "id": 1, "subject_type": 1, "subject_name": 1, "channel": 1,
         "destination": 1, "created_at": 1, "expires_at": 1}
    ).sort("created_at", -1).to_list(200)
    return {"pending": docs, "count": len(docs),
            "twilio_configured": _twilio_verify.is_configured()}

@router.get("/super-admin/security-status")
async def security_status(current_user: dict = Depends(verify_super_admin)):
    """حالة تكاملات الأمان (لعرضها في لوحة المالك)."""
    return {
        "two_fa_enabled": await two_fa_enabled(),
        "twilio_configured": _twilio_verify.is_configured(),
        "whatsapp_connected": await _wa_free.is_connected(),
        "email_configured": await email_transport_configured(),
        "owner_recovery_emails": OWNER_RECOVERY_EMAILS,
        "max_login_fails": MAX_LOGIN_FAILS,
        "owner_ips_saved": await db.owner_trusted_ips.count_documents({}),
        "blocked_ips": await db.blocked_ips.count_documents({}),
        "trusted_devices": await db.trusted_devices.count_documents({"revoked": {"$ne": True}}),
    }

@router.get("/super-admin/2fa-readiness")
async def two_fa_readiness(current_user: dict = Depends(verify_super_admin)):
    """جاهزية التفعيل: المستخدمون/السائقون الناقصة بياناتهم لاستلام رمز التحقق."""
    users = await db.users.find({"role": {"$ne": UserRole.SUPER_ADMIN}}, {"_id": 0, "id": 1, "full_name": 1, "email": 1, "phone": 1, "role": 1}).to_list(2000)
    users_no_phone = [{"id": u.get("id"), "name": u.get("full_name") or u.get("email"), "email": u.get("email"), "role": u.get("role")}
                      for u in users if not (u.get("phone") or "").strip()]
    users_no_contact = [u for u in users_no_phone if not (dict(u).get("email") or "").strip()]
    drivers = await db.drivers.find({}, {"_id": 0, "id": 1, "name": 1, "phone": 1}).to_list(2000)
    drivers_no_phone = [{"id": d.get("id"), "name": d.get("name")} for d in drivers if not (d.get("phone") or "").strip()]
    return {
        "twilio_configured": _twilio_verify.is_configured(),
        "email_configured": await email_transport_configured(),
        "total_users": len(users),
        "users_without_phone": users_no_phone,          # سيستلمون عبر البريد
        "users_without_any_contact": users_no_contact,  # لا يمكن إرسال رمز لهم
        "drivers_without_phone": drivers_no_phone,       # حرِج: السائق يستلم عبر الهاتف فقط
    }

@router.get("/super-admin/security-2fa-readiness")
async def check_2fa_readiness(current_user: dict = Depends(verify_super_admin)):
    """🛡 فحص وقائي قبل تفعيل 2FA — يمنع حبس أي مستخدم خارج النظام.
    
    يفحص كل المستخدمين النشطين + الحسابات الحساسة (admin/manager/cashier/…) ويعيد:
    - المستخدمون الجاهزون (لديهم قناة صالحة: واتساب متصل + هاتف صحيح، أو بريد)
    - المستخدمون المُعرَّضون للحبس (بلا هاتف صحيح + بلا بريد) → إن كان Twilio غير مُهيّأ، هؤلاء لن يدخلوا!
    - إمكانيات القنوات الحالية (واتساب متصل، بريد مُهيّأ، Twilio مُهيّأ)
    """
    wa_connected = await _wa_free.is_connected()
    # فحص إعداد البريد (env + DB): SMTP أو SendGrid
    _email_cfg = await _load_email_config()
    email_ready = bool(
        (_email_cfg.get("smtp_host") and _email_cfg.get("smtp_user") and _email_cfg.get("smtp_password"))
        or _email_cfg.get("sendgrid_api_key")
    )
    twilio_ready = _twilio_verify.is_configured()
    
    ready_users = []
    at_risk_users = []
    total = 0
    async for u in db.users.find({"is_active": {"$ne": False}},
                                 {"_id": 0, "id": 1, "email": 1, "phone": 1, "full_name": 1,
                                  "username": 1, "role": 1, "tenant_id": 1}):
        total += 1
        phone_ok = bool((u.get("phone") or "").strip() and len((u.get("phone") or "").strip()) >= 8)
        email_ok = bool("@" in (u.get("email") or "") and email_ready)
        wa_ok = phone_ok and wa_connected
        sms_ok = phone_ok and twilio_ready
        has_channel = wa_ok or email_ok or sms_ok
        entry = {
            "id": u.get("id"),
            "name": u.get("full_name") or u.get("username"),
            "role": u.get("role"),
            "tenant_id": u.get("tenant_id"),
            "email": u.get("email"),
            "phone_masked": _mask_phone(u.get("phone") or "") if phone_ok else None,
            "channels": [c for c, ok in [("whatsapp", wa_ok), ("email", email_ok), ("sms", sms_ok)] if ok],
        }
        if has_channel:
            ready_users.append(entry)
        else:
            at_risk_users.append(entry)
    
    return {
        "channels_available": {
            "whatsapp_connected": wa_connected,
            "email_configured": email_ready,
            "twilio_configured": twilio_ready,
        },
        "total_users": total,
        "ready_count": len(ready_users),
        "at_risk_count": len(at_risk_users),
        "at_risk_users": at_risk_users,
        "recommendation": (
            "🟢 آمن للتفعيل — كل المستخدمين لديهم قناة استلام صحيحة" if not at_risk_users else
            f"⚠️ لا تفعّل قبل حل هذا! {len(at_risk_users)} مستخدم بلا قناة استلام — سيُحبَسون خارج النظام."
        )
    }


@router.post("/super-admin/security-2fa-backup-codes")
async def generate_backup_codes(current_user: dict = Depends(verify_super_admin), request: Request = None):
    """🆘 توليد 5 رموز طوارئ للسوبر أدمن — كنجاة أخيرة عند فشل كل قنوات الرمز.
    
    الرموز صالحة لمرة واحدة كل واحدة، تُخزَّن مُشفَّرة (SHA256).
    يُعرَض النص الخام مرة واحدة فقط في هذا الرد — يجب على المالك حفظها في مكان آمن (ورقة/خزنة).
    """
    import secrets, hashlib
    codes = []
    hashed = []
    for _ in range(5):
        raw = secrets.token_hex(4).upper()  # 8 حروف/أرقام
        formatted = f"{raw[:4]}-{raw[4:]}"
        codes.append(formatted)
        hashed.append(hashlib.sha256(formatted.encode()).hexdigest())
    await db.security_config.update_one(
        {"id": "global"},
        {"$set": {
            "backup_codes": hashed,
            "backup_codes_generated_at": datetime.now(timezone.utc).isoformat(),
            "backup_codes_generated_by": current_user.get("email"),
        }},
        upsert=True,
    )
    await record_audit("security.2fa_backup_codes_generated", request=request, user=current_user,
                       details={"count": len(codes)})
    return {
        "success": True,
        "codes": codes,
        "warning": "احفظ هذه الرموز في مكان آمن الآن — لن يُعرَض النص الخام مرة أخرى. كل رمز صالح لمرة واحدة.",
        "instructions": "لاستخدامها: عند شاشة رمز التحقق، اضغط 'استخدم رمز طوارئ' وأدخل أياً من هذه الرموز.",
    }


@router.post("/super-admin/security-2fa-toggle")
async def toggle_two_fa(payload: dict = Body(...), request: Request = None, current_user: dict = Depends(verify_super_admin)):
    """تنشيط/إيقاف التحقق الإلزامي. عند التنشيط: يُخرج جميع المستخدمين والسائقين
    ويُلغى توثيق كل الأجهزة لإجبار الجميع على التحقق فوراً."""
    enabled = bool(payload.get("enabled", False))
    now_iso = datetime.now(timezone.utc).isoformat()
    update = {"id": "global", "two_fa_enabled": enabled, "updated_at": now_iso,
              "updated_by": current_user.get("email")}
    result = {"two_fa_enabled": enabled}
    if enabled:
        # إخراج الجميع فوراً: إبطال كل التوكنات القديمة + إلغاء توثيق الأجهزة + جلسات السائقين
        update["sessions_valid_after"] = now_iso
        update["activated_at"] = now_iso
        dev = await db.trusted_devices.delete_many({})
        drv = await db.driver_tokens.delete_many({})
        result["devices_revoked"] = dev.deleted_count
        result["driver_sessions_cleared"] = drv.deleted_count
    await db.security_config.update_one({"id": "global"}, {"$set": update}, upsert=True)
    await _refresh_security_config(force=True)
    await record_audit("security.2fa_toggle", request=request, user=current_user,
                       details={"enabled": enabled})
    return {"success": True, **result}

@router.get("/super-admin/whatsapp/status")
async def wa_status(current_user: dict = Depends(verify_super_admin)):
    """حالة اتصال الواتساب المجاني + رمز QR للربط."""
    return await _wa_free.status()

@router.post("/super-admin/whatsapp/logout")
async def wa_logout_ep(request: Request = None, current_user: dict = Depends(verify_super_admin)):
    """فك ربط الواتساب (يتطلب مسح QR جديد لاحقاً)."""
    await record_audit("security.whatsapp_logout", request=request, user=current_user)
    return await _wa_free.logout()

@router.post("/super-admin/whatsapp/reconnect")
async def wa_reconnect_ep(current_user: dict = Depends(verify_super_admin)):
    return await _wa_free.reconnect()

@router.post("/super-admin/whatsapp/pair")
async def wa_pair_ep(payload: dict = Body(...), request: Request = None, current_user: dict = Depends(verify_super_admin)):
    """ربط الواتساب برقم الهاتف (Pairing Code) — بديل مسح QR.
    المالك يُدخل رقم هاتفه، ونُرجع رمزاً يُدخله في: واتساب ← الأجهزة المرتبطة ← ربط جهاز ← ربط برقم الهاتف.
    force=true يُصفّر جلسة الخدمة أولاً (يفيد إن كانت الجلسة عالقة على 'Connection Closed')."""
    phone = sanitize_text(payload.get("phone"), 32)
    force = bool(payload.get("force"))
    if not phone:
        raise HTTPException(status_code=400, detail="رقم الهاتف مطلوب")
    e164 = await _phone_to_e164(phone)
    res = await _wa_free.request_pairing_code(e164, force=force)
    await record_audit("security.whatsapp_pair_request", request=request, user=current_user, details={"phone": _mask_phone(e164), "force": force})
    return res


@router.post("/super-admin/whatsapp/reset")
async def wa_reset_ep(request: Request = None, current_user: dict = Depends(verify_super_admin)):
    """تصفير كامل لجلسة الواتساب (auth dir) — يُستخدم عند العلوق على 'Connection Closed' لأكثر من دقيقة."""
    res = await _wa_free.reset_session()
    await record_audit("security.whatsapp_reset", request=request, user=current_user)
    return res

@router.post("/super-admin/whatsapp/test")
async def wa_test_ep(payload: dict = Body(...), current_user: dict = Depends(verify_super_admin)):
    """إرسال رسالة تجربة عبر الواتساب لرقم محدد."""
    phone = sanitize_text(payload.get("phone"), 32)
    if not phone:
        raise HTTPException(status_code=400, detail="الرقم مطلوب")
    e164 = await _phone_to_e164(phone)
    ok, err = await _wa_free.send_message(
        e164,
        "الواتساب مرتبط ويعمل بنجاح ✅",
        purpose="test",
        sent_by=current_user.get("id"),
        title="🧪 اختبار الاتصال",
    )
    return {"success": ok, "error": err, "phone": e164}

@router.get("/super-admin/whatsapp/messages")
async def wa_messages_list(
    limit: int = 50,
    status: Optional[str] = None,
    purpose: Optional[str] = None,
    current_user: dict = Depends(verify_super_admin)
):
    """جلب آخر رسائل الواتساب المُرسَلة من النظام (سجل شامل للمالك).
    
    - status: sent | failed (فلترة)
    - purpose: otp | order_alert | forgotten_shift | test | other (فلترة)
    - limit: بحد أقصى 200 رسالة
    """
    limit = max(1, min(int(limit or 50), 200))
    q = {}
    if status in ("sent", "failed"):
        q["status"] = status
    if purpose:
        q["purpose"] = purpose
    msgs = await db.wa_messages.find(q, {"_id": 0}).sort("sent_at", -1).limit(limit).to_list(limit)
    # إحصائيات موجزة
    total_sent = await db.wa_messages.count_documents({"status": "sent"})
    total_failed = await db.wa_messages.count_documents({"status": "failed"})
    total_all = await db.wa_messages.count_documents({})
    return {
        "messages": msgs,
        "counts": {
            "total": total_all,
            "sent": total_sent,
            "failed": total_failed,
        }
    }

# أنماط بيانات الاختبار الوهمية (لا تمسّ الأسماء العربية الحقيقية)
_DUMMY_NAME_PATTERNS = _re_rbac.compile(r"(تجريبي|اختبار|dummy|test|demo|probe|rw\s*probe|سائق\s*[0-9]+)", _re_rbac.IGNORECASE)
_DUMMY_EXACT_NAMES = {
    "سائق 1", "سائق 2", "سائق أحمد", "سائق علي", "زبون تجريبي",
    "موظف سلفة سابقة", "كاشير اختبار", "مورد تجريبي أ", "مورد تجريبي ب",
}

def _is_dummy_name(name: str) -> bool:
    if not name:
        return False
    n = str(name).strip()
    if n in _DUMMY_EXACT_NAMES:
        return True
    return bool(_DUMMY_NAME_PATTERNS.search(n))

@router.post("/super-admin/purge-dummy-data")
async def purge_dummy_data(payload: dict = Body(default={}), request: Request = None, current_user: dict = Depends(verify_super_admin)):
    """يحذف بيانات الاختبار الوهمية (سائقون/موظفون/زبائن/موردون) دون المساس بالبيانات الحقيقية.
    dry_run=true للمعاينة فقط."""
    dry_run = bool(payload.get("dry_run", False))
    report = {"drivers": [], "employees": [], "customers": [], "suppliers": []}

    async def _scan(coll, name_fields, extra_ids=None):
        found = []
        docs = await db[coll].find({}, {"_id": 0}).to_list(5000)
        for d in docs:
            nm = None
            for f in name_fields:
                if d.get(f):
                    nm = d.get(f); break
            did = str(d.get("id", ""))
            is_dummy = _is_dummy_name(nm) or (did.startswith("demo-drv")) or (extra_ids and did in extra_ids)
            if is_dummy:
                found.append({"id": d.get("id"), "name": nm, "phone": d.get("phone")})
        return found

    report["drivers"] = await _scan("drivers", ["name", "full_name"])
    report["employees"] = await _scan("employees", ["name", "full_name"])
    report["customers"] = await _scan("customers", ["name", "full_name"])
    report["suppliers"] = await _scan("suppliers", ["name"])

    deleted = {"drivers": 0, "employees": 0, "customers": 0, "suppliers": 0}
    if not dry_run:
        for coll in ("drivers", "employees", "customers", "suppliers"):
            ids = [x["id"] for x in report[coll] if x.get("id")]
            if ids:
                res = await db[coll].delete_many({"id": {"$in": ids}})
                deleted[coll] = res.deleted_count
        await record_audit("security.purge_dummy_data", request=request, user=current_user,
                           details={"deleted": deleted})
    total_found = sum(len(v) for v in report.values())
    return {"dry_run": dry_run, "found": report, "total_found": total_found, "deleted": deleted}



# ==================== لوحة معلومات الاشتراكات ====================

@router.get("/super-admin/subscriptions-dashboard")
async def get_subscriptions_dashboard(current_user: dict = Depends(verify_super_admin)):
    """لوحة معلومات شاملة للاشتراكات"""
    
    now = datetime.now(timezone.utc)
    
    # جلب إعدادات التنبيه
    settings = await db.settings.find_one({"type": "notification_settings"}, {"_id": 0})
    days_before = 15
    if settings and settings.get("value"):
        days_before = settings["value"].get("days_before_expiry", 15)
    
    # حساب التواريخ
    target_date = (now + timedelta(days=days_before)).isoformat()
    now_iso = now.isoformat()
    
    # جلب جميع العملاء (غير التجريبية)
    all_tenants = await db.tenants.find(
        {"is_demo": {"$ne": True}},
        {"_id": 0}
    ).to_list(1000)
    
    # تصنيف الاشتراكات
    active_subscriptions = []
    expiring_soon = []
    already_expired = []
    
    for tenant in all_tenants:
        expires_at = tenant.get("expires_at")
        if expires_at:
            if expires_at < now_iso:
                already_expired.append(tenant)
            elif expires_at <= target_date:
                expiring_soon.append(tenant)
                if tenant.get("is_active"):
                    active_subscriptions.append(tenant)
            else:
                if tenant.get("is_active"):
                    active_subscriptions.append(tenant)
        else:
            if tenant.get("is_active"):
                active_subscriptions.append(tenant)
    
    # إحصائيات حسب نوع الاشتراك
    subscription_types = {}
    for tenant in all_tenants:
        sub_type = tenant.get("subscription_type", "unknown")
        if sub_type not in subscription_types:
            subscription_types[sub_type] = {"count": 0, "active": 0, "expired": 0}
        subscription_types[sub_type]["count"] += 1
        if tenant.get("is_active") and tenant not in already_expired:
            subscription_types[sub_type]["active"] += 1
        elif tenant in already_expired:
            subscription_types[sub_type]["expired"] += 1
    
    # جلب أسعار الاشتراكات من قاعدة البيانات
    prices_doc = await db.settings.find_one({"type": "subscription_prices"}, {"_id": 0})
    
    # الأسعار الافتراضية بالدولار
    default_prices = {
        "bronze": {"monthly": 15, "name": "برونزية"},
        "silver": {"monthly": 30, "name": "فضية"},
        "gold": {"monthly": 50, "name": "ذهبية"},
        "basic": {"monthly": 25, "name": "أساسي"},
        "premium": {"monthly": 50, "name": "مميز"},
        "trial": {"monthly": 0, "name": "تجريبي"},
        "demo": {"monthly": 0, "name": "عرض"}
    }
    
    if prices_doc and prices_doc.get("value"):
        subscription_prices = prices_doc["value"]
    else:
        subscription_prices = default_prices
    
    expected_revenue = {
        "from_expiring": 0,
        "from_active": 0,
        "total_monthly": 0,
        "currency": "USD",
        "details": []
    }
    
    for tenant in expiring_soon:
        sub_type = tenant.get("subscription_type", "basic")
        duration = tenant.get("subscription_duration", 1)
        price_per_month = subscription_prices.get(sub_type, {}).get("monthly", 0)
        expected_revenue["from_expiring"] += price_per_month * duration
        expected_revenue["details"].append({
            "tenant_name": tenant.get("name"),
            "subscription_type": sub_type,
            "duration_months": duration,
            "expected_amount": price_per_month * duration,
            "expires_at": tenant.get("expires_at")
        })
    
    for tenant in active_subscriptions:
        sub_type = tenant.get("subscription_type", "basic")
        price_per_month = subscription_prices.get(sub_type, {}).get("monthly", 0)
        expected_revenue["from_active"] += price_per_month
    
    expected_revenue["total_monthly"] = expected_revenue["from_active"]
    
    # ترتيب الاشتراكات القريبة من الانتهاء حسب التاريخ
    expiring_soon.sort(key=lambda x: x.get("expires_at", ""))
    already_expired.sort(key=lambda x: x.get("expires_at", ""), reverse=True)
    
    # حساب عدد الأيام المتبقية لكل اشتراك
    for tenant in expiring_soon:
        if tenant.get("expires_at"):
            try:
                exp_date = datetime.fromisoformat(tenant["expires_at"].replace("Z", "+00:00"))
                days_left = (exp_date - now).days
                tenant["days_left"] = max(0, days_left)
            except:
                tenant["days_left"] = None
    
    for tenant in already_expired:
        if tenant.get("expires_at"):
            try:
                exp_date = datetime.fromisoformat(tenant["expires_at"].replace("Z", "+00:00"))
                days_ago = (now - exp_date).days
                tenant["days_expired"] = days_ago
            except:
                tenant["days_expired"] = None
    
    return {
        "summary": {
            "total_tenants": len(all_tenants),
            "active_subscriptions": len(active_subscriptions),
            "expiring_soon": len(expiring_soon),
            "already_expired": len(already_expired),
            "days_before_alert": days_before
        },
        "subscription_types": subscription_types,
        "expected_revenue": expected_revenue,
        "expiring_soon_list": expiring_soon[:10],  # أول 10
        "expired_list": already_expired[:10],  # أول 10
        "subscription_prices": subscription_prices
    }

# ==================== أسعار الاشتراكات ====================

class SubscriptionPriceUpdate(BaseModel):
    """تحديث سعر اشتراك واحد"""
    subscription_type: str  # basic, premium
    monthly_price: float  # السعر الشهري بالدولار

class SubscriptionPricesUpdate(BaseModel):
    """تحديث جميع أسعار الاشتراكات"""
    bronze: float = 15  # السعر الشهري للبرونزية بالدولار
    silver: float = 30  # السعر الشهري للفضية بالدولار
    gold: float = 50  # السعر الشهري للذهبية بالدولار

@router.get("/super-admin/subscription-prices")
async def get_subscription_prices(current_user: dict = Depends(verify_super_admin)):
    """جلب أسعار الاشتراكات"""
    prices_doc = await db.settings.find_one({"type": "subscription_prices"}, {"_id": 0})
    
    # الأسعار الافتراضية بالدولار
    default_prices = {
        "gold": {"monthly": 50, "name": "ذهبية"},
        "silver": {"monthly": 30, "name": "فضية"},
        "bronze": {"monthly": 15, "name": "برونزية"},
        "trial": {"monthly": 0, "name": "تجريبي"},
        "demo": {"monthly": 0, "name": "عرض"}
    }
    
    if prices_doc and prices_doc.get("value"):
        return {
            "prices": prices_doc["value"],
            "currency": "USD"
        }
    
    return {
        "prices": default_prices,
        "currency": "USD"
    }

@router.put("/super-admin/subscription-prices")
async def update_subscription_prices(prices: SubscriptionPricesUpdate, current_user: dict = Depends(verify_super_admin)):
    """تحديث أسعار الاشتراكات بالدولار"""
    
    new_prices = {
        "gold": {"monthly": prices.gold, "name": "ذهبية"},
        "silver": {"monthly": prices.silver, "name": "فضية"},
        "bronze": {"monthly": prices.bronze, "name": "برونزية"},
        "trial": {"monthly": 0, "name": "تجريبي"},
        "demo": {"monthly": 0, "name": "عرض"}
    }
    
    await db.settings.update_one(
        {"type": "subscription_prices"},
        {"$set": {"value": new_prices, "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True
    )
    
    return {
        "message": "تم تحديث أسعار الاشتراكات",
        "prices": new_prices,
        "currency": "USD"
    }

@router.post("/super-admin/impersonate/{tenant_id}")
async def impersonate_tenant(tenant_id: str, current_user: dict = Depends(verify_super_admin)):
    """الدخول كعميل - للمشاهدة والتحكم المباشر"""
    
    # التحقق إذا كان النظام الرئيسي
    if tenant_id == "main-system":
        # البحث عن admin النظام الرئيسي
        admin = await db.users.find_one({
            "$or": [{"tenant_id": {"$exists": False}}, {"tenant_id": None}],
            "role": UserRole.ADMIN
        }, {"_id": 0, "password": 0})
        if not admin:
            raise HTTPException(status_code=404, detail="مدير النظام الرئيسي غير موجود")
        
        # إنشاء token للدخول (جلسة نشطة واحدة)
        _sid = await issue_user_session(admin["id"], admin.get("role"))
        token = create_token(admin["id"], admin["role"], admin.get("branch_id"), admin.get("tenant_id"), session_id=_sid)
        
        # إضافة علامات الـ impersonation للمستخدم
        admin["impersonated"] = True
        admin["impersonated_by"] = current_user.get("id")
        admin["original_role"] = UserRole.SUPER_ADMIN
        
        return {
            "token": token,
            "user": admin,
            "tenant": {
                "id": "main-system",
                "name": "🏠 النظام الرئيسي",
                "is_main_system": True
            },
            "impersonated": True,
            "original_super_admin": current_user["id"]
        }
    
    # للعملاء العاديين
    tenant = await db.tenants.find_one({"id": tenant_id}, {"_id": 0})
    if not tenant:
        raise HTTPException(status_code=404, detail="العميل غير موجود")
    
    # البحث عن admin العميل
    admin = await db.users.find_one({"tenant_id": tenant_id, "role": UserRole.ADMIN}, {"_id": 0, "password": 0})
    if not admin:
        raise HTTPException(status_code=404, detail="مدير العميل غير موجود")
    
    # إنشاء token للدخول كالعميل مع علامة impersonation (جلسة نشطة واحدة)
    _sid = await issue_user_session(admin["id"], admin.get("role"))
    token = create_token(admin["id"], admin["role"], admin.get("branch_id"), admin.get("tenant_id"), session_id=_sid)
    
    # إضافة علامات الـ impersonation للمستخدم
    admin["impersonated"] = True
    admin["impersonated_by"] = current_user.get("id")
    admin["original_role"] = UserRole.SUPER_ADMIN
    
    return {
        "token": token,
        "user": admin,
        "tenant": tenant,
        "impersonated": True,
        "original_super_admin": current_user["id"]
    }

@router.get("/super-admin/tenants/{tenant_id}/live-stats")
async def get_tenant_live_stats(tenant_id: str, current_user: dict = Depends(verify_super_admin)):
    """إحصائيات حية للعميل"""
    
    # التحقق إذا كان النظام الرئيسي
    if tenant_id == "main-system":
        tenant = {
            "id": "main-system",
            "name": "🏠 النظام الرئيسي",
            "is_main_system": True
        }
        tenant_query = {"$or": [{"tenant_id": {"$exists": False}}, {"tenant_id": None}]}
    else:
        tenant = await db.tenants.find_one({"id": tenant_id}, {"_id": 0})
        if not tenant:
            raise HTTPException(status_code=404, detail="العميل غير موجود")
        tenant_query = {"tenant_id": tenant_id}
    
    # إحصائيات اليوم
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    
    today_query = {**tenant_query, "created_at": {"$gte": today}}
    today_orders = await db.orders.find(today_query, {"_id": 0}).to_list(500)
    
    # حساب الإحصائيات
    total_today = sum((o.get("total") or 0) for o in today_orders if o.get("status") != "cancelled")
    pending_orders = len([o for o in today_orders if o.get("status") == "pending"])
    preparing_orders = len([o for o in today_orders if o.get("status") == "preparing"])
    delivered_orders = len([o for o in today_orders if o.get("status") == "delivered"])
    cancelled_orders = len([o for o in today_orders if o.get("status") == "cancelled"])
    
    # المنتجات الأكثر مبيعاً اليوم
    product_sales = {}
    for order in today_orders:
        if order.get("status") != "cancelled":
            for item in order.get("items", []):
                # استخدام اسم المنتج (product_name) أو الاسم العادي (name)
                name = item.get("product_name") or item.get("name") or "غير معروف"
                if name not in product_sales:
                    product_sales[name] = {"quantity": 0, "total": 0}
                product_sales[name]["quantity"] += _sn(item.get("quantity"))
                product_sales[name]["total"] += _sn(item.get("subtotal"))
    
    top_products = sorted(product_sales.items(), key=lambda x: x[1]["total"], reverse=True)[:5]
    
    # المستخدمين النشطين (لديهم وردية مفتوحة)
    active_shifts = await db.shifts.count_documents({
        "status": "open"
    })
    
    return {
        "tenant": tenant,
        "today": {
            "total_sales": total_today,
            "total_orders": len(today_orders),
            "pending_orders": pending_orders,
            "preparing_orders": preparing_orders,
            "delivered_orders": delivered_orders,
            "cancelled_orders": cancelled_orders
        },
        "top_products": [{"name": p[0], **p[1]} for p in top_products],
        "active_shifts": active_shifts,
        "recent_orders": today_orders[:10]  # آخر 10 طلبات
    }

@router.get("/super-admin/tenants/{tenant_id}/orders")
async def get_tenant_orders(tenant_id: str, date: Optional[str] = None, status: Optional[str] = None, current_user: dict = Depends(verify_super_admin)):
    """جلب طلبات عميل معين"""
    
    query = {"tenant_id": tenant_id}
    if date:
        query["created_at"] = {"$regex": f"^{date}"}
    if status:
        query["status"] = status
    
    orders = await db.orders.find(query, {"_id": 0}).sort("created_at", -1).limit(100).to_list(100)
    return orders

@router.get("/super-admin/tenants/{tenant_id}/products")
async def get_tenant_products(tenant_id: str, current_user: dict = Depends(verify_super_admin)):
    """جلب منتجات عميل معين"""
    
    products = await db.products.find({"tenant_id": tenant_id}, {"_id": 0}).to_list(500)
    return products

@router.delete("/super-admin/tenants/{tenant_id}/permanent")
async def permanently_delete_tenant(tenant_id: str, confirm: bool = False, current_user: dict = Depends(verify_super_admin)):
    """حذف عميل نهائياً مع جميع بياناته"""
    
    if not confirm:
        raise HTTPException(status_code=400, detail="يجب تأكيد الحذف بإرسال confirm=true")
    
    tenant = await db.tenants.find_one({"id": tenant_id})
    if not tenant:
        raise HTTPException(status_code=404, detail="العميل غير موجود")
    
    # حذف جميع البيانات المرتبطة
    await db.users.delete_many({"tenant_id": tenant_id})
    await db.branches.delete_many({"tenant_id": tenant_id})
    await db.orders.delete_many({"tenant_id": tenant_id})
    await db.products.delete_many({"tenant_id": tenant_id})
    await db.categories.delete_many({"tenant_id": tenant_id})
    await db.inventory.delete_many({"tenant_id": tenant_id})
    await db.customers.delete_many({"tenant_id": tenant_id})
    await db.shifts.delete_many({"tenant_id": tenant_id})
    await db.expenses.delete_many({"tenant_id": tenant_id})
    await db.drivers.delete_many({"tenant_id": tenant_id})
    await db.tenants.delete_one({"id": tenant_id})
    
    return {"message": f"تم حذف العميل '{tenant['name']}' وجميع بياناته نهائياً"}

@router.post("/super-admin/reset-sales")
async def reset_all_sales(confirm: bool = False, current_user: dict = Depends(verify_super_admin)):
    """تصفير جميع المبيعات والطلبات - للتجربة"""
    
    if not confirm:
        raise HTTPException(status_code=400, detail="يجب تأكيد التصفير بإرسال confirm=true")
    
    # حذف جميع الطلبات
    orders_result = await db.orders.delete_many({})
    
    # حذف جميع الورديات
    shifts_result = await db.shifts.delete_many({})
    
    # إعادة تعيين إحصائيات العملاء
    await db.customers.update_many({}, {"$set": {
        "total_orders": 0,
        "total_spent": 0.0,
        "last_order_date": None
    }})
    
    # إعادة تعيين إحصائيات السائقين
    await db.drivers.update_many({}, {"$set": {
        "total_deliveries": 0,
        "is_available": True,
        "current_order_id": None
    }})
    
    # تصفير خزينة المالك
    deposits_result = await db.owner_deposits.delete_many({})
    withdrawals_result = await db.owner_withdrawals.delete_many({})
    profit_transfers_result = await db.owner_profit_transfers.delete_many({})
    profit_withdrawals_result = await db.owner_profit_withdrawals.delete_many({})
    
    return {
        "message": "تم تصفير جميع المبيعات بنجاح",
        "deleted_orders": orders_result.deleted_count,
        "deleted_shifts": shifts_result.deleted_count,
        "owner_wallet_reset": {
            "deleted_deposits": deposits_result.deleted_count,
            "deleted_withdrawals": withdrawals_result.deleted_count,
            "deleted_profit_transfers": profit_transfers_result.deleted_count,
            "deleted_profit_withdrawals": profit_withdrawals_result.deleted_count
        }
    }

@router.post("/super-admin/tenants/{tenant_id}/branches/{branch_id}/reset-sales")
async def reset_branch_sales(
    tenant_id: str,
    branch_id: str,
    confirm: bool = False,
    current_user: dict = Depends(verify_super_admin)
):
    """تصفير شامل لفرع محدد لعميل محدد (super_admin فقط).
    
    يحذف من هذا الفرع فقط (كل البيانات المعاملاتية):
    - الطلبات (نقد/بطاقة/آجل/توصيل/شركات) + الإلغاءات
    - الورديات (شفتات قديمة وجديدة)
    - إغلاقات الصندوق (قديمة وجديدة)
    - سجلات الصندوق وحركاته
    - المصاريف
    - المرتجعات + counters المرتجعات
    - أوامر الطباعة المعلقة
    - حركات/معاملات المخزون
    - الحجوزات + المراجعات
    - استخدام الكوبونات
    - سجلات التدقيق (audit) لهذا الفرع
    - معاملات الدفع
    
    لن يحذف: المنتجات، الفئات، الموظفين، الطابعات، الإعدادات، الموردين، 
    الرواتب، السلف، الحسومات، الموظفين، الحضور.
    """
    if not confirm:
        raise HTTPException(status_code=400, detail="يجب تأكيد التصفير بإرسال confirm=true")
    
    branch = await db.branches.find_one({"id": branch_id, "tenant_id": tenant_id}, {"_id": 0})
    if not branch:
        raise HTTPException(status_code=404, detail="الفرع غير موجود لهذا العميل")
    
    base_q = {"tenant_id": tenant_id, "branch_id": branch_id}
    # طلبات الفروع تُخزَّن بحقول to_branch_id/from_branch_id وليس branch_id — لذا نطابق كل الصيغ
    branch_match = {"$or": [
        {"branch_id": branch_id},
        {"to_branch_id": branch_id},
        {"from_branch_id": branch_id},
    ]}
    
    # === حذف كل البيانات المعاملاتية للفرع ===
    deleted = {}
    
    # طلبات + إلغاءات + توصيل (كلها بنفس collection)
    deleted["orders"] = (await db.orders.delete_many(base_q)).deleted_count
    deleted["branch_orders"] = (await db.branch_orders.delete_many(branch_match)).deleted_count
    deleted["branch_orders_new"] = (await db.branch_orders_new.delete_many(branch_match)).deleted_count
    
    # ورديات + إغلاقات الصندوق
    deleted["shifts"] = (await db.shifts.delete_many(base_q)).deleted_count
    deleted["cash_register_closings"] = (await db.cash_register_closings.delete_many(base_q)).deleted_count
    deleted["cash_register_closes"] = (await db.cash_register_closes.delete_many(base_q)).deleted_count
    deleted["cash_drawer_logs"] = (await db.cash_drawer_logs.delete_many(base_q)).deleted_count
    deleted["day_closures"] = (await db.day_closures.delete_many(base_q)).deleted_count
    
    # مصاريف + مرتجعات
    deleted["expenses"] = (await db.expenses.delete_many(base_q)).deleted_count
    deleted["refunds"] = (await db.refunds.delete_many(base_q)).deleted_count
    deleted["refund_counters"] = (await db.refund_counters.delete_many(base_q)).deleted_count
    
    # طابور الطباعة
    deleted["print_queue"] = (await db.print_queue.delete_many(base_q)).deleted_count
    
    # حركات المخزون والمعاملات
    deleted["inventory_movements"] = (await db.inventory_movements.delete_many(base_q)).deleted_count
    deleted["inventory_transactions"] = (await db.inventory_transactions.delete_many(base_q)).deleted_count
    
    # حجوزات + مراجعات
    deleted["reservations"] = (await db.reservations.delete_many(base_q)).deleted_count
    deleted["reviews"] = (await db.reviews.delete_many(base_q)).deleted_count
    deleted["customer_reviews"] = (await db.customer_reviews.delete_many(base_q)).deleted_count
    
    # كوبونات + معاملات الدفع
    deleted["coupon_usage"] = (await db.coupon_usage.delete_many(base_q)).deleted_count
    deleted["payment_transactions"] = (await db.payment_transactions.delete_many(base_q)).deleted_count
    
    # سجلات التدقيق
    deleted["audit_logs"] = (await db.audit_logs.delete_many(base_q)).deleted_count
    
    # سجلات المكالمات (call center) لهذا الفرع
    deleted["call_logs"] = (await db.call_logs.delete_many(base_q)).deleted_count
    
    # === حذف مخزون الفرع نهائياً (ليعود الفرع جديداً بلا مواد) ===
    # يرجع الفرع إلى حالة جديدة تماماً: لا منتجات ولا مخزون، ليبدأ بجرد صحيح من الصفر
    inv_deleted = await db.branch_inventory.delete_many({"branch_id": branch_id})
    branch_inventory_deleted = inv_deleted.deleted_count
    
    # تصفير حالة الطاولات (مهيأة للاستخدام)
    await db.tables.update_many(base_q, {"$set": {
        "status": "available",
        "current_order_id": None
    }})
    
    total_deleted = sum(deleted.values()) + branch_inventory_deleted
    
    return {
        "message": f"تم تصفير فرع '{branch.get('name','')}' بنجاح",
        "branch_name": branch.get("name", ""),
        "total_deleted": total_deleted,
        "branch_inventory_deleted": branch_inventory_deleted,
        "details": deleted
    }



@router.post("/super-admin/tenants/{tenant_id}/reset-sales")
async def reset_tenant_sales(tenant_id: str, confirm: bool = False, current_user: dict = Depends(verify_super_admin)):
    """تصفير مبيعات عميل معين - للتجربة"""
    
    if not confirm:
        raise HTTPException(status_code=400, detail="يجب تأكيد التصفير بإرسال confirm=true")
    
    # التحقق إذا كان النظام الرئيسي
    if tenant_id == "main-system":
        # حذف طلبات النظام الرئيسي (بدون tenant_id)
        orders_result = await db.orders.delete_many({
            "$or": [{"tenant_id": {"$exists": False}}, {"tenant_id": None}]
        })
        
        # حذف ورديات النظام الرئيسي
        shifts_result = await db.shifts.delete_many({
            "$or": [{"tenant_id": {"$exists": False}}, {"tenant_id": None}]
        })
        
        # إعادة تعيين إحصائيات عملاء النظام الرئيسي
        await db.customers.update_many({
            "$or": [{"tenant_id": {"$exists": False}}, {"tenant_id": None}]
        }, {"$set": {
            "total_orders": 0,
            "total_spent": 0.0,
            "last_order_date": None
        }})
        
        # تصفير خزينة المالك للنظام الرئيسي
        deposits_result = await db.owner_deposits.delete_many({
            "$or": [{"tenant_id": {"$exists": False}}, {"tenant_id": None}]
        })
        withdrawals_result = await db.owner_withdrawals.delete_many({
            "$or": [{"tenant_id": {"$exists": False}}, {"tenant_id": None}]
        })
        profit_transfers_result = await db.owner_profit_transfers.delete_many({
            "$or": [{"tenant_id": {"$exists": False}}, {"tenant_id": None}]
        })
        profit_withdrawals_result = await db.owner_profit_withdrawals.delete_many({
            "$or": [{"tenant_id": {"$exists": False}}, {"tenant_id": None}]
        })
        
        # حذف المصاريف للنظام الرئيسي
        expenses_result = await db.expenses.delete_many({
            "$or": [{"tenant_id": {"$exists": False}}, {"tenant_id": None}]
        })
        
        # حذف المرتجعات للنظام الرئيسي
        refunds_result = await db.refunds.delete_many({
            "$or": [{"tenant_id": {"$exists": False}}, {"tenant_id": None}]
        })
        
        # حذف سجلات الصندوق للنظام الرئيسي
        cash_drawer_result = await db.cash_drawer_logs.delete_many({
            "$or": [{"tenant_id": {"$exists": False}}, {"tenant_id": None}]
        })
        
        # حذف سجلات التدقيق للنظام الرئيسي
        audit_logs_result = await db.audit_logs.delete_many({
            "$or": [{"tenant_id": {"$exists": False}}, {"tenant_id": None}]
        })
        
        return {
            "message": "تم تصفير مبيعات النظام الرئيسي بنجاح",
            "deleted_orders": orders_result.deleted_count,
            "deleted_shifts": shifts_result.deleted_count,
            "deleted_expenses": expenses_result.deleted_count,
            "deleted_refunds": refunds_result.deleted_count,
            "deleted_cash_drawer_logs": cash_drawer_result.deleted_count,
            "deleted_audit_logs": audit_logs_result.deleted_count,
            "owner_wallet_reset": {
                "deleted_deposits": deposits_result.deleted_count,
                "deleted_withdrawals": withdrawals_result.deleted_count,
                "deleted_profit_transfers": profit_transfers_result.deleted_count,
                "deleted_profit_withdrawals": profit_withdrawals_result.deleted_count
            }
        }
    
    # للعملاء العاديين
    tenant = await db.tenants.find_one({"id": tenant_id})
    if not tenant:
        raise HTTPException(status_code=404, detail="العميل غير موجود")
    
    # البحث بـ tenant_id فقط
    query = {"tenant_id": tenant_id}
    
    # حذف طلبات العميل
    orders_result = await db.orders.delete_many(query)
    
    # حذف ورديات العميل
    shifts_result = await db.shifts.delete_many(query)
    
    # إعادة تعيين إحصائيات عملاء هذا العميل
    await db.customers.update_many(query, {"$set": {
        "total_orders": 0,
        "total_spent": 0.0,
        "last_order_date": None
    }})
    
    # تصفير خزينة المالك للعميل
    deposits_result = await db.owner_deposits.delete_many(query)
    withdrawals_result = await db.owner_withdrawals.delete_many(query)
    profit_transfers_result = await db.owner_profit_transfers.delete_many(query)
    profit_withdrawals_result = await db.owner_profit_withdrawals.delete_many(query)
    
    # حذف المصاريف
    expenses_result = await db.expenses.delete_many(query)
    
    # حذف المرتجعات
    refunds_result = await db.refunds.delete_many(query)
    
    # حذف سجلات الصندوق
    cash_drawer_result = await db.cash_drawer_logs.delete_many(query)
    
    # حذف سجلات التدقيق (اختياري - للتنظيف الكامل)
    audit_logs_result = await db.audit_logs.delete_many(query)
    
    return {
        "message": f"تم تصفير مبيعات '{tenant['name']}' بنجاح",
        "deleted_orders": orders_result.deleted_count,
        "deleted_shifts": shifts_result.deleted_count,
        "deleted_expenses": expenses_result.deleted_count,
        "deleted_refunds": refunds_result.deleted_count,
        "deleted_cash_drawer_logs": cash_drawer_result.deleted_count,
        "deleted_audit_logs": audit_logs_result.deleted_count,
        "owner_wallet_reset": {
            "deleted_deposits": deposits_result.deleted_count,
            "deleted_withdrawals": withdrawals_result.deleted_count,
            "deleted_profit_transfers": profit_transfers_result.deleted_count,
            "deleted_profit_withdrawals": profit_withdrawals_result.deleted_count
        }
    }

@router.post("/super-admin/tenants/{tenant_id}/reset-inventory")
async def reset_tenant_inventory(tenant_id: str, confirm: bool = False, delete_all: bool = False, current_user: dict = Depends(verify_super_admin)):
    """تصفير بيانات المخزون والمشتريات لعميل معين - للمالك فقط"""
    
    if not confirm:
        raise HTTPException(status_code=400, detail="يجب تأكيد التصفير بإرسال confirm=true")
    
    results = {
        "reset_counts": {},
        "tenant_name": ""
    }
    
    # إذا كان delete_all=true، نحذف جميع البيانات بغض النظر عن tenant_id
    if delete_all:
        query = {}
        results["tenant_name"] = "جميع البيانات"
    # التحقق إذا كان النظام الرئيسي
    elif tenant_id == "main-system":
        query = {"$or": [{"tenant_id": {"$exists": False}}, {"tenant_id": None}]}
        results["tenant_name"] = "النظام الرئيسي"
    else:
        tenant = await db.tenants.find_one({"id": tenant_id})
        if not tenant:
            raise HTTPException(status_code=404, detail="العميل غير موجود")
        # البحث عن البيانات بـ tenant_id أو بدونه (للتوافق مع البيانات القديمة)
        query = {"$or": [{"tenant_id": tenant_id}, {"tenant_id": {"$exists": False}}, {"tenant_id": None}]}
        results["tenant_name"] = tenant.get("name", tenant_id)
    
    # حذف طلبات الفروع
    deleted = await db.branch_orders_new.delete_many(query)
    results["reset_counts"]["branch_orders"] = deleted.deleted_count
    
    # حذف فواتير الشراء
    deleted_purchases = await db.purchases_new.delete_many(query)
    results["reset_counts"]["purchases"] = deleted_purchases.deleted_count
    
    # حذف طلبات الشراء
    deleted_requests = await db.purchase_requests.delete_many(query)
    results["reset_counts"]["purchase_requests"] = deleted_requests.deleted_count
    
    # حذف سجلات التصنيع
    deleted_mfg = await db.manufacturing_records.delete_many(query)
    results["reset_counts"]["manufacturing_records"] = deleted_mfg.deleted_count
    
    # حذف حركات المخزون
    deleted_movements = await db.inventory_movements.delete_many(query)
    results["reset_counts"]["inventory_movements"] = deleted_movements.deleted_count
    
    # حذف المواد الخام بالكامل
    deleted_raw = await db.raw_materials.delete_many(query)
    results["reset_counts"]["raw_materials"] = deleted_raw.deleted_count
    
    # حذف مخزون التصنيع بالكامل
    deleted_mfg_inv = await db.manufacturing_inventory.delete_many(query)
    results["reset_counts"]["manufacturing_inventory"] = deleted_mfg_inv.deleted_count
    
    # حذف المنتجات المصنعة بالكامل
    deleted_products = await db.manufactured_products.delete_many(query)
    results["reset_counts"]["manufactured_products"] = deleted_products.deleted_count
    
    # حذف الموردين بالكامل
    deleted_suppliers = await db.suppliers.delete_many(query)
    results["reset_counts"]["suppliers"] = deleted_suppliers.deleted_count
    
    # حذف مخزون الفروع
    deleted_branch_inv = await db.branch_inventory.delete_many(query)
    results["reset_counts"]["branch_inventory"] = deleted_branch_inv.deleted_count
    
    # حذف حركات المخزون (واردات/صادرات)
    deleted_transactions = await db.inventory_transactions.delete_many(query)
    results["reset_counts"]["inventory_transactions"] = deleted_transactions.deleted_count
    
    # حذف تحويلات المخزن
    deleted_transfers = await db.warehouse_transfers.delete_many(query)
    results["reset_counts"]["warehouse_transfers"] = deleted_transfers.deleted_count
    
    # حذف فواتير الشراء الجديدة
    deleted_purchase_invoices = await db.purchase_invoices.delete_many(query)
    results["reset_counts"]["purchase_invoices"] = deleted_purchase_invoices.deleted_count
    
    # حذف موردي المشتريات
    deleted_purchase_suppliers = await db.purchase_suppliers.delete_many(query)
    results["reset_counts"]["purchase_suppliers"] = deleted_purchase_suppliers.deleted_count
    
    # حذف طلبات الشراء من المخزن
    deleted_warehouse_requests = await db.warehouse_purchase_requests.delete_many(query)
    results["reset_counts"]["warehouse_purchase_requests"] = deleted_warehouse_requests.deleted_count
    
    # ==================== تصفير مخزون التغليف (الورقيات) ====================
    
    # حذف مواد التغليف
    deleted_packaging_materials = await db.packaging_materials.delete_many(query)
    results["reset_counts"]["packaging_materials"] = deleted_packaging_materials.deleted_count
    
    # حذف طلبات التغليف
    deleted_packaging_requests = await db.packaging_requests.delete_many(query)
    results["reset_counts"]["packaging_requests"] = deleted_packaging_requests.deleted_count
    
    # حذف مخزون التغليف في الفروع
    deleted_branch_packaging = await db.branch_packaging_inventory.delete_many(query)
    results["reset_counts"]["branch_packaging_inventory"] = deleted_branch_packaging.deleted_count
    
    # ==================== تصفير المواد الغذائية ====================
    
    # حذف المواد الخام الجديدة
    deleted_raw_new = await db.raw_materials_new.delete_many(query)
    results["reset_counts"]["raw_materials_new"] = deleted_raw_new.deleted_count
    
    # حذف طلبات التصنيع (من المصنع للمخزن)
    deleted_mfg_requests = await db.manufacturing_requests.delete_many(query)
    results["reset_counts"]["manufacturing_requests"] = deleted_mfg_requests.deleted_count
    
    return {
        "message": f"تم تصفير بيانات المخزون لـ '{results['tenant_name']}' بنجاح",
        "success": True,
        **results
    }

# ==================== تصفير الموارد البشرية ====================
@router.post("/super-admin/tenants/{tenant_id}/reset-hr")
async def reset_tenant_hr(tenant_id: str, confirm: bool = False, current_user: dict = Depends(verify_super_admin)):
    """تصفير بيانات الموارد البشرية لعميل معين - للمالك فقط"""
    if not confirm:
        raise HTTPException(status_code=400, detail="يجب تأكيد التصفير بإرسال confirm=true")
    
    if tenant_id == "main":
        query = {"$or": [{"tenant_id": {"$exists": False}}, {"tenant_id": None}, {"tenant_id": ""}]}
    else:
        tenant = await db.tenants.find_one({"id": tenant_id})
        if not tenant:
            raise HTTPException(status_code=404, detail="العميل غير موجود")
        query = {"tenant_id": tenant_id}
    
    results = {"reset_counts": {}}
    
    # جلب أرقام البصمة للموظفين قبل الحذف (لحذفهم من جهاز البصمة)
    employees_to_delete = await db.employees.find(
        {**query, "biometric_uid": {"$ne": None, "$exists": True}},
        {"_id": 0, "biometric_uid": 1, "name": 1}
    ).to_list(1000)
    biometric_uids_to_delete = [
        {"uid": int(e["biometric_uid"]), "name": e.get("name", "")}
        for e in employees_to_delete
        if e.get("biometric_uid") and str(e["biometric_uid"]).isdigit()
    ]
    
    # حذف الموظفين
    deleted_employees = await db.employees.delete_many(query)
    results["reset_counts"]["employees"] = deleted_employees.deleted_count
    
    # حذف الخصومات
    deleted_deductions = await db.deductions.delete_many(query)
    results["reset_counts"]["deductions"] = deleted_deductions.deleted_count
    
    # حذف المكافآت
    deleted_bonuses = await db.bonuses.delete_many(query)
    results["reset_counts"]["bonuses"] = deleted_bonuses.deleted_count
    
    # حذف السلف
    deleted_advances = await db.advances.delete_many(query)
    results["reset_counts"]["advances"] = deleted_advances.deleted_count
    
    # حذف سجلات الحضور
    deleted_attendance = await db.attendance.delete_many(query)
    results["reset_counts"]["attendance"] = deleted_attendance.deleted_count
    
    # حذف سجلات البصمة الخام
    deleted_biometric = await db.biometric_attendance.delete_many(query)
    results["reset_counts"]["biometric_attendance"] = deleted_biometric.deleted_count
    
    # حذف طلبات الوقت الإضافي
    deleted_overtime = await db.overtime_requests.delete_many(query)
    results["reset_counts"]["overtime_requests"] = deleted_overtime.deleted_count
    
    # حذف كشوف الرواتب
    deleted_payroll = await db.payroll.delete_many(query)
    results["reset_counts"]["payroll"] = deleted_payroll.deleted_count
    
    # حذف أجهزة البصمة
    deleted_devices = await db.biometric_devices.delete_many(query)
    results["reset_counts"]["biometric_devices"] = deleted_devices.deleted_count
    
    return {
        "message": "تم تصفير بيانات الموارد البشرية بنجاح",
        "success": True,
        "biometric_uids_to_delete": biometric_uids_to_delete,
        **results
    }


# ============================================================================
# 🔍 تشخيص قنوات الإرسال (Preflight Check)
# ============================================================================
@router.get("/super-admin/delivery-channels/status")
async def delivery_channels_status(current_user: dict = Depends(verify_super_admin)):
    """يُرجع حالة جميع قنوات الإرسال (بريد/واتساب/SMS) لعرض تحذير قبل الضغط.
    
    يُستخدم في الواجهة قبل زر الترحيب لتحذير المشرف إن كانت كل القنوات معطّلة.
    """
    from twilio_verify import _sms_configured
    email_ok = await email_transport_configured()
    wa_ok = await _wa_free.is_connected()
    sms_ok = _sms_configured()
    return {
        "email": {"ready": email_ok, "detail": "SMTP/SendGrid" if email_ok else "غير مُهيّأ — أضف SMTP من إعدادات النظام"},
        "whatsapp": {"ready": wa_ok, "detail": "متصل" if wa_ok else "غير مربوط — من لوحة المالك ← إعدادات النظام ← الواتساب"},
        "sms": {"ready": sms_ok, "detail": "Twilio Messaging مُهيّأ" if sms_ok else "غير مُهيّأ — أضف TWILIO_ACCOUNT_SID/AUTH_TOKEN/SMS_FROM في .env"},
        "any_ready": bool(email_ok or wa_ok or sms_ok),
    }



# ضمانات العزل (Tenant Isolation):
#   • كل استعلامات المستخدمين مقيّدة بـ tenant_id في الـ URL path
#   • لا يمكن أن تصل بيانات مستخدم من تينانت لمستخدم في تينانت آخر
#   • الاستجابة تُرجع بوضوح: البريد المُرسَل إليه + الهاتف المُرسَل إليه لكل مستخدم
#     ليطمئنّ مالك النظام أن التسليم صحيح لكل عميل ضمن مشروعه فقط.

def _generate_temp_password(length: int = 10) -> str:
    """يولّد كلمة مرور مؤقتة آمنة (أحرف + أرقام + رمز واحد)."""
    import secrets, string
    alpha = string.ascii_letters + string.digits
    body = ''.join(secrets.choice(alpha) for _ in range(length - 2))
    return body + secrets.choice("!@#$%") + secrets.choice(string.digits)


async def _send_welcome_bundle_to_user(user_doc: dict, tenant_doc: dict, plain_password: Optional[str] = None) -> dict:
    """يرسل ترحيب + كلمة مرور مؤقتة + رمز OTP لمستخدم واحد على البريد والواتساب/SMS.
    
    🛡️ حماية حرجة: كلمة المرور تُعاد تعيينها فقط إذا نجحت **قناة واحدة على الأقل**.
    إن فشلت كل القنوات (بريد + واتساب + SMS) → لا يُعاد تعيين كلمة المرور،
    حتى لا يُقفَل المستخدم خارج النظام.
    
    plain_password (اختياري): لو مُرِّرَت (من زر الترحيب مع custom_password)، تُستخدم مباشرة
    بلا فكّ vault — يحمي من فشل الفك بسبب اختلاف مفاتيح Fernet بين البيئات.
    """
    if not user_doc or not tenant_doc:
        return {"ok": False, "reason": "missing_user_or_tenant"}

    # عزل صارم: تأكّد أن المستخدم يخص التينانت المطلوب
    if user_doc.get("tenant_id") != tenant_doc.get("id"):
        return {"ok": False, "reason": "tenant_mismatch"}

    # 1) الأولوية للنص الصريح (plain_password) — يمرَّر عندما custom_password مُرسَلة.
    #    هذا يتجاوز أي مشكلة في فكّ vault ويضمن أن ما يُرسَل = ما كتبه المشرف بالحرف.
    temp_password = None
    password_source = None
    if plain_password:
        temp_password = plain_password
        password_source = "explicit_plain"
    else:
        stored_vault = user_doc.get("password_vault")
        temp_password = decrypt_plain_password(stored_vault) if stored_vault else None
        password_source = "vault" if temp_password else None
    
    # إذا لا توجد كلمة أصلية محفوظة → نُنشئ واحدة ونحفظها (يحدث فقط للمستخدمين القدامى قبل التحديث)
    if not temp_password:
        temp_password = _generate_temp_password(10)
        password_source = "generated_fallback"

    tenant_name = tenant_doc.get("name") or tenant_doc.get("name_en") or tenant_doc.get("slug") or "Maestro EGP"
    display_name = user_doc.get("full_name") or user_doc.get("username") or user_doc.get("email") or "-"
    email = (user_doc.get("email") or "").strip()
    phone_raw = (user_doc.get("phone") or "").strip()

    result = {
        "user_id": user_doc.get("id"),
        "name": display_name,
        "email": email or None,
        "phone": phone_raw or None,
        "email_sent": False,
        "email_error": None,
        "whatsapp_sent": False,
        "whatsapp_error": None,
        "sms_sent": False,
        "sms_error": None,
        "temp_password_reset": False,
        "password_source": password_source,  # vault (الأصل) أو generated_fallback (مستخدم قديم)
    }

    # 2) إعداد مهام الإرسال — كلاهما ينطلقان بالتوازي (نفس التوقيت)
    async def _email_task():
        if not email:
            return {"sent": False, "error": "no_email"}
        if not await email_transport_configured():
            return {"sent": False, "error": "email_transport_not_configured"}
        try:
            await send_welcome_email(
                recipient_email=email,
                tenant_name=tenant_name,
                owner_name=display_name,
                username=email,
                password=temp_password,
            )
            return {"sent": True, "error": None}
        except Exception as _ee:
            return {"sent": False, "error": str(_ee)}

    async def _wa_task():
        if not phone_raw:
            return {"sent": False, "error": "no_phone"}
        try:
            e164 = await _phone_to_e164(phone_raw)
            if not e164:
                return {"sent": False, "error": "invalid_phone"}
            if not await _wa_free.is_connected():
                return {"sent": False, "error": "wa_not_connected"}
            wa_body = (
                f"مرحباً {display_name}! 🎉\n\n"
                f"تم إنشاء حسابك في *{tenant_name}* على منصة Maestro EGP.\n\n"
                f"🔐 بيانات الدخول:\n"
                f"• اسم المستخدم: {email or user_doc.get('username', '-')}\n"
                f"• كلمة المرور: *{temp_password}*\n\n"
                f"⚠️ يُرجى تغيير كلمة المرور فور تسجيل الدخول لأول مرة.\n"
                f"🌐 رابط الدخول: {os.environ.get('FRONTEND_URL', 'https://maestroegp.com')}/login"
            )
            ok, err = await _wa_free.send_message(
                e164, wa_body,
                purpose="welcome", tenant_id=tenant_doc["id"],
                title=f"🎉 مرحباً في {tenant_name}",
            )
            return {"sent": bool(ok), "error": None if ok else err}
        except Exception as _we:
            return {"sent": False, "error": str(_we)}

    # ⚡ إطلاق البريد والواتساب معاً — لا انتظار متسلسل
    email_r, wa_r = await asyncio.gather(_email_task(), _wa_task(), return_exceptions=False)
    result["email_sent"] = email_r["sent"]
    result["email_error"] = email_r["error"]
    result["whatsapp_sent"] = wa_r["sent"]
    result["whatsapp_error"] = wa_r["error"]

    # 3) SMS كـ fallback — يُرسل فقط إن فشل الواتساب
    if phone_raw and not result["whatsapp_sent"]:
        try:
            from twilio_verify import send_sms, _sms_configured
            if not _sms_configured():
                result["sms_error"] = "sms_not_configured"
            else:
                e164 = await _phone_to_e164(phone_raw)
                if not e164:
                    result["sms_error"] = "invalid_phone"
                else:
                    sms_body = (
                        f"Maestro EGP - مرحباً {display_name}\n"
                        f"حسابك في {tenant_name} جاهز.\n"
                        f"المستخدم: {email or user_doc.get('username', '-')}\n"
                        f"كلمة المرور: {temp_password}\n"
                        f"غيّر كلمة المرور فور الدخول."
                    )
                    ok_sms, sms_ret = await send_sms(e164, sms_body)
                    result["sms_sent"] = bool(ok_sms)
                    if not ok_sms:
                        result["sms_error"] = sms_ret
        except Exception as _se:
            result["sms_error"] = str(_se)

    result["ok"] = bool(result["email_sent"] or result["whatsapp_sent"] or result["sms_sent"])
    
    # 🛡️ إعادة تعيين كلمة المرور فقط في حالة generated_fallback (لا نمس كلمة المرور الأصلية)
    # ننفّذ ذلك فقط إذا نجحت قناة واحدة على الأقل
    if result["ok"] and password_source == "generated_fallback":
        await db.users.update_one(
            {"id": user_doc["id"], "tenant_id": tenant_doc["id"]},
            {"$set": {
                "password": hash_password(temp_password),
                "password_vault": encrypt_plain_password(temp_password),
                "must_change_password": True,
                "welcome_sent_at": datetime.now(timezone.utc).isoformat(),
            }}
        )
        result["temp_password_reset"] = True
    elif result["ok"]:
        # الكلمة الأصلية أُرسلت — نُسجّل فقط أن الترحيب تمّ (بدون لمس كلمة المرور)
        await db.users.update_one(
            {"id": user_doc["id"], "tenant_id": tenant_doc["id"]},
            {"$set": {"welcome_sent_at": datetime.now(timezone.utc).isoformat()}}
        )
        result["temp_password_reset"] = False
    else:
        result["reason"] = "all_channels_failed"
        result["temp_password_reset"] = False
    
    return result


@router.post("/super-admin/tenants/{tenant_id}/send-welcome-to-owner")
async def send_welcome_to_tenant_owner(tenant_id: str, payload: dict = None, current_user: dict = Depends(verify_super_admin)):
    """إرسال ترحيب + بيانات دخول لمالك المطعم (العميل) في تينانت محدد.
    
    payload اختياري: {"custom_password": "..."} — لو مُرسَلة، تُستخدم هذه الكلمة بالضبط
    وتُحدَّث في DB (bcrypt + vault). هذا يضمن أن ما يُرسَل هو ما يريده المشرف تماماً.
    
    المستلم = العميل (tenant admin) — يُستخدم owner_email/owner_phone من التينانت.
    """
    tenant = await db.tenants.find_one({"id": tenant_id}, {"_id": 0})
    if not tenant:
        raise HTTPException(status_code=404, detail="التينانت غير موجود")

    # 🎯 نجلب المالك الفعلي — الذي أُنشئ عند إنشاء التينانت (email مطابق لـ tenant.owner_email)
    # هذا يضمن أن نُرسل لهاني (المالك الحقيقي) وليس لأي admin آخر (مثل معتز — مدير عام بصلاحية admin)
    owner = None
    if tenant.get("owner_email"):
        owner = await db.users.find_one(
            {"tenant_id": tenant_id, "role": UserRole.ADMIN, "email": tenant["owner_email"]},
            {"_id": 0}
        )
    # fallback: لو ما وجدنا مطابقة بالبريد → أقدم admin في التينانت (المالك الأصلي)
    if not owner:
        owner_cursor = db.users.find(
            {"tenant_id": tenant_id, "role": UserRole.ADMIN},
            {"_id": 0}
        ).sort("created_at", 1).limit(1)
        _admins = [u async for u in owner_cursor]
        owner = _admins[0] if _admins else None
    if not owner:
        raise HTTPException(status_code=404, detail="لا يوجد حساب مالك (admin) لهذا التينانت")

    # ✨ إن أرسل المشرف كلمة مرور مخصّصة → نحدّثها في DB + vault ثم نستخدمها
    custom_pw = None
    if payload and isinstance(payload, dict):
        custom_pw = (payload.get("custom_password") or "").strip() or None
    if custom_pw:
        await db.users.update_one(
            {"id": owner["id"], "tenant_id": tenant_id},
            {"$set": {
                "password": hash_password(custom_pw),
                "password_vault": encrypt_plain_password(custom_pw),
            }}
        )
        owner["password_vault"] = encrypt_plain_password(custom_pw)

    effective_owner = dict(owner)
    if tenant.get("owner_email"):
        effective_owner["email"] = tenant["owner_email"]
    if tenant.get("owner_phone"):
        effective_owner["phone"] = tenant["owner_phone"]
    if tenant.get("owner_name") and not effective_owner.get("full_name"):
        effective_owner["full_name"] = tenant["owner_name"]

    result = await _send_welcome_bundle_to_user(effective_owner, tenant, plain_password=custom_pw)
    await record_audit("super_admin.send_welcome_owner", user=current_user, details={
        "tenant_id": tenant_id, "target_user_id": owner.get("id"),
        "used_custom_password": bool(custom_pw),
        "email_used": effective_owner.get("email"), "phone_used": effective_owner.get("phone"),
        "email_sent": result.get("email_sent"), "whatsapp_sent": result.get("whatsapp_sent"),
        "sms_sent": result.get("sms_sent"),
    })
    return {
        "success": result.get("ok", False),
        "tenant_id": tenant_id,
        "tenant_name": tenant.get("name") or tenant.get("slug"),
        "owner": result,
    }


@router.post("/super-admin/tenants/{tenant_id}/send-welcome-to-users")
async def send_welcome_to_all_tenant_users(tenant_id: str, current_user: dict = Depends(verify_super_admin)):
    """إرسال ترحيب + بيانات دخول لجميع مستخدمي التينانت (باستثناء super_admin).
    كل مستخدم يتلقّى بياناته الخاصة على بريده وواتسابه.
    عزل صارم: لا يتم لمس أي مستخدم خارج tenant_id."""
    tenant = await db.tenants.find_one({"id": tenant_id}, {"_id": 0})
    if not tenant:
        raise HTTPException(status_code=404, detail="التينانت غير موجود")

    # 🔒 عزل: كل المستخدمين ضمن هذا التينانت فقط، عدا super_admin
    users_cursor = db.users.find(
        {"tenant_id": tenant_id, "role": {"$ne": UserRole.SUPER_ADMIN}},
        {"_id": 0}
    )
    users = [u async for u in users_cursor]
    if not users:
        return {
            "success": False,
            "tenant_id": tenant_id,
            "tenant_name": tenant.get("name") or tenant.get("slug"),
            "total": 0, "email_sent": 0, "whatsapp_sent": 0,
            "users": [],
            "message": "لا يوجد مستخدمون في هذا التينانت",
        }

    per_user_results = []
    email_sent_count = 0
    whatsapp_sent_count = 0
    for u in users:
        r = await _send_welcome_bundle_to_user(u, tenant)
        per_user_results.append(r)
        if r.get("email_sent"): email_sent_count += 1
        if r.get("whatsapp_sent"): whatsapp_sent_count += 1

    await record_audit("super_admin.send_welcome_users", user=current_user, details={
        "tenant_id": tenant_id, "total": len(users),
        "email_sent": email_sent_count, "whatsapp_sent": whatsapp_sent_count,
    })
    return {
        "success": True,
        "tenant_id": tenant_id,
        "tenant_name": tenant.get("name") or tenant.get("slug"),
        "total": len(users),
        "email_sent": email_sent_count,
        "whatsapp_sent": whatsapp_sent_count,
        "users": per_user_results,
    }

