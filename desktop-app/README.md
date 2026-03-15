# Maestro POS Desktop

برنامج نقطة البيع للمطاعم - يعمل مع وبدون إنترنت

## 📋 المميزات

- ✅ يعمل **بدون إنترنت** - يحفظ البيانات محلياً
- ✅ **مزامنة تلقائية** عند عودة الاتصال
- ✅ دعم **الطابعات** (فواتير + مطبخ)
- ✅ يعمل على **Windows** و **Mac** و **Linux**

## 🚀 طريقة التشغيل (للمطورين)

```bash
cd desktop-app
yarn install
yarn start
```

## 📦 بناء ملفات التثبيت

### Windows
```bash
yarn build:win
```
ملف التثبيت: `dist/Maestro POS Setup.exe`

### Mac
```bash
yarn build:mac
```
ملف التثبيت: `dist/Maestro POS.dmg`

### Linux
```bash
yarn build:linux
```
ملف التثبيت: `dist/Maestro POS.AppImage`

### جميع الأنظمة
```bash
yarn build:all
```

## 📁 هيكل الملفات

```
desktop-app/
├── main.js              # الملف الرئيسي لـ Electron
├── preload.js           # الجسر بين Electron والواجهة
├── package.json         # إعدادات المشروع
├── src/
│   ├── database.js      # قاعدة البيانات المحلية (SQLite)
│   ├── sync-manager.js  # نظام المزامنة
│   ├── printer-manager.js # إدارة الطابعات
│   └── views/
│       ├── setup.html   # صفحة الإعداد الأولي
│       └── offline.html # صفحة وضع عدم الاتصال
└── assets/
    └── icon.png         # أيقونة التطبيق
```

## 🔄 كيف تعمل المزامنة؟

1. **عند وجود إنترنت**: جميع العمليات تُرسل مباشرة للسيرفر
2. **عند انقطاع الإنترنت**: العمليات تُحفظ في قاعدة بيانات محلية
3. **عند عودة الإنترنت**: يتم رفع جميع العمليات المحلية تلقائياً

## 🖨️ الطابعات المدعومة

- طابعات الفواتير الحرارية (Receipt Printers)
- طابعات المطبخ
- أي طابعة متصلة بالنظام

## ⚙️ الإعدادات

عند أول تشغيل، سيُطلب منك:
1. رابط السيرفر (التطبيق المنشور)
2. بيانات تسجيل الدخول
3. اختيار الطابعات

## 📝 ملاحظات

- البيانات المحلية تُحفظ في: `%APPDATA%/maestro-pos-desktop/` (Windows)
- أو `~/Library/Application Support/maestro-pos-desktop/` (Mac)
