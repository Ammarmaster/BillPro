import asyncio, json, os, sys
sys.path.insert(0, os.path.abspath('backend'))

from motor.motor_asyncio import AsyncIOMotorClient
import server

sample = json.dumps([
  {
    "category": "Starters & Appetizers",
    "items": [
      { "name": "Paneer Tikka Test", "price": 250, "is_veg": True },
      { "name": "Chicken 65 Test", "price": 280, "is_veg": False }
    ]
  }
])

async def run():
    client = AsyncIOMotorClient('mongodb+srv://ammar:ammar@cluster0.eluhuhq.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0')
    server.db = client['lumina_erp']
    tid = '46935bd0-aedf-400f-a726-c33c36df5983'
    try:
        res = await server._process_json_menu_import(tid, sample, replace_existing=False)
        print('SUCCESS:', res)
    except Exception as e:
        import traceback
        traceback.print_exc()

asyncio.run(run())
