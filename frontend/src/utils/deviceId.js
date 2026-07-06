// معرّف جهاز ثابت لكل متصفح/جهاز — يُستخدم في المصادقة الثنائية (جهاز موثوق)
const KEY = 'maestro_device_id';

export function getDeviceId() {
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = (window.crypto && window.crypto.randomUUID)
        ? window.crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch (e) {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}
