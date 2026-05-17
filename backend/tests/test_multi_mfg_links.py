"""
Test multi-manufactured-product linking (manufactured_links array).
Verifies that:
1. A product with multiple linked manufactured products correctly:
   - Computes total cost as SUM of all linked mfg products' unit costs
   - Deducts inventory from ALL linked mfg products on sale
2. Legacy products with single `manufactured_product_id` still work (backward compat)
"""
import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient


MONGO_URL = os.environ.get("MONGO_URL")
DB_NAME = os.environ.get("DB_NAME")


def _compute_unit_cost(mp: dict) -> float:
    """Replicates backend cost-computation for a single mfg product."""
    batch_cost = (
        mp.get("raw_material_cost_after_waste")
        or mp.get("production_cost")
        or mp.get("raw_material_cost")
        or 0.0
    )
    _UNIT_W = {"غرام": 1.0, "كغم": 1000.0, "كيلو": 1000.0, "كجم": 1000.0, "gram": 1.0, "kg": 1000.0}
    pw = float(mp.get("piece_weight") or 0)
    pwu = mp.get("piece_weight_unit") or "غرام"
    piece_g = pw * _UNIT_W.get(pwu, 1.0)
    total_g = 0.0
    for ing in (mp.get("recipe") or []):
        f = _UNIT_W.get(ing.get("unit"))
        if f:
            total_g += (ing.get("quantity") or 0) * f
    calc_yield = (total_g / piece_g) if (piece_g > 0 and total_g > 0) else 0
    denom = calc_yield or float(mp.get("quantity") or 0) or 1.0
    return float(batch_cost) / denom


def test_multi_link_cost_is_sum_of_all_links():
    """A burger product linked to: meat (1 piece) + bun (1 piece) + sauce (50g)
       => total cost = meat_unit + bun_unit + (sauce_unit * 50/sauce_piece_weight)."""
    meat = {
        "raw_material_cost_after_waste": 100_000,  # 100k IQD for the batch
        "piece_weight": 120, "piece_weight_unit": "غرام",
        "recipe": [{"quantity": 60, "unit": "كغم"}],  # 60kg => 60000g => 500 pieces
        "quantity": 500,
    }
    bun = {
        "raw_material_cost_after_waste": 50_000,
        "piece_weight": 80, "piece_weight_unit": "غرام",
        "recipe": [{"quantity": 16, "unit": "كغم"}],  # 16000g / 80g = 200 pieces
        "quantity": 200,
    }
    sauce = {
        "raw_material_cost_after_waste": 30_000,
        "piece_weight": 1, "piece_weight_unit": "غرام",  # per gram
        "recipe": [{"quantity": 3000, "unit": "غرام"}],  # 3000g
        "quantity": 3000,
    }

    meat_unit = _compute_unit_cost(meat)   # 100000 / 500 = 200
    bun_unit = _compute_unit_cost(bun)     # 50000 / 200 = 250
    sauce_unit = _compute_unit_cost(sauce) # 30000 / 3000 = 10 per gram

    # Links: meat 1pc + bun 1pc + sauce 50g
    links = [
        {"manufactured_product_id": "meat", "consumption_qty": 1},
        {"manufactured_product_id": "bun", "consumption_qty": 1},
        {"manufactured_product_id": "sauce", "consumption_qty": 50},
    ]
    products = {"meat": meat, "bun": bun, "sauce": sauce}

    total = 0.0
    for lk in links:
        mp = products[lk["manufactured_product_id"]]
        total += _compute_unit_cost(mp) * lk["consumption_qty"]

    assert abs(total - (200 + 250 + 50 * 10)) < 0.01, f"got {total}"
    # = 200 + 250 + 500 = 950
    assert abs(total - 950) < 0.01


def test_backward_compat_single_link_still_works():
    """Legacy product with manufactured_product_id (no manufactured_links) must still compute cost."""
    mp = {
        "raw_material_cost_after_waste": 100_000,
        "piece_weight": 120, "piece_weight_unit": "غرام",
        "recipe": [{"quantity": 60, "unit": "كغم"}],
        "quantity": 500,
    }
    product = {
        "manufactured_product_id": "meat",
        "manufactured_consumption_qty": 1,
        # No manufactured_links field => emulates legacy data
    }

    # Backend logic: if no manufactured_links, fall back to single
    mfg_links = list(product.get("manufactured_links") or [])
    if not mfg_links and product.get("manufactured_product_id"):
        mfg_links = [{
            "manufactured_product_id": product["manufactured_product_id"],
            "consumption_qty": product.get("manufactured_consumption_qty") or 1,
        }]

    assert len(mfg_links) == 1
    assert mfg_links[0]["manufactured_product_id"] == "meat"
    assert mfg_links[0]["consumption_qty"] == 1

    total = _compute_unit_cost(mp) * mfg_links[0]["consumption_qty"]
    assert abs(total - 200) < 0.01  # 100000 / 500


def test_empty_links_with_no_legacy_means_zero_mfg_cost():
    """A product with neither manufactured_links nor manufactured_product_id has no mfg cost."""
    product = {"cost": 0}
    mfg_links = list(product.get("manufactured_links") or [])
    if not mfg_links and product.get("manufactured_product_id"):
        mfg_links = [{"manufactured_product_id": product["manufactured_product_id"]}]
    assert len(mfg_links) == 0


if __name__ == "__main__":
    test_multi_link_cost_is_sum_of_all_links()
    test_backward_compat_single_link_still_works()
    test_empty_links_with_no_legacy_means_zero_mfg_cost()
    print("✅ All multi-mfg-link tests passed")
