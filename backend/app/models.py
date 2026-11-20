"""PostgreSQL schema (SQLAlchemy). See ../schema.sql for the equivalent DDL."""
from datetime import datetime
from typing import List, Optional

from sqlalchemy import (
    Boolean, CheckConstraint, DateTime, Float, ForeignKey, Integer, String, Text,
    UniqueConstraint, func,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base

DEFAULT_SETTINGS = {
    "upcoming_only": True,
    "push_reminders": True,
    "email_reminders": False,
    "reminder_lead": "1 hour",       # "15 min" | "1 hour" | "1 day"
    "quiet_hours": True,
    "location_access": False,
    "calendar_access": True,
    "usage_analytics": False,
}


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(120))
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20), default="student")  # student | admin | club
    # Club accounts (created by an admin) manage events whose host_organization matches this name.
    club_name: Mapped[Optional[str]] = mapped_column(String(200))
    campus: Mapped[str] = mapped_column(String(20), default="Kennesaw")
    interests: Mapped[List[str]] = mapped_column(ARRAY(String(40)), default=list)
    settings: Mapped[dict] = mapped_column(JSONB, default=lambda: dict(DEFAULT_SETTINGS))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        CheckConstraint("role IN ('student','admin','club')", name="ck_users_role"),
        CheckConstraint("role <> 'club' OR club_name IS NOT NULL", name="ck_users_club_name"),
        CheckConstraint("campus IN ('Kennesaw','Marietta','Both')", name="ck_users_campus"),
    )


class Event(Base):
    __tablename__ = "events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    owl_life_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(200))
    host_organization: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    location: Mapped[Optional[str]] = mapped_column(String(200))
    campus: Mapped[str] = mapped_column(String(20), default="Kennesaw")
    flyer_url: Mapped[Optional[str]] = mapped_column(String(500))
    flyer_type: Mapped[Optional[str]] = mapped_column(String(10))  # png | jpeg | pdf
    flyer_preview_url: Mapped[Optional[str]] = mapped_column(String(500))  # image preview for pdf flyers
    flyer_text: Mapped[str] = mapped_column(Text, default="")  # OCR text, when available
    rsvp_url: Mapped[Optional[str]] = mapped_column(String(500))
    owl_life_url: Mapped[Optional[str]] = mapped_column(String(500))
    is_free: Mapped[bool] = mapped_column(Boolean, default=True)
    source_category: Mapped[Optional[str]] = mapped_column(String(80))  # category from Owl Life, if any
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    categories: Mapped[List["EventCategory"]] = relationship(
        back_populates="event", cascade="all, delete-orphan", order_by="desc(EventCategory.confidence)"
    )

    __table_args__ = (
        CheckConstraint("ends_at >= starts_at", name="ck_events_time_order"),
        CheckConstraint("flyer_type IS NULL OR flyer_type IN ('png','jpeg','pdf')", name="ck_events_flyer_type"),
    )


class EventCategory(Base):
    __tablename__ = "event_categories"

    event_id: Mapped[int] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"), primary_key=True)
    category: Mapped[str] = mapped_column(String(40), primary_key=True)
    confidence: Mapped[float] = mapped_column(Float, default=1.0)
    source: Mapped[str] = mapped_column(String(20), default="ai")  # ai | owl_life | admin | user

    event: Mapped[Event] = relationship(back_populates="categories")


class Interaction(Base):
    """Every swipe. Feeds the recommender (likes = positives, skips = negatives)."""
    __tablename__ = "interactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"), index=True)
    action: Mapped[str] = mapped_column(String(10))  # like | skip
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("user_id", "event_id", name="uq_interaction_user_event"),
        CheckConstraint("action IN ('like','skip')", name="ck_interaction_action"),
    )


class SavedEvent(Base):
    __tablename__ = "saved_events"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"), primary_key=True)
    saved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    event: Mapped[Event] = relationship()


class CategoryFeedback(Base):
    """Student corrections to AI flyer categories; folded back into categorizer training."""
    __tablename__ = "category_feedback"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"), index=True)
    category: Mapped[str] = mapped_column(String(40))
    is_correct: Mapped[bool] = mapped_column(Boolean)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
