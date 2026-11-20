"""AI flyer categorizer (PRD 5.1): multi-label classification with scikit-learn.

Text comes from the event title, description, host and, when Tesseract is installed,
OCR of the flyer image. A TF-IDF + one-vs-rest logistic regression model predicts
one to three categories. Student corrections are added to the training data on every
retrain, so classifications improve over time.
"""
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.multiclass import OneVsRestClassifier
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import MultiLabelBinarizer

from .categories import CATEGORIES, SEED_CORPUS

THRESHOLD = 0.30
MAX_LABELS = 3


def extract_flyer_text(image_path: Optional[Path]) -> str:
    """OCR a flyer if pytesseract + the tesseract binary are available; otherwise return ''."""
    if not image_path or not Path(image_path).exists():
        return ""
    try:
        import pytesseract  # optional dependency
        from PIL import Image, ImageOps

        # Phone photos are often stored sideways with an EXIF rotation tag; apply it so OCR reads
        # upright text. convert() also turns camera formats like MPO into plain RGB for tesseract.
        img = ImageOps.exif_transpose(Image.open(image_path)).convert("RGB")
        img.thumbnail((2400, 2400))  # big phone photos OCR slowly and no better
        text = pytesseract.image_to_string(img, timeout=30)
    except Exception:
        return ""
    return clean_text(text)


def clean_text(text: str) -> str:
    """PostgreSQL text columns reject NUL bytes, which OCR and PDF text layers can contain."""
    return (text or "").replace("\x00", " ").strip()


def event_text(name: str, description: str, host: str, flyer_text: str = "") -> str:
    return " ".join([name, name, host, description or "", flyer_text or ""]).lower()


class FlyerCategorizer:
    def __init__(self) -> None:
        self.mlb = MultiLabelBinarizer(classes=list(CATEGORIES))
        self.model: Optional[Pipeline] = None

    def fit(self, extra: Iterable[Tuple[str, Sequence[str]]] = ()) -> "FlyerCategorizer":
        samples = list(SEED_CORPUS) + [(t, list(l)) for t, l in extra if l]
        texts = [t for t, _ in samples]
        y = self.mlb.fit_transform([[c for c in labels if c in CATEGORIES] for _, labels in samples])
        self.model = Pipeline([
            ("tfidf", TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True, min_df=1)),
            ("clf", OneVsRestClassifier(LogisticRegression(C=8.0, class_weight="balanced", max_iter=2000))),
        ])
        self.model.fit(texts, y)
        return self

    def predict(self, text: str) -> List[Tuple[str, float]]:
        assert self.model is not None, "call fit() first"
        probs = self.model.predict_proba([text])[0]
        order = np.argsort(probs)[::-1]
        picked = [(self.mlb.classes_[i], float(probs[i])) for i in order[:MAX_LABELS] if probs[i] >= THRESHOLD]
        if not picked:  # always assign the single best guess
            i = order[0]
            picked = [(self.mlb.classes_[i], float(probs[i]))]
        return picked


def training_examples_from_db(db) -> List[Tuple[str, List[str]]]:
    """Owl Life/admin-provided categories and student corrections become extra training data."""
    from ..models import CategoryFeedback, Event, EventCategory

    examples: Dict[int, set] = {}
    removed: Dict[int, set] = {}
    for ec in db.query(EventCategory).filter(EventCategory.source.in_(["owl_life", "admin", "user"])):
        examples.setdefault(ec.event_id, set()).add(ec.category)
    for fb in db.query(CategoryFeedback):
        (examples if fb.is_correct else removed).setdefault(fb.event_id, set()).add(fb.category)
    out = []
    for event_id, labels in examples.items():
        labels = labels - removed.get(event_id, set())
        ev = db.get(Event, event_id)
        if ev and labels:
            out.append((event_text(ev.name, ev.description, ev.host_organization, ev.flyer_text), sorted(labels)))
    return out


def categorize_events(db, events) -> None:
    """(Re)assign AI categories to the given events. Owl Life, admin and student labels are kept."""
    from ..models import EventCategory

    model = FlyerCategorizer().fit(training_examples_from_db(db))
    events = list(events)
    ids = [ev.id for ev in events]
    # Drop old AI labels first so re-predicted ones don't collide on the primary key.
    db.query(EventCategory).filter(EventCategory.event_id.in_(ids), EventCategory.source == "ai").delete(
        synchronize_session=False)
    db.flush()
    for ev in events:
        db.refresh(ev)
        kept = {c.category for c in ev.categories}
        text = event_text(ev.name, ev.description, ev.host_organization, ev.flyer_text)
        for cat, p in model.predict(text):
            if cat not in kept:
                db.add(EventCategory(event_id=ev.id, category=cat, confidence=round(p, 3), source="ai"))
    db.commit()
