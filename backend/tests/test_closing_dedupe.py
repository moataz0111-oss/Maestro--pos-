"""اختبار إزالة صفوف إغلاق الوردية المكررة تلقائياً (منطقة محاسبية حساسة)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from server import dedupe_shift_closings


def _rec(**kw):
    base = {
        "id": kw.get("id"),
        "branch_id": "b1",
        "cashier_name": "محمد صبحي",
        "cashier_id": kw.get("cashier_id", "c1"),
        "shift_start": None,
        "shift_end": None,
        "closed_at": kw.get("closed_at", "2026-07-02T23:00:00+00:00"),
        "business_date": kw.get("business_date"),
        "total_sales": 0,
        "orders_count": 0,
        "cash_sales": 0,
        "card_sales": 0,
    }
    base.update(kw)
    return base


def test_overlapping_duplicate_keeps_smaller():
    """ورديتان متداخلتان زمنياً لنفس الكاشير/اليوم → تبقى الأصغر (غير المضخّمة) وتُستبعد الأكبر."""
    correct = _rec(id="ok", shift_start="2026-07-02T09:00:00+00:00", shift_end="2026-07-02T23:00:00+00:00",
                   total_sales=2266500, orders_count=143, business_date="2026-07-02")
    inflated = _rec(id="dup", shift_start="2026-07-02T09:05:00+00:00", shift_end="2026-07-02T23:00:00+00:00",
                    total_sales=2286500, orders_count=145, business_date="2026-07-02")
    kept, removed = dedupe_shift_closings([inflated, correct])
    assert len(kept) == 1
    assert kept[0]["id"] == "ok"
    assert kept[0]["total_sales"] == 2266500
    assert len(removed) == 1 and removed[0]["id"] == "dup"


def test_non_overlapping_legit_shifts_preserved():
    """ورديتان متتابعتان (صباح/مساء) غير متداخلتين بقيم مختلفة → لا تُدمجان (لا يُفقد أي مبلغ)."""
    morning = _rec(id="am", shift_start="2026-07-02T08:00:00+00:00", shift_end="2026-07-02T14:00:00+00:00",
                   total_sales=500000, orders_count=30, business_date="2026-07-02")
    evening = _rec(id="pm", shift_start="2026-07-02T15:00:00+00:00", shift_end="2026-07-02T23:00:00+00:00",
                   total_sales=600000, orders_count=40, business_date="2026-07-02")
    kept, removed = dedupe_shift_closings([evening, morning])
    assert len(kept) == 2
    assert len(removed) == 0
    assert sum(k["total_sales"] for k in kept) == 1100000


def test_identical_signature_duplicate_collapsed():
    """سجلّان ببصمة متطابقة (نفس المبيعات/الطلبات) حتى بلا تداخل زمني → يُبقى واحد فقط."""
    a = _rec(id="a", shift_start="2026-07-02T09:00:00+00:00", shift_end="2026-07-02T09:00:01+00:00",
             total_sales=449.75, orders_count=3, business_date="2026-07-02")
    b = _rec(id="b", shift_start="2026-07-02T09:05:00+00:00", shift_end="2026-07-02T09:05:01+00:00",
             total_sales=449.75, orders_count=3, business_date="2026-07-02")
    kept, removed = dedupe_shift_closings([a, b])
    assert len(kept) == 1
    assert len(removed) == 1


def test_different_cashiers_not_merged():
    """كاشيران مختلفان بنفس اليوم → لا يُدمجان."""
    c1 = _rec(id="c1", cashier_name="كاشير أ", shift_start="2026-07-02T09:00:00+00:00",
              shift_end="2026-07-02T23:00:00+00:00", total_sales=100000, orders_count=10, business_date="2026-07-02")
    c2 = _rec(id="c2", cashier_name="كاشير ب", shift_start="2026-07-02T09:00:00+00:00",
              shift_end="2026-07-02T23:00:00+00:00", total_sales=100000, orders_count=10, business_date="2026-07-02")
    kept, removed = dedupe_shift_closings([c1, c2])
    assert len(kept) == 2
    assert len(removed) == 0


def test_different_days_not_merged():
    """نفس الكاشير في يومين مختلفين → لا يُدمجان."""
    d1 = _rec(id="d1", shift_start="2026-07-01T09:00:00+00:00", shift_end="2026-07-01T23:00:00+00:00",
              total_sales=100000, orders_count=10, business_date="2026-07-01")
    d2 = _rec(id="d2", shift_start="2026-07-02T09:00:00+00:00", shift_end="2026-07-02T23:00:00+00:00",
              total_sales=100000, orders_count=10, business_date="2026-07-02")
    kept, removed = dedupe_shift_closings([d1, d2])
    assert len(kept) == 2
    assert len(removed) == 0


def test_single_and_empty():
    assert dedupe_shift_closings([]) == ([], [])
    one = [_rec(id="x", total_sales=1000)]
    kept, removed = dedupe_shift_closings(one)
    assert len(kept) == 1 and len(removed) == 0
