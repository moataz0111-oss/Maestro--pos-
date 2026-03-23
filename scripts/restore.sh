#!/bin/bash
# سكريبت استعادة النسخة الاحتياطية
# الاستخدام: ./restore.sh backup_file.archive

BACKUP_FILE=$1

if [ -z "$BACKUP_FILE" ]; then
    echo "❌ يرجى تحديد ملف النسخة الاحتياطية"
    echo "الاستخدام: ./restore.sh /path/to/backup.archive"
    echo ""
    echo "النسخ المتاحة:"
    ls -la /var/www/maestro/backups/*.archive 2>/dev/null || echo "لا توجد نسخ احتياطية"
    exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
    echo "❌ الملف غير موجود: $BACKUP_FILE"
    exit 1
fi

echo "⚠️ تحذير: سيتم استبدال البيانات الحالية!"
read -p "هل تريد المتابعة؟ (y/n): " confirm

if [ "$confirm" != "y" ]; then
    echo "تم الإلغاء"
    exit 0
fi

echo "🔄 بدء الاستعادة..."

# نسخ الملف للـ container
docker cp $BACKUP_FILE maestro-mongodb:/tmp/restore.archive

# استعادة قاعدة البيانات
docker exec maestro-mongodb mongorestore \
    --username maestro_admin \
    --password "Maestro@2024Secure" \
    --authenticationDatabase admin \
    --db maestro_db \
    --archive=/tmp/restore.archive \
    --gzip \
    --drop

# حذف الملف المؤقت
docker exec maestro-mongodb rm /tmp/restore.archive

echo "✅ تمت الاستعادة بنجاح!"
