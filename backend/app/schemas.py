from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator

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
    club_name: Optional[str] = None
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


# ---------- admin: event management ----------

def _check_url(v: Optional[str]) -> Optional[str]:
    if v is None:
        return v
    v = v.strip()
    if not v:
        return None
    if not (v.startswith("http://") or v.startswith("https://") or v.startswith("/static/")):
        raise ValueError("Links must start with http:// or https://.")
    return v


class _EventFields(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=200)
    host_organization: Optional[str] = Field(default=None, min_length=2, max_length=200)
    description: Optional[str] = Field(default=None, max_length=5000)
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    location: Optional[str] = Field(default=None, max_length=200)
    campus: Optional[Literal["Kennesaw", "Marietta"]] = None
    flyer_url: Optional[str] = Field(default=None, max_length=500)
    flyer_type: Optional[Literal["png", "jpeg", "pdf"]] = None
    flyer_preview_url: Optional[str] = Field(default=None, max_length=500)
    rsvp_url: Optional[str] = Field(default=None, max_length=500)
    owl_life_url: Optional[str] = Field(default=None, max_length=500)
    is_free: Optional[bool] = None
    # Categories the admin picks. They're kept as-is; the AI adds up to 3 of its own on top.
    # Flyer files are uploaded separately: PUT /admin/events/{id}/flyer.
    categories: Optional[List[str]] = None

    @field_validator("flyer_url", "flyer_preview_url", "rsvp_url", "owl_life_url")
    @classmethod
    def check_urls(cls, v):
        return _check_url(v)

    @field_validator("starts_at", "ends_at")
    @classmethod
    def tz_aware(cls, v):
        if v is not None and v.tzinfo is None:
            raise ValueError("Times must include a timezone offset.")
        return v

    @field_validator("categories")
    @classmethod
    def known_categories(cls, v):
        if v is None:
            return v
        bad = [c for c in v if c not in CATEGORIES]
        if bad:
            raise ValueError(f"Unknown categories: {', '.join(bad)}")
        return list(dict.fromkeys(v))

    @model_validator(mode="after")
    def time_order(self):
        if self.starts_at and self.ends_at and self.ends_at < self.starts_at:
            raise ValueError("The event can't end before it starts.")
        return self


class EventCreateIn(_EventFields):
    name: str = Field(min_length=2, max_length=200)
    # Required for admins. Club accounts always post as their own club, so they can leave it out.
    host_organization: Optional[str] = Field(default=None, min_length=2, max_length=200)
    starts_at: datetime
    ends_at: datetime
    campus: Literal["Kennesaw", "Marietta"] = "Kennesaw"
    is_free: bool = True
    owl_life_id: Optional[str] = Field(default=None, max_length=64)


class EventPatchIn(_EventFields):
    pass


class AdminEventOut(EventOut):
    saves: int = 0
    created_at: Optional[datetime] = None


# ---------- admin: club accounts ----------

def _check_email_format(v: str) -> str:
    """Club officers may use any address (an admin vouches for them), but it must look like an email."""
    v = v.strip().lower()
    local, _, domain = v.partition("@")
    if not local or "." not in domain or " " in v or v.count("@") != 1 or domain.startswith(".") or domain.endswith("."):
        raise ValueError("Enter a valid email address.")
    return v


def _check_club_name(v: str) -> str:
    v = " ".join(v.split())
    if len(v) < 2:
        raise ValueError("Enter the club's name.")
    return v


class ClubAccountIn(BaseModel):
    club_name: str = Field(max_length=200)
    full_name: str = Field(min_length=2, max_length=120)  # the club contact who will sign in
    email: str = Field(max_length=255)
    password: str = Field(min_length=8, max_length=128)

    @field_validator("email")
    @classmethod
    def check_email(cls, v):
        return _check_email_format(v)

    @field_validator("club_name")
    @classmethod
    def check_club(cls, v):
        return _check_club_name(v)

    @field_validator("full_name")
    @classmethod
    def strip_name(cls, v):
        return v.strip()


class ClubAccountPatch(BaseModel):
    club_name: Optional[str] = Field(default=None, max_length=200)
    full_name: Optional[str] = Field(default=None, min_length=2, max_length=120)
    email: Optional[str] = Field(default=None, max_length=255)
    password: Optional[str] = Field(default=None, min_length=8, max_length=128)  # reset; omit to keep

    @field_validator("email")
    @classmethod
    def check_email(cls, v):
        return None if v is None else _check_email_format(v)

    @field_validator("club_name")
    @classmethod
    def check_club(cls, v):
        return None if v is None else _check_club_name(v)

    @field_validator("full_name")
    @classmethod
    def strip_name(cls, v):
        return None if v is None else v.strip()


class ClubAccountOut(BaseModel):
    id: int
    club_name: str
    full_name: str
    email: str
    event_count: int = 0
    created_at: Optional[datetime] = None


class ClubOut(BaseModel):
    """A club name known to the system: from event hosts and/or club accounts."""
    name: str
    event_count: int = 0
    account_count: int = 0
