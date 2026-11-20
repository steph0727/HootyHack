"""Personalized event ranking (PRD 5, AI-01..AI-05).

Each event becomes a TF-IDF vector over its title, host, description and category
tokens. A student's signal comes from:
  * stated interests (Settings > Customize preferences),
  * events they swiped right on or saved (positives),
  * events they skipped (negatives).

Strategy, by how much we know about the student:
  * "learned"    - at least 3 likes and 3 skips: a per-student logistic regression,
                   blended with content similarity.
  * "similarity" - some likes or interests: cosine similarity to a profile vector.
  * "fallback"   - nothing yet: soonest upcoming + popularity + campus (AI-05).
Every 5th card is an exploration pick from outside the top of the ranking (PRD 5.2).
"""
import random
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Dict, List, Optional, Sequence

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics.pairwise import cosine_similarity

from .categories import CATEGORIES

EXPLORE_EVERY = 5
MIN_FOR_MODEL = 3


@dataclass
class Ranked:
    event: object
    score: float
    reason: str


REASON_MIN_CONFIDENCE = 0.5


def _cat_tokens(cats: Sequence[str], weights: Optional[Sequence[float]] = None) -> str:
    # Repeat category tokens so they outweigh incidental description words; confident labels count more.
    weights = weights or [1.0] * len(cats)
    return " ".join(" ".join([f"cat_{c}"] * (3 if w >= 0.6 else 2 if w >= 0.5 else 1))
                    for c, w in zip(cats, weights))


def _doc(ev) -> str:
    cats = [c.category for c in ev.categories]
    conf = [c.confidence for c in ev.categories]
    return f"{ev.name} {ev.host_organization} {ev.description or ''} {ev.flyer_text or ''} {_cat_tokens(cats, conf)}".lower()


def _soonness(ev, now: datetime) -> float:
    hours = max((ev.starts_at - now).total_seconds() / 3600.0, 0.0)
    return float(np.exp(-hours / (24 * 7)))  # ~1 for right now, ~0.37 a week out


def rank_events(
    candidates: List,
    all_events: List,
    liked_ids: Sequence[int],
    skipped_ids: Sequence[int],
    interests: Sequence[str],
    campus: str,
    popularity: Dict[int, int],
    seed: int = 0,
    now: Optional[datetime] = None,
    explore: bool = True,
):
    """Return (ranked list, strategy name)."""
    now = now or datetime.now(timezone.utc)
    if not candidates:
        return [], "empty"

    by_id = {e.id: e for e in all_events}
    corpus = list({e.id: e for e in list(all_events) + list(candidates)}.values())
    index = {e.id: i for i, e in enumerate(corpus)}
    vec = TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True, stop_words="english")
    X = vec.fit_transform([_doc(e) for e in corpus])
    Xc = X[[index[e.id] for e in candidates]]

    liked = [index[i] for i in liked_ids if i in index]
    skipped = [index[i] for i in skipped_ids if i in index]
    interests = [c for c in interests if c in CATEGORIES]

    max_pop = max(popularity.values(), default=0) or 1
    pop = np.array([popularity.get(e.id, 0) / max_pop for e in candidates])
    soon = np.array([_soonness(e, now) for e in candidates])
    camp = np.array([1.0 if campus == "Both" or e.campus == campus else 0.0 for e in candidates])

    personal = None
    strategy = "fallback"
    has_model = len(liked) >= MIN_FOR_MODEL and len(skipped) >= MIN_FOR_MODEL
    if has_model:
        strategy = "learned"
        train = X[liked + skipped]
        y = np.array([1] * len(liked) + [0] * len(skipped))
        clf = LogisticRegression(C=2.0, class_weight="balanced", max_iter=1000).fit(train, y)
        personal = clf.predict_proba(Xc)[:, 1]
    if liked or interests:
        profile = np.zeros((1, X.shape[1]))
        if liked:
            profile += np.asarray(X[liked].mean(axis=0))
        if interests:
            profile += 0.6 * np.asarray(vec.transform([_cat_tokens(interests)]).todense())
        if skipped:
            profile -= 0.3 * np.asarray(X[skipped].mean(axis=0))
        sim = cosine_similarity(Xc, profile).ravel()
        sim = (sim - sim.min()) / (np.ptp(sim) or 1.0)
        personal = sim if personal is None else 0.6 * personal + 0.4 * sim
        if not has_model:
            strategy = "similarity"
    if personal is None:
        score = 0.6 * soon + 0.25 * pop + 0.15 * camp
    else:
        score = 0.6 * personal + 0.2 * soon + 0.1 * camp + 0.1 * pop

    liked_cats: Dict[str, int] = {}
    for i in liked_ids:
        if i in by_id:
            for c in by_id[i].categories:
                if c.confidence < REASON_MIN_CONFIDENCE:
                    continue
                liked_cats[c.category] = liked_cats.get(c.category, 0) + 1
    favored = set(interests) | {c for c, n in liked_cats.items() if n >= 1}

    def reason_for(ev) -> str:
        cats = [c.category for c in ev.categories if c.confidence >= REASON_MIN_CONFIDENCE]
        match = next((c for c in cats if c in favored), None)
        if strategy != "fallback" and match:
            return f"Because you like {CATEGORIES[match]}"
        if _soonness(ev, now) > 0.85:
            return "Happening soon"
        if popularity.get(ev.id, 0) >= 2:
            return "Popular with Owls"
        return "Upcoming on campus"

    order = list(np.argsort(-score, kind="stable"))
    ranked = [Ranked(candidates[i], float(score[i]), reason_for(candidates[i])) for i in order]

    # Exploration: pull an event from outside the student's usual categories into every Nth slot.
    if explore and strategy != "fallback" and len(ranked) > EXPLORE_EVERY:
        rng = random.Random(seed)
        outside = [r for r in ranked[EXPLORE_EVERY:]
                   if not ({c.category for c in r.event.categories} & favored)]
        rng.shuffle(outside)
        outside_ids = {r.event.id for r in outside}
        result, pool = [], [r for r in ranked if r.event.id not in outside_ids]
        while pool or outside:
            if outside and len(result) % EXPLORE_EVERY == EXPLORE_EVERY - 1:
                pick = outside.pop()
                pick.reason = "Something new to try"
                result.append(pick)
            elif pool:
                result.append(pool.pop(0))
            else:
                result.append(outside.pop())
        ranked = result

    return ranked, strategy
