"""Unit conversion helpers for MfgLinksEditor links.

Allows the customer to pick ANY consumption unit (e.g., كغم/غرام/قطعة/شريحة)
on a sale-product link to a manufactured product. The converter maps the
chosen unit back to the manufactured product's MAIN unit for cost calculation
and inventory deduction.

Pure-Python (no DB) so it can be unit-tested in isolation.
"""

LINK_WEIGHT_MAP = {
    "غرام": 1.0, "كغم": 1000.0, "كيلو": 1000.0, "كجم": 1000.0,
    "gram": 1.0, "kg": 1000.0,
    "مل": 1.0, "لتر": 1000.0, "ml": 1.0, "liter": 1000.0, "l": 1000.0,
}


def convert_link_consumption_to_main(consumption_qty: float, consumption_unit: str,
                                     main_unit: str, piece_weight: float,
                                     piece_weight_unit: str) -> float:
    """يُحوّل الكمية المُستهلكة من أي وحدة (consumption_unit) إلى main_unit
    للمنتج المُصنّع. يدعم 4 حالات:

    A) consumption_unit == main_unit           → بدون تغيير.
    B) consumption_unit == piece_weight_unit  → qty / piece_weight.
    C) كلاهما من نفس العائلة الوزنية           → ضرب/قسمة عبر الجدول.
    D) consumption_unit وزني + pwu وزني        → عبر pwu ثم ÷ piece_weight.
    """
    cu = (consumption_unit or "").strip()
    mu = (main_unit or "").strip()
    pwu = (piece_weight_unit or "").strip()
    pw = float(piece_weight or 0)

    if not cu or cu == mu:
        return consumption_qty
    if cu == pwu and pw > 0:
        return consumption_qty / pw
    cu_factor = LINK_WEIGHT_MAP.get(cu)
    mu_factor = LINK_WEIGHT_MAP.get(mu)
    if cu_factor is not None and mu_factor is not None:
        return consumption_qty * cu_factor / mu_factor
    pwu_factor = LINK_WEIGHT_MAP.get(pwu)
    if cu_factor is not None and pwu_factor is not None and pw > 0:
        qty_in_pwu_base = consumption_qty * cu_factor / pwu_factor
        return qty_in_pwu_base / pw
    return consumption_qty
