# تعليمات إنشاء أيقونات التطبيق

## الأيقونات المطلوبة:
- **icon.png** - للينكس (512x512 أو 1024x1024)
- **icon.icns** - للماك
- **icon.ico** - لويندوز

---

## طريقة التحويل على Mac:

### 1. تحويل SVG إلى PNG
```bash
# باستخدام Inkscape (إذا مثبت)
inkscape icon.svg -w 1024 -h 1024 -o icon.png

# أو افتح icon.svg في أي متصفح واحفظه كـ PNG
```

### 2. إنشاء icon.icns للماك
```bash
# إنشاء مجلد iconset
mkdir icon.iconset

# إنشاء الأحجام المطلوبة
sips -z 16 16     icon.png --out icon.iconset/icon_16x16.png
sips -z 32 32     icon.png --out icon.iconset/icon_16x16@2x.png
sips -z 32 32     icon.png --out icon.iconset/icon_32x32.png
sips -z 64 64     icon.png --out icon.iconset/icon_32x32@2x.png
sips -z 128 128   icon.png --out icon.iconset/icon_128x128.png
sips -z 256 256   icon.png --out icon.iconset/icon_128x128@2x.png
sips -z 256 256   icon.png --out icon.iconset/icon_256x256.png
sips -z 512 512   icon.png --out icon.iconset/icon_256x256@2x.png
sips -z 512 512   icon.png --out icon.iconset/icon_512x512.png
sips -z 1024 1024 icon.png --out icon.iconset/icon_512x512@2x.png

# تحويل إلى icns
iconutil -c icns icon.iconset

# حذف المجلد المؤقت
rm -rf icon.iconset
```

### 3. إنشاء icon.ico لويندوز
```bash
# باستخدام ImageMagick
convert icon.png -define icon:auto-resize=256,128,64,48,32,16 icon.ico

# أو استخدم موقع:
# https://convertico.com/
```

---

## الطريقة السهلة:

### استخدم electron-icon-builder
```bash
npm install -g electron-icon-builder

# تأكد من وجود icon.png (1024x1024)
electron-icon-builder --input=./icon.png --output=./
```

---

## أو استخدم هذه المواقع المجانية:

1. **https://cloudconvert.com/svg-to-icns** - للماك
2. **https://convertico.com/** - لويندوز  
3. **https://www.aconvert.com/icon/** - للجميع

---

## ملاحظات:
- الأيقونة يجب أن تكون مربعة (1:1)
- يُفضل 1024x1024 بكسل للجودة العالية
- الخلفية الشفافة تعمل على Mac و Windows 10+
