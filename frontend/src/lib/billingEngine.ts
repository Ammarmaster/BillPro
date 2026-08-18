/**
 * Centralized, float-safe Billing Engine using integer calculations in paise (cents).
 * Avoids any rounding/floating-point issues in POS math.
 */

export interface BillingItem {
  price: number;
  quantity: number;
  name: string;
}

export interface BillingCalculationInput {
  items: BillingItem[];
  discount: number; // Flat discount in Rupees
  taxPercent: number; // e.g. 5.0 for 5% GST
  gstEnabled: boolean;
  serviceChargePercent?: number; // e.g. 2.0 for 2%
}

export interface BillingCalculationResult {
  subtotal: number;
  discount: number;
  taxableAmount: number;
  tax: number;
  cgst: number;
  sgst: number;
  serviceCharge: number;
  roundOff: number;
  total: number;
}

export const BillingEngine = {
  calculate(input: BillingCalculationInput): BillingCalculationResult {
    const { items, discount, taxPercent, gstEnabled, serviceChargePercent = 0 } = input;

    // Convert all inputs to integer paise
    let subtotalPaise = 0;
    for (const item of items) {
      const pricePaise = Math.round(item.price * 100);
      subtotalPaise += pricePaise * item.quantity;
    }

    const discountPaise = Math.round(discount * 100);
    const taxablePaise = Math.max(0, subtotalPaise - discountPaise);

    // Calculate tax/GST on taxable amount
    let taxPaise = 0;
    if (gstEnabled && taxPercent > 0) {
      taxPaise = Math.round(taxablePaise * (taxPercent / 100));
    }
    const cgstPaise = Math.round(taxPaise / 2);
    const sgstPaise = taxPaise - cgstPaise;

    // Service Charge
    let serviceChargePaise = 0;
    if (serviceChargePercent > 0) {
      serviceChargePaise = Math.round(subtotalPaise * (serviceChargePercent / 100));
    }

    // Grand total before rounding
    const grandTotalPaise = taxablePaise + taxPaise + serviceChargePaise;

    // Round to nearest Rupee (100 paise)
    const roundedGrandTotalPaise = Math.round(grandTotalPaise / 100) * 100;
    const roundOffPaise = roundedGrandTotalPaise - grandTotalPaise;

    return {
      subtotal: subtotalPaise / 100,
      discount: discountPaise / 100,
      taxableAmount: taxablePaise / 100,
      tax: taxPaise / 100,
      cgst: cgstPaise / 100,
      sgst: sgstPaise / 100,
      serviceCharge: serviceChargePaise / 100,
      roundOff: roundOffPaise / 100,
      total: roundedGrandTotalPaise / 100,
    };
  },

  calculateChange(grandTotal: number, cashPaid: number): { change: number; balance: number } {
    const totalPaise = Math.round(grandTotal * 100);
    const paidPaise = Math.round(cashPaid * 100);
    
    if (paidPaise >= totalPaise) {
      return {
        change: (paidPaise - totalPaise) / 100,
        balance: 0,
      };
    } else {
      return {
        change: 0,
        balance: (totalPaise - paidPaise) / 100,
      };
    }
  }
};
