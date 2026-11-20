import hashlib
import hmac
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .config import JWT_EXPIRE_HOURS, JWT_SECRET
from .db import get_db
from .models import User

_bearer = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False


def _password_version(user: User) -> str:
    """Fingerprint of the current password hash. Changing or resetting the password changes it,
    which signs out every session that was opened with the old password."""
    return hashlib.sha256(user.password_hash.encode("utf-8")).hexdigest()[:16]


def create_token(user: User) -> str:
    now = datetime.now(timezone.utc)
    payload = {"sub": str(user.id), "pwv": _password_version(user), "iat": now,
               "exp": now + timedelta(hours=JWT_EXPIRE_HOURS)}
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def current_user(
    creds: HTTPAuthorizationCredentials = Depends(_bearer), db: Session = Depends(get_db)
) -> User:
    unauthorized = HTTPException(status.HTTP_401_UNAUTHORIZED, "Please sign in again.")
    if creds is None:
        raise unauthorized
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=["HS256"])
        user = db.get(User, int(payload["sub"]))
        version = str(payload["pwv"])
    except (jwt.PyJWTError, KeyError, ValueError):
        raise unauthorized
    if user is None or not hmac.compare_digest(version, _password_version(user)):
        raise unauthorized
    return user


def admin_user(user: User = Depends(current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only Owl Life admins can do that.")
    return user


def event_manager(user: User = Depends(current_user)) -> User:
    """Admins manage every event; club accounts manage their own club's events."""
    if user.role not in ("admin", "club"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only admins and club accounts can manage events.")
    return user
