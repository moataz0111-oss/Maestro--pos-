"""
Test: `_resolve_ingredient_ids` يربط المكوّن بالاسم تلقائياً
عند عدم وجود raw_material_id أو manufactured_product_id.
"""
import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


class FakeCollection:
    def __init__(self, data):
        self._data = data

    async def find_one(self, query, projection=None):
        # match name regex (case-insensitive)
        for d in self._data:
            ok = True
            for k, v in query.items():
                if k == "name" and isinstance(v, dict) and "$regex" in v:
                    import re
                    pat = v["$regex"]
                    if not re.match(pat, d.get("name", ""), re.IGNORECASE):
                        ok = False
                        break
                else:
                    if d.get(k) != v:
                        ok = False
                        break
            if ok:
                return d
        return None


class FakeDB:
    def __init__(self, raws, mfgs):
        self.raw_materials = FakeCollection(raws)
        self.manufactured_products = FakeCollection(mfgs)


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def test_resolve_links_manufactured_by_name():
    os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
    from routes.inventory_system import _resolve_ingredient_ids
    db = FakeDB(
        raws=[],
        mfgs=[{"id": "mfg-mayo", "name": "مايونيز", "tenant_id": "t1"}],
    )
    ing = {"raw_material_name": "مايونيز", "quantity": 1, "unit": "كغم"}
    out = _run(_resolve_ingredient_ids(db, ing, tenant_id="t1"))
    assert out["manufactured_product_id"] == "mfg-mayo"
    assert out["source"] == "manufactured"


def test_resolve_prefers_raw_material():
    from routes.inventory_system import _resolve_ingredient_ids
    db = FakeDB(
        raws=[{"id": "rm-1", "name": "طماطم"}],
        mfgs=[{"id": "mfg-x", "name": "طماطم"}],
    )
    ing = {"raw_material_name": "طماطم", "quantity": 1, "unit": "كغم"}
    out = _run(_resolve_ingredient_ids(db, ing, tenant_id="t1"))
    assert out.get("raw_material_id") == "rm-1"
    assert out.get("source") == "raw"


def test_resolve_no_match_leaves_unchanged():
    from routes.inventory_system import _resolve_ingredient_ids
    db = FakeDB(raws=[], mfgs=[])
    ing = {"raw_material_name": "غير موجود", "quantity": 1, "unit": "كغم"}
    out = _run(_resolve_ingredient_ids(db, ing, tenant_id="t1"))
    assert out.get("raw_material_id") is None
    assert out.get("manufactured_product_id") is None


def test_resolve_skips_when_id_present():
    from routes.inventory_system import _resolve_ingredient_ids
    db = FakeDB(raws=[{"id": "rm-other", "name": "مايونيز"}], mfgs=[])
    ing = {"raw_material_id": "kept", "raw_material_name": "مايونيز"}
    out = _run(_resolve_ingredient_ids(db, ing, tenant_id="t1"))
    assert out["raw_material_id"] == "kept"


if __name__ == "__main__":
    test_resolve_links_manufactured_by_name()
    test_resolve_prefers_raw_material()
    test_resolve_no_match_leaves_unchanged()
    test_resolve_skips_when_id_present()
    print("✅ كل اختبارات الربط التلقائي نجحت!")
