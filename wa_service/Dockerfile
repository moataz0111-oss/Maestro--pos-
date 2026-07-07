# خدمة الواتساب المجاني (Baileys) — لإرسال رموز التحقق مجاناً
FROM node:20-alpine

WORKDIR /app

# تثبيت الاعتماديات (منفصلة عن الشيفرة لتفعيل التخزين المؤقت في Docker)
COPY package.json yarn.lock* ./
RUN npm install --omit=dev --no-audit --no-fund

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


CMD ["node", "index.js"]
