# Maestro POS - تطبيق سطح المكتب

## المتطلبات
- Node.js v18 أو أحدث
- Yarn أو npm

## التثبيت

```bash
cd desktop-app
yarn install
# أو
npm install
```

## التشغيل (وضع التطوير)

```bash
yarn start
# أو
npm start
```

## بناء ملفات التثبيت

### Windows (يتطلب تشغيل على Windows)
```bash
yarn build:win
```
سينتج ملف `.exe` في مجلد `dist/`

### Mac (يتطلب تشغيل على macOS)
```bash
yarn build:mac
```
سينتج ملف `.dmg` في مجلد `dist/`

### Linux
```bash
yarn build:linux
```
سينتج ملف `.AppImage` في مجلد `dist/`

## الإعداد الأولي

عند تشغيل التطبيق لأول مرة:
1. ستظهر صفحة الإعداد
2. أدخل رابط السيرفر (مثل: `https://your-domain.com`)
3. سجل الدخول ببيانات حسابك
4. سيتم حفظ البيانات محلياً

## الميزات

### ✅ العمل بدون إنترنت
- حفظ الطلبات محلياً
- مزامنة تلقائية عند عودة الاتصال
- عرض البيانات المخزنة محلياً

### ✅ قارئ الباركود
- دعم قارئات USB HID
- يعمل تلقائياً بدون إعداد
- إضافة المنتج للطلب فوراً

### ✅ الطباعة
- طباعة الفواتير
- طباعة طلبات المطبخ
- دعم طابعات متعددة

### ✅ نظام الترخيص
- التحقق عند بدء التشغيل
- فترة سماح 24 ساعة للعمل offline
- إدارة الأجهزة من Super Admin

## هيكل الملفات

```
desktop-app/
├── main.js              # العملية الرئيسية
├── preload.js           # جسر الاتصال مع الواجهة
├── package.json         # الاعتماديات والإعدادات
├── src/
│   ├── database.js      # قاعدة البيانات المحلية (SQLite)
│   ├── sync-manager.js  # إدارة المزامنة
│   ├── printer-manager.js # إدارة الطابعات
│   ├── license-manager.js # إدارة الترخيص
│   ├── barcode-scanner.js # قارئ الباركود
│   └── views/
│       ├── setup.html   # صفحة الإعداد
│       └── offline.html # صفحة عدم الاتصال
└── assets/
    └── icon.*           # أيقونات التطبيق
```

## ملاحظات هامة

1. **الأيقونات**: 
   - Windows يتطلب `.ico`
   - Mac يتطلب `.icns`
   - يمكن تحويل PNG باستخدام أدوات مثل `electron-icon-builder`

2. **توقيع الكود** (اختياري للإنتاج):
   - Windows: يتطلب شهادة Code Signing
   - Mac: يتطلب Apple Developer Account

3. **التحديثات التلقائية**:
   - يمكن إضافة `electron-updater` لاحقاً

## استكشاف الأخطاء

### التطبيق لا يعمل
```bash
# تحقق من السجلات
electron . --enable-logging
```

### مشاكل قاعدة البيانات
- تأكد من تثبيت `better-sqlite3` بشكل صحيح
- قد تحتاج إعادة البناء: `npm rebuild better-sqlite3`

### مشاكل الاتصال
- تحقق من رابط السيرفر
- تحقق من اتصال الإنترنت
- تحقق من صلاحية الترخيص

## دمج جهاز البصمة ZKTeco

### SDK المطلوب
1. قم بتنزيل ZKTeco SDK من الموقع الرسمي
2. ضع ملفات DLL في مجلد التطبيق
3. استخدم `zkemkeeper.ocx` للاتصال بالجهاز

### مثال الاستخدام
```javascript
// سيتم إضافته بعد توفير SDK
const zkDevice = require('./src/zkteco-manager');
zkDevice.connect('192.168.1.100', 4370);
zkDevice.onFingerprint((employeeId) => {
  console.log('تم التعرف على الموظف:', employeeId);
});
```

## الدعم

للمساعدة أو الإبلاغ عن مشاكل، تواصل مع فريق الدعم.
