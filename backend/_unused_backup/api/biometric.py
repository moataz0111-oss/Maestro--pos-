"""
ZKTeco Fingerprint Device Integration
تكامل أجهزة البصمة من ZKTeco
"""
from fastapi import APIRouter, HTTPException, Depends, Request, BackgroundTasks
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
import uuid
import logging
import asyncio

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/biometric", tags=["Biometric Devices"])

# ==================== MODELS ====================

class BiometricDevice(BaseModel):
    """نموذج جهاز البصمة"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    ip_address: str
    port: int = 4370
    serial_number: Optional[str] = None
    branch_id: str
    device_type: str = "fingerprint"  # fingerprint, face, card
    is_active: bool = True
    last_sync: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class BiometricDeviceCreate(BaseModel):
    """إنشاء جهاز جديد"""
    name: str
    ip_address: str
    port: int = 4370
    branch_id: str
    device_type: str = "fingerprint"


class AttendanceRecord(BaseModel):
    """سجل حضور من جهاز البصمة"""
    employee_id: str
    punch_time: str
    punch_type: str  # in, out, break_start, break_end
    device_id: str
    verify_type: str = "fingerprint"  # fingerprint, face, card, password
    device_serial: Optional[str] = None


class ZKTecoPushPayload(BaseModel):
    """بيانات Push من جهاز ZKTeco"""
    AuthToken: Optional[str] = None
    OperationID: Optional[str] = None
    CommandName: Optional[str] = None  # ATT_LOG, USER_INFO, etc.
    VerifyType: Optional[str] = None  # Fingerprint, Face, Card
    PIN: Optional[str] = None  # رقم الموظف
    DateTime: Optional[str] = None
    DeviceSN: Optional[str] = None
    Status: Optional[int] = None  # 0=Check-In, 1=Check-Out


class DeviceConnectionResult(BaseModel):
    """نتيجة الاتصال بالجهاز"""
    success: bool
    message: str
    device_info: Optional[Dict[str, Any]] = None
    users_count: Optional[int] = None
    attendance_count: Optional[int] = None


# ==================== DEVICE CONNECTION HELPER ====================

class ZKTecoConnection:
    """Helper class للاتصال بأجهزة ZKTeco"""
    
    def __init__(self, ip: str, port: int = 4370):
        self.ip = ip
        self.port = port
        self.zk = None
    
    async def connect(self) -> bool:
        """الاتصال بالجهاز"""
        try:
            # محاولة استيراد مكتبة pyzk
            from zk import ZK
            self.zk = ZK(self.ip, port=self.port, timeout=10)
            conn = self.zk.connect()
            return conn is not None
        except ImportError:
            logger.warning("pyzk library not installed. Using mock mode.")
            return True  # Mock mode
        except Exception as e:
            logger.error(f"Failed to connect to device {self.ip}: {e}")
            return False
    
    async def disconnect(self):
        """قطع الاتصال"""
        if self.zk:
            try:
                self.zk.disconnect()
            except:
                pass
    
    async def get_device_info(self) -> Dict[str, Any]:
        """جلب معلومات الجهاز"""
        try:
            if self.zk:
                return {
                    "serial_number": self.zk.get_serialnumber() if hasattr(self.zk, 'get_serialnumber') else "N/A",
                    "device_name": self.zk.get_device_name() if hasattr(self.zk, 'get_device_name') else "ZKTeco Device",
                    "firmware": self.zk.get_firmware_version() if hasattr(self.zk, 'get_firmware_version') else "N/A",
                    "platform": self.zk.get_platform() if hasattr(self.zk, 'get_platform') else "N/A",
                }
        except:
            pass
        return {"serial_number": "N/A", "device_name": "ZKTeco Device"}
    
    async def get_users(self) -> List[Dict]:
        """جلب قائمة المستخدمين المسجلين"""
        try:
            if self.zk:
                users = self.zk.get_users()
                return [{"uid": u.uid, "user_id": u.user_id, "name": u.name} for u in users]
        except:
            pass
        return []
    
    async def get_attendance(self, start_date=None) -> List[Dict]:
        """جلب سجلات الحضور"""
        try:
            if self.zk:
                records = self.zk.get_attendance()
                result = []
                for r in records:
                    record = {
                        "user_id": str(r.user_id),
                        "timestamp": r.timestamp.isoformat() if r.timestamp else None,
                        "status": r.status,
                        "punch": r.punch
                    }
                    if start_date and r.timestamp:
                        if r.timestamp >= start_date:
                            result.append(record)
                    else:
                        result.append(record)
                return result
        except:
            pass
        return []
    
    async def enroll_user(self, user_id: str, name: str) -> bool:
        """تسجيل مستخدم جديد على الجهاز"""
        try:
            if self.zk:
                self.zk.set_user(uid=int(user_id), name=name)
                return True
        except Exception as e:
            logger.error(f"Failed to enroll user: {e}")
        return False
    
    async def delete_user(self, user_id: str) -> bool:
        """حذف مستخدم من الجهاز"""
        try:
            if self.zk:
                self.zk.delete_user(uid=int(user_id))
                return True
        except Exception as e:
            logger.error(f"Failed to delete user: {e}")
        return False


# ==================== DATABASE DEPENDENCY ====================
# Note: سيتم استبدالها بالاتصال الفعلي من server.py

async def get_db():
    """Placeholder for database dependency"""
    # سيتم استيرادها من ملف مشترك عند التكامل الكامل
    pass


# ==================== ROUTES ====================

# --- إدارة الأجهزة ---

@router.get("/devices", response_model=List[Dict])
async def list_devices(branch_id: Optional[str] = None):
    """قائمة أجهزة البصمة"""
    # Mock response - سيتم ربطها بقاعدة البيانات
    return [
        {
            "id": "mock-device-1",
            "name": "جهاز بصمة الفرع الرئيسي",
            "ip_address": "192.168.1.100",
            "port": 4370,
            "branch_id": branch_id or "main",
            "device_type": "fingerprint",
            "is_active": True,
            "last_sync": None,
            "status": "not_connected"
        }
    ]


@router.post("/devices")
async def create_device(device: BiometricDeviceCreate):
    """إضافة جهاز بصمة جديد"""
    new_device = BiometricDevice(
        name=device.name,
        ip_address=device.ip_address,
        port=device.port,
        branch_id=device.branch_id,
        device_type=device.device_type
    )
    
    # Mock save - سيتم حفظه في قاعدة البيانات
    return {
        "message": "تم إضافة الجهاز بنجاح",
        "device": new_device.model_dump()
    }


@router.post("/devices/{device_id}/test-connection")
async def test_device_connection(device_id: str, ip_address: str, port: int = 4370):
    """اختبار الاتصال بجهاز البصمة"""
    try:
        connection = ZKTecoConnection(ip_address, port)
        connected = await connection.connect()
        
        if connected:
            device_info = await connection.get_device_info()
            users = await connection.get_users()
            await connection.disconnect()
            
            return DeviceConnectionResult(
                success=True,
                message="تم الاتصال بنجاح",
                device_info=device_info,
                users_count=len(users)
            )
        else:
            return DeviceConnectionResult(
                success=False,
                message="فشل الاتصال بالجهاز. تأكد من عنوان IP والمنفذ."
            )
    except Exception as e:
        logger.error(f"Connection test failed: {e}")
        return DeviceConnectionResult(
            success=False,
            message=f"خطأ: {str(e)}"
        )


@router.post("/devices/{device_id}/sync")
async def sync_device_attendance(
    device_id: str, 
    ip_address: str, 
    port: int = 4370,
    background_tasks: BackgroundTasks = None
):
    """مزامنة سجلات الحضور من الجهاز"""
    try:
        connection = ZKTecoConnection(ip_address, port)
        connected = await connection.connect()
        
        if not connected:
            raise HTTPException(status_code=400, detail="فشل الاتصال بالجهاز")
        
        # جلب سجلات الحضور
        attendance_records = await connection.get_attendance()
        await connection.disconnect()
        
        # TODO: حفظ السجلات في قاعدة البيانات
        # وربطها بجدول حضور الموظفين
        
        return {
            "message": "تمت المزامنة بنجاح",
            "records_count": len(attendance_records),
            "records": attendance_records[:10]  # أول 10 سجلات فقط
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Sync failed: {e}")
        raise HTTPException(status_code=500, detail=f"فشل المزامنة: {str(e)}")


@router.delete("/devices/{device_id}")
async def delete_device(device_id: str):
    """حذف جهاز بصمة"""
    # Mock delete
    return {"message": "تم حذف الجهاز بنجاح"}


# --- Push API (للاستقبال من الأجهزة مباشرة) ---

@router.post("/push/attendance")
async def receive_attendance_push(request: Request):
    """
    استقبال بيانات الحضور من أجهزة ZKTeco (Push SDK)
    يجب تكوين الجهاز لإرسال البيانات لهذا الـ endpoint
    """
    try:
        body = await request.body()
        data = await request.json() if body else {}
        
        logger.info(f"Received push data: {data}")
        
        # استخراج البيانات
        payload = ZKTecoPushPayload(**data) if data else None
        
        if payload and payload.PIN:
            # معالجة سجل الحضور
            punch_type = "in" if payload.Status == 0 else "out"
            
            attendance_record = AttendanceRecord(
                employee_id=payload.PIN,
                punch_time=payload.DateTime or datetime.now(timezone.utc).isoformat(),
                punch_type=punch_type,
                device_id=payload.DeviceSN or "unknown",
                verify_type=payload.VerifyType or "fingerprint"
            )
            
            # TODO: حفظ في قاعدة البيانات
            logger.info(f"Attendance: Employee {attendance_record.employee_id} - {punch_type}")
            
            return {
                "status": "received",
                "OperationID": payload.OperationID,
                "message": "تم استلام البيانات"
            }
        
        return {"status": "no_data", "message": "لا توجد بيانات حضور"}
    
    except Exception as e:
        logger.error(f"Push error: {e}")
        return {"status": "error", "message": str(e)}


# --- إدارة المستخدمين على الأجهزة ---

@router.post("/devices/{device_id}/users")
async def enroll_user_on_device(
    device_id: str, 
    ip_address: str, 
    user_id: str, 
    user_name: str,
    port: int = 4370
):
    """تسجيل موظف على جهاز البصمة"""
    try:
        connection = ZKTecoConnection(ip_address, port)
        connected = await connection.connect()
        
        if not connected:
            raise HTTPException(status_code=400, detail="فشل الاتصال بالجهاز")
        
        success = await connection.enroll_user(user_id, user_name)
        await connection.disconnect()
        
        if success:
            return {
                "message": f"تم تسجيل الموظف {user_name} بنجاح",
                "user_id": user_id
            }
        else:
            raise HTTPException(status_code=400, detail="فشل تسجيل الموظف")
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/devices/{device_id}/users")
async def list_device_users(device_id: str, ip_address: str, port: int = 4370):
    """قائمة المستخدمين المسجلين على الجهاز"""
    try:
        connection = ZKTecoConnection(ip_address, port)
        connected = await connection.connect()
        
        if not connected:
            raise HTTPException(status_code=400, detail="فشل الاتصال بالجهاز")
        
        users = await connection.get_users()
        await connection.disconnect()
        
        return {"users": users, "count": len(users)}
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/devices/{device_id}/users/{user_id}")
async def remove_user_from_device(
    device_id: str, 
    user_id: str, 
    ip_address: str, 
    port: int = 4370
):
    """حذف مستخدم من جهاز البصمة"""
    try:
        connection = ZKTecoConnection(ip_address, port)
        connected = await connection.connect()
        
        if not connected:
            raise HTTPException(status_code=400, detail="فشل الاتصال بالجهاز")
        
        success = await connection.delete_user(user_id)
        await connection.disconnect()
        
        if success:
            return {"message": f"تم حذف المستخدم {user_id} بنجاح"}
        else:
            raise HTTPException(status_code=400, detail="فشل حذف المستخدم")
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
