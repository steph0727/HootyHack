# Hooty Hack 🦉

Campus event discovery for Kennesaw State students. Swipe right to save an Owl Life event, swipe left to skip. A scikit-learn model learns what you like and orders your Discover feed.

**Student view only.**The admin/club dashboard from the Figma file is out of scope.

| Layer            | Tech                                                                               |
| ---------------- | ---------------------------------------------------------------------------------- |
| Mobile + web app | React Native, Expo SDK 58, Expo Router, React (web via react-native-web; HTML/CSS) |
| API              | Python, FastAPI, SQLAlchemy                                                        |
| Database         | PostgreSQL                                                                         |
| AI               | scikit-learn: flyer categorizer and personalized recommender                       |

## Run it

**1. Database.** Use a local PostgreSQL install (`createdb hooty_hack`) or run `docker compose up -d` and set
`DATABASE_URL=postgresql+psycopg2://hooty:hooty@localhost:5432/hooty_hack` in `backend/.env`.

**2. API** (Python 3.9+):

```bash
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
cp .env.example .env            # then set JWT_SECRET
.venv/bin/python -m app.seed    # sample events, flyers, demo student, admin, demo club
.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

API docs: http://localhost:8000/docs. Tests: `.venv/bin/python -m pytest -q tests` (needs a `hooty_hack_test` database).

**3. App:**

```bash
cd mobile
npm install
npx expo start          # press w for web, i for iOS simulator, a for Android, or scan the QR code with Expo Go
```

The app looks for the API on port 8000 of the same machine that runs the Expo dev server, so phones on the same Wi-Fi work. To point it elsewhere, set `EXPO_PUBLIC_API_URL`.

**Demo student:** the seed script creates the account set by `DEMO_EMAIL` / `DEMO_PASSWORD` in `backend/.env.example`. You can also register any `@students.kennesaw.edu` address.

**Admin:** the seed script also creates an admin account: `ADMIN_EMAIL` / `ADMIN_PASSWORD`, defaulting to `owl.admin@kennesaw.edu` / `hootyhack-admin`. Admins land on **Manage events** (`app/admin/`), where they can create, edit, search and delete events, pick categories, upload a flyer (PNG, JPG or PDF) from the device, and preview an event the way students see it. The API for this is under `/admin/events` and returns 403 for students. Register always creates students, so the only ways to make an admin are the seed script or changing `users.role` in the database.

**Club accounts:** from Manage events → **Club accounts**, an admin creates a sign-in for a club (club name, contact name, email, starting password) and shares it with the club. A club account lands on its own dashboard, where it can create, edit, delete and upload flyers for **only** the events whose host matches its club name (case and extra spaces are ignored), so existing events under that name become the club's automatically. Clubs can't change an event's host or manage other accounts, and can change their password under Password. Deleting a club account keeps its events. The seed script creates a demo club account for "SHPE at KSU": `CLUB_EMAIL` / `CLUB_PASSWORD`, defaulting to `shpe.club@kennesaw.edu` / `hootyhack-club`. API: `/admin/club-accounts` and `/admin/clubs` (admins only).

## Screens (from the Figma file)

| Figma frame                                  | Route                                         |
| -------------------------------------------- | --------------------------------------------- |
| 01 Sign in                                   | `app/(auth)/sign-in.js`                       |
| 02 Create account (then interest onboarding) | `app/(auth)/create-account.js`                |
| 03 Discover events (swipe deck)              | `app/(tabs)/discover.js` + `src/SwipeDeck.js` |
| 03 Flyer close up                            | `app/flyer/[id].js`                           |
| 04 Event information                         | `app/event/[id].js`                           |
| 06 Settings                                  | `app/(tabs)/settings/index.js`                |
| 07 Saved events                              | `app/(tabs)/saved.js`                         |
| 08 Customize preferences                     | `app/(tabs)/settings/preferences.js`          |
| 09 Campus                                    | `app/(tabs)/settings/campus.js`               |
| 11 Profile & password                        | `app/(tabs)/settings/profile.js`              |
| 12 Event reminders                           | `app/(tabs)/settings/reminders.js`            |
| 13 Privacy & permissions                     | `app/(tabs)/settings/privacy.js`              |

## AI (PRD section 5)

**Flyer categorizer** (`backend/app/ml/categorizer.py`). A TF-IDF + one-vs-rest logistic regression gives each event 1–3 of 12 categories, with confidence scores. Its input is the title, description, host and, when Tesseract is installed, OCR text from the flyer. Training data is a seed corpus, plus categories Owl Life supplies, plus student corrections ("Not quite right? Suggest a category" on the event page). Each correction retrains the model.

**Recommender** (`backend/app/ml/recommender.py`). Events become TF-IDF vectors that include weighted category tokens. The strategy depends on how much the app knows about the student:

- **learned:** with 3+ likes and 3+ skips, a per-student logistic regression, blended with content similarity.
- **similarity:** with some likes or stated interests, cosine similarity to a profile vector built from likes and interests, minus skips.
- **fallback:** with nothing yet, soonest first, then popularity and campus (AI-05).

Ended events are never shown (FR-13). Every 5th card is a deliberate pick from outside the student's usual categories. Cards show why they were picked ("Because you like Tech & Making", "Something new to try").

## Owl Life data (PRD section 6)

No public Owl Life API is assumed. `python -m app.ingest events.json` imports an authorized export (the format is documented in `backend/app/ingest.py`) and runs the categorizer on it. The seeded events and flyers are **sample data** made for the prototype. Their Owl Life and RSVP links go to the general Owl Life events page.

## Known gaps

- Event reminders and privacy toggles are saved to the account, but notification delivery, calendar sync and location aren't built yet.
- "Forgot password" shows a message; there's no email reset flow.
- Flyer OCR needs the `tesseract` binary (`brew install tesseract`). Without it, uploads still work, but the categorizer only reads PDF text layers and the event details.
- PDF flyers need an image preview (`flyer_preview_url`) to show on cards. Uploaded PDFs get one rendered from page 1.

Hooty Hack — How to Run the App with Expo
Here's the complete step-by-step process to run your Hooty Hack application locally using FastAPI (backend) and Expo (frontend).
Part 1: Backend Setup (Python + FastAPI)
Open your terminal in VS Code.
Step 1: Navigate to the backend folder
cd hootySwipe
cd backend

Step 2: Create a Python virtual environment
Only needed during initial setup.

python3 -m venv .venv

This creates an isolated environment for your backend's Python dependencies.
Step 3: Activate the virtual environment
source .venv/bin/activate

You should see (.venv) at the beginning of your terminal prompt.
Step 4: Install backend dependencies
Only needed initially or when dependencies change.
python -m pip install -r requirements.txt

Step 5: Configure environment variables
Only needed during initial setup.
cp .env.example .env

Make sure .env contains your correct database URL and a secure JWT_SECRET.
Step 6: Seed the database
Only needed when initially populating the database or intentionally reseeding.
python -m app.seed

This populates the database with the sample club events and demo student.
Step 7: Start the backend server
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

Verify that it's running at:

http://localhost:8000/docs

Leave this terminal running.

Part 2: Frontend Setup (React Native + Expo)
Step 8: Open a second terminal
Keep the backend running in the first terminal.

Navigate to your frontend directory from the hootySwipe project root:
cd mobile

If you're currently in backend, run cd ../mobile instead.
Step 9: Install frontend dependencies
Only needed initially or when dependencies change.
npm install

Step 10: Start Expo
npx expo start

Once Expo launches, choose how you want to run your application.
Command Action
w Open application in web browser
i Open iOS Simulator
a Open Android Emulator
Scan QR code Open on phone using Expo Go, if compatible

Quick reference — Every time you want to run Hooty Hack
Since you've already installed everything, you don't need to repeat the installation or database seeding steps every time.
Terminal 1 — Backend

cd hootySwipe/backend
source .venv/bin/activate
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

Terminal 2 — Expo

cd hootySwipe/mobile
npx expo start
