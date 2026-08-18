import math
from typing import List, Dict, Any, Optional

def calculate_bill(
    items: List[Dict[str, Any]], 
    discount: float, 
    tax_percent: float, 
    gst_enabled: bool,
    service_charge_percent: float = 0.0
) -> Dict[str, Any]:
    """
    Centralized, float-safe billing calculation in integer paise to avoid POS rounding bugs.
    Ensures cgst + sgst splits sum exactly to the rounded total tax.
    """
    # Convert subtotal inputs to integer paise
    subtotal_paise = 0
    for item in items:
      price_paise = int(round(float(item.get("price", 0.0)) * 100))
      qty = int(item.get("quantity", 1))
      subtotal_paise += price_paise * qty

    discount_paise = int(round(discount * 100))
    taxable_paise = max(0, subtotal_paise - discount_paise)

    # Tax / GST split
    tax_paise = 0
    if gst_enabled and tax_percent > 0:
      tax_paise = int(round(taxable_paise * (tax_percent / 100.0)))
    
    cgst_paise = int(round(tax_paise / 2.0))
    sgst_paise = tax_paise - cgst_paise

    # Service charge
    service_charge_paise = 0
    if service_charge_percent > 0:
      service_charge_paise = int(round(subtotal_paise * (service_charge_percent / 100.0)))

    # Grand total before rounding
    grand_total_paise = taxable_paise + tax_paise + service_charge_paise

    # Round to nearest Rupee (100 paise)
    rounded_grand_total_paise = int(round(grand_total_paise / 100.0)) * 100
    round_off_paise = rounded_grand_total_paise - grand_total_paise

    return {
        "subtotal": subtotal_paise / 100.0,
        "discount": discount_paise / 100.0,
        "taxable_amount": taxable_paise / 100.0,
        "tax": tax_paise / 100.0,
        "cgst": cgst_paise / 100.0,
        "sgst": sgst_paise / 100.0,
        "service_charge": service_charge_paise / 100.0,
        "round_off": round_off_paise / 100.0,
        "total": rounded_grand_total_paise / 100.0
    }
