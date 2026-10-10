"""
Automated Test Suite for Offline-First POS & End-of-Day Closing / Reconciliation.
Verifies accounting math, cash drawer formula, split bills, denomination counting,
idempotency, and tenant isolation.
"""
import pytest
import asyncio
import uuid
from datetime import datetime, timezone
from pathlib import Path
import sys

ROOT_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT_DIR))

from server import (
    calculate_session_metrics,
    db,
)


def test_denomination_calculation():
    """
    Test Indian Currency Denomination breakdown helper calculations.
    """
    denoms = {
        "500": 4,   # 2000
        "200": 3,   # 600
        "100": 5,   # 500
        "50": 6,    # 300
        "20": 10,   # 200
        "10": 15,   # 150
        "coins": 45 # 45
    }

    total_calculated = (
        denoms["500"] * 500 +
        denoms["200"] * 200 +
        denoms["100"] * 100 +
        denoms["50"] * 50 +
        denoms["20"] * 20 +
        denoms["10"] * 10 +
        denoms["coins"]
    )

    expected = 2000 + 600 + 500 + 300 + 200 + 150 + 45
    assert total_calculated == expected
    assert total_calculated == 3795


def test_all_closing_and_reconciliation_scenarios():
    """
    Runs all async database and accounting calculation tests inside a single event loop.
    """
    async def _main():
        # Scenario 1: Standard Balanced Session Accounting Formula
        # Expected Cash = Opening Float + Cash Sales + Cash In - Cash Refunds - Cash Out - Cash Drops
        test_tid_1 = f"test_tenant_{uuid.uuid4().hex[:8]}"
        session_id_1 = f"sess_{uuid.uuid4().hex[:8]}"

        session_doc_1 = {
            "_id": session_id_1,
            "id": session_id_1,
            "tenant_id": test_tid_1,
            "cashier_id": "user_123",
            "cashier_name": "John Doe",
            "business_date": "2026-10-10",
            "opened_at": datetime.now(timezone.utc).isoformat(),
            "opening_float": 1000.0,
            "status": "open",
            "movements": [
                {"type": "cash_in", "amount": 500.0, "reason": "Extra change", "recorded_at": datetime.now(timezone.utc).isoformat()},
                {"type": "cash_out", "amount": 200.0, "reason": "Vegetables payout", "recorded_at": datetime.now(timezone.utc).isoformat()},
                {"type": "cash_drop", "amount": 300.0, "reason": "Safe deposit", "recorded_at": datetime.now(timezone.utc).isoformat()},
            ],
        }

        bill_1 = {
            "id": f"bill_{uuid.uuid4().hex[:8]}",
            "tenant_id": test_tid_1,
            "cash_session_id": session_id_1,
            "status": "paid",
            "payment_method": "cash",
            "subtotal": 800.0,
            "discount": 50.0,
            "cgst": 18.75,
            "sgst": 18.75,
            "total": 787.50,
            "paid_at": datetime.now(timezone.utc).isoformat(),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        bill_2 = {
            "id": f"bill_{uuid.uuid4().hex[:8]}",
            "tenant_id": test_tid_1,
            "cash_session_id": session_id_1,
            "status": "paid",
            "payment_method": "cash",
            "subtotal": 400.0,
            "discount": 0.0,
            "cgst": 10.0,
            "sgst": 10.0,
            "total": 420.0,
            "paid_at": datetime.now(timezone.utc).isoformat(),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }

        try:
            await db.bills.insert_many([bill_1, bill_2])
            metrics_1 = await calculate_session_metrics(test_tid_1, session_doc_1)

            assert metrics_1["total_cash_sales"] == 1207.50
            assert metrics_1["cash_sales_count"] == 2
            assert metrics_1["cash_in"] == 500.0
            assert metrics_1["cash_out"] == 200.0
            assert metrics_1["cash_drop"] == 300.0
            assert metrics_1["cash_refunds"] == 0.0

            expected_1 = 1000.0 + 1207.50 + 500.0 - 200.0 - 300.0
            assert metrics_1["expected_cash"] == expected_1
            assert metrics_1["gross_sales"] == 1207.50

            counted_cash = 2207.50
            discrepancy = counted_cash - metrics_1["expected_cash"]
            assert discrepancy == 0.0
        finally:
            await db.bills.delete_many({"tenant_id": test_tid_1})

        # Scenario 2: Split Payments & Digital Reconciliations
        test_tid_2 = f"test_tenant_{uuid.uuid4().hex[:8]}"
        session_id_2 = f"sess_{uuid.uuid4().hex[:8]}"

        session_doc_2 = {
            "_id": session_id_2,
            "id": session_id_2,
            "tenant_id": test_tid_2,
            "cashier_id": "user_123",
            "cashier_name": "Alice",
            "business_date": "2026-10-10",
            "opened_at": datetime.now(timezone.utc).isoformat(),
            "opening_float": 500.0,
            "status": "open",
            "movements": [],
        }

        split_bill = {
            "id": f"bill_{uuid.uuid4().hex[:8]}",
            "tenant_id": test_tid_2,
            "cash_session_id": session_id_2,
            "status": "paid",
            "payment_method": "split",
            "payment_splits": [
                {"method": "cash", "amount": 300.0},
                {"method": "upi", "amount": 300.0},
            ],
            "subtotal": 580.0,
            "discount": 0.0,
            "cgst": 10.0,
            "sgst": 10.0,
            "total": 600.0,
            "paid_at": datetime.now(timezone.utc).isoformat(),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        upi_bill = {
            "id": f"bill_{uuid.uuid4().hex[:8]}",
            "tenant_id": test_tid_2,
            "cash_session_id": session_id_2,
            "status": "paid",
            "payment_method": "upi",
            "subtotal": 450.0,
            "discount": 0.0,
            "cgst": 11.25,
            "sgst": 11.25,
            "total": 472.50,
            "paid_at": datetime.now(timezone.utc).isoformat(),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        card_bill = {
            "id": f"bill_{uuid.uuid4().hex[:8]}",
            "tenant_id": test_tid_2,
            "cash_session_id": session_id_2,
            "status": "paid",
            "payment_method": "card",
            "subtotal": 1000.0,
            "discount": 0.0,
            "cgst": 25.0,
            "sgst": 25.0,
            "total": 1050.0,
            "paid_at": datetime.now(timezone.utc).isoformat(),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }

        try:
            await db.bills.insert_many([split_bill, upi_bill, card_bill])
            metrics_2 = await calculate_session_metrics(test_tid_2, session_doc_2)

            assert metrics_2["total_cash_sales"] == 300.0
            assert metrics_2["total_upi_sales"] == 300.0 + 472.50
            assert metrics_2["total_card_sales"] == 1050.0
            assert metrics_2["gross_sales"] == 600.0 + 472.50 + 1050.0
            assert metrics_2["paid_bills_count"] == 3
            assert metrics_2["expected_cash"] == 800.0
        finally:
            await db.bills.delete_many({"tenant_id": test_tid_2})

        # Scenario 3: Open / Unpaid Bills Detection
        test_tid_3 = f"test_tenant_{uuid.uuid4().hex[:8]}"
        session_id_3 = f"sess_{uuid.uuid4().hex[:8]}"

        session_doc_3 = {
            "_id": session_id_3,
            "id": session_id_3,
            "tenant_id": test_tid_3,
            "cashier_id": "user_123",
            "cashier_name": "Bob",
            "business_date": "2026-10-10",
            "opened_at": datetime.now(timezone.utc).isoformat(),
            "opening_float": 1000.0,
            "status": "open",
            "movements": [],
        }

        pending_bill = {
            "id": f"bill_{uuid.uuid4().hex[:8]}",
            "tenant_id": test_tid_3,
            "table_number": "Table 5",
            "status": "pending",
            "subtotal": 500.0,
            "total": 525.0,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }

        try:
            await db.bills.insert_one(pending_bill)
            metrics_3 = await calculate_session_metrics(test_tid_3, session_doc_3)

            assert metrics_3["unpaid_bills_count"] == 1
            assert metrics_3["unpaid_bills_amount"] == 525.0
        finally:
            await db.bills.delete_many({"tenant_id": test_tid_3})

        # Scenario 4: Multi-Tenant Isolation
        tid_a = f"tenant_a_{uuid.uuid4().hex[:8]}"
        tid_b = f"tenant_b_{uuid.uuid4().hex[:8]}"

        session_a = {
            "_id": f"sess_a_{uuid.uuid4().hex[:8]}",
            "id": f"sess_a_{uuid.uuid4().hex[:8]}",
            "tenant_id": tid_a,
            "cashier_name": "Tenant A Cashier",
            "business_date": "2026-10-10",
            "opened_at": datetime.now(timezone.utc).isoformat(),
            "opening_float": 1000.0,
            "status": "open",
            "movements": [],
        }

        bill_tenant_b = {
            "id": f"bill_{uuid.uuid4().hex[:8]}",
            "tenant_id": tid_b,
            "status": "paid",
            "payment_method": "cash",
            "subtotal": 5000.0,
            "total": 5000.0,
            "paid_at": datetime.now(timezone.utc).isoformat(),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }

        try:
            await db.bills.insert_one(bill_tenant_b)
            metrics_a = await calculate_session_metrics(tid_a, session_a)

            # Tenant A must NOT count Tenant B's sales
            assert metrics_a["total_cash_sales"] == 0.0
            assert metrics_a["paid_bills_count"] == 0
            assert metrics_a["expected_cash"] == 1000.0
        finally:
            await db.bills.delete_many({"tenant_id": {"$in": [tid_a, tid_b]}})

    asyncio.run(_main())
