"""End-to-end API tests against a throwaway PostgreSQL database (hooty_hack_test)."""
import os
import uuid

os.environ["DATABASE_URL"] = os.getenv("TEST_DATABASE_URL", "postgresql+psycopg2://localhost:5432/hooty_hack_test")

import pytest
from fastapi.testclient import TestClient

from app import seed
from app.db import Base, engine
from app.main import app


@pytest.fixture(scope="module")
def client():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    seed.main(reset=True)
    with TestClient(app) as c:
        yield c


def _register(client, **kw):
    body = {"full_name": "Test Owl", "email": f"t{uuid.uuid4().hex[:8]}@students.kennesaw.edu",
            "password": "password123", "agreed_to_terms": True, **kw}
    r = client.post("/auth/register", json=body)
    assert r.status_code == 201, r.text
    return body, {"Authorization": f"Bearer {r.json()['token']}"}


def test_register_rules(client):
    bad = {"full_name": "X Y", "email": "a@gmail.com", "password": "password123", "agreed_to_terms": True}
    assert client.post("/auth/register", json=bad).status_code == 422
    bad["email"] = "a@students.kennesaw.edu"; bad["agreed_to_terms"] = False
    assert client.post("/auth/register", json=bad).status_code == 422
    body, _ = _register(client)
    assert client.post("/auth/register", json=body).status_code == 409


def test_login_and_auth_required(client):
    body, _ = _register(client)
    assert client.post("/auth/login", json={"email": body["email"], "password": "nope12345"}).status_code == 401
    assert client.post("/auth/login", json={"email": body["email"].upper(), "password": body["password"]}).status_code == 200
    assert client.get("/events/feed").status_code == 401


def test_swipe_flow_and_persistence(client):
    body, h = _register(client)
    feed = client.get("/events/feed?campus=Both", headers=h).json()
    assert feed["strategy"] == "fallback" and feed["events"]
    assert all(not e["is_past"] for e in feed["events"])                 # FR-13
    first, second = feed["events"][0], feed["events"][1]
    assert client.post(f"/events/{first['id']}/swipe", json={"direction": "right"}, headers=h).status_code == 204
    assert client.post(f"/events/{second['id']}/swipe", json={"direction": "left"}, headers=h).status_code == 204
    ids = [e["id"] for e in client.get("/events/feed?campus=Both", headers=h).json()["events"]]
    assert first["id"] not in ids and second["id"] not in ids          # no repeats
    # saved persists across a fresh login
    tok = client.post("/auth/login", json={"email": body["email"], "password": body["password"]}).json()["token"]
    h2 = {"Authorization": f"Bearer {tok}"}
    saved = client.get("/saved", headers=h2).json()
    assert [e["id"] for e in saved] == [first["id"]]
    assert client.delete(f"/saved/{first['id']}", headers=h2).status_code == 204
    assert client.get("/saved", headers=h2).json() == []


def test_users_only_see_their_own_saves(client):
    _, a = _register(client)
    _, b = _register(client)
    ev = client.get("/events/feed?campus=Both", headers=a).json()["events"][0]
    client.post(f"/events/{ev['id']}/swipe", json={"direction": "right"}, headers=a)
    assert client.get("/saved", headers=b).json() == []
    assert client.delete(f"/saved/{ev['id']}", headers=b).status_code == 404


def test_recommendations_follow_likes(client):
    _, h = _register(client)
    feed = client.get("/events/feed?campus=Both&limit=50", headers=h).json()["events"]
    tech = [e for e in feed if any(c["key"] == "tech" for c in e["categories"])]
    other = [e for e in feed if not any(c["key"] in ("tech", "academic", "gaming") for c in e["categories"])]
    for e in tech[:3]:
        client.post(f"/events/{e['id']}/swipe", json={"direction": "right"}, headers=h)
    for e in other[:3]:
        client.post(f"/events/{e['id']}/swipe", json={"direction": "left"}, headers=h)
    res = client.get("/events/feed?campus=Both&limit=50", headers=h).json()
    assert res["strategy"] == "learned"
    top = res["events"][:3]
    assert any(c["key"] in ("tech", "academic", "gaming") for e in top for c in e["categories"]), top


def test_interest_preferences_change_strategy(client):
    _, h = _register(client)
    r = client.patch("/me", json={"interests": ["faith"], "campus": "Kennesaw"}, headers=h)
    assert r.status_code == 200 and r.json()["interests"] == ["faith"]
    res = client.get("/events/feed", headers=h).json()
    assert res["strategy"] == "similarity"
    assert all(e["campus"] == "Kennesaw" for e in res["events"])
    assert any(c["key"] == "faith" for c in res["events"][0]["categories"])
    assert client.patch("/me", json={"interests": ["nope"]}, headers=h).status_code == 422


def test_category_feedback_and_password(client):
    body, h = _register(client)
    ev = client.get("/events/feed?campus=Both", headers=h).json()["events"][0]
    assert client.post(f"/events/{ev['id']}/categories/feedback", json={"category": "service", "is_correct": True},
                       headers=h).status_code == 204
    assert client.post("/me/password", json={"current_password": "wrong", "new_password": "newpassword1"},
                       headers=h).status_code == 400
    assert client.post("/me/password", json={"current_password": body["password"], "new_password": "newpassword1"},
                       headers=h).status_code == 204
    assert client.post("/auth/login", json={"email": body["email"], "password": "newpassword1"}).status_code == 200
