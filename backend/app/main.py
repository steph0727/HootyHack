"""Hooty Hack API (FastAPI + PostgreSQL + scikit-learn). Student role only."""
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta, timezone
from typing import Dict, List, Optional, Set
from zoneinfo import ZoneInfo

from fastapi import Depends, FastAPI, HTTPException, Query, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from . import schemas
from .config import BASE_DIR, CAMPUS_TZ
from .db import Base, engine, get_db
from .ml.categories import CATEGORIES
from .ml.categorizer import categorize_events
from .ml.recommender import rank_events
from .models import DEFAULT_SETTINGS, CategoryFeedback, Event, Interaction, SavedEvent, User
from .security import create_token, current_user, hash_password, verify_password

@asynccontextmanager
async def lifespan(_app):
    Base.metadata.create_all(engine)
    yield


app = FastAPI(title="Hooty Hack API", version="1.0.0", lifespan=lifespan)
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
        id=u.id, email=u.email, full_name=u.full_name, role=u.role, campus=u.campus,
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
    return schemas.AuthOut(token=create_token(user.id), user=_user_out(user))


@app.post("/auth/login", response_model=schemas.AuthOut)
def login(body: schemas.LoginIn, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "That email and password don't match.")
    return schemas.AuthOut(token=create_token(user.id), user=_user_out(user))


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


@app.post("/me/password", status_code=204)
def change_password(body: schemas.PasswordChangeIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Your current password is incorrect.")
    user.password_hash = hash_password(body.new_password)
    db.commit()


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


@app.get("/health")
def health(db: Session = Depends(get_db)):
    return {"ok": True, "events": db.query(func.count(Event.id)).scalar()}
