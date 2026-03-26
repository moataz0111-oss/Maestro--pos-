#!/bin/bash
# سكربت إصلاح ونشر نهائي - ينفذ مرة واحدة على الـ VPS

echo "🔧 بدء الإصلاح النهائي..."

cd /var/www/maestro

# 1. حذف أي سكربتات معطوبة
rm -f /usr/local/bin/docker-compose 2>/dev/null

# 2. سحب آخر التحديثات
echo "📥 سحب آخر التحديثات..."
git fetch origin
git reset --hard origin/main

# 3. إيقاف كل شيء ما عدا MongoDB
echo "⏹️ إيقاف الخدمات..."
docker stop maestro-frontend maestro-backend maestro-nginx 2>/dev/null || true
docker rm maestro-frontend maestro-backend maestro-nginx 2>/dev/null || true

# 4. تنظيف Docker
echo "🧹 تنظيف Docker..."
docker network prune -f 2>/dev/null || true
docker builder prune -f 2>/dev/null || true
docker image prune -f 2>/dev/null || true
docker rmi maestro_frontend maestro_backend maestro-frontend maestro-backend 2>/dev/null || true

# 5. إعادة بناء بدون cache
echo "🔨 إعادة البناء (قد يستغرق 5-10 دقائق)..."
docker-compose build --no-cache frontend backend

# 6. تشغيل الخدمات
echo "🚀 تشغيل الخدمات..."
docker-compose up -d

# 7. انتظار البدء
echo "⏳ انتظار بدء الخدمات..."
sleep 30

# 8. التحقق
echo "🔍 التحقق من الخدمات..."
docker-compose ps

echo ""
echo "🔐 اختبار تسجيل الدخول..."
curl -s -X POST http://127.0.0.1/api/super-admin/login \
  -H "Content-Type: application/json" \
  -d '{"email":"owner@maestroegp.com","password":"owner123","secret_key":"271018"}' | grep -q "token" && echo "✅ تسجيل الدخول يعمل!" || echo "❌ مشكلة في تسجيل الدخول"

echo ""
echo "============================================="
echo "✅ تم الانتهاء!"
echo "============================================="
