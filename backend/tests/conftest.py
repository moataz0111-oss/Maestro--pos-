"""تحميل .env قبل استيراد أي شيء — لضمان توفر MONGO_URL وباقي المتغيرات في كل الاختبارات."""
import os
from pathlib import Path
from dotenv import load_dotenv

_backend_dir = Path(__file__).parent.parent
load_dotenv(_backend_dir / ".env")
# fallback إن كان .env مفقوداً
os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test_db")
