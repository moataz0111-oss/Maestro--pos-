"""Benchmark + correctness check for reports cost-map N+1 refactor.

Seeds a large synthetic tenant, then:
  1. Times the NEW cached `_build_current_costs_map` (single pre-enrich pass).
  2. Times the OLD per-product DB path (mfg_cache=None) for comparison.
  3. Asserts both paths return IDENTICAL unit_cost/unit_pkg for every product.
Cleans up afterwards. Run: `python3 tests/bench_costmap.py`
"""
import asyncio
import os
import time
import uuid
from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorClient

import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from routes.reports_routes import _build_current_costs_map, _resolve_product_unit_cost

TENANT = "perf_bench_tenant"
N_MFG = 40
N_PRODUCTS = 300


async def seed(db):
    await db.manufactured_products.delete_many({"tenant_id": TENANT})
    await db.products.delete_many({"tenant_id": TENANT})
    await db.raw_materials.delete_many({"tenant_id": TENANT})

    now = datetime.now(timezone.utc).isoformat()
    # raw materials
    raw_ids = []
    raws = []
    for i in range(20):
        rid = str(uuid.uuid4())
        raw_ids.append(rid)
        raws.append({"id": rid, "tenant_id": TENANT, "name": f"خام {i}",
                     "pack_quantity": 1000, "pack_unit": "غرام", "cost_per_unit": 5 + i,
                     "created_at": now})
    await db.raw_materials.insert_many(raws)

    # manufactured products with recipes referencing raw materials
    mfg_ids = []
    mfgs = []
    for i in range(N_MFG):
        mid = str(uuid.uuid4())
        mfg_ids.append(mid)
        recipe = [{"raw_material_id": raw_ids[(i + j) % len(raw_ids)],
                   "raw_material_name": f"خام {(i + j) % len(raw_ids)}",
                   "quantity": 500, "unit": "غرام"} for j in range(3)]
        mfgs.append({
            "id": mid, "tenant_id": TENANT, "name": f"مصنّع {i}",
            "unit": "حبة", "piece_weight": 119, "piece_weight_unit": "غرام",
            "piece_def_value": 119, "piece_def_unit": "غرام",
            "raw_material_cost": 100000 + i * 1000,
            "raw_material_cost_after_waste": 105000 + i * 1000,
            "production_cost": 105000 + i * 1000,
            "cost_before_waste": 100000 + i * 1000,
            "total_produced": 100, "transferred_quantity": 0, "quantity": 100,
            "recipe": recipe, "created_at": now,
        })
    await db.manufactured_products.insert_many(mfgs)

    # sale products: half linked via manufactured_links, half via name-match fallback
    prods = []
    for i in range(N_PRODUCTS):
        pid = str(uuid.uuid4())
        if i % 2 == 0:
            mid = mfg_ids[i % N_MFG]
            links = [{"manufactured_product_id": mid, "consumption_qty": 1, "consumption_unit": "حبة"}]
            prods.append({"id": pid, "tenant_id": TENANT, "name": f"صنف بيع {i}",
                          "price": 5000, "cost": 3000, "packaging_cost": 200,
                          "operating_cost": 50, "manufactured_links": links, "created_at": now})
        else:
            # name fallback: name matches an existing manufactured product name
            prods.append({"id": pid, "tenant_id": TENANT, "name": f"مصنّع {i % N_MFG}",
                          "price": 5000, "cost": 3000, "packaging_cost": 200,
                          "operating_cost": 50, "created_at": now})
    await db.products.insert_many(prods)


async def old_path_map(db, tenant_id):
    """Replicates the OLD behaviour: resolve each product with per-product DB queries."""
    products_q = {"tenant_id": tenant_id}
    by_id = {}
    async for p in db.products.find(products_q, {"_id": 0}):
        resolved = await _resolve_product_unit_cost(db, p)  # no cache => DB path
        if p.get("id"):
            by_id[p["id"]] = {"unit_cost": resolved["unit_cost"], "unit_pkg": resolved["unit_pkg"]}
    return by_id


async def main():
    c = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = c[os.environ["DB_NAME"]]
    try:
        print(f"Seeding {N_PRODUCTS} products, {N_MFG} manufactured products...")
        await seed(db)

        # warmup (establish connection pool, prime OS cache)
        await _build_current_costs_map(db, TENANT)
        await old_path_map(db, TENANT)

        RUNS = 3
        new_times, old_times = [], []
        new_map = old_map = None
        for _ in range(RUNS):
            t0 = time.perf_counter()
            old_map = await old_path_map(db, TENANT)
            old_times.append(time.perf_counter() - t0)

            t0 = time.perf_counter()
            new_map = await _build_current_costs_map(db, TENANT)
            new_times.append(time.perf_counter() - t0)

        t_new = sum(new_times) / RUNS
        t_old = sum(old_times) / RUNS

        print(f"\n(avg of {RUNS} runs, after warmup)")
        print(f"NEW cached path : {t_new*1000:8.1f} ms")
        print(f"OLD N+1   path : {t_old*1000:8.1f} ms")
        if t_new > 0:
            print(f"Speedup        : {t_old / t_new:6.1f}x")

        # correctness: identical results
        new_by_id = new_map["by_id"]
        mismatches = 0
        for pid, old_v in old_map.items():
            nv = new_by_id.get(pid)
            if not nv:
                mismatches += 1
                continue
            if round(nv["unit_cost"], 4) != round(old_v["unit_cost"], 4) or \
               round(nv["unit_pkg"], 4) != round(old_v["unit_pkg"], 4):
                mismatches += 1
                if mismatches <= 5:
                    print(f"  MISMATCH {pid}: new={nv} old={old_v}")
        print(f"\nProducts compared: {len(old_map)} | mismatches: {mismatches}")
        assert mismatches == 0, "Cached path must return identical costs to DB path!"
        print("CORRECTNESS: PASS ✅ (cached == DB path)")
    finally:
        await db.manufactured_products.delete_many({"tenant_id": TENANT})
        await db.products.delete_many({"tenant_id": TENANT})
        await db.raw_materials.delete_many({"tenant_id": TENANT})
        print("Cleaned up bench data.")


if __name__ == "__main__":
    asyncio.run(main())
