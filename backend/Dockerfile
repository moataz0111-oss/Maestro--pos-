FROM python:3.11-slim

WORKDIR /app

# مكتبات النظام وأدوات البناء — لازمة حتى تُركّب وتُستورد حزم بايثون (Pillow/pillow_heif/cryptography...)
# بدونها قد ينهار الخادم عند الإقلاع في صورة slim رغم نجاح الاستيراد على بيئة كاملة.
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    gcc \
    g++ \
    curl \
    libjpeg62-turbo \
    zlib1g \
    libpng16-16 \
    libfreetype6 \
    libheif1 \
    libde265-0 \
    libffi8 \
    libssl3 \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

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
