"""Tests for Yield Variance tracking on POST /manufactured-products/{id}/produce.

The variance feature lets the user record the ACTUAL yield obtained from a
production batch — often different from the recipe-computed yield due to
process waste, scrap, or operator error. The system stores each variance into
the `yield_variances` collection and exposes them via GET /yield-variances.
"""
import asyncio
import os
import sys
import uuid

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "maestro_pos_test")
os.environ.setdefault("REACT_APP_BACKEND_URL", "http://localhost:8001")

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from routes.inventory_system import produce_product, get_yield_variances  # noqa: E402


# ============================================================================
# In-memory fake Mongo collection
# ============================================================================

class _AsyncCursor:
    def __init__(self, items):
        self._items = list(items)

    def sort(self, *_args, **_kwargs):
        # naïve: sort by created_at desc
        self._items.sort(key=lambda d: d.get("created_at", ""), reverse=True)
        return self

    async def to_list(self, n):
        return list(self._items[:n])

    def __aiter__(self):
        self._idx = 0
        return self

    async def __anext__(self):
        if self._idx >= len(self._items):
            raise StopAsyncIteration
        v = self._items[self._idx]
        self._idx += 1
        return v


class FakeCollection:
    def __init__(self):
        self.docs = []

    async def find_one(self, query, projection=None):
        for d in self.docs:
            if all(d.get(k) == v for k, v in query.items()):
                if projection and projection.get("_id") == 0:
                    return {k: v for k, v in d.items() if k != "_id"}
                return d
        return None

    def find(self, query=None, projection=None):
        query = query or {}
        out = []
        for d in self.docs:
            ok = True
            for k, v in query.items():
                if isinstance(v, dict) and "$gte" in v:
                    if d.get(k, "") < v["$gte"]:
                        ok = False
                        break
                elif d.get(k) != v:
                    ok = False
                    break
            if ok:
                out.append({kk: vv for kk, vv in d.items() if kk != "_id"} if projection else d)
        return _AsyncCursor(out)

    async def insert_one(self, doc):
        self.docs.append(dict(doc))
        return type("R", (), {"inserted_id": doc.get("id", str(uuid.uuid4()))})()

    async def update_one(self, query, update):
        for d in self.docs:
            if all(d.get(k) == v for k, v in query.items()):
                for k, v in update.get("$inc", {}).items():
                    d[k] = (d.get(k) or 0) + v
                for k, v in update.get("$set", {}).items():
                    d[k] = v
                return type("R", (), {"matched_count": 1})()
        return type("R", (), {"matched_count": 0})()


class FakeDB:
    def __init__(self):
        self.manufactured_products = FakeCollection()
        self.manufacturing_inventory = FakeCollection()
        self.raw_materials = FakeCollection()
        self.inventory_movements = FakeCollection()
        self.yield_variances = FakeCollection()
        self.audit_logs = FakeCollection()


def _seed(db):
    """Beef Bacon scenario: 5 قطع لحم → expected 91.67 شريحة، طلب 91."""
    db.raw_materials.docs.append({
        "id": "beef",
        "name": "لحم بقري",
        "unit": "قطعة",
        "pack_quantity": 550,
        "pack_unit": "غرام",
    })
    db.manufacturing_inventory.docs.append({
        "raw_material_id": "beef",
        "quantity": 100,  # vastly enough
    })
    db.manufactured_products.docs.append({
        "id": "bacon",
        "name": "Beef Bacon",
        "unit": "شريحة",
        "piece_weight": 30,
        "piece_weight_unit": "غرام",
        "quantity": 0,
        "total_produced": 0,
        "raw_material_cost": 27500,
        "raw_material_cost_after_waste": 27500,
        "selling_price": 0,
        "recipe": [
            {
                "raw_material_id": "beef",
                "raw_material_name": "لحم بقري",
                "quantity": 5,
                "unit": "قطعة",
                "cost_per_unit": 5500,
                "waste_percentage": 0,
            }
        ],
    })


_USER = {"id": "u1", "email": "test@x", "full_name": "Tester", "username": "tester", "tenant_id": None}


# ============================================================================
# Patch get_db to return our fake
# ============================================================================
import routes.inventory_system as inv_mod  # noqa: E402


def _patched(fake):
    inv_mod.get_db = lambda: fake


# ============================================================================
# Tests
# ============================================================================

def test_produce_without_actual_yield_no_variance_record():
    db = FakeDB()
    _seed(db)
    _patched(db)
    res = asyncio.run(produce_product("bacon", quantity=91, actual_yield=None, current_user=_USER))
    assert res["actual_yield"] == 91
    assert res["yield_variance"] == 0
    assert res["yield_variance_record"] is None
    # No record stored
    assert len(db.yield_variances.docs) == 0


def test_produce_with_actual_yield_equals_expected_still_records():
    """If user explicitly confirms actual=expected, we still log a 0-variance record."""
    db = FakeDB()
    _seed(db)
    _patched(db)
    res = asyncio.run(produce_product("bacon", quantity=91, actual_yield=91.0, current_user=_USER))
    assert res["actual_yield"] == 91.0
    assert res["yield_variance"] == 0
    assert res["yield_variance_record"] is not None
    assert len(db.yield_variances.docs) == 1


def test_produce_with_under_yield_records_negative_variance():
    db = FakeDB()
    _seed(db)
    _patched(db)
    res = asyncio.run(produce_product("bacon", quantity=91, actual_yield=85.0, current_user=_USER))
    assert res["actual_yield"] == 85.0
    assert abs(res["yield_variance"] - (-6.0)) < 1e-6
    assert res["yield_variance_pct"] < 0
    rec = db.yield_variances.docs[0]
    assert rec["product_id"] == "bacon"
    assert rec["expected_yield"] == 91.0
    assert rec["actual_yield"] == 85.0
    assert rec["variance"] == -6.0
    # Inventory should reflect actual (85), not expected (91)
    bacon = next(d for d in db.manufactured_products.docs if d["id"] == "bacon")
    assert bacon["quantity"] == 85.0
    assert bacon["total_produced"] == 85.0


def test_produce_with_over_yield_records_positive_variance():
    db = FakeDB()
    _seed(db)
    _patched(db)
    res = asyncio.run(produce_product("bacon", quantity=91, actual_yield=95.0, current_user=_USER))
    assert abs(res["yield_variance"] - 4.0) < 1e-6
    assert res["yield_variance_pct"] > 0
    bacon = next(d for d in db.manufactured_products.docs if d["id"] == "bacon")
    assert bacon["quantity"] == 95.0


def test_get_yield_variances_returns_records_and_summary():
    db = FakeDB()
    _seed(db)
    _patched(db)
    # produce 3 batches with different variances
    asyncio.run(produce_product("bacon", quantity=91, actual_yield=85.0, current_user=_USER))
    asyncio.run(produce_product("bacon", quantity=91, actual_yield=90.0, current_user=_USER))
    asyncio.run(produce_product("bacon", quantity=91, actual_yield=92.0, current_user=_USER))
    out = asyncio.run(get_yield_variances(product_id=None, days=30, limit=100, current_user=_USER))
    assert len(out["records"]) == 3
    assert out["summary"]["total_records"] == 3
    # Variance sum: -6 + -1 + 1 = -6
    assert abs(out["summary"]["total_units_variance"] - (-6.0)) < 1e-6
    assert out["summary"]["total_expected_yield"] == 273.0  # 91*3
    assert out["summary"]["total_actual_yield"] == 267.0


def test_get_yield_variances_filter_by_product_id():
    db = FakeDB()
    _seed(db)
    _patched(db)
    asyncio.run(produce_product("bacon", quantity=10, actual_yield=8.0, current_user=_USER))
    out = asyncio.run(get_yield_variances(product_id="bacon", days=30, limit=100, current_user=_USER))
    assert len(out["records"]) == 1
    out_empty = asyncio.run(get_yield_variances(product_id="other", days=30, limit=100, current_user=_USER))
    assert len(out_empty["records"]) == 0
