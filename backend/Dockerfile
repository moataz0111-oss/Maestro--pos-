FROM python:3.11-slim

WORKDIR /app

# نسخ ملفات المتطلبات
COPY requirements.txt .

# تثبيت المتطلبات
RUN pip install --no-cache-dir -r requirements.txt
RUN pip install emergentintegrations --extra-index-url https://d33sy5i8bnduwe.cloudfront.net/simple/

# نسخ كود التطبيق
COPY . .

# إنشاء مجلدات uploads
RUN mkdir -p /app/uploads/logos /app/uploads/backgrounds /app/uploads/images/products /app/uploads/images/categories

# تشغيل السيرفر
EXPOSE 8001
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8001"]
