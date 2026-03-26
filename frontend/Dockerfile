FROM node:20-alpine as build

WORKDIR /app

# متغير لإجبار إعادة البناء (يتغير مع كل deploy)
ARG CACHEBUST=1

# نسخ ملفات package
COPY package.json yarn.lock ./

# تثبيت المتطلبات
RUN yarn install

# نسخ الكود (هذا يجب أن يبطل cache إذا تغيرت الملفات)
COPY . .

# طباعة للتأكد من الكود الجديد
RUN echo "Build timestamp: $(date)" && grep -c "صورة الفاتورة" src/pages/Purchasing.js || true

# بناء التطبيق
ARG REACT_APP_BACKEND_URL
ENV REACT_APP_BACKEND_URL=$REACT_APP_BACKEND_URL
RUN yarn build

# مرحلة التشغيل
FROM nginx:alpine

# نسخ ملفات البناء
COPY --from=build /app/build /usr/share/nginx/html

# إنشاء إعدادات nginx
RUN echo 'server { \
    listen 3000; \
    location / { \
        root /usr/share/nginx/html; \
        index index.html; \
        try_files $uri $uri/ /index.html; \
    } \
    location /api { \
        proxy_pass http://backend:8001; \
        proxy_http_version 1.1; \
        proxy_set_header Upgrade $http_upgrade; \
        proxy_set_header Connection "upgrade"; \
        proxy_set_header Host $host; \
        proxy_set_header X-Real-IP $remote_addr; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]
