# ===========================================
# 🚀 دليل نشر Maestro POS على السيرفر
# ===========================================

## المتطلبات:
- سيرفر Ubuntu 22.04+
- دومين مع SSL (✅ تم: maestroegp.com)
- حساب GitHub (✅ تم: moataz0111-oss)

---

## الخطوة 1: حفظ الكود على GitHub

في منصة Emergent:
1. اضغط "Save" → "Save to GitHub"
2. اختر repository: maestro-pos
3. انتظر حتى يتم الحفظ

---

## الخطوة 2: إعداد السيرفر (مرة واحدة)

ssh root@158.220.118.54

# تثبيت Docker
curl -fsSL https://get.docker.com | sh
apt install docker-compose git -y

# إنشاء مجلد التطبيق
mkdir -p /var/www/maestro
cd /var/www/maestro

# استنساخ الكود
git clone https://github.com/moataz0111-oss/maestro-pos.git .

# نسخ ملفات Docker
cp deploy/docker-compose.yml .
cp deploy/backend/Dockerfile backend/
cp deploy/frontend/Dockerfile frontend/
cp deploy/frontend/nginx.conf frontend/

# إعداد Nginx
cp deploy/nginx-site.conf /etc/nginx/sites-available/maestro
ln -sf /etc/nginx/sites-available/maestro /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# تشغيل التطبيق
docker-compose up -d --build

---

## الخطوة 3: إعداد النشر التلقائي

# جعل السكربتات قابلة للتنفيذ
chmod +x deploy/*.sh

# إعداد Webhook (اختياري - للنشر التلقائي عند push)
# أو تشغيل يدوياً:
./deploy/deploy.sh

---

## الخطوة 4: إعداد Backup تلقائي

# إضافة للـ crontab (كل يوم الساعة 3 صباحاً)
crontab -e

# أضف هذا السطر:
0 3 * * * /var/www/maestro/deploy/backup.sh >> /var/log/maestro-backup.log 2>&1

---

## أوامر مفيدة:

# عرض حالة الحاويات
docker-compose ps

# عرض logs
docker-compose logs -f

# إعادة تشغيل
docker-compose restart

# تحديث من GitHub
./deploy/deploy.sh

# نسخ احتياطي يدوي
./deploy/backup.sh

# استعادة
./deploy/restore.sh

---

## استكشاف الأخطاء:

# فحص Backend
docker logs maestro-backend

# فحص Frontend
docker logs maestro-frontend

# فحص MongoDB
docker logs maestro-mongodb

# فحص Nginx
tail -f /var/log/nginx/error.log

---

## الروابط:
- الموقع: https://maestroegp.com
- GitHub: https://github.com/moataz0111-oss/maestro-pos
