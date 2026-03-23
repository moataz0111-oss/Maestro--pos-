# دليل إعداد CI/CD للتحديث التلقائي
# =================================

## ما هو CI/CD؟
CI/CD = Continuous Integration / Continuous Deployment
يعني: كل ما تعدل الكود وتحفظه في GitHub، السيرفر يسحب التحديثات ويعيد البناء تلقائياً!

---

## الطريقة 1: GitHub Actions + SSH (الأسهل والمجانية)

### الخطوة 1: إنشاء SSH Key على السيرفر
```bash
# على سيرفر VPS
ssh-keygen -t ed25519 -C "github-actions" -f ~/.ssh/github_actions -N ""

# اعرض المفتاح العام (أضفه للسيرفر)
cat ~/.ssh/github_actions.pub >> ~/.ssh/authorized_keys

# اعرض المفتاح الخاص (ستحتاجه لـ GitHub)
cat ~/.ssh/github_actions
```

### الخطوة 2: إضافة Secrets في GitHub
1. اذهب لـ GitHub repo → Settings → Secrets and variables → Actions
2. أضف هذه الـ Secrets:

| Secret Name | القيمة |
|-------------|--------|
| `VPS_HOST` | IP السيرفر (مثال: 123.45.67.89) |
| `VPS_USER` | root |
| `VPS_SSH_KEY` | محتوى ملف github_actions (المفتاح الخاص) |
| `VPS_PORT` | 22 |

### الخطوة 3: إنشاء ملف GitHub Actions
أنشئ ملف `.github/workflows/deploy.yml` في repo:

```yaml
name: Deploy to Production

on:
  push:
    branches: [ main ]  # يعمل عند Push لـ main

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
    - name: Deploy to VPS
      uses: appleboy/ssh-action@v1.0.3
      with:
        host: ${{ secrets.VPS_HOST }}
        username: ${{ secrets.VPS_USER }}
        key: ${{ secrets.VPS_SSH_KEY }}
        port: ${{ secrets.VPS_PORT }}
        script: |
          cd /var/www/maestro
          git pull origin main
          cd deploy
          docker-compose up -d --build
          echo "✅ Deployment completed at $(date)"
```

---

## الطريقة 2: Webhook مباشر (بدون GitHub Actions)

### الخطوة 1: إنشاء سكريبت Webhook على السيرفر
```bash
# على السيرفر
nano /var/www/maestro/webhook.py
```

محتوى الملف:
```python
from flask import Flask, request
import subprocess
import hmac
import hashlib

app = Flask(__name__)
WEBHOOK_SECRET = "your-secret-key-here"  # غيّرها!

@app.route('/webhook', methods=['POST'])
def webhook():
    # التحقق من التوقيع
    signature = request.headers.get('X-Hub-Signature-256')
    if not verify_signature(request.data, signature):
        return 'Invalid signature', 401
    
    # تنفيذ التحديث
    subprocess.Popen(['/var/www/maestro/deploy/auto-deploy.sh'])
    return 'OK', 200

def verify_signature(payload, signature):
    if not signature:
        return False
    expected = 'sha256=' + hmac.new(
        WEBHOOK_SECRET.encode(),
        payload,
        hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(signature, expected)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=9000)
```

### الخطوة 2: سكريبت التحديث التلقائي
```bash
nano /var/www/maestro/deploy/auto-deploy.sh
```

محتوى الملف:
```bash
#!/bin/bash
cd /var/www/maestro
git pull origin main
cd deploy
docker-compose up -d --build
echo "$(date): Deployment completed" >> /var/log/maestro-deploy.log
```

```bash
chmod +x /var/www/maestro/deploy/auto-deploy.sh
```

### الخطوة 3: تشغيل Webhook كـ Service
```bash
# تثبيت Flask
pip install flask

# إنشاء systemd service
sudo nano /etc/systemd/system/maestro-webhook.service
```

محتوى الملف:
```ini
[Unit]
Description=Maestro GitHub Webhook
After=network.target

[Service]
User=root
WorkingDirectory=/var/www/maestro
ExecStart=/usr/bin/python3 webhook.py
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable maestro-webhook
sudo systemctl start maestro-webhook
```

### الخطوة 4: إعداد GitHub Webhook
1. اذهب لـ GitHub repo → Settings → Webhooks → Add webhook
2. Payload URL: `http://YOUR_SERVER_IP:9000/webhook`
3. Content type: `application/json`
4. Secret: نفس `WEBHOOK_SECRET` في السكريبت
5. Events: Just the push event

---

## الطريقة 3: Watchtower (الأبسط للـ Docker)

Watchtower يراقب Docker images ويحدثها تلقائياً:

```bash
# أضف هذا لـ docker-compose.yml
  watchtower:
    image: containrrr/watchtower
    container_name: watchtower
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    command: --interval 300  # يفحص كل 5 دقائق
    restart: always
```

---

## ملخص الطرق

| الطريقة | السهولة | المجانية | الأمان |
|---------|---------|----------|--------|
| GitHub Actions + SSH | ⭐⭐⭐ | ✅ مجاني | 🔒 عالي |
| Webhook مباشر | ⭐⭐ | ✅ مجاني | 🔓 متوسط |
| Watchtower | ⭐⭐⭐⭐ | ✅ مجاني | 🔒 عالي |

---

## نصيحتي: استخدم GitHub Actions + SSH
- مجاني 100%
- آمن (SSH Key)
- سهل الإعداد
- يعمل تلقائياً مع كل Push

هل تريد مساعدة في إعداد أي طريقة؟
