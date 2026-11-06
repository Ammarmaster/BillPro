"""Backup server list saved by the super admin. The database is an in-memory fake (no real data touched)."""
import asyncio
import inspect
import os

import pytest

# Set before importing the server: load_dotenv keeps existing values, so the real .env is never used here
os.environ["MONGO_URL"] = "mongodb://localhost:1/backend-servers-tests"
os.environ["DB_NAME"] = "backend_servers_tests"
os.environ["JWT_SECRET"] = "test-secret"

from fastapi import HTTPException

import server

SUPER_ADMIN = {"id": "u1", "role": "super_admin", "tenant_id": None}


class FakeSettings:
    def __init__(self):
        self.docs = {}

    async def find_one(self, query, _projection=None):
        doc = self.docs.get(query["id"])
        return dict(doc) if doc else None

    async def update_one(self, query, update, upsert=False):
        assert upsert
        self.docs.setdefault(query["id"], {"id": query["id"]}).update(update["$set"])


class FakeDb:
    def __init__(self):
        self.system_settings = FakeSettings()


def save(servers, user=SUPER_ADMIN):
    payload = server.BackupServerListIn(servers=servers)
    return asyncio.run(server.save_backend_servers(payload, user))


def read():
    return asyncio.run(server.get_backend_servers())


def test_super_admin_saves_list_and_every_app_can_read_it(monkeypatch):
    monkeypatch.setattr(server, "db", FakeDb())
    assert read() == {"servers": []}

    result = save([
        {"name": "  Railway backup ", "url": " https://backup.example.com/ "},
        {"name": "Same again", "url": "https://BACKUP.example.com"},
        {"name": "Fly", "url": "https://fly.example.com"},
    ])

    saved = [{"name": "Railway backup", "url": "https://backup.example.com"},
             {"name": "Fly", "url": "https://fly.example.com"}]
    assert result == {"servers": saved}
    assert read() == {"servers": saved}
    # Saving an empty list removes every backup
    assert save([]) == {"servers": []}
    assert read() == {"servers": []}


def test_only_super_admin_can_change_the_list():
    # The route's login check is the one FastAPI runs before the function
    check = inspect.signature(server.save_backend_servers).parameters["user"].default.dependency
    for role in ("owner", "admin_employee", "manager", "waiter"):
        with pytest.raises(HTTPException) as err:
            asyncio.run(check(user={"id": "u2", "role": role}))
        assert err.value.status_code == 403
    assert asyncio.run(check(user=SUPER_ADMIN)) == SUPER_ADMIN
    # Reading the list needs no login, so apps can fetch it before anyone signs in
    assert not inspect.signature(server.get_backend_servers).parameters


def test_unsafe_or_unnamed_servers_are_refused(monkeypatch):
    monkeypatch.setattr(server, "db", FakeDb())
    bad = [
        {"name": "Plain http", "url": "http://backup.example.com"},
        {"name": "No address", "url": "https://"},
        {"name": "Not a link", "url": "backup.example.com"},
        {"name": "With query", "url": "https://backup.example.com?x=1"},
        {"name": "With space", "url": "https://backup example.com"},
        {"name": "   ", "url": "https://backup.example.com"},
    ]
    for entry in bad:
        with pytest.raises(HTTPException) as err:
            save([entry])
        assert err.value.status_code == 400, entry
    with pytest.raises(HTTPException) as err:
        save([{"name": f"S{i}", "url": f"https://s{i}.example.com"} for i in range(11)])
    assert err.value.status_code == 400
    assert read() == {"servers": []}
