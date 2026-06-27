# backend/app/services/auth_service.py

import bcrypt
from jose import jwt, JWTError
from datetime import datetime, timedelta, timezone
import os
import uuid
import redis
import secrets
import hashlib

from dotenv import load_dotenv

from app.core.constants import REDIS_SESSION_PREFIX, REDIS_BLACKLIST_PREFIX

load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM  = os.getenv("ALGORITHM", "HS256")
REDIS_URL  = os.getenv("REDIS_URL", "redis://localhost:6379")

if not SECRET_KEY or SECRET_KEY == "your_secret_key_here":
    raise RuntimeError(
        "SECRET_KEY is not configured or is using the placeholder value. "
        "Set a strong SECRET_KEY in your .env file."
    )

redis_client = redis.from_url(REDIS_URL, decode_responses=True)

try:
    redis_client.ping()
except Exception:
    raise RuntimeError("Redis connection failed")

ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "20"))
REFRESH_TOKEN_EXPIRE_HOURS  = int(os.getenv("REFRESH_TOKEN_EXPIRE_HOURS",  "8"))
IDLE_TIMEOUT_MINUTES        = int(os.getenv("IDLE_TIMEOUT_MINUTES",        "30"))


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _session_key(user_id) -> str:
    return f"{REDIS_SESSION_PREFIX}{user_id}"


def _blacklist_key(token: str) -> str:
    return f"{REDIS_BLACKLIST_PREFIX}{token}"


# ---------------------------------------------------------------------------
# Password
# ---------------------------------------------------------------------------

def hash_password(password: str) -> str:
    """Hash a plaintext password with bcrypt."""
    salt   = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode("utf-8"), salt)
    return hashed.decode("utf-8")


def verify_password(password: str, hashed_password: str) -> bool:
    """Return True if *password* matches the stored bcrypt hash."""
    try:
        return bcrypt.checkpw(
            password.encode("utf-8"),
            hashed_password.encode("utf-8"),
        )
    except ValueError:
        return False


# ---------------------------------------------------------------------------
# Token creation & decoding
# ---------------------------------------------------------------------------

def create_token_pair(data: dict) -> tuple[str, str]:
    """
    Create a new (access_token, refresh_token) pair and register the session
    in Redis with an idle-timeout TTL.
    """
    session_id = str(uuid.uuid4())
    user_id    = data.get("id")

    ttl = IDLE_TIMEOUT_MINUTES * 60
    redis_client.setex(_session_key(user_id), ttl, session_id)

    base_payload = {**data, "session_id": session_id}

    access_payload = {
        **base_payload,
        "exp":  datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
        "type": "access",
    }
    access_token = jwt.encode(access_payload, SECRET_KEY, algorithm=ALGORITHM)

    refresh_payload = {
        **base_payload,
        "exp":  datetime.now(timezone.utc) + timedelta(hours=REFRESH_TOKEN_EXPIRE_HOURS),
        "type": "refresh",
    }
    refresh_token = jwt.encode(refresh_payload, SECRET_KEY, algorithm=ALGORITHM)

    return access_token, refresh_token


def decode_token(token: str) -> dict:
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])


# ---------------------------------------------------------------------------
# Session validation
# ---------------------------------------------------------------------------

def is_session_valid(token: str) -> bool:
    """
    Return True if the token's session_id matches the one stored in Redis.
    Also slides the idle-timeout TTL forward on success.
    """
    try:
        payload          = decode_token(token)
        user_id          = payload.get("id")
        token_session_id = payload.get("session_id")

        if not user_id or not token_session_id:
            return False

        key               = _session_key(user_id)
        stored_session_id = redis_client.get(key)

        if stored_session_id == token_session_id:
            redis_client.expire(key, IDLE_TIMEOUT_MINUTES * 60)
            return True

        return False

    except JWTError:
        return False


# ---------------------------------------------------------------------------
# Token revocation
# ---------------------------------------------------------------------------

def blacklist_refresh_token(token: str, revoke_session: bool = False) -> None:
    """
    Add the refresh token to the blacklist and optionally delete the session.

    Parameters
    ----------
    token          : The raw refresh token string.
    revoke_session : If True, also delete the user's active session from Redis,
                     which forces re-login on all devices.
    """
    try:
        payload = decode_token(token)
        exp     = payload.get("exp")
        user_id = payload.get("id")

        if not exp:
            return

        ttl  = int(exp - datetime.now(timezone.utc).timestamp())
        pipe = redis_client.pipeline()

        if ttl > 0:
            pipe.setex(_blacklist_key(token), ttl, "revoked")

        if revoke_session and user_id:
            pipe.delete(_session_key(user_id))

        pipe.execute()

    except JWTError:
        pass


def is_token_blacklisted(token: str) -> bool:
    return redis_client.exists(_blacklist_key(token)) == 1

# ---------------------------------------------------------------------------
# Password Reset
# ---------------------------------------------------------------------------

def check_forgot_password_rate_limit(email: str) -> bool:
    """
    Check if the user has requested a password reset too many times recently.
    Returns True if allowed, False if rate limited.
    Allows 3 requests per hour.
    """
    key = f"rate_limit:forgot_pwd:{email}"
    requests = redis_client.incr(key)
    if requests == 1:
        # First request, set expiry to 1 hour (3600 seconds)
        redis_client.expire(key, 3600)
    
    if requests > 3:
        return False
    return True


def create_password_reset_token(user_id: int) -> str:
    """
    Generates a secure random token, hashes it, invalidates any existing token for the user,
    and stores the hashed token in Redis. Returns the raw token to be sent to the user.
    """
    # Generate raw token
    raw_token = secrets.token_urlsafe(32)
    # Hash token
    hashed_token = hashlib.sha256(raw_token.encode('utf-8')).hexdigest()
    
    user_token_key = f"user_reset_token:{user_id}"
    
    # Invalidate previous token if exists
    previous_hashed_token = redis_client.get(user_token_key)
    pipe = redis_client.pipeline()
    
    if previous_hashed_token:
        pipe.delete(f"password_reset_token:{previous_hashed_token}")
        
    # Store new hashed token mapping to user_id, valid for 15 mins (900 seconds)
    pipe.setex(f"password_reset_token:{hashed_token}", 900, user_id)
    # Track which token belongs to this user so we can invalidate it next time
    pipe.setex(user_token_key, 900, hashed_token)
    
    pipe.execute()
    
    return raw_token


def verify_password_reset_token(raw_token: str) -> int | None:
    """
    Hashes the raw token and looks it up in Redis.
    If valid, returns the user_id and deletes the token to ensure single use.
    If invalid or expired, returns None.
    """
    hashed_token = hashlib.sha256(raw_token.encode('utf-8')).hexdigest()
    key = f"password_reset_token:{hashed_token}"
    
    user_id_str = redis_client.get(key)
    
    if user_id_str:
        # Valid token found, delete it to ensure single use
        redis_client.delete(key)
        # Also clean up the user_reset_token tracker
        redis_client.delete(f"user_reset_token:{user_id_str}")
        return int(user_id_str)
        
    return None

# Also add a verify without consuming
def check_password_reset_token_validity(raw_token: str) -> bool:
    """
    Check if the token is valid without consuming it.
    Useful for pre-validation on the frontend.
    """
    hashed_token = hashlib.sha256(raw_token.encode('utf-8')).hexdigest()
    key = f"password_reset_token:{hashed_token}"
    return redis_client.exists(key) == 1