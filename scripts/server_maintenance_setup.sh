#!/bin/bash
# 🛡️ Server Maintenance Setup — Maestro EGP Production
# "مساحة شبه لانهائية" للوجات + تنظيف تلقائي يمنع الامتلاء
# Usage: sudo bash server_maintenance_setup.sh

set -e

echo "═══════════════════════════════════════════════════"
echo "🛡️  إعداد الحماية الدائمة — Maestro"
echo "═══════════════════════════════════════════════════"

# ============================================================
# 1️⃣  لوجات Docker: 500MB × 10 ملفات = 5GB لكل حاوية (ضخم جداً)
# ============================================================
echo ""
echo "1️⃣  ضبط Docker: 5GB مساحة لوج لكل حاوية…"
mkdir -p /etc/docker
cat > /etc/docker/daemon.json <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "500m",
    "max-file": "10",
    "compress": "true"
  },
  "storage-driver": "overlay2"
}
EOF
echo "   ✅ كل حاوية تحصل على 5GB لوجات مضغوطة"

# ============================================================
# 2️⃣  journal النظام: 5GB (ضخم جداً كذلك)
# ============================================================
echo ""
echo "2️⃣  journal النظام: 5GB…"
mkdir -p /etc/systemd/journald.conf.d
cat > /etc/systemd/journald.conf.d/maestro.conf <<'EOF'
[Journal]
SystemMaxUse=5G
SystemKeepFree=10G
SystemMaxFileSize=500M
MaxRetentionSec=6month
Compress=yes
EOF
systemctl restart systemd-journald
echo "   ✅ journal 5GB مضغوط، احتفاظ 6 أشهر"

# ============================================================
# 3️⃣  سكريبت تنظيف ذكي — يعمل فقط عند الاقتراب من الامتلاء
# ============================================================
echo ""
echo "3️⃣  سكريبت تنظيف ذكي…"
cat > /usr/local/bin/maestro-cleanup.sh <<'SCRIPT'
#!/bin/bash
LOG=/var/log/maestro-cleanup.log
USED=$(df / | awk 'NR==2 {gsub("%","",$5); print $5+0}')
echo "═══ $(date) — Disk at ${USED}% ═══" >> $LOG

# حذف صور Docker غير المستخدمة الأقدم من 7 أيام (آمن 100%)
docker image prune -a -f --filter "until=168h" >> $LOG 2>&1
# volumes يتيمة فقط (MongoDB محمي لأنه مُستخدم)
docker volume prune -f >> $LOG 2>&1
# networks يتيمة
docker network prune -f >> $LOG 2>&1
# build cache أقدم من 7 أيام
docker builder prune -a -f --filter "until=168h" >> $LOG 2>&1
# apt cache
apt-get clean >> $LOG 2>&1

# backups أقدم من 60 يوم
find /var/www/maestro/backups -type f -mtime +60 -delete 2>/dev/null

# ⚡ طوارئ: إذا تجاوز 85% → تنظيف أعنف
if [ "$USED" -gt 85 ]; then
  echo "⚠️ EMERGENCY — القرص عند ${USED}%" >> $LOG
  # صور Docker غير المستخدمة فوراً (بلا شرط عمر)
  docker image prune -a -f >> $LOG 2>&1
  # لوجات حاويات الأقدم من 7 أيام يُفرَّغ محتواها
  find /var/lib/docker/containers -name "*.log" -mtime +7 -exec truncate -s 0 {} \;
  # journal: احتفظ بالأحدث فقط 500MB
  journalctl --vacuum-size=500M >> $LOG 2>&1
fi

df -h / >> $LOG
SCRIPT
chmod +x /usr/local/bin/maestro-cleanup.sh
echo "   ✅ /usr/local/bin/maestro-cleanup.sh جاهز"

# ============================================================
# 4️⃣  cron: فحص كل 6 ساعات + تنظيف أسبوعي
# ============================================================
echo ""
echo "4️⃣  جدولة تلقائية…"
cat > /etc/cron.d/maestro-cleanup <<'EOF'
# تنظيف أسبوعي — كل أحد 3 ص
0 3 * * 0 root /usr/local/bin/maestro-cleanup.sh
# فحص كل 6 ساعات — ينظّف فوراً إذا تجاوز 85%
0 */6 * * * root /usr/local/bin/maestro-cleanup.sh
# تحذير يومي في اللوج إذا تجاوز 75%
0 9 * * * root df -h / | awk 'NR==2 {gsub("%","",$5); if ($5+0 > 75) print strftime("%F %T"), "⚠️ Disk at " $5 "%"}' >> /var/log/maestro-disk-alert.log
EOF
echo "   ✅ تنظيف تلقائي كل 6 ساعات + ترحيل أسبوعي"

# ============================================================
# 5️⃣  تطبيق إعدادات Docker الجديدة
# ============================================================
echo ""
echo "5️⃣  إعادة تشغيل Docker (ثانيتين توقف)…"
systemctl restart docker
echo "   ✅ Docker daemon يحترم السقف الجديد الآن"

# ============================================================
# ملخص
# ============================================================
echo ""
echo "═══════════════════════════════════════════════════"
echo "✅ تم! من الآن:"
echo "═══════════════════════════════════════════════════"
echo "📊 كل حاوية: 5GB لوجات مضغوطة"
echo "📜 journal النظام: 5GB"
echo "⚡ تنظيف تلقائي كل 6 ساعات"
echo "🚨 تنظيف طارئ تلقائي عند 85%"
echo "📁 لوجات: /var/log/maestro-cleanup.log"
echo ""
df -h /
