from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .config import DATABASE_URL

engine = create_engine(DATABASE_URL, pool_pre_ping=True, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Create tables, then apply small in-place upgrades to databases made by older versions."""
    Base.metadata.create_all(engine)
    with engine.begin() as conn:
        # v1 allowed only students. Admins manage all events; club accounts manage their own club's.
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS club_name VARCHAR(200)"))
        conn.execute(text("ALTER TABLE users DROP CONSTRAINT IF EXISTS ck_users_student_only"))
        conn.execute(text("ALTER TABLE users DROP CONSTRAINT IF EXISTS ck_users_role"))
        conn.execute(text("ALTER TABLE users ADD CONSTRAINT ck_users_role CHECK (role IN ('student','admin','club'))"))
        conn.execute(text("ALTER TABLE users DROP CONSTRAINT IF EXISTS ck_users_club_name"))
        conn.execute(text(
            "ALTER TABLE users ADD CONSTRAINT ck_users_club_name CHECK (role <> 'club' OR club_name IS NOT NULL)"))
