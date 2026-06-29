"""
حماية النقاط العامة (بدون مصادقة) ضد الحقن والهجمات:
- محدِّد معدّل (Rate Limiter) في الذاكرة لكل IP لكل نوع طلب.
- تنظيف المدخلات النصية (إزالة وسوم HTML/سكربتات) لمنع حقن XSS/البيانات الضارة.
يُستخدم في server.py و routes/call_routes.py للنقاط العامة التي لا تملك توكن.
"""
from fastapi import HTTPException
from collections import defaultdict, deque
from threading import Lock
import time
import re

_BUCKETS = defaultdict(deque)
_LOCK = Lock()


def _client_ip(request) -> str:
    if not request:
        return "unknown"
    xff = request.headers.get("x-forwarded-for") or request.headers.get("X-Forwarded-For")
    if xff:
        return xff.split(",")[0].strip()
    xri = request.headers.get("x-real-ip")
    if xri:
        return xri.strip()
    return request.client.host if getattr(request, "client", None) else "unknown"


def enforce_rate_limit(request, bucket: str, max_calls: int, window_seconds: int):
    """يرفع 429 إذا تجاوز IP الحد المسموح لنقطة معينة خلال نافذة زمنية.
    sliding window في الذاكرة (خفيف، لكل عملية uvicorn)."""
    ip = _client_ip(request)
    key = f"{bucket}:{ip}"
    now = time.time()
    cutoff = now - window_seconds
    with _LOCK:
        dq = _BUCKETS[key]
        while dq and dq[0] < cutoff:
            dq.popleft()
        if len(dq) >= max_calls:
            raise HTTPException(
                status_code=429,
                detail="عدد كبير من الطلبات. يرجى المحاولة بعد قليل.",
            )
        dq.append(now)
        # تنظيف دوري بسيط لتفادي تضخم الذاكرة
        if len(_BUCKETS) > 50000:
            for k in list(_BUCKETS.keys()):
                if not _BUCKETS[k]:
                    del _BUCKETS[k]


_TAG_RE = re.compile(r"<[^>]*>")
_CTRL_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")


def sanitize_text(value, max_len: int = 1000) -> str:
    """تنظيف نص قادم من مستخدم عام: إزالة وسوم HTML، أحرف التحكم، وقصّ الطول."""
    if value is None:
        return ""
    s = str(value)
    s = _TAG_RE.sub("", s)        # إزالة أي وسوم HTML/سكربت
    s = _CTRL_RE.sub("", s)       # إزالة أحرف التحكم
    s = s.replace("\u202e", "").replace("\u202d", "")  # إزالة تجاوز اتجاه النص
    return s.strip()[:max_len]
