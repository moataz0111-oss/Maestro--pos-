FROM node:20-alpine as build

WORKDIR /app

# نسخ ملفات package
COPY package.json yarn.lock ./

# تثبيت المتطلبات
# هذا الـlayer يبقى مكاش طالما package.json/yarn.lock ما تغيروا
# (Docker layer cache العادي بدون BuildKit)
RUN yarn install --network-timeout 100000 --prefer-offline 2>&1 | grep -v "Workspaces can only" || true

# CACHEBUST يأتي بعد yarn install: يجبر إبطال الكاش لكل ما يأتي تحته
# (نسخ الكود + البناء) عند كل deploy، بينما يحافظ على layer التثبيت
ARG CACHEBUST=1
RUN echo "Cache bust: $CACHEBUST"

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
