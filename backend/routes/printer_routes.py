"""Printer Routes (extracted from server.py)"""
from fastapi import APIRouter
from server import *  # noqa: F401,F403

router = APIRouter()

# ==================== PRINTER ROUTES ====================

class PrinterCreate(BaseModel):
    model_config = ConfigDict(extra="ignore")
    name: str
    ip_address: Optional[str] = ""
    port: int = 9100
    branch_id: Optional[str] = ""  # اختياري لتفادي 422 في UPDATE عند إرسال null
    printer_type: str = "receipt"  # النوع: receipt, kitchen, bar, packaging, label, custom
    connection_type: str = "network"  # network أو usb
    usb_printer_name: Optional[str] = ""  # اسم الطابعة في Windows للطباعة USB
    custom_type_name: Optional[str] = None  # اسم مخصص للنوع إذا كان custom
    # صلاحيات الطباعة
    print_mode: str = "full_receipt"  # full_receipt, orders_only, selected_products
    show_prices: bool = True  # عرض الأسعار في الطباعة
    print_individual_items: bool = False  # طباعة كل صنف على حدة
    auto_print_on_order: bool = True  # طباعة تلقائية عند الطلب

@router.post("/printers")
async def create_printer(printer: PrinterCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in [UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    tenant_id = get_user_tenant_id(current_user)
    printer_doc = {
        "id": str(uuid.uuid4()),
        **printer.model_dump(),
        "tenant_id": tenant_id,  # ربط الطابعة بالعميل
        "is_active": True,
        "is_online": False,
        "last_check": None
    }
    await db.printers.insert_one(printer_doc)
    del printer_doc["_id"]
    return printer_doc

@router.get("/printer-types")
async def get_printer_types(current_user: dict = Depends(get_current_user)):
    """جلب أنواع الطابعات المتاحة"""
    default_types = [
        {"id": "receipt", "name": "طابعة إيصالات", "name_en": "Receipt Printer", "icon": "Receipt"},
        {"id": "kitchen", "name": "طابعة مطبخ", "name_en": "Kitchen Printer", "icon": "ChefHat"},
        {"id": "bar", "name": "طابعة بار/مشروبات", "name_en": "Bar Printer", "icon": "Wine"},
        {"id": "packaging", "name": "طابعة تغليف", "name_en": "Packaging Printer", "icon": "Package"},
        {"id": "label", "name": "طابعة ملصقات", "name_en": "Label Printer", "icon": "Tag"},
    ]
    
    # جلب الأنواع المخصصة للعميل
    tenant_id = get_user_tenant_id(current_user)
    query = {"tenant_id": tenant_id} if tenant_id else {}
    custom_types = await db.printer_types.find(query, {"_id": 0}).to_list(50)
    
    return {"default": default_types, "custom": custom_types}

@router.post("/printer-types")
async def create_printer_type(type_data: dict, current_user: dict = Depends(get_current_user)):
    """إضافة نوع طابعة مخصص"""
    if current_user["role"] not in [UserRole.ADMIN, UserRole.MANAGER]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    tenant_id = get_user_tenant_id(current_user)
    type_doc = {
        "id": str(uuid.uuid4()),
        "name": type_data.get("name"),
        "name_en": type_data.get("name_en", type_data.get("name")),
        "icon": type_data.get("icon", "Printer"),
        "tenant_id": tenant_id,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.printer_types.insert_one(type_doc)
    del type_doc["_id"]
    return type_doc

@router.delete("/printer-types/{type_id}")
async def delete_printer_type(type_id: str, current_user: dict = Depends(get_current_user)):
    """حذف نوع طابعة مخصص"""
    query = build_tenant_query(current_user, {"id": type_id})
    await db.printer_types.delete_one(query)
    return {"message": "تم الحذف"}

@router.get("/printers")
async def get_printers(branch_id: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    # فلترة حسب tenant_id لفصل بيانات كل عميل
    query = build_tenant_query(current_user)
    if branch_id:
        query["branch_id"] = branch_id
    printers = await db.printers.find(query, {"_id": 0}).to_list(50)
    return printers

@router.put("/printers/{printer_id}")
async def update_printer(printer_id: str, printer: dict, current_user: dict = Depends(get_current_user)):
    """تحديث طابعة - يقبل partial update (أي حقول، حتى is_online فقط)"""
    if current_user["role"] not in [UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    # التحقق من أن الطابعة تنتمي لنفس العميل
    query = build_tenant_query(current_user, {"id": printer_id})
    existing = await db.printers.find_one(query)
    if not existing:
        raise HTTPException(status_code=404, detail="الطابعة غير موجودة")
    
    # إزالة حقول محظورة من الـ update (id, tenant_id, _id)
    update_data = {k: v for k, v in (printer or {}).items() if k not in ("id", "_id", "tenant_id")}
    if not update_data:
        return {**existing, "_id": None}
    update_data.pop("_id", None)
    existing.pop("_id", None)
    await db.printers.update_one({"id": printer_id}, {"$set": update_data})
    updated = await db.printers.find_one({"id": printer_id}, {"_id": 0})
    return updated

@router.delete("/printers/{printer_id}")
async def delete_printer(printer_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] not in [UserRole.ADMIN, UserRole.MANAGER, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="غير مصرح")
    
    # التحقق من أن الطابعة تنتمي لنفس العميل
    query = build_tenant_query(current_user, {"id": printer_id})
    result = await db.printers.delete_one(query)
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="الطابعة غير موجودة")
    return {"message": "تم حذف الطابعة بنجاح"}

@router.post("/printers/{printer_id}/test")
async def test_printer_connection(printer_id: str, current_user: dict = Depends(get_current_user)):
    """اختبار اتصال الطابعة (سريع - 1.5 ثانية timeout)"""
    import socket
    
    # التحقق من أن الطابعة تنتمي لنفس العميل
    query = build_tenant_query(current_user, {"id": printer_id})
    printer = await db.printers.find_one(query, {"_id": 0})
    if not printer:
        raise HTTPException(status_code=404, detail="الطابعة غير موجودة")
    
    connection_type = printer.get("connection_type", "network")
    ip = printer.get("ip_address", "")
    port = printer.get("port", 9100)
    
    # طابعة USB: نعتمد على حالة الوسيط (لا معنى لفحص socket)
    if connection_type == "usb" or not ip:
        agent_hb = await db.agent_heartbeats.find_one(
            {"branch_id": printer.get("branch_id", "")},
            {"_id": 0, "last_seen": 1},
            sort=[("last_seen", -1)]
        )
        if agent_hb:
            try:
                last_dt = datetime.fromisoformat(agent_hb["last_seen"].replace("Z", "+00:00"))
                age = (datetime.now(timezone.utc) - last_dt).total_seconds()
                if age < 60:
                    await db.printers.update_one(query, {"$set": {"is_online": True, "last_check": datetime.now(timezone.utc).isoformat()}})
                    return {"status": "online", "message": "الوسيط متصل - الطابعة جاهزة"}
            except Exception:
                pass
        await db.printers.update_one(query, {"$set": {"is_online": False, "last_check": datetime.now(timezone.utc).isoformat()}})
        return {"status": "offline", "message": "الوسيط غير متصل - شغّل الوسيط على جهاز الكاشير"}
    
    # طابعة شبكية: فحص socket سريع
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(1.5)  # timeout أسرع لتحسين UX
        result = sock.connect_ex((ip, port))
        sock.close()
        
        if result == 0:
            await db.printers.update_one(query, {"$set": {"is_online": True, "last_check": datetime.now(timezone.utc).isoformat()}})
            return {"status": "online", "message": "الطابعة متصلة"}
        else:
            await db.printers.update_one(query, {"$set": {"is_online": False, "last_check": datetime.now(timezone.utc).isoformat()}})
            return {"status": "offline", "message": "الطابعة غير متصلة - تحقق من IP"}
    except socket.error as e:
        await db.printers.update_one(query, {"$set": {"is_online": False, "last_check": datetime.now(timezone.utc).isoformat()}})
        return {"status": "error", "message": f"خطأ في الاتصال: {str(e)}"}


PRINT_AGENT_VERSION = "6.5.0"

@router.get("/print-agent-version")
async def get_print_agent_version():
    """إرجاع آخر إصدار متاح للوسيط"""
    return {"version": PRINT_AGENT_VERSION}


@router.get("/print-agent-script")
async def get_print_agent_script(branch_id: str = ""):
    """إرجاع ملف server.ps1 مع حقن رقم النسخة و branch_id (لعزل الفروع)"""
    from fastapi.responses import Response
    ps1_path = ROOT_DIR / "static" / "print_server.ps1"
    if not ps1_path.exists():
        raise HTTPException(status_code=404, detail="ملف وسيط الطباعة غير موجود")
    ps1_code = ps1_path.read_text(encoding='utf-8')
    # حقن النسخة الحالية + branch_id لعزل أوامر الطباعة بين الفروع
    ps1_code = ps1_code.replace("{{AGENT_VERSION}}", PRINT_AGENT_VERSION)
    ps1_code = ps1_code.replace("{{BRANCH_ID}}", branch_id or "")
    return Response(
        content=ps1_code,
        media_type="text/plain",
        headers={
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0"
        }
    )


@router.get("/download-print-agent")
async def download_print_agent(request: Request, branch_id: str = ""):
    """تحميل وسيط الطباعة المحلي - ملف bat بسيط يحمّل من الإنترنت.
    
    يجب تمرير branch_id لعزل أوامر الطباعة بين الفروع (مهم للعملاء متعددي الفروع)
    """
    from fastapi.responses import Response

    ps1_path = ROOT_DIR / "static" / "print_server.ps1"
    if not ps1_path.exists():
        raise HTTPException(status_code=404, detail="ملف وسيط الطباعة غير موجود")

    # Build the download URL from request headers
    host = request.headers.get('x-forwarded-host') or request.headers.get('host', 'localhost:8001')
    scheme = request.headers.get('x-forwarded-proto', 'https')
    # تمرير branch_id ليحقنه السيرفر في ملف ps1
    script_url = f"{scheme}://{host}/api/print-agent-script?branch_id={branch_id}"
    backend_url = f"{scheme}://{host}"

    bat_lines = [
        '@echo off',
        'chcp 65001 >nul 2>&1',
        '',
        'REM ======================================================',
        f'REM   Maestro Print Agent v{PRINT_AGENT_VERSION} - Full Clean Install',
        'REM ======================================================',
        '',
        'REM === Request Admin ===',
        'net session >nul 2>&1',
        'if %errorlevel% neq 0 (',
        '    powershell -Command "Start-Process \'%~f0\' -Verb RunAs"',
        '    exit /b',
        ')',
        '',
        f'title Maestro Print Agent v{PRINT_AGENT_VERSION} - Clean Install',
        'color 0A',
        'echo.',
        'echo  ========================================',
        f'echo    Maestro Print Agent v{PRINT_AGENT_VERSION}',
        'echo    Full Clean Install',
        'echo  ========================================',
        'echo.',
        '',
        'set "D=%LOCALAPPDATA%\\MaestroPrintAgent"',
        'set "S=%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\Startup"',
        '',
        'REM ========================================',
        'REM   STEP 1: KILL EVERYTHING',
        'REM ========================================',
        'echo  [1/6] KILLING all old agent processes...',
        '',
        'REM Kill VBS launchers',
        'taskkill /F /IM wscript.exe >nul 2>&1',
        'del /F /Q "%S%\\MaestroPrintAgent.vbs" >nul 2>&1',
        '',
        'REM Kill ALL PowerShell running any agent script',
        'powershell -NoProfile -Command "Get-Process powershell -ErrorAction SilentlyContinue | Where-Object { $_.Id -ne $PID } | ForEach-Object { try { $cmd = (Get-CimInstance Win32_Process -Filter (\'ProcessId=\'+$_.Id)).CommandLine; if ($cmd -match \'server\\.ps1|print_server|MaestroPrintAgent\') { Stop-Process -Id $_.Id -Force; Write-Host \'    Killed PID:\' $_.Id } } catch {} }"',
        '',
        'REM Kill by port 9999 - round 1',
        'for /f "tokens=5" %%p in (\'netstat -aon 2^>nul ^| findstr ":9999 " ^| findstr /i "LISTEN"\') do (',
        '    echo    - Killing port 9999 PID %%p',
        '    taskkill /F /PID %%p >nul 2>&1',
        ')',
        '',
        'echo    Waiting 3 seconds...',
        'timeout /t 3 /nobreak >nul',
        '',
        'REM Kill by port 9999 - round 2 (force)',
        'for /f "tokens=5" %%p in (\'netstat -aon 2^>nul ^| findstr ":9999 " ^| findstr /i "LISTEN"\') do (',
        '    echo    - Force killing PID %%p',
        '    taskkill /F /PID %%p >nul 2>&1',
        ')',
        'timeout /t 2 /nobreak >nul',
        '',
        'REM Kill by port 9999 - round 3 (nuclear)',
        'for /f "tokens=5" %%p in (\'netstat -aon 2^>nul ^| findstr ":9999"\') do (',
        '    taskkill /F /PID %%p >nul 2>&1',
        ')',
        'timeout /t 2 /nobreak >nul',
        'echo    [OK] All processes killed',
        'echo.',
        '',
        'REM ========================================',
        'REM   STEP 2: DELETE EVERYTHING',
        'REM ========================================',
        'echo  [2/6] DELETING all old files...',
        '',
        'REM Method 1: rd',
        'if exist "%D%" (',
        '    echo    - Removing directory...',
        '    rd /s /q "%D%" >nul 2>&1',
        '    timeout /t 1 /nobreak >nul',
        ')',
        '',
        'REM Method 2: del + rd',
        'if exist "%D%" (',
        '    echo    - Force deleting files...',
        '    del /F /S /Q "%D%\\*.*" >nul 2>&1',
        '    for /d %%d in ("%D%\\*") do rd /s /q "%%d" >nul 2>&1',
        '    rd /s /q "%D%" >nul 2>&1',
        '    timeout /t 1 /nobreak >nul',
        ')',
        '',
        'REM Method 3: PowerShell force remove',
        'if exist "%D%" (',
        '    echo    - PowerShell force remove...',
        '    powershell -NoProfile -Command "Remove-Item -Path \'%D%\' -Recurse -Force -ErrorAction SilentlyContinue"',
        '    timeout /t 2 /nobreak >nul',
        ')',
        '',
        'REM Method 4: Rename and delete',
        'if exist "%D%" (',
        '    echo    - Rename trick...',
        '    ren "%D%" "MaestroPrintAgent_OLD_%RANDOM%" >nul 2>&1',
        ')',
        '',
        'REM Register URL ACL for all users (prevents permission issues)',
        'netsh http delete urlacl url=http://localhost:9999/ >nul 2>&1',
        'netsh http delete urlacl url=https://localhost:9443/ >nul 2>&1',
        'netsh http delete urlacl url=http://+:9999/ >nul 2>&1',
        'netsh http add urlacl url=http://localhost:9999/ user=Everyone listen=yes >nul 2>&1',
        'netsh http add urlacl url=https://localhost:9443/ user=Everyone listen=yes >nul 2>&1',
        '',
        'REM Create fresh directory',
        'mkdir "%D%" >nul 2>&1',
        'echo    [OK] Clean directory ready',
        'echo.',
        '',
        'REM ========================================',
        f'REM   STEP 3: DOWNLOAD FRESH v{PRINT_AGENT_VERSION}',
        'REM ========================================',
        f'echo  [3/6] Downloading v{PRINT_AGENT_VERSION} (no cache)...',
        'powershell -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $headers=@{\'Cache-Control\'=\'no-cache\';\'Pragma\'=\'no-cache\'}; Invoke-WebRequest -Uri \'' + script_url + '\' -OutFile \'%D%\\server.ps1\' -UseBasicParsing -Headers $headers"',
        '',
        'if not exist "%D%\\server.ps1" (',
        '    echo    [ERROR] Download failed! Retrying...',
        '    timeout /t 3 /nobreak >nul',
        '    powershell -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri \'' + script_url + '?t=%RANDOM%\' -OutFile \'%D%\\server.ps1\' -UseBasicParsing"',
        ')',
        '',
        'if not exist "%D%\\server.ps1" (',
        '    echo    [ERROR] Download failed!',
        '    echo    Check your internet connection.',
        '    pause',
        '    exit /b 1',
        ')',
        '',
        'REM Verify downloaded version',
        'powershell -NoProfile -Command "$c=Get-Content \'%D%\\server.ps1\' -Raw; if($c -match \'v4\\.\'){Write-Host \'    Downloaded OK\' -ForegroundColor Green}else{Write-Host \'    WARNING: Version mismatch!\' -ForegroundColor Red}"',
        'echo    [OK]',
        'echo.',
        '',
        'REM ========================================',
        'REM   STEP 4: START NEW AGENT',
        'REM ========================================',
        '',
        'REM ========================================',
        'REM   STEP 3.5: HTTPS CERTIFICATE SETUP',
        'REM ========================================',
        'echo  [3.5/6] Setting up HTTPS certificate...',
        'powershell -ExecutionPolicy Bypass -NoProfile -Command "& { $d=$env:LOCALAPPDATA+\'\\MaestroPrintAgent\'; try { $ex=Get-ChildItem Cert:\\LocalMachine\\My -ErrorAction SilentlyContinue | Where-Object {$_.Subject -eq \'CN=MaestroPrintAgent\'}; if($ex){$t=$ex[0].Thumbprint; Write-Host \'    Cert exists:\' $t -ForegroundColor Green; $cp=$d+\'\\cert.cer\'; if(-not(Test-Path $cp)){Export-Certificate -Cert $ex[0] -FilePath $cp -Force|Out-Null}} else {$c=New-SelfSignedCertificate -DnsName \'localhost\',\'127.0.0.1\' -CertStoreLocation \'Cert:\\LocalMachine\\My\' -FriendlyName \'Maestro Print Agent\' -Subject \'CN=MaestroPrintAgent\' -NotAfter (Get-Date).AddYears(10) -KeyAlgorithm RSA -KeyLength 2048 -KeyExportPolicy Exportable; $t=$c.Thumbprint; Write-Host \'    Cert created:\' $t -ForegroundColor Green; Export-Certificate -Cert $c -FilePath ($d+\'\\cert.cer\') -Force|Out-Null}; certutil -addstore Root ($d+\'\\cert.cer\')|Out-Null; Write-Host \'    Cert trusted (certutil)\' -ForegroundColor Green; netsh http delete sslcert ipport=0.0.0.0:9443|Out-Null; netsh http add sslcert ipport=0.0.0.0:9443 certhash=$t appid=\'{d4a1c0e1-0000-0000-0000-000000000001}\'|Out-Null; Write-Host \'    SSL port 9443 OK\' -ForegroundColor Green } catch { Write-Host \'    HTTPS error:\' $_.Exception.Message -ForegroundColor Yellow } }"',
        '',
        f'echo  [4/6] Starting new agent v{PRINT_AGENT_VERSION}...',
        f'echo {{"backend_url":"{backend_url}"}} > "%D%\\config.json"',
        'start "" powershell -ExecutionPolicy Bypass -NoProfile -WindowStyle Hidden -File "%D%\\server.ps1"',
        'echo    [OK]',
        'echo.',
        '',
        'REM ========================================',
        'REM   STEP 5: AUTO-START SETUP',
        'REM ========================================',
        'echo  [5/6] Setting auto-start...',
        'powershell -NoProfile -Command "$d=$env:LOCALAPPDATA+\'\\MaestroPrintAgent\'; $q=[char]34; $vbs=\'Set s=CreateObject(\'+$q+\'WScript.Shell\'+$q+\')\'+[char]13+[char]10+\'s.Run \'+$q+\'powershell -ExecutionPolicy Bypass -NoProfile -WindowStyle Hidden -File \'+$q+$q+$d+\'\\server.ps1\'+$q+$q+$q+\', 0, False\'; [IO.File]::WriteAllText(($d+\'\\launcher.vbs\'),$vbs); Copy-Item ($d+\'\\launcher.vbs\') ($env:APPDATA+\'\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\MaestroPrintAgent.vbs\') -Force"',
        'echo    [OK]',
        '',
        'REM ========================================',
        'REM   STEP 6: WATCHDOG SCHEDULED TASK',
        'REM   يفحص كل 2 دقيقة ويعيد تشغيل الوسيط',
        'REM ========================================',
        'echo  [6/6] Setting up watchdog (auto-restart every 2 min)...',
        '',
        'REM إنشاء سكربت الحارس (watchdog) بدون نافذة مرئية',
        'echo try{Invoke-WebRequest -Uri http://localhost:9999/status -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop}catch{$s=$env:LOCALAPPDATA+\'\\MaestroPrintAgent\\server.ps1\';if(Test-Path $s){Start-Process powershell -ArgumentList \'-ExecutionPolicy Bypass -NoProfile -WindowStyle Hidden -File\',\"`\"$s`\"\"-WindowStyle Hidden}} > "%D%\\watchdog.ps1"',
        '',
        'REM إنشاء VBS wrapper لإخفاء نافذة PowerShell بالكامل (بدون وميض أزرق)',
        'echo Set s=CreateObject("WScript.Shell")>"%D%\\watchdog.vbs"',
        'echo s.Run "powershell -ExecutionPolicy Bypass -NoProfile -WindowStyle Hidden -File "^&Chr(34)^&"%D%\\watchdog.ps1"^&Chr(34), 0, False>>"%D%\\watchdog.vbs"',
        '',
        'REM حذف المهمة القديمة وإنشاء جديدة عبر VBS (بدون وميض)',
        'schtasks /Delete /TN "MaestroPrintAgentWatchdog" /F >nul 2>&1',
        'schtasks /Create /TN "MaestroPrintAgentWatchdog" /TR "wscript.exe \"%LOCALAPPDATA%\\MaestroPrintAgent\\watchdog.vbs\"" /SC MINUTE /MO 1 /RL HIGHEST /F >nul 2>&1',
        '',
        'if %errorlevel% equ 0 (',
        '    echo    [OK] Watchdog scheduled task created',
        ') else (',
        '    echo    [WARNING] Could not create scheduled task - agent will still auto-start on boot',
        ')',
        'echo.',
        '',
        'REM === Verify Running ===',
        'echo.',
        'echo  Verifying agent is running...',
        'timeout /t 10 /nobreak >nul',
        f'powershell -NoProfile -Command "try {{ $r=Invoke-WebRequest -Uri \'http://localhost:9999/status\' -UseBasicParsing -TimeoutSec 10; $j=$r.Content|ConvertFrom-Json; Write-Host (\'  Agent Version: \'+$j.version) -ForegroundColor Green; if($j.version -eq \'{PRINT_AGENT_VERSION}\'){{Write-Host \'  v{PRINT_AGENT_VERSION} OK!\' -ForegroundColor Green}}else{{Write-Host \'  WARNING: Expected {PRINT_AGENT_VERSION} got \'+$j.version -ForegroundColor Red}} }} catch {{ Write-Host \'  Agent starting... wait 30 sec and refresh browser\' -ForegroundColor Yellow }}"',
        'echo.',
        'echo  ========================================',
        'echo    DONE! Refresh the POS page.',
        f'echo    Agent v{PRINT_AGENT_VERSION} installed.',
        'echo  ========================================',
        'echo.',
        'pause',
        'exit /b',
    ]
    bat_content = '\r\n'.join(bat_lines) + '\r\n'

    return Response(
        content=bat_content,
        media_type="application/x-msdos-program",
        headers={
            "Content-Disposition": "attachment; filename=MaestroPrintAgent_v3.2.bat",
            "Content-Type": "application/x-msdos-program",
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0"
        }
    )

