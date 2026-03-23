#!/bin/bash

# ===========================================
# Maestro POS - Auto Deploy Script
# ===========================================

set -e

echo "🚀 بدء عملية النشر..."

# المتغيرات
APP_DIR="/var/www/maestro"
BACKUP_DIR="/var/backups/maestro"
DATE=$(date +%Y%m%d_%H%M%S)

# إنشاء مجلد النسخ الاحتياطية
mkdir -p $BACKUP_DIR

# الانتقال لمجلد التطبيق
cd $APP_DIR

# سحب آخر التحديثات من GitHub
echo "📥 سحب التحديثات من GitHub..."
git pull origin main

# نسخ احتياطي لقاعدة البيانات قبل التحديث
echo "💾 نسخ احتياطي لقاعدة البيانات..."
docker exec maestro-mongodb mongodump --out /backups/backup_$DATE --username maestro_admin --password Maestro@2024Secure --authenticationDatabase admin 2>/dev/null || true

# إعادة بناء وتشغيل الحاويات
echo "🔄 إعادة بناء التطبيق..."
docker-compose build --no-cache

echo "🚀 تشغيل التطبيق..."
docker-compose up -d

# تنظيف الصور القديمة
echo "🧹 تنظيف الصور القديمة..."
docker image prune -f

# الانتظار للتأكد من التشغيل
sleep 10

# فحص حالة الخدمات
echo "✅ فحص حالة الخدمات..."
docker-compose ps

echo "🎉 تم النشر بنجاح!"
echo "📍 الموقع: https://maestroegp.com"
