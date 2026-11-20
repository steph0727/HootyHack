from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field, field_validator

from .config import ALLOWED_EMAIL_DOMAINS
from .ml.categories import CATEGORIES


def _check_email(v: str) -> str:
    v = v.strip().lower()
    if "@" not in v or v.count("@") != 1:
        raise ValueError("Enter a valid email address.")
    if v.split("@")[1] not in ALLOWED_EMAIL_DOMAINS:
        raise ValueError("Use your KSU email (you@students.kennesaw.edu).")
    return v


class RegisterIn(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    email: str
    password: str = Field(min_length=8, max_length=128)
    agreed_to_terms: bool

    @field_validator("email")
    @classmethod
    def check_email(cls, v: str) -> str:
        return _check_email(v)

    @field_validator("agreed_to_terms")
    @classmethod
    def must_agree(cls, v: bool) -> bool:
        if not v:
            raise ValueError("Please agree to the Terms of Service and Privacy Policy.")
        return v


class LoginIn(BaseModel):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def normalize_email(cls, v: str) -> str:
        return v.strip().lower()


class SettingsIn(BaseModel):
    upcoming_only: Optional[bool] = None
    push_reminders: Optional[bool] = None
    email_reminders: Optional[bool] = None
    reminder_lead: Optional[Literal["15 min", "1 hour", "1 day"]] = None
    quiet_hours: Optional[bool] = None
    location_access: Optional[bool] = None
    calendar_access: Optional[bool] = None
    usage_analytics: Optional[bool] = None


class UserPatch(BaseModel):
    full_name: Optional[str] = Field(default=None, min_length=2, max_length=120)
    campus: Optional[Literal["Kennesaw", "Marietta", "Both"]] = None
    interests: Optional[List[str]] = None
    settings: Optional[SettingsIn] = None

    @field_validator("interests")
    @classmethod
    def known_categories(cls, v):
        if v is None:
            return v
        bad = [c for c in v if c not in CATEGORIES]
        if bad:
            raise ValueError(f"Unknown interests: {', '.join(bad)}")
        return list(dict.fromkeys(v))


class PasswordChangeIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


class UserOut(BaseModel):
    id: int
    email: str
    full_name: str
    role: str
    campus: str
    interests: List[str]
    settings: dict


class AuthOut(BaseModel):
    token: str
    user: UserOut


class CategoryOut(BaseModel):
    key: str
    label: str
    confidence: float
    source: str


class EventOut(BaseModel):
    id: int
    owl_life_id: str
    name: str
    host_organization: str
    description: str
    starts_at: datetime
    ends_at: datetime
    location: Optional[str]
    campus: str
    flyer_url: Optional[str]
    flyer_type: Optional[str]
    flyer_preview_url: Optional[str]
    rsvp_url: Optional[str]
    owl_life_url: Optional[str]
    is_free: bool
    categories: List[CategoryOut]
    is_saved: bool = False
    is_past: bool = False
    is_ongoing: bool = False
    reason: Optional[str] = None


class FeedOut(BaseModel):
    strategy: str  # learned | similarity | fallback | empty
    events: List[EventOut]
    remaining: int


class SwipeIn(BaseModel):
    direction: Literal["right", "left"]


class CategoryFeedbackIn(BaseModel):
    category: str
    is_correct: bool

    @field_validator("category")
    @classmethod
    def known(cls, v):
        if v not in CATEGORIES:
            raise ValueError("Unknown category.")
        return v
