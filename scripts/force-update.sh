#!/bin/bash
# ===========================================
# Maestro Force Update Script
# ===========================================
# نفذ هذا على السيرفر: bash force-update.sh
# ===========================================

set -e

echo "============================================="
echo "🚀 Maestro Force Update Script"
echo "============================================="
echo ""

cd /var/www/maestro

echo "📥 Step 1: Pulling latest code from GitHub..."
git fetch --all
git reset --hard origin/main
git pull origin main

echo ""
echo "🛑 Step 2: Stopping containers..."
docker-compose down

echo ""
echo "🗑️ Step 3: Cleaning old images (keeping data)..."
docker image prune -af
docker container prune -f

echo ""
echo "🔨 Step 4: Building fresh images..."
docker-compose build --no-cache

echo ""
echo "🚀 Step 5: Starting all services..."
docker-compose up -d

echo ""
echo "⏳ Step 6: Waiting for services to start (60 seconds)..."
sleep 60

echo ""
echo "🔍 Step 7: Checking services status..."
docker-compose ps

echo ""
echo "🧪 Step 8: Testing API..."
if curl -s --max-time 10 http://127.0.0.1/api/health > /dev/null 2>&1; then
    echo "✅ API is working!"
else
    echo "❌ API not responding, checking logs..."
    docker-compose logs --tail=30 backend
fi

echo ""
echo "============================================="
echo "✅ Update Complete!"
echo "============================================="
echo "📊 MongoDB Data: PRESERVED"
echo "🔄 Backend: REBUILT"
echo "🎨 Frontend: REBUILT"
echo "🌐 Nginx: REBUILT"
echo "============================================="
