"""
Push Notifications System
نظام الإشعارات الفورية
"""
from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
import uuid
import logging
import json

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/notifications", tags=["Push Notifications"])

# ==================== MODELS ====================

class PushSubscription(BaseModel):
    """اشتراك Push للمتصفح"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    user_type: str  # driver, admin, customer
    endpoint: str
    keys: Dict[str, str]  # p256dh, auth
    device_type: str = "web"  # web, android, ios
    device_name: Optional[str] = None
    branch_id: Optional[str] = None
    tenant_id: Optional[str] = None
    is_active: bool = True
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class PushSubscriptionCreate(BaseModel):
    """إنشاء اشتراك"""
    user_id: str
    user_type: str
    endpoint: str
    keys: Dict[str, str]
    device_type: str = "web"
    device_name: Optional[str] = None
    branch_id: Optional[str] = None

class FCMToken(BaseModel):
    """Firebase Cloud Messaging Token"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    user_type: str
    token: str
    device_type: str = "web"
    device_id: Optional[str] = None
    branch_id: Optional[str] = None
    tenant_id: Optional[str] = None
    is_active: bool = True
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: Optional[str] = None

class FCMTokenCreate(BaseModel):
    """تسجيل FCM Token"""
    user_id: str
    user_type: str
    token: str
    device_type: str = "web"
    device_id: Optional[str] = None
    branch_id: Optional[str] = None

class NotificationPayload(BaseModel):
    """حمولة الإشعار"""
    title: str
    body: str
    icon: Optional[str] = "/icons/icon-192.png"
    badge: Optional[str] = "/icons/icon-96.png"
    image: Optional[str] = None
    tag: Optional[str] = None
    data: Dict[str, Any] = {}
    actions: List[Dict[str, str]] = []
    require_interaction: bool = False
    silent: bool = False

class SendNotificationRequest(BaseModel):
    """طلب إرسال إشعار"""
    target_type: str  # user, role, branch, all
    target_id: Optional[str] = None  # user_id, role, branch_id
    notification: NotificationPayload
    priority: str = "high"  # high, normal

class NotificationLog(BaseModel):
    """سجل الإشعارات"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    target_type: str
    target_id: Optional[str] = None
    title: str
    body: str
    data: Dict[str, Any] = {}
    status: str = "sent"  # sent, delivered, failed
    sent_count: int = 0
    failed_count: int = 0
    error_message: Optional[str] = None
    tenant_id: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

# ==================== NOTIFICATION TEMPLATES ====================

NOTIFICATION_TEMPLATES = {
    "new_order": {
        "title": "طلب جديد! 🔔",
        "body": "طلب جديد #{order_number} بقيمة {total} د.ع",
        "icon": "/icons/icon-192.png",
        "tag": "new-order",
        "require_interaction": True,
        "actions": [
            {"action": "view", "title": "عرض الطلب"},
            {"action": "dismiss", "title": "تجاهل"}
        ]
    },
    "order_assigned": {
        "title": "تم تعيين طلب لك 📦",
        "body": "طلب #{order_number} - {customer_address}",
        "icon": "/icons/icon-192.png",
        "tag": "order-assigned",
        "require_interaction": True,
        "actions": [
            {"action": "accept", "title": "قبول"},
            {"action": "reject", "title": "رفض"}
        ]
    },
    "order_ready": {
        "title": "الطلب جاهز للاستلام 🍽️",
        "body": "طلب #{order_number} جاهز للتوصيل",
        "icon": "/icons/icon-192.png",
        "tag": "order-ready"
    },
    "order_delivered": {
        "title": "تم التوصيل ✅",
        "body": "طلب #{order_number} تم توصيله بنجاح",
        "icon": "/icons/icon-192.png"
    },
    "low_stock": {
        "title": "تنبيه مخزون ⚠️",
        "body": "{material_name} وصل للحد الأدنى ({current}/{min})",
        "icon": "/icons/icon-192.png",
        "tag": "low-stock"
    },
    "shift_reminder": {
        "title": "تذكير بالوردية ⏰",
        "body": "ورديتك تبدأ خلال 30 دقيقة",
        "icon": "/icons/icon-192.png"
    }
}

# ==================== FIREBASE INTEGRATION ====================

class FirebaseNotificationService:
    """خدمة إشعارات Firebase"""
    
    def __init__(self):
        self.initialized = False
        self.app = None
    
    async def initialize(self, credentials_path: str = None):
        """تهيئة Firebase Admin SDK"""
        try:
            import firebase_admin
            from firebase_admin import credentials
            
            if not firebase_admin._apps:
                if credentials_path:
                    cred = credentials.Certificate(credentials_path)
                    self.app = firebase_admin.initialize_app(cred)
                else:
                    # Use default credentials
                    self.app = firebase_admin.initialize_app()
                
                self.initialized = True
                logger.info("Firebase Admin SDK initialized successfully")
            else:
                self.app = firebase_admin.get_app()
                self.initialized = True
        except ImportError:
            logger.warning("firebase-admin not installed. Using mock mode.")
        except Exception as e:
            logger.error(f"Failed to initialize Firebase: {e}")
    
    async def send_to_token(self, token: str, notification: NotificationPayload) -> bool:
        """إرسال إشعار لجهاز واحد"""
        if not self.initialized:
            logger.warning("Firebase not initialized. Skipping notification.")
            return False
        
        try:
            from firebase_admin import messaging
            
            message = messaging.Message(
                notification=messaging.Notification(
                    title=notification.title,
                    body=notification.body,
                    image=notification.image
                ),
                data={k: str(v) for k, v in notification.data.items()},
                token=token,
                android=messaging.AndroidConfig(
                    priority="high",
                    notification=messaging.AndroidNotification(
                        icon=notification.icon,
                        color="#10b981"
                    )
                ),
                webpush=messaging.WebpushConfig(
                    notification=messaging.WebpushNotification(
                        icon=notification.icon,
                        badge=notification.badge,
                        tag=notification.tag,
                        require_interaction=notification.require_interaction,
                        actions=[
                            messaging.WebpushNotificationAction(action=a["action"], title=a["title"])
                            for a in notification.actions
                        ] if notification.actions else None
                    )
                )
            )
            
            response = messaging.send(message)
            logger.info(f"Successfully sent message: {response}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to send notification: {e}")
            return False
    
    async def send_to_multiple(self, tokens: List[str], notification: NotificationPayload) -> Dict[str, int]:
        """إرسال إشعار لعدة أجهزة"""
        if not self.initialized:
            logger.warning("Firebase not initialized. Skipping notifications.")
            return {"success": 0, "failure": len(tokens)}
        
        try:
            from firebase_admin import messaging
            
            message = messaging.MulticastMessage(
                notification=messaging.Notification(
                    title=notification.title,
                    body=notification.body,
                    image=notification.image
                ),
                data={k: str(v) for k, v in notification.data.items()},
                tokens=tokens,
                webpush=messaging.WebpushConfig(
                    notification=messaging.WebpushNotification(
                        icon=notification.icon,
                        badge=notification.badge,
                        tag=notification.tag
                    )
                )
            )
            
            response = messaging.send_multicast(message)
            logger.info(f"Sent to {response.success_count} devices, failed: {response.failure_count}")
            
            return {
                "success": response.success_count,
                "failure": response.failure_count
            }
            
        except Exception as e:
            logger.error(f"Failed to send multicast: {e}")
            return {"success": 0, "failure": len(tokens)}
    
    async def send_to_topic(self, topic: str, notification: NotificationPayload) -> bool:
        """إرسال إشعار لموضوع"""
        if not self.initialized:
            return False
        
        try:
            from firebase_admin import messaging
            
            message = messaging.Message(
                notification=messaging.Notification(
                    title=notification.title,
                    body=notification.body
                ),
                data={k: str(v) for k, v in notification.data.items()},
                topic=topic
            )
            
            response = messaging.send(message)
            logger.info(f"Sent to topic {topic}: {response}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to send to topic: {e}")
            return False
    
    async def subscribe_to_topic(self, tokens: List[str], topic: str) -> bool:
        """اشتراك أجهزة في موضوع"""
        if not self.initialized:
            return False
        
        try:
            from firebase_admin import messaging
            
            response = messaging.subscribe_to_topic(tokens, topic)
            logger.info(f"Subscribed {response.success_count} to topic {topic}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to subscribe to topic: {e}")
            return False

# Global instance
firebase_service = FirebaseNotificationService()

# ==================== HELPER FUNCTIONS ====================

def format_notification(template_key: str, **kwargs) -> NotificationPayload:
    """تنسيق إشعار من قالب"""
    template = NOTIFICATION_TEMPLATES.get(template_key, {})
    
    return NotificationPayload(
        title=template.get("title", "إشعار").format(**kwargs),
        body=template.get("body", "").format(**kwargs),
        icon=template.get("icon", "/icons/icon-192.png"),
        tag=template.get("tag"),
        require_interaction=template.get("require_interaction", False),
        actions=template.get("actions", []),
        data=kwargs
    )
