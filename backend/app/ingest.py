"""Owl Life event ingestion.

PRD section 6: Owl Life may not offer a public API, so this module accepts a JSON
export in the shape below (from an authorized feed, or a hand-prepared dataset) and
upserts it into PostgreSQL. AI categorization then runs on every imported event.

    [{"owl_life_id": "...", "name": "...", "host_organization": "...",
      "description": "...", "starts_at": "2026-11-20T18:00:00-05:00",
      "ends_at": "...", "location": "...", "campus": "Kennesaw|Marietta",
      "flyer_url": "...", "flyer_type": "png|jpeg|pdf", "flyer_preview_url": "...",
      "rsvp_url": "...", "owl_life_url": "...", "is_free": true,
      "category": "optional Owl Life category key"}]

Usage:  python -m app.ingest path/to/events.json
"""
import json
import sys
from datetime import datetime
from pathlib import Path
from typing import Iterable

from .config import BASE_DIR
from .db import SessionLocal, init_db
from .ml.categories import CATEGORIES
from .ml.categorizer import categorize_events, extract_flyer_text
from .models import Event, EventCategory

FIELDS = ["name", "host_organization", "description", "location", "campus", "flyer_url", "flyer_type",
          "flyer_preview_url", "rsvp_url", "owl_life_url", "is_free"]


def _parse(ts):
    return ts if isinstance(ts, datetime) else datetime.fromisoformat(ts)


def upsert_events(db, records: Iterable[dict]):
    touched = []
    for rec in records:
        ev = db.query(Event).filter_by(owl_life_id=str(rec["owl_life_id"])).first() or Event(
            owl_life_id=str(rec["owl_life_id"]))
        for f in FIELDS:
            if f in rec:
                setattr(ev, f, rec[f])
        ev.starts_at, ev.ends_at = _parse(rec["starts_at"]), _parse(rec["ends_at"])
        local = rec.get("flyer_preview_url") or rec.get("flyer_url") or ""
        if local.startswith("/static/"):
            ev.flyer_text = extract_flyer_text(BASE_DIR / local.lstrip("/"))
        db.add(ev)
        db.flush()
        cat = rec.get("category")
        if cat in CATEGORIES and not any(c.category == cat for c in ev.categories):
            ev.source_category = cat
            db.add(EventCategory(event_id=ev.id, category=cat, confidence=1.0, source="owl_life"))
        touched.append(ev)
    db.commit()
    categorize_events(db, touched)
    return touched


def main(path: str) -> None:
    init_db()
    records = json.loads(Path(path).read_text())
    with SessionLocal() as db:
        n = len(upsert_events(db, records))
    print(f"Imported {n} events from {path}")


if __name__ == "__main__":
    main(sys.argv[1])
