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
    r = client.post("/me/password", json={"current_password": body["password"], "new_password": "newpassword1"},
                    headers=h)
    assert r.status_code == 200 and r.json()["token"]   # fresh token for this session
    assert client.post("/auth/login", json={"email": body["email"], "password": "newpassword1"}).status_code == 200


# ---------- admin ----------

def _admin(client):
    r = client.post("/auth/login", json={"email": "owl.admin@kennesaw.edu", "password": "hootyhack-admin"})
    assert r.status_code == 200, r.text
    assert r.json()["user"]["role"] == "admin"
    return {"Authorization": f"Bearer {r.json()['token']}"}


def test_admin_routes_forbidden_for_students(client):
    _, h = _register(client)
    assert client.get("/admin/events", headers=h).status_code == 403
    assert client.post("/admin/events", json={}, headers=h).status_code == 403
    assert client.get("/admin/events").status_code == 401


def test_admin_create_edit_delete_event(client):
    h = _admin(client)
    body = {"name": "Owl Hack Night", "host_organization": "ACM at KSU",
            "description": "Late night coding with pizza and mentors.",
            "starts_at": "2030-03-01T18:00:00-05:00", "ends_at": "2030-03-01T22:00:00-05:00",
            "location": "Atrium J-101", "campus": "Marietta", "categories": ["tech"]}
    r = client.post("/admin/events", json=body, headers=h)
    assert r.status_code == 201, r.text
    ev = r.json()
    assert ev["owl_life_id"].startswith("admin-")
    assert ev["categories"][0] == {"key": "tech", "label": "Tech & Making", "confidence": 1.0, "source": "admin"}
    assert ev["flyer_url"] is None

    # Edit: partial update, bad time order rejected, categories replaced.
    r = client.patch(f"/admin/events/{ev['id']}", json={"ends_at": "2030-03-01T17:00:00-05:00"}, headers=h)
    assert r.status_code == 422
    r = client.patch(f"/admin/events/{ev['id']}",
                     json={"name": "Owl Hack Night II", "categories": ["social", "tech"], "rsvp_url": "ftp://x"},
                     headers=h)
    assert r.status_code == 422
    r = client.patch(f"/admin/events/{ev['id']}", json={"name": "Owl Hack Night II", "categories": ["social"],
                                                       "flyer_url": "https://example.com/f.pdf"}, headers=h)
    assert r.status_code == 422  # pdf flyer without preview
    r = client.patch(f"/admin/events/{ev['id']}", json={"name": "Owl Hack Night II", "categories": ["social"]},
                     headers=h)
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["name"] == "Owl Hack Night II" and out["location"] == "Atrium J-101"
    assert [c["key"] for c in out["categories"] if c["source"] == "admin"] == ["social"]

    # Students see the edited event.
    _, sh = _register(client)
    assert client.get(f"/events/{ev['id']}", headers=sh).json()["name"] == "Owl Hack Night II"
    assert any(e["id"] == ev["id"] for e in client.get("/admin/events?q=hack night", headers=h).json())

    assert client.delete(f"/admin/events/{ev['id']}", headers=h).status_code == 204
    assert client.get(f"/events/{ev['id']}", headers=sh).status_code == 404


def _flyer_png(lines):
    import io
    from PIL import Image, ImageDraw
    from app.flyers import _font
    img = Image.new("RGB", (900, 1200), "white")
    d = ImageDraw.Draw(img)
    for i, line in enumerate(lines):
        d.text((60, 120 + i * 140), line, font=_font(90), fill="black")
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return img, buf.getvalue()


def test_admin_flyer_upload_is_read_by_categorizer(client):
    from app.config import FLYER_DIR
    h = _admin(client)
    # A vague title: the category has to come from what the flyer says.
    body = {"name": "Thursday Meetup", "host_organization": "Owl Club",
            "starts_at": "2030-04-01T18:00:00-04:00", "ends_at": "2030-04-01T20:00:00-04:00"}
    ev = client.post("/admin/events", json=body, headers=h).json()

    img, png = _flyer_png(["HACKATHON", "CODING", "PROGRAMMING", "ROBOTS"])
    r = client.put(f"/admin/events/{ev['id']}/flyer", files={"file": ("f.png", png, "image/png")}, headers=h)
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["flyer_type"] == "png"
    assert client.get(out["flyer_url"].replace("http://testserver", "")).status_code == 200
    assert "tech" in [c["key"] for c in out["categories"]]

    # PDF: stored with a PNG preview for cards.
    import io
    buf = io.BytesIO(); img.save(buf, "PDF")
    r = client.put(f"/admin/events/{ev['id']}/flyer", files={"file": ("f.pdf", buf.getvalue(), "application/pdf")},
                   headers=h)
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["flyer_type"] == "pdf" and out["flyer_preview_url"].endswith("-preview.png")

    bad = client.put(f"/admin/events/{ev['id']}/flyer", files={"file": ("x.gif", b"GIF89a....", "image/gif")},
                     headers=h)
    assert bad.status_code == 422
    out = client.delete(f"/admin/events/{ev['id']}/flyer", headers=h).json()
    assert out["flyer_url"] is None
    client.delete(f"/admin/events/{ev['id']}", headers=h)
    for f in FLYER_DIR.glob(f"event-{ev['id']}-*"):
        f.unlink()


# ---------- club accounts ----------

def _login(client, email, password):
    r = client.post("/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return r.json(), {"Authorization": f"Bearer {r.json()['token']}"}


def _club_account(client, admin_h, club="Cybersecurity Club", **kw):
    body = {"club_name": club, "full_name": "Club Officer", "email": f"c{uuid.uuid4().hex[:8]}@gmail.com",
            "password": "clubpass123", **kw}
    r = client.post("/admin/club-accounts", json=body, headers=admin_h)
    assert r.status_code == 201, r.text
    return body, r.json()


def test_init_db_is_idempotent(client):
    from app.db import init_db
    init_db(); init_db()


def test_club_account_management_is_admin_only(client):
    admin = _admin(client)
    _, student = _register(client)
    body, acct = _club_account(client, admin)
    _, club = _login(client, body["email"], body["password"])
    for h in (student, club):
        assert client.get("/admin/club-accounts", headers=h).status_code == 403
        assert client.get("/admin/clubs", headers=h).status_code == 403
        assert client.post("/admin/club-accounts", json=body, headers=h).status_code == 403
        assert client.patch(f"/admin/club-accounts/{acct['id']}", json={"password": "x" * 9}, headers=h).status_code == 403
        assert client.delete(f"/admin/club-accounts/{acct['id']}", headers=h).status_code == 403
    assert client.get("/admin/club-accounts").status_code == 401
    # Students can't use event management either.
    assert client.get("/admin/events", headers=student).status_code == 403


def test_admin_creates_edits_and_deletes_club_account(client):
    admin = _admin(client)
    # Existing seeded events hosted by the club are counted (case/space-insensitive name match).
    body, acct = _club_account(client, admin, club="  cybersecurity   CLUB ")
    assert acct["club_name"] == "cybersecurity CLUB" and acct["event_count"] >= 1
    assert any(a["id"] == acct["id"] for a in client.get("/admin/club-accounts", headers=admin).json())
    clubs = {c["name"]: c for c in client.get("/admin/clubs", headers=admin).json()}
    assert clubs["Cybersecurity Club"]["account_count"] >= 1 and clubs["Cybersecurity Club"]["event_count"] >= 1

    # Validation and duplicates.
    assert client.post("/admin/club-accounts", json={**body, "email": "not-an-email"}, headers=admin).status_code == 422
    assert client.post("/admin/club-accounts", json={**body, "password": "short"}, headers=admin).status_code == 422
    assert client.post("/admin/club-accounts", json={**body, "club_name": " "}, headers=admin).status_code == 422
    assert client.post("/admin/club-accounts", json=body, headers=admin).status_code == 409

    me, h = _login(client, body["email"].upper(), body["password"])
    assert me["user"]["role"] == "club" and me["user"]["club_name"] == "cybersecurity CLUB"

    # Password reset by admin; old password stops working.
    r = client.patch(f"/admin/club-accounts/{acct['id']}", json={"password": "newclubpass1", "full_name": "New Officer"},
                     headers=admin)
    assert r.status_code == 200 and r.json()["full_name"] == "New Officer"
    assert client.post("/auth/login", json={"email": body["email"], "password": body["password"]}).status_code == 401
    _login(client, body["email"], "newclubpass1")

    # Admin endpoints only touch club accounts, never students/admins.
    student_body, _ = _register(client)
    student_id = client.post("/auth/login", json={"email": student_body["email"],
                                                  "password": student_body["password"]}).json()["user"]["id"]
    assert client.patch(f"/admin/club-accounts/{student_id}", json={"full_name": "Hacked"}, headers=admin).status_code == 404
    assert client.delete(f"/admin/club-accounts/{student_id}", headers=admin).status_code == 404

    assert client.delete(f"/admin/club-accounts/{acct['id']}", headers=admin).status_code == 204
    assert client.post("/auth/login", json={"email": body["email"], "password": "newclubpass1"}).status_code == 401
    # Deleting the account keeps the club's events.
    assert any(e["host_organization"] == "Cybersecurity Club"
               for e in client.get("/admin/events?when=all&q=cyber", headers=admin).json())


def test_club_manages_only_its_own_events(client):
    admin = _admin(client)
    body, _ = _club_account(client, admin, club="Hillel at KSU")
    _, club = _login(client, body["email"], body["password"])

    mine = client.get("/admin/events?when=all", headers=club).json()
    assert mine and all(e["host_organization"] == "Hillel at KSU" for e in mine)
    others = [e for e in client.get("/admin/events?when=all", headers=admin).json()
              if e["host_organization"] != "Hillel at KSU"]
    other = others[0]

    # Create: host is forced to the club, whatever the body says; no host needed.
    new = {"name": "Latke Night", "host_organization": "Some Other Club",
           "starts_at": "2030-12-10T18:00:00-05:00", "ends_at": "2030-12-10T20:00:00-05:00"}
    r = client.post("/admin/events", json=new, headers=club)
    assert r.status_code == 201, r.text
    ev = r.json()
    assert ev["host_organization"] == "Hillel at KSU" and ev["owl_life_id"].startswith("club-")
    del new["host_organization"]
    assert client.post("/admin/events", json=new, headers=club).status_code == 201
    assert client.post("/admin/events", json=new, headers=admin).status_code == 422  # admins must name a host

    # Edit own event; host can't be moved away.
    r = client.patch(f"/admin/events/{ev['id']}", json={"name": "Latke Night!", "host_organization": "Elsewhere"},
                     headers=club)
    assert r.status_code == 200 and r.json()["name"] == "Latke Night!" and r.json()["host_organization"] == "Hillel at KSU"

    # Other clubs' events are off limits for every operation.
    assert client.get(f"/admin/events/{other['id']}", headers=club).status_code == 403
    assert client.patch(f"/admin/events/{other['id']}", json={"name": "Mine now"}, headers=club).status_code == 403
    _, png = _flyer_png(["SHABBAT"])
    assert client.put(f"/admin/events/{other['id']}/flyer", files={"file": ("f.png", png, "image/png")},
                      headers=club).status_code == 403
    assert client.delete(f"/admin/events/{other['id']}/flyer", headers=club).status_code == 403
    assert client.delete(f"/admin/events/{other['id']}", headers=club).status_code == 403
    assert client.get(f"/admin/events/{other['id']}", headers=admin).json()["name"] == other["name"]

    # Own flyer upload works; then clean up.
    r = client.put(f"/admin/events/{ev['id']}/flyer", files={"file": ("f.png", png, "image/png")}, headers=club)
    assert r.status_code == 200, r.text
    from app.config import FLYER_DIR
    assert client.delete(f"/admin/events/{ev['id']}", headers=club).status_code == 204
    for f in FLYER_DIR.glob(f"event-{ev['id']}-*"):
        f.unlink()


def test_server_errors_are_json_with_cors(client, monkeypatch):
    import app.main as main
    _, h = _register(client)

    def boom(*a, **kw):
        raise RuntimeError("boom")

    monkeypatch.setattr(main, "rank_events", boom)
    r = client.get("/events/feed", headers={**h, "Origin": "http://localhost:8081"})
    assert r.status_code == 500
    assert r.json()["detail"].startswith("Something went wrong")
    assert r.headers.get("access-control-allow-origin") == "*"


# ---------- review regressions ----------

def test_unicode_club_names_match_in_list_and_detail(client):
    admin = _admin(client)
    body, _ = _club_account(client, admin, club="ΦΒΣ Fraternity")   # Postgres lower() and Python lower() differ on Σ
    _, club = _login(client, body["email"], body["password"])
    new = {"name": "Rush Week", "starts_at": "2030-09-01T18:00:00-04:00", "ends_at": "2030-09-01T20:00:00-04:00"}
    ev = client.post("/admin/events", json=new, headers=club).json()
    listed = [e["id"] for e in client.get("/admin/events?when=all", headers=club).json()]
    assert ev["id"] in listed
    assert client.get(f"/admin/events/{ev['id']}", headers=club).status_code == 200
    client.delete(f"/admin/events/{ev['id']}", headers=club)


def test_password_change_signs_out_old_sessions(client):
    admin = _admin(client)
    body, acct = _club_account(client, admin)
    _, old = _login(client, body["email"], body["password"])
    assert client.get("/me", headers=old).status_code == 200
    client.patch(f"/admin/club-accounts/{acct['id']}", json={"password": "resetpass99"}, headers=admin)
    assert client.get("/me", headers=old).status_code == 401          # admin reset revokes the old holder
    assert client.get("/admin/events", headers=old).status_code == 401

    # A user changing their own password keeps this session via the returned token; others die.
    student_body, s_old = _register(client)
    r = client.post("/me/password", json={"current_password": student_body["password"], "new_password": "brandnew123"},
                    headers=s_old)
    assert r.status_code == 200, r.text
    fresh = {"Authorization": f"Bearer {r.json()['token']}"}
    assert client.get("/me", headers=fresh).status_code == 200
    assert client.get("/me", headers=s_old).status_code == 401


def test_oversized_flyer_rejected_before_parsing(client):
    h = _admin(client)
    ev = client.get("/admin/events", headers=h).json()[0]
    big = b"\x89PNG\r\n\x1a\n" + b"0" * (17 * 1024 * 1024)
    r = client.put(f"/admin/events/{ev['id']}/flyer", files={"file": ("big.png", big, "image/png")},
                   headers={**h, "Origin": "http://localhost:8081"})
    assert r.status_code == 413 and "15 MB" in r.json()["detail"]
    assert r.headers.get("access-control-allow-origin") == "*"
    # Anonymous oversized uploads are refused too (before auth would even run).
    assert client.put(f"/admin/events/{ev['id']}/flyer", files={"file": ("big.png", big, "image/png")}).status_code == 413


def test_ocr_reads_rotated_phone_photos(tmp_path):
    from PIL import Image
    from app.ml.categorizer import extract_flyer_text
    upright, _ = _flyer_png(["HACKATHON", "CODING"])
    raw = upright.rotate(90, expand=True)            # how a phone stores a portrait shot...
    exif = Image.Exif(); exif[0x0112] = 6             # ...plus "rotate 90° clockwise to display"
    path = tmp_path / "phone.jpg"
    raw.save(path, "JPEG", exif=exif.tobytes())
    assert "HACKATHON" in extract_flyer_text(path).upper()


def test_huge_pdf_page_preview_is_capped():
    import io
    from PIL import Image
    from app.config import FLYER_DIR
    from app.flyers import save_uploaded_flyer
    img, _ = _flyer_png(["BIG PAGE"])
    buf = io.BytesIO()
    img.save(buf, "PDF", resolution=6)                # 900x1200 px at 6 dpi = 150 x 200 inch page
    _, kind, preview, _ = save_uploaded_flyer(987654, buf.getvalue())
    try:
        assert kind == "pdf"
        with Image.open(FLYER_DIR / preview.rsplit("/", 1)[-1]) as p:
            assert max(p.size) <= 2400
    finally:
        for f in FLYER_DIR.glob("event-987654-*"):
            f.unlink()
