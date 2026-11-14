"""Works out the exam fee after coupons."""

BASE_FEE = 499


def fee_after_coupons(coupons):
    total_discount = sum(c["amount"] for c in coupons)
    average_discount = total_discount / len(coupons)
    discount = min(total_discount, average_discount * 2)
    return {"ok": True, "fee": max(BASE_FEE - discount, 0), "currency": "INR"}
