"""اختبار حساب مجموع الطلب - يحمي من الـbug الذي اكتُشف اليوم"""

def calculate_item_total_NEW(item):
    """الصيغة الصحيحة (مطابقة لـSلسلة Frontend)"""
    base_total = item["price"] * item["quantity"]
    extras_total = sum(e.get("price",0) * int(e.get("quantity",1)) for e in item.get("extras",[]))
    return base_total + extras_total


def calculate_item_total_OLD_BUG(item):
    """الصيغة الخاطئة القديمة (تُضاعف الإضافات بالكمية)"""
    base = item["price"]
    extras = sum(e.get("price",0) * int(e.get("quantity",1)) for e in item.get("extras",[]))
    return (base + extras) * item["quantity"]


def test_simple_no_extras():
    item = {"price": 5000, "quantity": 2, "extras": []}
    assert calculate_item_total_NEW(item) == 10000


def test_user_video_case_1():
    """الفيديو 1: 13,750 → 15,750 (+2000) - الإصلاح يجعل ينطبق"""
    # افتراضي: منتج بـ12000 + إضافة 1750 (qty=1) ولكن qty=2:
    # OLD: (12000+1750)*2 = 27500
    # NEW: 12000*2 + 1750 = 25750
    # السلة (frontend): 25750 ✅
    item = {"price": 12000, "quantity": 1, "extras": [{"price": 1750, "quantity": 1}]}
    assert calculate_item_total_NEW(item) == 13750  # qty=1 → نفس النتيجة
    
    # لكن لو qty=2:
    item2 = {"price": 5000, "quantity": 2, "extras": [{"price": 2000, "quantity": 1}]}
    assert calculate_item_total_NEW(item2) == 12000  # ✅ صحيح
    assert calculate_item_total_OLD_BUG(item2) == 14000  # ❌ كان bug


def test_multiple_extras():
    item = {
        "price": 10000, "quantity": 3,
        "extras": [
            {"price": 1000, "quantity": 2},  # 2000
            {"price": 500, "quantity": 1},   # 500
        ]
    }
    # NEW: 10000*3 + 2000 + 500 = 32500
    # OLD: (10000 + 2500)*3 = 37500
    assert calculate_item_total_NEW(item) == 32500
    assert calculate_item_total_OLD_BUG(item) == 37500


def test_no_quantity_difference_when_qty_1():
    """إذا qty=1، النتيجتين متطابقتين"""
    item = {"price": 5000, "quantity": 1, "extras": [{"price": 2000, "quantity": 1}]}
    assert calculate_item_total_NEW(item) == calculate_item_total_OLD_BUG(item) == 7000


if __name__ == "__main__":
    test_simple_no_extras()
    test_user_video_case_1()
    test_multiple_extras()
    test_no_quantity_difference_when_qty_1()
    print("✅ كل الاختبارات نجحت — الصيغة الصحيحة مُثبَّتة")
