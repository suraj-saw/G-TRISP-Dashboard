# backend/app/services/auth_service.py

import bcrypt
from jose import jwt, JWTError
from datetime import datetime, timedelta
import os
import uuid
import redis
from datetime import timezone

from dotenv import load_dotenv

load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")

if not SECRET_KEY or SECRET_KEY == "your_secret_key_here":
    raise RuntimeError(
        "SECRET_KEY is not configured or is using the placeholder value. "
        "Set a strong SECRET_KEY in your .env file."
    )

redis_client = redis.from_url(
    REDIS_URL,
    decode_responses=True
)

try:
    redis_client.ping()
except Exception:
    raise RuntimeError(
        "Redis connection failed"
    )

ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "20"))
REFRESH_TOKEN_EXPIRE_HOURS = int(os.getenv("REFRESH_TOKEN_EXPIRE_HOURS", "8"))
IDLE_TIMEOUT_MINUTES = int(os.getenv("IDLE_TIMEOUT_MINUTES", "30"))


def hash_password(password: str) -> str:
    # Fixed: Use bcrypt directly to avoid passlib 1.7.4 incompatibility with bcrypt 4+
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
    return hashed.decode('utf-8')


def verify_password(password: str, hashed_password: str) -> bool:
    try:
        # Fixed: Use bcrypt directly to verify
        return bcrypt.checkpw(password.encode('utf-8'), hashed_password.encode('utf-8'))
    except ValueError:
        return False


def create_token_pair(data: dict) -> tuple[str, str]:
    session_id = str(uuid.uuid4())
    user_id = data.get("id")

    ttl = IDLE_TIMEOUT_MINUTES * 60
    redis_client.setex(f"session:{user_id}", ttl, session_id)

    base_payload = {**data, "session_id": session_id}

    access_payload = {
        **base_payload,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
        "type": "access"
    }
    access_token = jwt.encode(access_payload, SECRET_KEY, algorithm=ALGORITHM)

    refresh_payload = {
        **base_payload,
        "exp": datetime.now(timezone.utc) + timedelta(hours=REFRESH_TOKEN_EXPIRE_HOURS),
        "type": "refresh"
    }
    refresh_token = jwt.encode(refresh_payload, SECRET_KEY, algorithm=ALGORITHM)

    return access_token, refresh_token


def decode_token(token: str) -> dict:
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])


def is_session_valid(token: str) -> bool:
    try:
        payload = decode_token(token)
        user_id = payload.get("id")
        token_session_id = payload.get("session_id")

        if not user_id or not token_session_id:
            return False

        session_key = f"session:{user_id}"
        stored_session_id = redis_client.get(session_key)

        if stored_session_id == token_session_id:
            redis_client.expire(session_key, IDLE_TIMEOUT_MINUTES * 60)
            return True

        return False

    except JWTError:
        return False


def blacklist_refresh_token(token: str, revoke_session: bool = False):
    try:
        payload = decode_token(token)
        exp = payload.get("exp")
        user_id = payload.get("id")

        if not exp:
            return

        ttl = int(exp - datetime.now(timezone.utc).timestamp())

        pipe = redis_client.pipeline()

        if ttl > 0:
            pipe.setex(f"blacklist:{token}", ttl, "revoked")

        if revoke_session and user_id:
            pipe.delete(f"session:{user_id}")

        pipe.execute()

    except JWTError:
        pass


def is_token_blacklisted(token: str) -> bool:
    return redis_client.exists(f"blacklist:{token}") == 1