"""Hooty Hack API (FastAPI + PostgreSQL + scikit-learn). Students discover events; admins manage them."""
import logging
import uuid
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta, timezone
from typing import Dict, List, Optional, Set
from zoneinfo import ZoneInfo

from fastapi import Depends, FastAPI, File, HTTPException, Query, Request, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload
from starlette.middleware.base import BaseHTTPMiddleware

from . import schemas
from .config import BASE_DIR, CAMPUS_TZ
from .db import get_db, init_db
from .ml.categories import CATEGORIES
from .ml.categorizer import categorize_events
from .ml.recommender import rank_events
from .flyers import MAX_FLYER_BYTES, FlyerError, save_uploaded_flyer
from .models import DEFAULT_SETTINGS, CategoryFeedback, Event, EventCategory, Interaction, SavedEvent, User
from .security import admin_user, create_token, current_user, event_manager, hash_password, verify_password

@asynccontextmanager
async def lifespan(_app):
    init_db()
    yield


log = logging.getLogger("hooty.api")

app = FastAPI(title="Hooty Hack API", version="1.0.0", lifespan=lifespan)


async def _json_server_errors(request: Request, call_next):
    """Turn unexpected crashes into a JSON 500.

    Registered before CORSMiddleware so it runs *inside* it: the 500 still gets CORS headers.
    Without this, a browser sees a crash as a CORS failure and the app reports a bogus
    "can't reach the server" error instead of a real one.
    """
    try:
        return await call_next(request)
    except Exception:
        log.exception("Unhandled error on %s %s", request.method, request.url.path)
        return JSONResponse({"detail": "Something went wrong on our end. Please try again."}, status_code=500)


async def _limit_flyer_uploads(request: Request, call_next):
    """Refuse oversized flyer uploads from the Content-Length header, before the body is parsed
    (form parsing happens before auth runs, so this also stops anonymous disk-filling)."""
    if request.method == "PUT" and request.url.path.endswith("/flyer"):
        try:
            size = int(request.headers.get("content-length", "0"))
        except ValueError:
            size = 0
        if size > MAX_FLYER_BYTES + 1024 * 1024:  # +1 MB for multipart overhead
            return JSONResponse({"detail": "Flyers must be 15 MB or smaller."}, status_code=413)
    return await call_next(request)


# Starlette runs the last-added middleware first, so CORS must be added after these.
app.add_middleware(BaseHTTPMiddleware, dispatch=_limit_flyer_uploads)
app.add_middleware(BaseHTTPMiddleware, dispatch=_json_server_errors)
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
)
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")


# ---------- helpers ----------

def _now() -> datetime:
    return datetime.now(timezone.utc)


def _abs(request: Request, url: Optional[str]) -> Optional[str]:
    """Flyers are stored as /static/... paths; make them absolute for the client."""
    if url and url.startswith("/"):
        return str(request.base_url).rstrip("/") + url
    return url


def _user_out(u: User) -> schemas.UserOut:
    return schemas.UserOut(
        id=u.id, email=u.email, full_name=u.full_name, role=u.role, club_name=u.club_name, campus=u.campus,
        interests=list(u.interests or []), settings={**DEFAULT_SETTINGS, **(u.settings or {})},
    )


def _event_out(request: Request, ev: Event, saved: Set[int], reason: Optional[str] = None) -> schemas.EventOut:
    now = _now()
    return schemas.EventOut(
        id=ev.id, owl_life_id=ev.owl_life_id, name=ev.name, host_organization=ev.host_organization,
        description=ev.description or "", starts_at=ev.starts_at, ends_at=ev.ends_at,
        location=ev.location, campus=ev.campus,
        flyer_url=_abs(request, ev.flyer_url), flyer_type=ev.flyer_type,
        flyer_preview_url=_abs(request, ev.flyer_preview_url),
        rsvp_url=ev.rsvp_url, owl_life_url=ev.owl_life_url, is_free=ev.is_free,
        categories=[schemas.CategoryOut(key=c.category, label=CATEGORIES.get(c.category, c.category),
                                        confidence=c.confidence, source=c.source) for c in ev.categories],
        is_saved=ev.id in saved, is_past=ev.ends_at < now, is_ongoing=ev.starts_at <= now <= ev.ends_at,
        reason=reason,
    )


def _saved_ids(db: Session, user: User) -> Set[int]:
    return {sid for (sid,) in db.query(SavedEvent.event_id).filter(SavedEvent.user_id == user.id)}


def _get_event(db: Session, event_id: int) -> Event:
    ev = db.get(Event, event_id)
    if not ev:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "We couldn't find that event. It may have been removed.")
    return ev


# ---------- auth (FR-01) ----------

@app.post("/auth/register", response_model=schemas.AuthOut, status_code=201)
def register(body: schemas.RegisterIn, db: Session = Depends(get_db)):
    user = User(email=body.email, full_name=body.full_name.strip(), password_hash=hash_password(body.password),
                role="student", campus="Kennesaw", interests=[], settings=dict(DEFAULT_SETTINGS))
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with that email already exists. Try signing in.")
    return schemas.AuthOut(token=create_token(user), user=_user_out(user))


@app.post("/auth/login", response_model=schemas.AuthOut)
def login(body: schemas.LoginIn, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "That email and password don't match.")
    return schemas.AuthOut(token=create_token(user), user=_user_out(user))


# ---------- profile & settings (FR-11) ----------

@app.get("/me", response_model=schemas.UserOut)
def me(user: User = Depends(current_user)):
    return _user_out(user)


@app.patch("/me", response_model=schemas.UserOut)
def update_me(body: schemas.UserPatch, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if body.full_name is not None:
        user.full_name = body.full_name.strip()
    if body.campus is not None:
        user.campus = body.campus
    if body.interests is not None:
        user.interests = body.interests
    if body.settings is not None:
        user.settings = {**DEFAULT_SETTINGS, **(user.settings or {}), **body.settings.model_dump(exclude_none=True)}
    db.commit()
    return _user_out(user)


@app.post("/me/password", response_model=schemas.AuthOut)
def change_password(body: schemas.PasswordChangeIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Changing the password signs out other sessions; this one gets a fresh token."""
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Your current password is incorrect.")
    user.password_hash = hash_password(body.new_password)
    db.commit()
    return schemas.AuthOut(token=create_token(user), user=_user_out(user))


@app.post("/me/swipes/reset", status_code=204)
def reset_skips(user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Bring skipped events back into the Discover queue."""
    db.query(Interaction).filter(Interaction.user_id == user.id, Interaction.action == "skip").delete()
    db.commit()


@app.get("/categories")
def categories():
    return [{"key": k, "label": v} for k, v in CATEGORIES.items()]


# ---------- discover feed (FR-02, FR-03, FR-12, FR-13, AI-04, AI-05) ----------

@app.get("/events/feed", response_model=schemas.FeedOut)
def feed(
    request: Request,
    filter: str = Query("for_you", pattern="^(for_you|today|this_week)$"),
    campus: Optional[str] = Query(None, pattern="^(Kennesaw|Marietta|Both)$"),
    limit: int = Query(20, ge=1, le=50),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    now = _now()
    settings = {**DEFAULT_SETTINGS, **(user.settings or {})}
    campus = campus or user.campus

    all_events = db.query(Event).options(selectinload(Event.categories)).all()
    interactions = db.query(Interaction).filter(Interaction.user_id == user.id).all()
    swiped = {i.event_id for i in interactions}
    saved = _saved_ids(db, user)
    liked = [i.event_id for i in interactions if i.action == "like"] + [s for s in saved if s not in swiped]
    skipped = [i.event_id for i in interactions if i.action == "skip"]

    tz = ZoneInfo(CAMPUS_TZ)
    local_today = now.astimezone(tz).date()
    day_end = datetime.combine(local_today + timedelta(days=1), datetime.min.time(), tz)
    week_end = datetime.combine(local_today + timedelta(days=7 - local_today.weekday()), datetime.min.time(), tz)

    def eligible(ev: Event) -> bool:
        if ev.ends_at <= now:                               # FR-13: never show ended events
            return False
        if settings["upcoming_only"] and ev.starts_at <= now:
            return False
        if ev.id in swiped or ev.id in saved:               # no repeats in the queue
            return False
        if campus != "Both" and ev.campus != campus:
            return False
        if filter == "today" and ev.starts_at >= day_end:
            return False
        if filter == "this_week" and ev.starts_at >= week_end:
            return False
        return True

    candidates = [e for e in all_events if eligible(e)]
    popularity: Dict[int, int] = dict(
        db.query(SavedEvent.event_id, func.count()).group_by(SavedEvent.event_id).all()
    )
    ranked, strategy = rank_events(
        candidates, all_events, liked, skipped, user.interests or [], campus, popularity,
        seed=user.id * 1000 + date.today().toordinal(), now=now,
    )
    if filter != "for_you" and strategy != "empty":
        ranked.sort(key=lambda r: r.event.starts_at)  # Today / This week read best in time order
    return schemas.FeedOut(
        strategy=strategy,
        events=[_event_out(request, r.event, saved, r.reason) for r in ranked[:limit]],
        remaining=len(ranked),
    )


@app.get("/events/{event_id}", response_model=schemas.EventOut)
def event_detail(event_id: int, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return _event_out(request, _get_event(db, event_id), _saved_ids(db, user))


@app.post("/events/{event_id}/swipe", status_code=204)
def swipe(event_id: int, body: schemas.SwipeIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Right = save (FR-04). Left = skip (FR-05). Saving never RSVPs."""
    _get_event(db, event_id)
    action = "like" if body.direction == "right" else "skip"
    existing = db.query(Interaction).filter_by(user_id=user.id, event_id=event_id).first()
    if existing:
        existing.action, existing.created_at = action, _now()
    else:
        db.add(Interaction(user_id=user.id, event_id=event_id, action=action))
    if action == "like" and not db.get(SavedEvent, (user.id, event_id)):
        db.add(SavedEvent(user_id=user.id, event_id=event_id))
    db.commit()


@app.post("/events/{event_id}/categories/feedback", status_code=204)
def category_feedback(event_id: int, body: schemas.CategoryFeedbackIn,
                      user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Student correction to an AI category; retrains the categorizer for this event."""
    ev = _get_event(db, event_id)
    db.add(CategoryFeedback(user_id=user.id, event_id=event_id, category=body.category, is_correct=body.is_correct))
    db.commit()
    categorize_events(db, [ev])


# ---------- saved events (FR-06, FR-07, FR-10) ----------

@app.get("/saved", response_model=List[schemas.EventOut])
def saved_events(request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = (db.query(SavedEvent).filter(SavedEvent.user_id == user.id)
            .options(selectinload(SavedEvent.event).selectinload(Event.categories)).all())
    ids = {r.event_id for r in rows}
    events = sorted((r.event for r in rows), key=lambda e: e.starts_at)
    return [_event_out(request, e, ids) for e in events]


@app.post("/saved/{event_id}", status_code=204)
def save_event(event_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    swipe(event_id, schemas.SwipeIn(direction="right"), user, db)


@app.delete("/saved/{event_id}", status_code=204)
def unsave_event(event_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    row = db.get(SavedEvent, (user.id, event_id))
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "That event isn't in your saved list.")
    db.delete(row)
    db.commit()


# ---------- admin: create & edit events ----------

REQUIRED_EVENT_FIELDS = ("name", "host_organization", "starts_at", "ends_at", "campus", "is_free")


def _admin_event_out(request: Request, ev: Event, saves: int = 0) -> schemas.AdminEventOut:
    base = _event_out(request, ev, set())
    return schemas.AdminEventOut(**base.model_dump(), saves=saves, created_at=ev.created_at)


def _save_counts(db: Session) -> Dict[int, int]:
    return dict(db.query(SavedEvent.event_id, func.count()).group_by(SavedEvent.event_id).all())


def _flyer_type_for(url: str) -> str:
    path = url.split("?")[0].lower()
    if path.endswith(".pdf"):
        return "pdf"
    if path.endswith((".jpg", ".jpeg")):
        return "jpeg"
    return "png"


def _apply_event_fields(db: Session, ev: Event, data: dict) -> None:
    for f in REQUIRED_EVENT_FIELDS:
        if f in data and data[f] is None:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"{f.replace('_', ' ').capitalize()} is required.")
    categories = data.pop("categories", None)
    data.pop("owl_life_id", None)

    if "flyer_url" in data:
        if data["flyer_url"] is None:
            data.update(flyer_type=None, flyer_preview_url=None)
        elif data.get("flyer_type") is None:
            data["flyer_type"] = _flyer_type_for(data["flyer_url"])
    for field, value in data.items():
        if field == "description":
            value = value or ""
        elif field == "host_organization":
            value = " ".join(value.split())
        elif isinstance(value, str):
            value = value.strip()
        setattr(ev, field, value)
    if ev.ends_at < ev.starts_at:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "The event can't end before it starts.")
    if ev.flyer_type == "pdf" and not ev.flyer_preview_url:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                            "PDF flyers need an image preview link so they can show on cards.")
    db.add(ev)
    db.flush()

    if categories is not None:
        # Admin picks replace earlier manual labels (admin or Owl Life). Student corrections stay.
        db.query(EventCategory).filter(EventCategory.event_id == ev.id,
                                       EventCategory.source.in_(["admin", "owl_life", "ai"])).delete(
            synchronize_session=False)
        kept = {c for (c,) in db.query(EventCategory.category).filter(EventCategory.event_id == ev.id)}
        for cat in categories:
            if cat in kept:
                continue
            db.add(EventCategory(event_id=ev.id, category=cat, confidence=1.0, source="admin"))
        db.flush()
        db.refresh(ev)

    db.commit()
    categorize_events(db, [ev])
    db.refresh(ev)


def _club_key(name: Optional[str]) -> str:
    """Club names match case-insensitively, ignoring extra spaces ("SHPE at KSU" == "shpe  at ksu ")."""
    return " ".join((name or "").split()).lower()


def _club_hosts(db: Session, club_name: str) -> List[str]:
    """Every host_organization spelling that belongs to this club. Matching happens in Python with
    _club_key, the same function _owns uses, so the list and per-event checks can never disagree
    (Postgres lower() and Python lower() differ for some letters, e.g. Greek final sigma)."""
    key = _club_key(club_name)
    return [h for (h,) in db.query(Event.host_organization).distinct() if _club_key(h) == key]


def _owns(user: User, ev: Event) -> bool:
    return user.role == "admin" or (user.role == "club" and _club_key(ev.host_organization) == _club_key(user.club_name))


def _managed_event(db: Session, user: User, event_id: int) -> Event:
    ev = _get_event(db, event_id)
    if not _owns(user, ev):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only manage your own club's events.")
    return ev


@app.get("/admin/events", response_model=List[schemas.AdminEventOut])
def admin_list_events(
    request: Request,
    q: Optional[str] = Query(None, max_length=100),
    when: str = Query("upcoming", pattern="^(upcoming|past|all)$"),
    manager: User = Depends(event_manager),
    db: Session = Depends(get_db),
):
    query = db.query(Event).options(selectinload(Event.categories))
    if manager.role == "club":
        query = query.filter(Event.host_organization.in_(_club_hosts(db, manager.club_name)))
    now = _now()
    if when == "upcoming":
        query = query.filter(Event.ends_at >= now).order_by(Event.starts_at)
    elif when == "past":
        query = query.filter(Event.ends_at < now).order_by(Event.starts_at.desc())
    else:
        query = query.order_by(Event.starts_at.desc())
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(Event.name.ilike(like) | Event.host_organization.ilike(like)
                             | Event.location.ilike(like))
    saves = _save_counts(db)
    return [_admin_event_out(request, ev, saves.get(ev.id, 0)) for ev in query.all()]


@app.get("/admin/events/{event_id}", response_model=schemas.AdminEventOut)
def admin_get_event(event_id: int, request: Request, manager: User = Depends(event_manager),
                    db: Session = Depends(get_db)):
    return _admin_event_out(request, _managed_event(db, manager, event_id), _save_counts(db).get(event_id, 0))


@app.post("/admin/events", response_model=schemas.AdminEventOut, status_code=201)
def admin_create_event(body: schemas.EventCreateIn, request: Request, manager: User = Depends(event_manager),
                       db: Session = Depends(get_db)):
    data = body.model_dump()
    if manager.role == "club":
        # Clubs always post as themselves and can't pick an Owl Life ID.
        data["host_organization"] = manager.club_name
        data["owl_life_id"] = None
    elif not (data.get("host_organization") or "").strip():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Host organization is required.")
    prefix = "club" if manager.role == "club" else "admin"
    owl_life_id = (data.get("owl_life_id") or "").strip() or f"{prefix}-{uuid.uuid4().hex[:12]}"
    if db.query(Event).filter_by(owl_life_id=owl_life_id).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "An event with that Owl Life ID already exists.")
    ev = Event(owl_life_id=owl_life_id, description="", flyer_text="")
    _apply_event_fields(db, ev, data)
    return _admin_event_out(request, ev)


@app.patch("/admin/events/{event_id}", response_model=schemas.AdminEventOut)
def admin_update_event(event_id: int, body: schemas.EventPatchIn, request: Request,
                       manager: User = Depends(event_manager), db: Session = Depends(get_db)):
    ev = _managed_event(db, manager, event_id)
    data = body.model_dump(exclude_unset=True)
    if manager.role == "club":
        data.pop("host_organization", None)  # a club can't move an event to another host
    _apply_event_fields(db, ev, data)
    return _admin_event_out(request, ev, _save_counts(db).get(event_id, 0))


@app.put("/admin/events/{event_id}/flyer", response_model=schemas.AdminEventOut)
def admin_upload_flyer(event_id: int, request: Request, file: UploadFile = File(...),
                       manager: User = Depends(event_manager), db: Session = Depends(get_db)):
    """Upload a PNG, JPEG or PDF flyer. The categorizer reads its text (OCR) and re-tags the event.

    A plain (sync) def on purpose: OCR, PDF rendering and model training are slow and blocking,
    so FastAPI runs this in its threadpool instead of stalling every other request."""
    ev = _managed_event(db, manager, event_id)
    data = file.file.read(MAX_FLYER_BYTES + 1)  # never load more than the limit (+1 byte to detect "too big")
    try:
        flyer_url, flyer_type, preview_url, flyer_text = save_uploaded_flyer(ev.id, data)
    except FlyerError as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(e))
    ev.flyer_url, ev.flyer_type, ev.flyer_preview_url, ev.flyer_text = flyer_url, flyer_type, preview_url, flyer_text
    db.commit()
    categorize_events(db, [ev])
    db.refresh(ev)
    return _admin_event_out(request, ev, _save_counts(db).get(event_id, 0))


@app.delete("/admin/events/{event_id}/flyer", response_model=schemas.AdminEventOut)
def admin_remove_flyer(event_id: int, request: Request, manager: User = Depends(event_manager),
                       db: Session = Depends(get_db)):
    ev = _managed_event(db, manager, event_id)
    ev.flyer_url = ev.flyer_type = ev.flyer_preview_url = None
    ev.flyer_text = ""
    db.commit()
    categorize_events(db, [ev])
    db.refresh(ev)
    return _admin_event_out(request, ev, _save_counts(db).get(event_id, 0))


@app.delete("/admin/events/{event_id}", status_code=204)
def admin_delete_event(event_id: int, manager: User = Depends(event_manager), db: Session = Depends(get_db)):
    db.delete(_managed_event(db, manager, event_id))
    db.commit()


# ---------- admin: club accounts ----------

def _club_event_counts(db: Session) -> Dict[str, int]:
    counts: Dict[str, int] = {}
    for host, n in db.query(Event.host_organization, func.count()).group_by(Event.host_organization):
        counts[_club_key(host)] = counts.get(_club_key(host), 0) + n
    return counts


def _club_account_out(u: User, counts: Dict[str, int]) -> schemas.ClubAccountOut:
    return schemas.ClubAccountOut(id=u.id, club_name=u.club_name, full_name=u.full_name, email=u.email,
                                  event_count=counts.get(_club_key(u.club_name), 0), created_at=u.created_at)


def _get_club_account(db: Session, account_id: int) -> User:
    u = db.get(User, account_id)
    if not u or u.role != "club":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "We couldn't find that club account.")
    return u


def _commit_account(db: Session) -> None:
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with that email already exists.")


@app.get("/admin/clubs", response_model=List[schemas.ClubOut])
def admin_list_clubs(_admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    """Every club name we know about (event hosts + club accounts), for picking when creating an account."""
    clubs: Dict[str, schemas.ClubOut] = {}
    for host, n in db.query(Event.host_organization, func.count()).group_by(Event.host_organization):
        c = clubs.setdefault(_club_key(host), schemas.ClubOut(name=" ".join(host.split())))
        c.event_count += n
    for (name,) in db.query(User.club_name).filter(User.role == "club"):
        c = clubs.setdefault(_club_key(name), schemas.ClubOut(name=name))
        c.account_count += 1
    return sorted(clubs.values(), key=lambda c: c.name.casefold())


@app.get("/admin/club-accounts", response_model=List[schemas.ClubAccountOut])
def admin_list_club_accounts(_admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    counts = _club_event_counts(db)
    accounts = db.query(User).filter(User.role == "club").all()
    accounts.sort(key=lambda u: (u.club_name.casefold(), u.full_name.casefold()))
    return [_club_account_out(u, counts) for u in accounts]


@app.get("/admin/club-accounts/{account_id}", response_model=schemas.ClubAccountOut)
def admin_get_club_account(account_id: int, _admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    return _club_account_out(_get_club_account(db, account_id), _club_event_counts(db))


@app.post("/admin/club-accounts", response_model=schemas.ClubAccountOut, status_code=201)
def admin_create_club_account(body: schemas.ClubAccountIn, _admin: User = Depends(admin_user),
                              db: Session = Depends(get_db)):
    """Create a sign-in for a club. It can then create and edit only events hosted by that club."""
    u = User(email=body.email, full_name=body.full_name, password_hash=hash_password(body.password),
             role="club", club_name=body.club_name, campus="Both", interests=[], settings=dict(DEFAULT_SETTINGS))
    db.add(u)
    _commit_account(db)
    return _club_account_out(u, _club_event_counts(db))


@app.patch("/admin/club-accounts/{account_id}", response_model=schemas.ClubAccountOut)
def admin_update_club_account(account_id: int, body: schemas.ClubAccountPatch, _admin: User = Depends(admin_user),
                              db: Session = Depends(get_db)):
    u = _get_club_account(db, account_id)
    if body.club_name is not None:
        u.club_name = body.club_name
    if body.full_name is not None:
        u.full_name = body.full_name
    if body.email is not None:
        u.email = body.email
    if body.password is not None:
        u.password_hash = hash_password(body.password)
    _commit_account(db)
    return _club_account_out(u, _club_event_counts(db))


@app.delete("/admin/club-accounts/{account_id}", status_code=204)
def admin_delete_club_account(account_id: int, _admin: User = Depends(admin_user), db: Session = Depends(get_db)):
    """Removes the sign-in only. The club's events stay up."""
    db.delete(_get_club_account(db, account_id))
    db.commit()


@app.get("/health")
def health(db: Session = Depends(get_db)):
    return {"ok": True, "events": db.query(func.count(Event.id)).scalar()}
