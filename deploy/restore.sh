#!/bin/bash

# ===========================================
# Maestro POS - Restore Script
# استعادة النسخ الاحتياطية
# ===========================================

BACKUP_DIR="/var/backups/maestro"

echo "📋 النسخ الاحتياطية المتاحة:"
echo ""
echo "=== قاعدة البيانات ==="
ls -lh $BACKUP_DIR/db/*.tar.gz 2>/dev/null || echo "لا توجد نسخ"
echo ""
echo "=== ملفات التطبيق ==="
ls -lh $BACKUP_DIR/files/*.tar.gz 2>/dev/null || echo "لا توجد نسخ"
echo ""

read -p "أدخل اسم ملف قاعدة البيانات للاستعادة (مثال: db_20260323_120000.tar.gz): " DB_FILE

if [ -f "$BACKUP_DIR/db/$DB_FILE" ]; then
    echo "🔄 جاري استعادة قاعدة البيانات..."
    
    # فك الضغط
    cd $BACKUP_DIR/db
    tar -xzf $DB_FILE
    
    # استخراج اسم المجلد
    FOLDER_NAME=$(echo $DB_FILE | sed 's/.tar.gz//')
    
    # نسخ للحاوية
    docker cp $FOLDER_NAME maestro-mongodb:/backups/
    
    # استعادة
    docker exec maestro-mongodb mongorestore \
        --drop \
        /backups/$FOLDER_NAME \
        --username maestro_admin \
        --password Maestro@2024Secure \
        --authenticationDatabase admin
    
    # تنظيف
    rm -rf $FOLDER_NAME
    
    echo "✅ تم استعادة قاعدة البيانات بنجاح!"
else
    echo "❌ الملف غير موجود"
fi
