# backend/app/services/auth_service.py

"""
Authentication and Session Management Service.

This module handles the core security operations for the application, including:
- Password hashing and verification (Bcrypt).
- JWT (JSON Web Token) generation and decoding.
- Stateful session management using Redis (idle timeouts, token blacklisting).
- Secure, rate-limited password reset flows.
"""

import bcrypt
from jose import jwt, JWTError
from datetime import datetime, timedelta, timezone
import os
import uuid
import redis
import secrets
import hashlib

from dotenv import load_dotenv

from app.core.constants import (
    REDIS_SESSION_PREFIX,
    REDIS_BLACKLIST_PREFIX,
    DEFAULT_ACCESS_TOKEN_EXPIRE_MINUTES,
    DEFAULT_REFRESH_TOKEN_EXPIRE_HOURS,
    DEFAULT_IDLE_TIMEOUT_MINUTES,
    PASSWORD_RESET_TOKEN_TTL_SECONDS,
    FORGOT_PASSWORD_RATE_WINDOW_SECONDS,
    FORGOT_PASSWORD_MAX_REQUESTS,
)

load_dotenv()

# ── Environment Configuration & Validation ────────────────────────────────────
SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM  = os.getenv("ALGORITHM", "HS256")
REDIS_URL  = os.getenv("REDIS_URL", "redis://localhost:6379")

# Enforce strict security baseline: Prevent the app from booting with unsafe keys
if not SECRET_KEY or SECRET_KEY == "your_secret_key_here":
    raise RuntimeError(
        "SECRET_KEY is not configured or is using the placeholder value. "
        "Set a strong SECRET_KEY in your .env file."
    )

# Initialize Redis connection with string decoding enabled
redis_client = redis.from_url(REDIS_URL, decode_responses=True)

try:
    # Validate Redis connection at startup
    redis_client.ping()
except Exception:
    raise RuntimeError("Redis connection failed")

# TTL Configurations mapped from environment variables or constants
ACCESS_TOKEN_EXPIRE_MINUTES = int(
    os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", str(DEFAULT_ACCESS_TOKEN_EXPIRE_MINUTES))
)
REFRESH_TOKEN_EXPIRE_HOURS = int(
    os.getenv("REFRESH_TOKEN_EXPIRE_HOURS", str(DEFAULT_REFRESH_TOKEN_EXPIRE_HOURS))
)
IDLE_TIMEOUT_MINUTES = int(
    os.getenv("IDLE_TIMEOUT_MINUTES", str(DEFAULT_IDLE_TIMEOUT_MINUTES))
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _session_key(user_id) -> str:
    """Generate a consistent Redis key for a user's active session."""
    return f"{REDIS_SESSION_PREFIX}{user_id}"


def _blacklist_key(token: str) -> str:
    """Generate a consistent Redis key for a blacklisted token."""
    return f"{REDIS_BLACKLIST_PREFIX}{token}"


# ---------------------------------------------------------------------------
# Password
# ---------------------------------------------------------------------------

def hash_password(password: str) -> str:
    """
    Hash a plaintext password securely using bcrypt.

    Args:
        password (str): The plaintext password to hash.

    Returns:
        str: The decoded bcrypt hash string safe for database storage.
    """
    salt   = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode("utf-8"), salt)
    return hashed.decode("utf-8")


def verify_password(password: str, hashed_password: str) -> bool:
    """
    Verify a plaintext password against a stored bcrypt hash.

    Args:
        password (str): The plaintext password attempt.
        hashed_password (str): The stored bcrypt hash from the database.

    Returns:
        bool: True if the password matches the hash, False otherwise.
    """
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

    Args:
        data (dict): Payload data to embed in the JWT (must include 'id').

    Returns:
        tuple[str, str]: A tuple containing the (access_token, refresh_token).
    """
    session_id = str(uuid.uuid4())
    user_id    = data.get("id")

    # Register the session in Redis to track activity and enforce idle timeouts
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
    """
    Decode and validate a JWT string.

    Args:
        token (str): The JWT string to decode.

    Returns:
        dict: The decoded token payload.

    Raises:
        JWTError: If the token is invalid, expired, or corrupted.
    """
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])


# ---------------------------------------------------------------------------
# Session validation
# ---------------------------------------------------------------------------

def is_session_valid(token: str) -> bool:
    """
    Validate that a token's session_id matches the active session in Redis.
    
    If successful, this function implements a "sliding window" by resetting 
    the session's idle-timeout TTL back to its maximum value.

    Args:
        token (str): The JWT string to validate.

    Returns:
        bool: True if the session is valid and active, False otherwise.
    """
    try:
        payload          = decode_token(token)
        user_id          = payload.get("id")
        token_session_id = payload.get("session_id")

        if not user_id or not token_session_id:
            return False

        key               = _session_key(user_id)
        stored_session_id = redis_client.get(key)

        # Verify the token belongs to the currently active session
        if stored_session_id == token_session_id:
            # Slide the idle timeout window forward
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

    Args:
        token (str): The raw refresh token string to revoke.
        revoke_session (bool): If True, deletes the user's active session 
            from Redis, forcing a re-login on all devices. Defaults to False.
    """
    try:
        payload = decode_token(token)
        exp     = payload.get("exp")
        user_id = payload.get("id")

        if not exp:
            return

        ttl  = int(exp - datetime.now(timezone.utc).timestamp())
        
        # Use Redis pipelines to ensure atomicity and reduce network round-trips
        pipe = redis_client.pipeline()

        # Only store the token in the blacklist until its natural expiration time
        if ttl > 0:
            pipe.setex(_blacklist_key(token), ttl, "revoked")

        if revoke_session and user_id:
            pipe.delete(_session_key(user_id))

        pipe.execute()

    except JWTError:
        pass


def is_token_blacklisted(token: str) -> bool:
    """
    Check if a given token has been explicitly revoked.

    Args:
        token (str): The raw token string to check.

    Returns:
        bool: True if the token is blacklisted, False otherwise.
    """
    return redis_client.exists(_blacklist_key(token)) == 1


# ---------------------------------------------------------------------------
# Password Reset
# ---------------------------------------------------------------------------

def check_forgot_password_rate_limit(email: str) -> bool:
    """
    Enforce rate limits on password reset requests to prevent spam/abuse.

    Allows `FORGOT_PASSWORD_MAX_REQUESTS` per `FORGOT_PASSWORD_RATE_WINDOW_SECONDS`.

    Args:
        email (str): The email address requesting the reset.

    Returns:
        bool: True if the request is allowed, False if rate limited.
    """
    key = f"rate_limit:forgot_pwd:{email}"
    requests = redis_client.incr(key)
    
    # Set the TTL window only on the first request
    if requests == 1:
        redis_client.expire(key, FORGOT_PASSWORD_RATE_WINDOW_SECONDS)

    if requests > FORGOT_PASSWORD_MAX_REQUESTS:
        return False
    return True


def create_password_reset_token(user_id: int) -> str:
    """
    Generate and securely store a single-use password reset token.

    Security mechanism: The raw token is generated and returned to be emailed 
    to the user, but only the SHA-256 hash of the token is stored in Redis. 
    This prevents an attacker who compromises Redis from hijacking reset links.

    Args:
        user_id (int): The ID of the user requesting the reset.

    Returns:
        str: The raw, URL-safe secure token to be sent to the user.
    """
    raw_token    = secrets.token_urlsafe(32)
    hashed_token = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()

    user_token_key = f"user_reset_token:{user_id}"

    # Invalidate any previously generated (but unused) token for this user
    previous_hashed_token = redis_client.get(user_token_key)
    pipe = redis_client.pipeline()

    if previous_hashed_token:
        pipe.delete(f"password_reset_token:{previous_hashed_token}")

    # Store the new hashed token mapping to the user_id
    pipe.setex(
        f"password_reset_token:{hashed_token}",
        PASSWORD_RESET_TOKEN_TTL_SECONDS,
        user_id,
    )
    
    # Track which token belongs to this user so we can invalidate it if they request another
    pipe.setex(user_token_key, PASSWORD_RESET_TOKEN_TTL_SECONDS, hashed_token)

    pipe.execute()

    return raw_token


def verify_password_reset_token(raw_token: str) -> int | None:
    """
    Validate a password reset token and consume it.

    Hashes the raw token and verifies it exists in Redis. If valid, the token 
    is immediately deleted (enforcing single-use).

    Args:
        raw_token (str): The raw token provided by the user via their reset link.

    Returns:
        int | None: The associated user_id if valid, or None if invalid/expired.
    """
    hashed_token = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
    key = f"password_reset_token:{hashed_token}"

    user_id_str = redis_client.get(key)

    if user_id_str:
        # Consume the token to prevent reuse
        redis_client.delete(key)
        redis_client.delete(f"user_reset_token:{user_id_str}")
        return int(user_id_str)

    return None


def check_password_reset_token_validity(raw_token: str) -> bool:
    """
    Check if a reset token is valid without consuming it.
    
    Useful for frontend pre-validation (e.g., checking if the link is expired 
    before showing the "Enter new password" form).

    Args:
        raw_token (str): The raw token to check.

    Returns:
        bool: True if the token exists and is not expired, False otherwise.
    """
    hashed_token = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
    key = f"password_reset_token:{hashed_token}"
    return redis_client.exists(key) == 1