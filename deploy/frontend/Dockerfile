FROM node:18-alpine as build

WORKDIR /app

# نسخ ملفات package
COPY package.json yarn.lock ./

# تثبيت المتطلبات
RUN yarn install --frozen-lockfile

# نسخ الكود
COPY . .

# بناء التطبيق
ARG REACT_APP_BACKEND_URL
ENV REACT_APP_BACKEND_URL=$REACT_APP_BACKEND_URL
RUN yarn build

# مرحلة التشغيل
FROM nginx:alpine

# نسخ ملفات البناء
COPY --from=build /app/build /usr/share/nginx/html

# نسخ إعدادات nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]
