# تعليمات الأيقونة - Maestro POS

## الأيقونة الحالية
- `icon.png` - الأيقونة الأصلية (دائرية بخلفية شفافة)
- `icon.svg` - نسخة SVG

## إنشاء أيقونة Mac (.icns)

### الطريقة التلقائية (موصى بها):
```bash
cd desktop-app
chmod +x create-mac-icon.sh
./create-mac-icon.sh
```

### الطريقة اليدوية:
```bash
# 1. إنشاء مجلد iconset
mkdir -p assets/icon.iconset

# 2. إنشاء جميع الأحجام المطلوبة
sips -z 16 16     assets/icon.png --out assets/icon.iconset/icon_16x16.png
sips -z 32 32     assets/icon.png --out assets/icon.iconset/icon_16x16@2x.png
sips -z 32 32     assets/icon.png --out assets/icon.iconset/icon_32x32.png
sips -z 64 64     assets/icon.png --out assets/icon.iconset/icon_32x32@2x.png
sips -z 128 128   assets/icon.png --out assets/icon.iconset/icon_128x128.png
sips -z 256 256   assets/icon.png --out assets/icon.iconset/icon_128x128@2x.png
sips -z 256 256   assets/icon.png --out assets/icon.iconset/icon_256x256.png
sips -z 512 512   assets/icon.png --out assets/icon.iconset/icon_256x256@2x.png
sips -z 512 512   assets/icon.png --out assets/icon.iconset/icon_512x512.png
sips -z 1024 1024 assets/icon.png --out assets/icon.iconset/icon_512x512@2x.png

# 3. تحويل إلى icns
iconutil -c icns assets/icon.iconset -o assets/icon.icns

# 4. حذف المجلد المؤقت
rm -rf assets/icon.iconset
```

## إنشاء أيقونة Windows (.ico)

### باستخدام ImageMagick:
```bash
# تثبيت ImageMagick
brew install imagemagick

# إنشاء ICO
convert assets/icon.png -define icon:auto-resize=256,128,64,48,32,16 assets/icon.ico
```

### باستخدام أداة Online:
1. اذهب إلى: https://cloudconvert.com/png-to-ico
2. ارفع `icon.png`
3. حمّل `icon.ico`

## مواصفات الأيقونة المثالية
- الحجم الأصلي: 1024x1024 بكسل
- الصيغة: PNG مع خلفية شفافة
- التصميم: دائري مع هامش داخلي

## الأحجام المطلوبة
| النظام | الأحجام |
|--------|---------|
| Mac | 16, 32, 64, 128, 256, 512, 1024 |
| Windows | 16, 32, 48, 64, 128, 256 |
| Linux | 512 (PNG) |
