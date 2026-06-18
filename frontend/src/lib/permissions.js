// طلب جميع الصلاحيات المطلوبة للتطبيقات (إشعارات + ميكروفون + تفعيل الصوت)
// يجب استدعاؤها من خلال تفاعل المستخدم (نقرة زر) لتعمل على iPhone و Android.

let _audioUnlocked = false;
const PERMS_KEY = 'maestro_perms_granted';

// فتح قفل الصوت (AudioContext) عبر تفاعل المستخدم — ضروري لتشغيل الرنين لاحقاً
export const unlockAudio = () => {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return false;
    const ctx = new Ctx();
    if (ctx.state === 'suspended') ctx.resume();
    // نغمة صامتة قصيرة لفتح القفل
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    o.connect(g); g.connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + 0.02);
    _audioUnlocked = true;
    return true;
  } catch (e) {
    return false;
  }
};

// هل سبق منح الصلاحيات (محفوظة)
export const arePermissionsGranted = () => {
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') return true;
    return localStorage.getItem(PERMS_KEY) === '1';
  } catch (e) {
    return false;
  }
};

// فتح قفل الصوت تلقائياً عند أول تفاعل للمستخدم (مرة واحدة) دون إظهار أي طلب
export const initAudioAutoUnlock = () => {
  if (_audioUnlocked) return;
  const handler = () => {
    unlockAudio();
    window.removeEventListener('pointerdown', handler);
    window.removeEventListener('touchstart', handler);
    window.removeEventListener('keydown', handler);
  };
  window.addEventListener('pointerdown', handler, { once: true });
  window.addEventListener('touchstart', handler, { once: true });
  window.addEventListener('keydown', handler, { once: true });
};

export const getPermissionStatus = () => {
  const notif = (typeof Notification !== 'undefined') ? Notification.permission : 'unsupported';
  return { notifications: notif, audioUnlocked: _audioUnlocked, saved: arePermissionsGranted() };
};

// طلب إذن الإشعارات
export const requestNotificationPermission = async () => {
  if (typeof Notification === 'undefined') return 'unsupported';
  try {
    const res = await Notification.requestPermission();
    return res; // 'granted' | 'denied' | 'default'
  } catch (e) {
    return 'denied';
  }
};

// طلب إذن الميكروفون (للمكالمات الصوتية)
export const requestMicrophonePermission = async () => {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return 'unsupported';
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // إيقاف المسارات فوراً — هدفنا فقط الحصول على الإذن
    stream.getTracks().forEach((t) => t.stop());
    return 'granted';
  } catch (e) {
    return 'denied';
  }
};

// طلب جميع الصلاحيات دفعة واحدة (من نقرة زر)
export const requestAllPermissions = async ({ withMic = true } = {}) => {
  unlockAudio();
  // اهتزاز تجريبي (يفعّل دعم الاهتزاز على أندرويد)
  try { if (navigator.vibrate) navigator.vibrate(60); } catch (e) { /* noop */ }
  const notifications = await requestNotificationPermission();
  let microphone = 'skipped';
  if (withMic) microphone = await requestMicrophonePermission();
  // حفظ دائم: لا نطلب الصلاحيات مرة أخرى بعد المنح
  if (notifications === 'granted') {
    try { localStorage.setItem(PERMS_KEY, '1'); } catch (e) { /* noop */ }
  }
  return { notifications, microphone, audioUnlocked: _audioUnlocked };
};
