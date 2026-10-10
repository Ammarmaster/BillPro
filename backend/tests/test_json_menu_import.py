import json
import asyncio
from server import _process_json_menu_import, db

async def run_tests():
    tid = "test_tenant_json_menu_99"
    print("--- Starting JSON Menu Import Tests ---")
    
    # Clean up
    await db.categories.delete_many({"tenant_id": tid})
    await db.menu_items.delete_many({"tenant_id": tid})

    # Test 1: Nested Category Import
    print("\n[1] Testing Nested Category Import...")
    sample = [
        {
            "category": "Starters & Appetizers",
            "items": [
                {
                    "name": "Paneer Tikka",
                    "price": 260,
                    "description": "Grilled cottage cheese cubes",
                    "is_veg": True
                },
                {
                    "name": "Chicken Tikka",
                    "price": 320,
                    "description": "Spicy roasted chicken skewers",
                    "is_veg": False
                }
            ]
        },
        {
            "category": "Beverages",
            "items": [
                {
                    "name": "Cold Coffee",
                    "price": 120,
                    "is_veg": True
                }
            ]
        }
    ]

    res1 = await _process_json_menu_import(tid, sample, replace_existing=False)
    assert res1["categories_created"] == 2, f"Expected 2 categories, got {res1['categories_created']}"
    assert res1["items_created"] == 3, f"Expected 3 items, got {res1['items_created']}"

    cats = await db.categories.find({"tenant_id": tid}, {"_id": 0}).to_list(100)
    assert len(cats) == 2, f"Expected 2 categories in DB, got {len(cats)}"
    items = await db.menu_items.find({"tenant_id": tid}, {"_id": 0}).to_list(100)
    assert len(items) == 3, f"Expected 3 items in DB, got {len(items)}"

    paneer = next(it for it in items if it["name"] == "Paneer Tikka")
    assert paneer["price"] == 260.0
    assert paneer["is_veg"] is True
    print("[PASS] Nested Category Import passed!")

    # Test 2: Flat Dish List Import (Append Mode)
    print("\n[2] Testing Flat Dish List Import (Append)...")
    flat_sample = [
        {"name": "Masala Dosa", "price": "140", "category": "South Indian", "veg": True},
        {"name": "Idli Sambar", "price": 90, "category": "South Indian", "veg": True},
        {"name": "Mutton Biryani", "price": 450, "category": "Biryani Special", "type": "non-veg"},
    ]

    res2 = await _process_json_menu_import(tid, flat_sample, replace_existing=False)
    assert res2["categories_created"] == 2, f"Expected 2 new categories, got {res2['categories_created']}"
    assert res2["items_created"] == 3, f"Expected 3 items, got {res2['items_created']}"

    all_items = await db.menu_items.find({"tenant_id": tid}, {"_id": 0}).to_list(100)
    assert len(all_items) == 6, f"Expected total 6 items (3 existing + 3 appended), got {len(all_items)}"
    print("[PASS] Flat Dish List Import (Append) passed!")

    # Test 3: Replace Mode
    print("\n[3] Testing Replace Mode...")
    replace_sample = [
        {
            "category": "Exclusive Menu",
            "items": [
                {"name": "Chef Special Platter", "price": 850, "description": "Gourmet assorted delicacies", "is_veg": True}
            ]
        }
    ]

    res3 = await _process_json_menu_import(tid, replace_sample, replace_existing=True)
    assert res3["items_created"] == 1
    assert res3["categories_created"] == 1

    final_cats = await db.categories.find({"tenant_id": tid}, {"_id": 0}).to_list(100)
    assert len(final_cats) == 1
    assert final_cats[0]["name"] == "Exclusive Menu"

    final_items = await db.menu_items.find({"tenant_id": tid}, {"_id": 0}).to_list(100)
    assert len(final_items) == 1
    assert final_items[0]["name"] == "Chef Special Platter"
    assert final_items[0]["price"] == 850.0
    print("[PASS] Replace Mode passed!")

    # Clean up
    await db.categories.delete_many({"tenant_id": tid})
    await db.menu_items.delete_many({"tenant_id": tid})
    print("\n[SUCCESS] ALL JSON MENU IMPORT TESTS PASSED!")

if __name__ == "__main__":
    asyncio.run(run_tests())
