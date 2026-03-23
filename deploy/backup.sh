#!/bin/bash

# ===========================================
# Maestro POS - Backup Script
# نظام النسخ الاحتياطي التلقائي
# ===========================================

set -e

# المتغيرات
BACKUP_DIR="/var/backups/maestro"
DATE=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=30

echo "💾 بدء النسخ الاحتياطي - $DATE"

# إنشاء مجلد النسخ الاحتياطية
mkdir -p $BACKUP_DIR/db
mkdir -p $BACKUP_DIR/files

# =====================
# 1. نسخ قاعدة البيانات
# =====================
echo "📦 نسخ قاعدة البيانات MongoDB..."
docker exec maestro-mongodb mongodump \
    --out /backups/db_$DATE \
    --username maestro_admin \
    --password Maestro@2024Secure \
    --authenticationDatabase admin

# نقل النسخة لمجلد النسخ الاحتياطية
docker cp maestro-mongodb:/backups/db_$DATE $BACKUP_DIR/db/

# ضغط النسخة
cd $BACKUP_DIR/db
tar -czf db_$DATE.tar.gz db_$DATE
rm -rf db_$DATE

echo "✅ تم نسخ قاعدة البيانات: $BACKUP_DIR/db/db_$DATE.tar.gz"

# =====================
# 2. نسخ ملفات التطبيق
# =====================
echo "📁 نسخ ملفات التطبيق..."
cd /var/www
tar -czf $BACKUP_DIR/files/app_$DATE.tar.gz maestro --exclude='maestro/node_modules' --exclude='maestro/.git'

echo "✅ تم نسخ الملفات: $BACKUP_DIR/files/app_$DATE.tar.gz"

# =====================
# 3. حذف النسخ القديمة
# =====================
echo "🧹 حذف النسخ الأقدم من $RETENTION_DAYS يوم..."
find $BACKUP_DIR/db -name "*.tar.gz" -mtime +$RETENTION_DAYS -delete
find $BACKUP_DIR/files -name "*.tar.gz" -mtime +$RETENTION_DAYS -delete

# =====================
# 4. عرض حجم النسخ
# =====================
echo ""
echo "📊 حجم النسخ الاحتياطية:"
du -sh $BACKUP_DIR/db/db_$DATE.tar.gz
du -sh $BACKUP_DIR/files/app_$DATE.tar.gz

echo ""
echo "🎉 تم النسخ الاحتياطي بنجاح!"
echo "📍 الموقع: $BACKUP_DIR"
