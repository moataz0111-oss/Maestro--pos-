# Database configuration and initialization
import os
from motor.motor_asyncio import AsyncIOMotorClient
from pathlib import Path

ROOT_DIR = Path(__file__).parent

# MongoDB Configuration
mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME', 'restaurant_db')]

# Static Files Configuration
UPLOAD_DIR = ROOT_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)
BACKGROUNDS_DIR = UPLOAD_DIR / "backgrounds"
BACKGROUNDS_DIR.mkdir(exist_ok=True)
LOGOS_DIR = UPLOAD_DIR / "logos"
LOGOS_DIR.mkdir(exist_ok=True)
IMAGES_DIR = UPLOAD_DIR / "images"
IMAGES_DIR.mkdir(exist_ok=True)
PRODUCTS_DIR = IMAGES_DIR / "products"
PRODUCTS_DIR.mkdir(exist_ok=True)
CATEGORIES_DIR = IMAGES_DIR / "categories"
CATEGORIES_DIR.mkdir(exist_ok=True)

# JWT Configuration
JWT_SECRET = os.environ.get('JWT_SECRET', 'your-secret-key-change-in-production')
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24
