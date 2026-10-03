"""
Database Optimization & Reliability Service
خدمة تحسين قاعدة البيانات والموثوقية
"""
import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional
import json
import os

logger = logging.getLogger(__name__)


async def create_database_indexes(db):
    """إنشاء indexes لتسريع الاستعلامات"""
    try:
        # Orders indexes
        await db.orders.create_index([("tenant_id", 1), ("created_at", -1)])
        await db.orders.create_index([("branch_id", 1), ("created_at", -1)])
        await db.orders.create_index([("status", 1)])
        await db.orders.create_index([("shift_id", 1)])
        await db.orders.create_index([("customer_phone", 1)])
        await db.orders.create_index([("order_number", 1)])
        
        # Users indexes
        await db.users.create_index([("email", 1)], unique=True)
        await db.users.create_index([("username", 1)], unique=True)
        await db.users.create_index([("tenant_id", 1)])
        await db.users.create_index([("branch_id", 1)])
        
        # Products indexes
        await db.products.create_index([("tenant_id", 1), ("category_id", 1)])
        await db.products.create_index([("barcode", 1)])
        await db.products.create_index([("name", "text")])
        
        # Categories indexes
        await db.categories.create_index([("tenant_id", 1), ("sort_order", 1)])
        
        # Branches indexes
        await db.branches.create_index([("tenant_id", 1)])
        
        # Employees indexes
        await db.employees.create_index([("tenant_id", 1), ("branch_id", 1)])
        await db.employees.create_index([("national_id", 1)])
        
        # Attendance indexes
        await db.attendance.create_index([("employee_id", 1), ("date", -1)])
        await db.attendance.create_index([("tenant_id", 1), ("date", -1)])
        
        # Shifts indexes
        await db.shifts.create_index([("branch_id", 1), ("status", 1)])
        await db.shifts.create_index([("started_at", -1)])
        
        # Expenses indexes
        await db.expenses.create_index([("tenant_id", 1), ("date", -1)])
        await db.expenses.create_index([("branch_id", 1), ("date", -1)])
        
        # Drivers indexes
        await db.drivers.create_index([("tenant_id", 1), ("is_active", 1)])
        await db.drivers.create_index([("phone", 1)])
        
        # Inventory indexes
        await db.inventory.create_index([("branch_id", 1), ("product_id", 1)])
        
        # Day closures indexes
        await db.day_closures.create_index([("tenant_id", 1), ("closed_at", -1)])
        
        logger.info("✅ Database indexes created successfully")
        return True
    except Exception as e:
        logger.error(f"❌ Failed to create indexes: {e}")
        return False


async def get_database_stats(db) -> Dict:
    """إحصائيات قاعدة البيانات"""
    try:
        stats = {
            "collections": {},
            "total_documents": 0,
            "database_size": "N/A"
        }
        
        collections = await db.list_collection_names()
        
        for coll_name in collections:
            count = await db[coll_name].count_documents({})
            stats["collections"][coll_name] = count
            stats["total_documents"] += count
        
        # Get database stats
        try:
            db_stats = await db.command("dbStats")
            stats["database_size"] = f"{db_stats.get('dataSize', 0) / (1024*1024):.2f} MB"
            stats["storage_size"] = f"{db_stats.get('storageSize', 0) / (1024*1024):.2f} MB"
            stats["indexes_size"] = f"{db_stats.get('indexSize', 0) / (1024*1024):.2f} MB"
        except Exception:
            pass
        
        return stats
    except Exception as e:
        logger.error(f"Failed to get database stats: {e}")
        return {"error": str(e)}


async def backup_collection(db, collection_name: str, backup_path: str) -> bool:
    """نسخ احتياطي لمجموعة"""
    try:
        documents = await db[collection_name].find({}, {"_id": 0}).to_list(None)
        
        backup_file = f"{backup_path}/{collection_name}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        
        os.makedirs(backup_path, exist_ok=True)
        
        with open(backup_file, 'w', encoding='utf-8') as f:
            json.dump(documents, f, ensure_ascii=False, indent=2, default=str)
        
        logger.info(f"✅ Backed up {collection_name}: {len(documents)} documents")
        return True
    except Exception as e:
        logger.error(f"❌ Backup failed for {collection_name}: {e}")
        return False


async def full_backup(db, backup_path: str = "/app/backups") -> Dict:
    """نسخ احتياطي كامل"""
    results = {"success": [], "failed": [], "timestamp": datetime.now(timezone.utc).isoformat()}
    
    collections = await db.list_collection_names()
    
    for coll_name in collections:
        success = await backup_collection(db, coll_name, backup_path)
        if success:
            results["success"].append(coll_name)
        else:
            results["failed"].append(coll_name)
    
    logger.info(f"Backup complete: {len(results['success'])} success, {len(results['failed'])} failed")
    return results


async def cleanup_old_data(db, days_to_keep: int = 365) -> Dict:
    """تنظيف البيانات القديمة"""
    cutoff_date = (datetime.now(timezone.utc) - timedelta(days=days_to_keep)).isoformat()
    
    results = {}
    
    # لا نحذف الطلبات، فقط نؤرشفها
    # يمكن إضافة أرشفة لاحقاً
    
    # تنظيف سجلات الإشعارات القديمة
    try:
        result = await db.notifications.delete_many({"created_at": {"$lt": cutoff_date}})
        results["notifications_deleted"] = result.deleted_count
    except Exception:
        pass
    
    # تنظيف سجلات التدقيق القديمة
    try:
        result = await db.audit_logs.delete_many({"created_at": {"$lt": cutoff_date}})
        results["audit_logs_deleted"] = result.deleted_count
    except Exception:
        pass
    
    return results


class SystemHealth:
    """فحص صحة النظام"""
    
    @staticmethod
    async def check_database(db) -> Dict:
        """فحص قاعدة البيانات"""
        try:
            # Simple ping
            await db.command("ping")
            
            # Check collections
            collections = await db.list_collection_names()
            
            return {
                "status": "healthy",
                "collections_count": len(collections),
                "message": "Database is operational"
            }
        except Exception as e:
            return {
                "status": "unhealthy",
                "error": str(e),
                "message": "Database connection failed"
            }
    
    @staticmethod
    async def check_disk_space() -> Dict:
        """فحص مساحة القرص"""
        try:
            import shutil
            total, used, free = shutil.disk_usage("/")
            
            free_percent = (free / total) * 100
            
            return {
                "status": "healthy" if free_percent > 10 else "warning",
                "total_gb": round(total / (1024**3), 2),
                "used_gb": round(used / (1024**3), 2),
                "free_gb": round(free / (1024**3), 2),
                "free_percent": round(free_percent, 1)
            }
        except Exception as e:
            return {"status": "unknown", "error": str(e)}
    
    @staticmethod
    async def full_health_check(db) -> Dict:
        """فحص صحة شامل"""
        return {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "database": await SystemHealth.check_database(db),
            "disk": await SystemHealth.check_disk_space(),
            "version": "1.0.0"
        }
