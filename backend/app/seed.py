"""Seed PostgreSQL with a representative set of KSU club events (sample data, not live Owl Life data).

Dates are relative to the day you run this, so the feed always has upcoming events.
Also creates a demo student account, an admin account and a club account (SHPE at KSU) (credentials are in README.md / DEMO_* env vars).

Usage:  python -m app.seed            (add --reset to wipe events, swipes and saves first)
"""
import os
import sys
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from .config import CAMPUS_TZ
from .db import SessionLocal, init_db
from .flyers import render_flyer
from .ingest import upsert_events
from .models import DEFAULT_SETTINGS, Event, Interaction, SavedEvent, User
from .security import hash_password

OWL_LIFE = "https://owllife.kennesaw.edu/events"

# slug, name, host, description, day offset, start "HH:MM", hours, location, campus, theme, flyer fmt, owl category, rsvp?
EVENTS = [
    ("SHPE_Study", "SHPEtinas Study Night", "SHPE at KSU",
     "Bring your books and brains to get warmed up for finals with a group study session.",
     1, "18:00", 2, "Atrium · Room J-2120", "Marietta", "tech", "png", None, True),
    ("acm-showcase", "ACM Project Showcase", "SHPE at KSU",
     "Student teams demo the software engineering projects they built this semester. Vote for your favorite.",
     1, "18:00", 2, "Engineering Technology Center", "Marietta", "tech", "png", "tech", True),
    ("career-fair", "Fall Tech Career Fair", "Career Planning & Development",
     "Meet employers hiring for internships and full-time roles. Bring copies of your resume and dress business casual.",
     4, "10:00", 4, "Convocation Center", "Kennesaw", "career", "jpeg", "career", True),
    ("open-mic", "Owl Open Mic Night", "Student Activities Board",
     "Poetry, music, comedy. Sign up at the door for a five-minute slot or just come cheer on fellow Owls.",
     2, "19:30", 2, "Student Center Commons", "Kennesaw", "arts", "png", None, False),
    ("bible-study", "Thursday Worship & Social", "Chi Alpha Christian Fellowship",
     "A night of worship music followed by games and snacks. Everyone is welcome to hang out and meet new people.",
     7, "19:00", 2, "Social Sciences Building 1021", "Kennesaw", "faith", "png", None, False),
    ("diwali", "Diwali: Festival of Lights", "Indian Student Association",
     "Celebrate Diwali with dance performances, rangoli, henna, and a catered dinner. Traditional dress encouraged!",
     3, "18:00", 3, "Bailey Performance Center Lawn", "Kennesaw", "culture", "pdf", "culture", True),
    ("smash", "Smash Bros Ultimate Tournament", "KSU Esports",
     "Double elimination bracket, prizes for top 3. Bring your own controller if you have one.",
     2, "17:00", 4, "Esports Arena, Student Rec Center", "Kennesaw", "gaming", "png", "gaming", True),
    ("yoga", "Sunrise Yoga on the Green", "Campus Recreation",
     "Start your morning with a relaxing all-levels yoga flow. Mats provided. Stress relief before finals.",
     5, "07:30", 1, "Campus Green", "Kennesaw", "wellness", "jpeg", None, False),
    ("food-drive", "Holiday Canned Food Drive", "Volunteer KSU",
     "Help sort donations for the KSU CARE Center food pantry. Service hours available.",
     6, "13:00", 3, "CARE Center", "Kennesaw", "service", "png", "service", True),
    ("robotics", "Robotics Build Session", "KSU Robotics Club",
     "Hands-on build session for our competition robot: soldering, Arduino programming, and CAD. Beginners welcome.",
     3, "16:00", 3, "Makerspace, Building Q", "Marietta", "tech", "png", None, False),
    ("resume", "Resume Review Drop-In", "Career Planning & Development",
     "Get quick feedback on your resume from career advisors and recruiters. LinkedIn headshots too.",
     2, "11:00", 3, "Student Center 274", "Kennesaw", "career", "png", None, False),
    ("trivia", "Pub-Style Trivia Night", "Residence Hall Association",
     "Form a team of up to six and compete for gift cards. Free snacks and drinks.",
     0, "20:00", 2, "University Village Clubhouse", "Kennesaw", "social", "png", None, False),
    ("ctf", "Capture the Flag: Cyber Challenge", "Cybersecurity Club",
     "A beginner-friendly CTF competition: crypto, web, and forensics challenges. Teams of up to four.",
     8, "12:00", 6, "Atrium · Room J-101", "Marietta", "tech", "png", "tech", True),
    ("sga", "Student Government Town Hall", "Student Government Association",
     "Share your ideas about campus life with SGA senators and administrators. Leadership opportunities available.",
     9, "17:30", 1.5, "Student Center Ballroom", "Kennesaw", "leadership", "png", "leadership", False),
    ("climbing", "Intro to Bouldering", "Outdoor Adventure Club",
     "Learn climbing basics at the rec center wall. Shoes and chalk provided.",
     4, "18:00", 2, "Student Recreation & Activities Center", "Kennesaw", "sports", "png", None, True),
    ("hillel", "Shabbat Dinner", "Hillel at KSU",
     "Join Jewish students and friends for a home-cooked Shabbat dinner. Everyone is welcome.",
     1, "19:00", 2, "Hillel House", "Kennesaw", "faith", "jpeg", None, True),
    ("msa", "Interfaith Dinner & Dialogue", "Muslim Student Association",
     "A shared meal and conversation between students of all faiths and none. Hosted with the Interfaith Council.",
     10, "18:30", 2, "Student Center Commons", "Kennesaw", "faith", "png", None, True),
    ("film", "Indie Film Screening", "Film Society",
     "Screening of student short films followed by a Q&A with the directors. Popcorn provided.",
     6, "19:00", 2.5, "Stillwell Theater", "Kennesaw", "arts", "png", "arts", False),
    ("dnd", "Board Games & D&D Night", "Tabletop Gaming Guild",
     "Drop in for board games, or join a one-shot Dungeons & Dragons adventure. Dice available to borrow.",
     5, "18:00", 4, "Engineering Technology Center 120", "Marietta", "gaming", "png", None, False),
    ("ml-study", "Machine Learning Study Group", "Data Science Club",
     "Working through neural networks with scikit-learn and PyTorch. Bring questions and a laptop.",
     3, "15:00", 1.5, "Library Room 432", "Kennesaw", "academic", "png", None, False),
    ("pitch", "Startup Pitch Competition", "Entrepreneurship Club",
     "Five-minute pitches judged by local founders. Cash prizes and mentoring for the top teams.",
     12, "17:00", 3, "Coles College of Business", "Kennesaw", "career", "png", "career", True),
    ("blood-drive", "Red Cross Blood Drive", "Pre-Health Society",
     "Donate blood and save lives. Walk-ins welcome, appointments preferred.",
     8, "10:00", 6, "Student Center Ballroom", "Marietta", "service", None, "service", True),
    ("lunar", "Lunar New Year Preview Night", "Asian Student Association",
     "Lantern crafts, dumplings, and a preview of our spring culture show.",
     13, "18:00", 2, "Student Center Commons", "Kennesaw", "culture", "png", None, False),
    ("mindful", "Mindfulness Before Finals", "Counseling & Psychological Services",
     "A guided meditation and stress relief session with therapy dogs.",
     11, "12:00", 1, "Wellness Center", "Kennesaw", "wellness", "png", None, False),
    ("intramural", "3v3 Basketball Tournament", "Campus Recreation",
     "Sign up your team for a one-day 3v3 bracket. Prizes for winners.",
     7, "14:00", 4, "Rec Center Courts", "Marietta", "sports", "jpeg", "sports", True),
    # Past events (shouldn't appear in Discover, show under Saved > Past)
    ("halloween", "Halloween Costume Social", "Student Activities Board",
     "Costume contest, candy, and a haunted hallway.", -19, "19:00", 3, "Student Center", "Kennesaw",
     "social", "png", None, False),
    ("homecoming", "Homecoming Tailgate", "Alumni Association",
     "Food trucks, music, and Owl spirit before the big game.", -30, "11:00", 4, "Fifth Third Bank Stadium",
     "Kennesaw", "sports", "png", None, False),
]


def build_records(now: datetime):
    tz = ZoneInfo(CAMPUS_TZ)
    today = now.astimezone(tz).date()
    out = []
    for (slug, name, host, desc, offset, start, hours, where, campus, theme, fmt, cat, rsvp) in EVENTS:
        h, m = map(int, start.split(":"))
        starts = datetime(today.year, today.month, today.day, h, m, tzinfo=tz) + timedelta(days=offset)
        if slug == "trivia":  # always "happening now" to exercise ongoing events
            starts = now - timedelta(minutes=30)
        ends = starts + timedelta(hours=hours)
        when = f"{starts.strftime('%a, %b')} {starts.day} · {starts.strftime('%-I:%M %p')}"
        flyer = preview = None
        if fmt:
            flyer, preview = render_flyer(slug, name, host, when, f"{where} · {campus}", theme, fmt)
        out.append({
            "owl_life_id": f"sample-{slug}", "name": name, "host_organization": host, "description": desc,
            "starts_at": starts, "ends_at": ends, "location": where, "campus": campus,
            "flyer_url": flyer, "flyer_type": fmt, "flyer_preview_url": preview,
            "rsvp_url": OWL_LIFE if rsvp else None, "owl_life_url": OWL_LIFE,
            "is_free": True, "category": cat,
        })
    return out


def main(reset: bool = False) -> None:
    init_db()
    now = datetime.now(timezone.utc)
    with SessionLocal() as db:
        if reset:
            db.query(Interaction).delete()
            db.query(SavedEvent).delete()
            db.query(Event).delete()
            db.commit()
        events = upsert_events(db, build_records(now))

        email = os.getenv("DEMO_EMAIL", "owl.demo@students.kennesaw.edu").strip().lower()
        password = os.getenv("DEMO_PASSWORD", "hootyhack-demo")
        user = db.query(User).filter_by(email=email).first()
        if not user:
            user = User(email=email, full_name="Demo Owl", password_hash=hash_password(password), role="student",
                        campus="Both", interests=["tech", "arts", "social"], settings=dict(DEFAULT_SETTINGS))
            db.add(user)
            db.commit()
        admin_email = os.getenv("ADMIN_EMAIL", "owl.admin@kennesaw.edu").strip().lower()
        admin_password = os.getenv("ADMIN_PASSWORD", "hootyhack-admin")
        if not db.query(User).filter_by(email=admin_email).first():
            db.add(User(email=admin_email, full_name="Owl Life Admin", password_hash=hash_password(admin_password),
                        role="admin", campus="Both", interests=[], settings=dict(DEFAULT_SETTINGS)))
            db.commit()
        club_email = os.getenv("CLUB_EMAIL", "shpe.club@kennesaw.edu").strip().lower()
        club_password = os.getenv("CLUB_PASSWORD", "hootyhack-club")
        if not db.query(User).filter_by(email=club_email).first():
            db.add(User(email=club_email, full_name="SHPE Officer", password_hash=hash_password(club_password),
                        role="club", club_name="SHPE at KSU", campus="Both", interests=[],
                        settings=dict(DEFAULT_SETTINGS)))
            db.commit()
        # Give the demo account a saved past event so Saved > Past isn't empty.
        past = next(e for e in events if e.owl_life_id == "sample-halloween")
        if not db.get(SavedEvent, (user.id, past.id)):
            db.add(SavedEvent(user_id=user.id, event_id=past.id))
            db.commit()
        print(f"Seeded {len(events)} events. Demo student: {email}  Admin: {admin_email}  Club (SHPE at KSU): {club_email}")
        for ev in events[:6]:
            print(f"  {ev.name}: " + ", ".join(f"{c.category}({c.source} {c.confidence:.2f})" for c in ev.categories))


if __name__ == "__main__":
    main(reset="--reset" in sys.argv)
