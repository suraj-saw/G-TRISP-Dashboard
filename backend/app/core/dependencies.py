# backend/app/core/dependencies.py

"""
Core Application Dependencies.

This module provides common FastAPI dependency providers used across the application,
including database session management and user authentication/authorization resolvers.
"""

from typing import Generator
# pyrefly: ignore [missing-import]
from fastapi import Depends, HTTPException, Request
# pyrefly: ignore [missing-import]
from sqlalchemy.orm import Session
# pyrefly: ignore
from jose import JWTError

from app.database import SessionLocal
from app.models.user import User
from app.services.auth_service import (
    decode_token,
    is_session_valid,
)
from app.core.constants import ACCESS_TOKEN_COOKIE


def get_db() -> Generator[Session, None, None]:
    """
    FastAPI Dependency to provide a database session per request.

    Guarantees session cleanup after HTTP response is sent.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    """
    Dependency to resolve and authenticate the current user from their access token cookie.
    """
    token = request.cookies.get(ACCESS_TOKEN_COOKIE)

    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    try:
        payload = decode_token(token)

        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")

        user_id_str = payload.get("sub")
        if not user_id_str:
            raise HTTPException(status_code=401, detail="Invalid token")

    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired access token")

    # Check if request is a passive background status poll
    is_background_poll = request.headers.get("x-background-poll", "").lower() == "true"
    touch_session = not is_background_poll

    if not is_session_valid(token, touch=touch_session):
        raise HTTPException(
            status_code=401,
            detail="Session invalidated. Please log in again.",
        )

    user = db.query(User).filter(User.id == int(user_id_str)).first()

    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if user.status != "approved":
        raise HTTPException(
            status_code=403,
            detail="Your account is not currently approved for access.",
        )

    return user


def get_current_admin_user(current_user: User = Depends(get_current_user)) -> User:
    """
    Dependency to ensure the authenticated user has administrative privileges (admin or superadmin).
    """
    if current_user.role not in ["admin", "superadmin"]:
        raise HTTPException(
            status_code=403,
            detail="Not enough privileges. Admin access required.",
        )
    return current_user


def get_current_superadmin_user(current_user: User = Depends(get_current_user)) -> User:
    """
    Dependency to ensure the authenticated user has superadmin privileges.
    """
    if current_user.role != "superadmin":
        raise HTTPException(
            status_code=403,
            detail="Not enough privileges. Superadmin access required.",
        )
    return current_user
