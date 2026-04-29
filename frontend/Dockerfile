FROM node:20-alpine as build

WORKDIR /app

# نسخ ملفات package
COPY package.json yarn.lock ./

# تثبيت المتطلبات
# هذا الـlayer يبقى مكاش طالما package.json/yarn.lock ما تغيروا
RUN yarn install --network-timeout 100000 --prefer-offline 2>&1 | grep -v "Workspaces can only" || true

# File-based cachebust: deploy.yml يكتب timestamp في .cachebust قبل البناء
# → COPY يكتشف الملف تغير → يبطل الكاش → COPY . . و yarn build يعملان من جديد
# (يشتغل على classic Docker builder بدون BuildKit/buildx)
COPY .cachebust /tmp/.cachebust
RUN echo "Cache bust: $(cat /tmp/.cachebust)"

# نسخ الكود
COPY . .

# طباعة للتأكد من الكود الجديد
RUN echo "Build timestamp: $(date)" && grep -c "اسم العميل المرتبط" src/pages/Coupons.js || true

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
