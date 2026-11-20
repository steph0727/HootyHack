"""Runtime configuration, read from environment variables (or backend/.env)."""
import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+psycopg2://localhost:5432/hooty_hack")
JWT_SECRET = os.getenv("JWT_SECRET", "dev-only-change-me")
JWT_EXPIRE_HOURS = int(os.getenv("JWT_EXPIRE_HOURS", "168"))
CAMPUS_TZ = os.getenv("CAMPUS_TZ", "America/New_York")

# Only KSU addresses may register (PRD 2.1: students).
ALLOWED_EMAIL_DOMAINS = tuple(
    d.strip().lower()
    for d in os.getenv("ALLOWED_EMAIL_DOMAINS", "students.kennesaw.edu,kennesaw.edu").split(",")
    if d.strip()
)

FLYER_DIR = BASE_DIR / "static" / "flyers"
FLYER_DIR.mkdir(parents=True, exist_ok=True)
