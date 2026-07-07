# خدمة الواتساب المجاني (Baileys) — لإرسال رموز التحقق مجاناً
# نستخدم صورة node:20 الكاملة (تتضمن build tools ولا تحتاج قواعد alpine)
# — Baileys يعتمد على أشجار libsignal التي تحتاج أدوات بناء في بعض بيئات CI
FROM node:20-bookworm-slim

# تثبيت أدوات البناء + git اللازمة (Baileys يجلب libsignal من GitHub)
RUN apt-get update && apt-get install -y --no-install-recommends \
        python3 make g++ git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# تثبيت الاعتماديات (منفصلة عن الشيفرة لتفعيل التخزين المؤقت في Docker)
COPY package.json yarn.lock* ./

# استخدم yarn لو yarn.lock موجود (أسرع + توافق أفضل)، وإلا npm install عادي
RUN if [ -f yarn.lock ]; then \
        corepack enable && \
        yarn install --production --frozen-lockfile --network-timeout 600000 || \
        yarn install --production --network-timeout 600000; \
    else \
        npm install --production --no-audit --no-fund --network-timeout=600000; \
    fi

# نسخ الشيفرة
COPY index.js ./

# مجلد مصادقة واتساب (يُحفَظ عبر volume في docker-compose)
RUN mkdir -p /app/auth

ENV WA_SERVICE_PORT=3002
ENV WA_SERVICE_HOST=0.0.0.0
ENV WA_AUTH_DIR=/app/auth
# WA_SERVICE_TOKEN يُمرَّر من docker-compose

EXPOSE 3002

CMD ["node", "index.js"]
