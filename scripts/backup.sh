#!/bin/bash
# سكريبت النسخ الاحتياطي لـ Maestro POS
# يتم تشغيله يومياً تلقائياً

# إعدادات
BACKUP_DIR="/var/www/maestro/backups"
DATE=$(date +%Y-%m-%d_%H-%M-%S)
BACKUP_NAME="maestro_backup_$DATE"
KEEP_DAYS=30  # الاحتفاظ بالنسخ لمدة 30 يوم

# إنشاء مجلد النسخ الاحتياطية
mkdir -p $BACKUP_DIR

echo "🔄 بدء النسخ الاحتياطي: $DATE"

# نسخ قاعدة البيانات MongoDB
echo "📦 نسخ قاعدة البيانات..."
docker exec maestro-mongodb mongodump \
    --username maestro_admin \
    --password "Maestro@2024Secure" \
    --authenticationDatabase admin \
    --db maestro_db \
    --archive=/backups/$BACKUP_NAME.archive \
    --gzip

# نسخ ملفات التكوين المهمة
echo "📁 نسخ ملفات التكوين..."
tar -czf $BACKUP_DIR/${BACKUP_NAME}_config.tar.gz \
    /var/www/maestro/docker-compose.yml \
    /var/www/maestro/nginx.conf \
    /var/www/maestro/.env 2>/dev/null || true

# حذف النسخ القديمة (أكثر من 30 يوم)
echo "🗑️ حذف النسخ القديمة..."
find $BACKUP_DIR -name "maestro_backup_*" -mtime +$KEEP_DAYS -delete

# عرض حجم النسخ الاحتياطية
echo "📊 حجم النسخ الاحتياطية:"
du -sh $BACKUP_DIR

echo "✅ اكتمل النسخ الاحتياطي: $BACKUP_NAME"
echo "📍 الموقع: $BACKUP_DIR"
