# دليل نشر Maestro POS على خادم الإنتاج

## المتطلبات الأساسية
- Ubuntu 22.04 (أو أحدث)
- Docker و Docker Compose
- Git
- Domain: maestroegp.com (مُعد مسبقاً)

---

## الخطوة 1: تنظيف الخادم (إذا لزم الأمر)

```bash
# إيقاف وحذف كل شيء
cd /var/www/maestro 2>/dev/null
docker-compose down -v 2>/dev/null
cd /
rm -rf /var/www/maestro
```

---

## الخطوة 2: استنساخ الكود من GitHub

```bash
# إنشاء المجلد
mkdir -p /var/www
cd /var/www

# استنساخ الكود (استبدل بـ repo الخاص بك)
git clone https://github.com/moataz0111-oss/Maestro-_-POS.git maestro
cd maestro
```

---

## الخطوة 3: إعداد ملفات Docker

```bash
# الدخول لمجلد النشر
cd /var/www/maestro/deploy

# نسخ الكود من المصدر
mkdir -p frontend backend

# نسخ Frontend
cp -r ../frontend/* frontend/
cp frontend/Dockerfile frontend/

# نسخ Backend
cp -r ../backend/* backend/
cp backend/Dockerfile backend/
```

---

## الخطوة 4: بناء وتشغيل Docker

```bash
cd /var/www/maestro/deploy

# بناء وتشغيل الخدمات
docker-compose up -d --build

# التحقق من حالة الخدمات
docker-compose ps
```

---

## الخطوة 5: إدخال البيانات الأساسية (Seed)

```bash
# تثبيت المتطلبات داخل container الـ backend
docker exec -it maestro-backend pip install passlib bcrypt

# نسخ سكريبت البيانات
docker cp seed_data.py maestro-backend:/app/seed_data.py

# تشغيل السكريبت
docker exec -it maestro-backend python seed_data.py
```

**أو يدوياً عبر MongoDB:**

```bash
# الدخول لـ MongoDB shell
docker exec -it maestro-mongodb mongosh -u maestro_admin -p "Maestro@2024Secure" --authenticationDatabase admin

# داخل MongoDB shell
use maestro_db

# إنشاء Super Admin
db.users.insertOne({
  id: UUID().toString(),
  email: "owner@maestroegp.com",
  password: "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewKxcHqxmNQnYyH6",
  name: "مالك النظام",
  role: "super_admin",
  is_active: true,
  super_admin_secret: "271018",
  created_at: new Date().toISOString()
})
```

---

## الخطوة 6: إعداد Nginx (Reverse Proxy + SSL)

```bash
# تثبيت Nginx و Certbot
apt update
apt install -y nginx certbot python3-certbot-nginx

# نسخ إعدادات الموقع
cp nginx-site.conf /etc/nginx/sites-available/maestroegp.com
ln -sf /etc/nginx/sites-available/maestroegp.com /etc/nginx/sites-enabled/

# اختبار الإعدادات
nginx -t

# إعادة تشغيل Nginx
systemctl restart nginx

# الحصول على شهادة SSL
certbot --nginx -d maestroegp.com -d www.maestroegp.com
```

---

## بيانات الدخول

| الحساب | البريد الإلكتروني | كلمة المرور | ملاحظات |
|--------|-------------------|-------------|---------|
| Super Admin | owner@maestroegp.com | owner123 | Secret: 271018 |
| Hani (Graffiti Burger) | hanialdujaili@gmail.com | Hani@2024 | |
| Demo | demo@maestroegp.com | Demo@2024 | |

---

## الأوامر المفيدة

```bash
# عرض سجلات الخدمات
docker-compose logs -f backend
docker-compose logs -f frontend

# إعادة تشغيل خدمة معينة
docker-compose restart backend

# النسخ الاحتياطي
./backup.sh

# استعادة النسخة الاحتياطية
./restore.sh backup_file.gz
```

---

## استكشاف الأخطاء

### الموقع لا يعمل
```bash
# تحقق من حالة Docker
docker-compose ps

# تحقق من سجلات الأخطاء
docker-compose logs --tail=50 backend
docker-compose logs --tail=50 frontend
```

### خطأ في قاعدة البيانات
```bash
# تحقق من اتصال MongoDB
docker exec -it maestro-mongodb mongosh -u maestro_admin -p "Maestro@2024Secure" --authenticationDatabase admin --eval "db.adminCommand('ping')"
```

### مشكلة في SSL
```bash
# تجديد الشهادة
certbot renew

# التحقق من حالة الشهادة
certbot certificates
```

---

## التحديثات المستقبلية

```bash
cd /var/www/maestro

# سحب أحدث الكود
git pull origin main

# إعادة بناء وتشغيل
cd deploy
docker-compose up -d --build
```
