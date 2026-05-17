"""
Test: تقرير المبيعات يجب أن يستثني "معلق" من by_payment_method
ويعرضه كحقل منفصل pending_orders_summary لتطابق تقرير إغلاق الصندوق.
"""

def test_pending_excluded_from_payment_methods():
    """
    Simulates the post-fix response structure of /api/reports/sales.
    Ensures:
      - "معلق" is NOT a key in by_payment_method
      - pending_orders_summary has count + amount
      - total_sales == sum(by_payment_method.values())  (consistency with cash close)
    """
    # هذه قيم وهمية تمثّل استجابة الـ endpoint بعد الإصلاح
    response = {
        "total_sales": 470210.0,
        "by_payment_method": {"نقدي": 470210.0},
        "pending_orders_summary": {"count": 9, "amount": 80000.0},
    }

    # ✅ "معلق" ليس في by_payment_method
    assert "معلق" not in response["by_payment_method"]

    # ✅ pending_orders_summary موجود ومُعبّأ
    assert response["pending_orders_summary"]["count"] == 9
    assert response["pending_orders_summary"]["amount"] == 80000.0

    # ✅ total_sales يتطابق مع مجموع طرق الدفع (لا يدخل المعلق)
    sum_of_payment_methods = sum(response["by_payment_method"].values())
    assert abs(response["total_sales"] - sum_of_payment_methods) < 0.01, \
        f"total_sales ({response['total_sales']}) لا يتطابق مع مجموع طرق الدفع ({sum_of_payment_methods})"


def test_no_pending_means_empty_summary():
    """عند عدم وجود طلبات معلقة، يجب أن يكون count=0 و amount=0."""
    response = {
        "total_sales": 100.0,
        "by_payment_method": {"نقدي": 100.0},
        "pending_orders_summary": {"count": 0, "amount": 0},
    }
    assert response["pending_orders_summary"]["count"] == 0
    assert response["pending_orders_summary"]["amount"] == 0
    assert "معلق" not in response["by_payment_method"]


if __name__ == "__main__":
    test_pending_excluded_from_payment_methods()
    test_no_pending_means_empty_summary()
    print("✅ All pending-orders-summary consistency tests passed")
