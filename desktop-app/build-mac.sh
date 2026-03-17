#!/bin/bash
# Maestro POS Desktop - Build Script for macOS
# ==========================================

echo "╔════════════════════════════════════════╗"
echo "║   Maestro POS Desktop Builder (Mac)   ║"
echo "╚════════════════════════════════════════╝"
echo ""

# التحقق من Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js غير مثبت!"
    echo "   ثبّته من: https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
echo "✓ Node.js: $(node -v)"

if [ "$NODE_VERSION" -gt 22 ]; then
    echo "⚠️  تحذير: Node.js v24+ قد يسبب مشاكل"
    echo "   يُفضل استخدام Node.js v20"
fi

# ===== الخطوة 1: إنشاء أيقونة macOS =====
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📦 الخطوة 1: إنشاء أيقونة macOS (.icns)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ ! -f "assets/icon.png" ]; then
    echo "❌ ملف assets/icon.png غير موجود!"
    exit 1
fi

# حذف الأيقونة القديمة
rm -rf assets/icon.iconset
rm -f assets/icon.icns

# إنشاء مجلد iconset
mkdir -p assets/icon.iconset

# إنشاء جميع الأحجام المطلوبة
echo "   إنشاء أحجام الأيقونة..."
sips -z 16 16     assets/icon.png --out assets/icon.iconset/icon_16x16.png > /dev/null 2>&1
sips -z 32 32     assets/icon.png --out assets/icon.iconset/icon_16x16@2x.png > /dev/null 2>&1
sips -z 32 32     assets/icon.png --out assets/icon.iconset/icon_32x32.png > /dev/null 2>&1
sips -z 64 64     assets/icon.png --out assets/icon.iconset/icon_32x32@2x.png > /dev/null 2>&1
sips -z 128 128   assets/icon.png --out assets/icon.iconset/icon_128x128.png > /dev/null 2>&1
sips -z 256 256   assets/icon.png --out assets/icon.iconset/icon_128x128@2x.png > /dev/null 2>&1
sips -z 256 256   assets/icon.png --out assets/icon.iconset/icon_256x256.png > /dev/null 2>&1
sips -z 512 512   assets/icon.png --out assets/icon.iconset/icon_256x256@2x.png > /dev/null 2>&1
sips -z 512 512   assets/icon.png --out assets/icon.iconset/icon_512x512.png > /dev/null 2>&1
sips -z 1024 1024 assets/icon.png --out assets/icon.iconset/icon_512x512@2x.png > /dev/null 2>&1

# تحويل إلى icns
iconutil -c icns assets/icon.iconset -o assets/icon.icns

# تنظيف
rm -rf assets/icon.iconset

if [ -f "assets/icon.icns" ]; then
    echo "   ✓ تم إنشاء الأيقونة بنجاح"
else
    echo "   ⚠️ فشل إنشاء الأيقونة"
fi

# ===== الخطوة 2: تثبيت الاعتماديات =====
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📦 الخطوة 2: تثبيت الاعتماديات"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# حذف node_modules إذا كانت موجودة لتجنب المشاكل
if [ -d "node_modules" ]; then
    echo "   حذف node_modules القديمة..."
    rm -rf node_modules
fi

# حذف package-lock.json
rm -f package-lock.json

# تثبيت الاعتماديات
echo "   جاري التثبيت..."
npm install --legacy-peer-deps

if [ $? -ne 0 ]; then
    echo ""
    echo "❌ فشل تثبيت الاعتماديات!"
    echo ""
    echo "جرّب هذه الحلول:"
    echo "  1. استخدم Node.js v20: brew install node@20"
    echo "  2. أعد تشغيل Terminal"
    exit 1
fi

echo "   ✓ تم تثبيت الاعتماديات"

# ===== الخطوة 3: بناء التطبيق =====
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📦 الخطوة 3: بناء تطبيق macOS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

npm run build:mac

if [ $? -eq 0 ]; then
    echo ""
    echo "╔════════════════════════════════════════╗"
    echo "║         ✓ تم البناء بنجاح!           ║"
    echo "╚════════════════════════════════════════╝"
    echo ""
    echo "📁 ملف التثبيت في: dist/"
    echo ""
    ls -la dist/*.dmg 2>/dev/null
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "📋 خطوات التثبيت:"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  1. افتح مجلد dist: open dist/"
    echo "  2. انقر مرتين على ملف .dmg"
    echo "  3. اسحب التطبيق إلى Applications"
    echo "  4. افتح التطبيق من Applications"
    echo ""
    
    # فتح مجلد dist تلقائياً
    open dist/
else
    echo ""
    echo "╔════════════════════════════════════════╗"
    echo "║           ❌ فشل البناء!              ║"
    echo "╚════════════════════════════════════════╝"
    echo ""
    echo "راجع رسائل الخطأ أعلاه"
fi
