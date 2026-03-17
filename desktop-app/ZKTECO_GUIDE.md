# 🔐 دليل أجهزة ZKTeco - Maestro POS

## المتطلبات
- جهاز ZKTeco متصل بالشبكة (Ethernet أو WiFi)
- معرفة عنوان IP للجهاز
- المنفذ الافتراضي: **4370**

## الأجهزة المدعومة
جميع أجهزة ZKTeco التي تدعم بروتوكول TCP/UDP على المنفذ 4370:
- ZK-F18, F22
- K40, K50
- iClock 360, 580, 680, 880
- UA400, UA760
- MB360, MB460
- iface 302, 702
- SpeedFace-V5L, V4L
- وغيرها...

---

## إعداد الجهاز

### 1. تعيين IP ثابت للجهاز
من قائمة الجهاز:
```
Menu → Comm → Ethernet → IP Address
```
- IP Address: 192.168.1.xxx (اختر رقم غير مستخدم)
- Subnet Mask: 255.255.255.0
- Gateway: 192.168.1.1

### 2. التأكد من المنفذ
```
Menu → Comm → Ethernet → Port: 4370
```

### 3. تفعيل الاتصال بالشبكة
```
Menu → Comm → Ethernet → DHCP: OFF
```

---

## استخدام API في التطبيق

### التهيئة
```javascript
// في Electron (من الواجهة الأمامية)
if (window.electronAPI) {
  await window.electronAPI.zkteco.initialize();
}
```

### الاتصال بجهاز
```javascript
const result = await window.electronAPI.zkteco.connect(
  '192.168.1.100',  // IP الجهاز
  4370,             // المنفذ
  'جهاز المدخل'     // اسم للتعريف
);

if (result.success) {
  console.log('Device ID:', result.deviceId);
  console.log('Device Info:', result.info);
}
```

### البحث عن أجهزة على الشبكة
```javascript
const result = await window.electronAPI.zkteco.scan(
  '192.168.1',  // قاعدة IP
  1,            // بداية النطاق
  254           // نهاية النطاق
);

console.log('Found devices:', result.devices);
```

### جلب المستخدمين
```javascript
const result = await window.electronAPI.zkteco.getUsers(deviceId);
if (result.success) {
  result.users.forEach(user => {
    console.log(`ID: ${user.uid}, Name: ${user.name}`);
  });
}
```

### جلب سجلات الحضور
```javascript
const result = await window.electronAPI.zkteco.getLogs(deviceId);
if (result.success) {
  result.logs.forEach(log => {
    console.log(`User: ${log.deviceUserId}, Time: ${log.recordTime}`);
  });
}
```

### إضافة مستخدم
```javascript
await window.electronAPI.zkteco.addUser(deviceId, {
  uid: 1,           // رقم المستخدم
  name: 'أحمد',     // الاسم
  password: '',     // كلمة المرور (اختياري)
  role: 0,          // 0=عادي، 14=مشرف
  cardNo: ''        // رقم البطاقة (اختياري)
});
```

### الاستماع للبصمات الحية (Real-time)
```javascript
// بدء الاستماع
await window.electronAPI.zkteco.startRealtime(deviceId);

// استقبال البصمات
window.electronAPI.onZKTecoAttendance((data) => {
  console.log('بصمة جديدة:', data);
  console.log('User ID:', data.deviceUserId);
  console.log('Time:', data.recordTime);
});
```

### ضبط وقت الجهاز
```javascript
await window.electronAPI.zkteco.setTime(deviceId);
```

### مسح سجلات الحضور
```javascript
await window.electronAPI.zkteco.clearLogs(deviceId);
```

### قطع الاتصال
```javascript
await window.electronAPI.zkteco.disconnect(deviceId);
```

---

## الأحداث (Events)

### اتصال جهاز
```javascript
window.electronAPI.onZKTecoDeviceConnected((data) => {
  console.log('جهاز متصل:', data.name, data.ip);
});
```

### قطع اتصال جهاز
```javascript
window.electronAPI.onZKTecoDeviceDisconnected((data) => {
  console.log('تم قطع الاتصال:', data.name);
});
```

### بصمة جديدة
```javascript
window.electronAPI.onZKTecoAttendance((data) => {
  console.log('بصمة:', data);
  // data.deviceUserId - رقم المستخدم
  // data.recordTime - وقت التسجيل
  // data.deviceId - معرف الجهاز
  // data.deviceName - اسم الجهاز
});
```

---

## استكشاف الأخطاء

### ❌ فشل الاتصال
- تأكد من أن الجهاز والكمبيوتر على نفس الشبكة
- تحقق من صحة عنوان IP
- تأكد من أن المنفذ 4370 مفتوح
- جرب: `ping 192.168.1.xxx`

### ❌ لا يوجد استجابة
- أعد تشغيل الجهاز
- تحقق من كابل الشبكة
- تأكد من إعدادات Ethernet على الجهاز

### ❌ مكتبة ZKTeco غير متوفرة
```bash
cd desktop-app
npm install zkteco-js
```

---

## ملاحظات هامة

1. **الاتصال المستمر**: حافظ على الاتصال مفتوحاً أثناء استخدام الجهاز
2. **المزامنة**: يُفضل جلب السجلات بشكل دوري وليس لحظي
3. **الأمان**: لا تعرض المنفذ 4370 للإنترنت
4. **النسخ الاحتياطي**: احتفظ بنسخة من بيانات المستخدمين
