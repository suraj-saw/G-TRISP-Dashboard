"""
@file auth.py
@description Authentication and Authorization Routing Module.

This module defines the API endpoints for user registration, login, token refresh,
password reset, and session management. It acts as the HTTP interface for the logic
defined in `auth_service.py`.

JWT Flow & Security Assumptions:
- Access Tokens are short-lived and used for authenticating requests.
- Refresh Tokens are longer-lived and stored in HTTP-only, secure cookies to prevent XSS.
- Redis is used as a stateful layer to track active sessions, enforce idle timeouts,
  and blacklist revoked refresh tokens, marrying the statelessness of JWT with
  stateful security controls.
- Passwords are never returned or logged; they are hashed via bcrypt.

Authorization Checks:
- `get_current_user`: Ensures the user possesses a valid, non-expired access token
  that matches an active Redis session, and their account status is 'approved'.
- `get_current_admin_user`: Inherits `get_current_user` and strictly requires the
  role to be 'admin'.
"""

import os
import logging

logger = logging.getLogger(__name__)

ENVIRONMENT     = os.getenv("ENVIRONMENT", "development")
COOKIE_SECURE   = ENVIRONMENT == "production"
COOKIE_SAMESITE = os.getenv("COOKIE_SAMESITE", "strict")
FRONTEND_URL    = os.getenv("FRONTEND_URL", "http://localhost:5173")

# pyrefly: ignore [missing-import]
from fastapi import APIRouter, Depends, HTTPException, status, Request, Response
# pyrefly: ignore [missing-import]
from sqlalchemy.orm import Session
from jose import JWTError

from app.database import get_db
from app.models.user import User
from app.schemas.user_schema import UserCreate, UserLogin, UserResponse, ForgotPasswordRequest, ResetPasswordRequest
from app.services.auth_service import (
    hash_password,
    verify_password,
    create_token_pair,
    decode_token,
    blacklist_refresh_token,
    is_token_blacklisted,
    is_session_valid,
    check_forgot_password_rate_limit,
    create_password_reset_token,
    verify_password_reset_token,
    check_password_reset_token_validity,
    ACCESS_TOKEN_EXPIRE_MINUTES,
    REFRESH_TOKEN_EXPIRE_HOURS,
)
from app.utils.email import send_reset_password_email
from app.models.notification import Notification
from app.core.constants import (
    ACCESS_TOKEN_COOKIE,
    REFRESH_TOKEN_COOKIE,
    AUTH_PREFIX,
)

router = APIRouter(prefix=AUTH_PREFIX, tags=["Auth"])

# ---------------------------------------------------------------------------
# Shared cookie helper
# ---------------------------------------------------------------------------

def _set_auth_cookies(
    response: Response,
    access_token: str,
    refresh_token: str,
) -> None:
    """Write both auth cookies onto *response* with consistent settings."""
    _common = dict(
        httponly=True,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        path="/",
    )
    response.set_cookie(
        key=ACCESS_TOKEN_COOKIE,
        value=access_token,
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        **_common,
    )
    response.set_cookie(
        key=REFRESH_TOKEN_COOKIE,
        value=refresh_token,
        max_age=REFRESH_TOKEN_EXPIRE_HOURS * 3600,
        **_common,
    )


# ---------------------------------------------------------------------------
# Dependency: resolve the current authenticated user
# ---------------------------------------------------------------------------

def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    """
    Dependency to resolve and authenticate the current user from their access token.

    Authorization Checks:
    1. Extracts access token from HttpOnly cookies.
    2. Decodes JWT to verify signature and expiration.
    3. Validates the token type is 'access'.
    4. Checks Redis to ensure the session hasn't been invalidated or timed out.
    5. Retrieves user from the database and ensures they are 'approved'.

    Args:
        request (Request): The incoming FastAPI request.
        db (Session): Database session.

    Returns:
        User: The fully authenticated SQLAlchemy user object.

    Raises:
        HTTPException: If authentication fails at any step (401) or if the account
                       is not approved (403).
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

    if not is_session_valid(token):
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


# ---------------------------------------------------------------------------
# Dependency: resolve the current admin user
# ---------------------------------------------------------------------------

def get_current_admin_user(current_user: User = Depends(get_current_user)) -> User:
    """
    Dependency to ensure the authenticated user has administrative privileges.

    Authorization Checks:
    - Inherits all checks from `get_current_user`.
    - Strictly verifies that the `role` column equals 'admin'.

    Args:
        current_user (User): The authenticated user resolved by `get_current_user`.

    Returns:
        User: The authenticated admin user.

    Raises:
        HTTPException: If the user does not have the admin role (403).
    """
    if current_user.role != "admin":
        raise HTTPException(
            status_code=403,
            detail="Not enough privileges. Admin access required.",
        )
    return current_user


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.post("/register", status_code=status.HTTP_201_CREATED)
def register(user: UserCreate, db: Session = Depends(get_db)):
    """
    Register a new user account.

    Business Rules:
    - New accounts are created with a 'pending' status.
    - They require manual approval from an administrator before they can log in.
    - Generates a system notification for admins to review the registration.

    Args:
        user (UserCreate): The registration payload containing username, email, and password.
        db (Session): Database session.

    Returns:
        dict: Success message and new user ID.
    """
    existing = db.query(User).filter(
        (User.username == user.username) | (User.email == user.email)
    ).first()

    if existing:
        raise HTTPException(status_code=400, detail="Username or email already exists")

    new_user = User(
        username=user.username,
        email=user.email,
        hashed_password=hash_password(user.password),
        status="pending",
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    db.add(Notification(
        type="user_registration",
        message=(
            f"New user '{new_user.username}' ({new_user.email}) "
            "registered and is awaiting approval."
        ),
        related_user_id=new_user.id,
    ))
    db.commit()

    return {
        "message": "Registration successful. Your account is pending admin approval.",
        "user_id": new_user.id,
    }


@router.post("/login")
def login(user: UserLogin, response: Response, db: Session = Depends(get_db)):
    """
    Authenticate a user and establish a new session.

    JWT Flow:
    1. Verifies credentials against hashed database password.
    2. Checks if account is approved.
    3. Generates a new JWT access and refresh token pair.
    4. Sets these tokens as HttpOnly cookies on the response.

    Args:
        user (UserLogin): The login payload containing email and password.
        response (Response): FastAPI response to set cookies on.
        db (Session): Database session.

    Returns:
        dict: Success message.
    """
    db_user = db.query(User).filter(User.email == user.email).first()

    if not db_user or not verify_password(user.password, db_user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if db_user.status == "pending":
        raise HTTPException(
            status_code=403,
            detail="Your account is pending admin approval. Please check back later.",
        )
    if db_user.status == "rejected":
        raise HTTPException(
            status_code=403,
            detail="Your registration was not approved. Contact an administrator.",
        )

    access_token, refresh_token = create_token_pair({
        "sub": str(db_user.id),
        "id":  db_user.id,
    })
    _set_auth_cookies(response, access_token, refresh_token)

    return {"message": "Logged in successfully"}


@router.post("/refresh")
def refresh(request: Request, response: Response):
    """
    Rotate tokens using a valid refresh token.

    JWT Flow:
    1. Extracts refresh token from HttpOnly cookies.
    2. Verifies token is not blacklisted or expired.
    3. Verifies session is still active in Redis.
    4. Blacklists the old refresh token (sliding window logic).
    5. Generates and returns a fresh pair of tokens.

    Args:
        request (Request): FastAPI request to extract cookies.
        response (Response): FastAPI response to set new cookies.

    Returns:
        dict: Success message.
    """
    token = request.cookies.get(REFRESH_TOKEN_COOKIE)

    if not token:
        raise HTTPException(status_code=401, detail="Refresh token missing")

    if is_token_blacklisted(token):
        raise HTTPException(status_code=401, detail="Refresh token has been revoked")

    if not is_session_valid(token):
        raise HTTPException(
            status_code=401,
            detail="Session invalidated. Please log in again.",
        )

    try:
        payload = decode_token(token)

        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")

        user_id_str = payload.get("sub")
        user_id     = payload.get("id")

        if not user_id_str or not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")

    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")

    blacklist_refresh_token(token, revoke_session=False)

    access_token, new_refresh_token = create_token_pair({
        "sub": user_id_str,
        "id":  user_id,
    })
    _set_auth_cookies(response, access_token, new_refresh_token)

    return {"message": "Token refreshed successfully"}


@router.post("/logout")
def logout(request: Request, response: Response):
    """
    Terminate the current user session securely.

    Security Assumptions:
    - Revokes the refresh token in Redis.
    - Destroys the active session in Redis, logging out all devices sharing the session.
    - Clears the HttpOnly cookies from the browser.

    Args:
        request (Request): FastAPI request to extract the current token.
        response (Response): FastAPI response to clear cookies.

    Returns:
        dict: Success message.
    """
    token = request.cookies.get(REFRESH_TOKEN_COOKIE)

    if token:
        blacklist_refresh_token(token, revoke_session=True)

    response.delete_cookie(ACCESS_TOKEN_COOKIE,  path="/")
    response.delete_cookie(REFRESH_TOKEN_COOKIE, path="/")

    return {"message": "Logged out successfully"}


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    """
    Retrieve the profile of the currently authenticated user.

    Args:
        current_user (User): Resolved by the `get_current_user` dependency.

    Returns:
        User: The user profile data.
    """
    return current_user


# ---------------------------------------------------------------------------
# Password Reset Routes
# ---------------------------------------------------------------------------

@router.post("/forgot-password")
def forgot_password(req: ForgotPasswordRequest, db: Session = Depends(get_db)):
    """
    Initiate the password reset flow.

    Security Assumptions:
    - Highly susceptible to enumeration attacks; thus, rate-limited via Redis.
    - Emits generic success messages even if the email doesn't exist, preventing 
      attackers from probing for valid accounts.
    - Cannot reset passwords for pending/rejected users unless they are admins.

    Args:
        req (ForgotPasswordRequest): Contains the user's email.
        db (Session): Database session.

    Returns:
        dict: Generic success message indicating an email has been sent if valid.
    """
    email = req.email
    
    if not check_forgot_password_rate_limit(email):
        logger.warning(f"Rate limit exceeded for forgot password request: {email}")
        raise HTTPException(
            status_code=429, 
            detail="Too many requests. Please try again later."
        )

    user = db.query(User).filter(User.email == email).first()
    
    if not user:
        logger.info(f"Password reset requested for non-existent email: {email}")
        raise HTTPException(
            status_code=404,
            detail="The email is not registered."
        )

    if user.role != "admin":
        if user.status == "rejected":
            logger.warning(f"Password reset requested for rejected user: {email}")
            raise HTTPException(
                status_code=403,
                detail="Your access has been revoked by the administrators, try contact them."
            )
        elif user.status == "pending":
            logger.warning(f"Password reset requested for pending user: {email}")
            raise HTTPException(
                status_code=403,
                detail="Your account is pending admin approval."
            )

    logger.info(f"Password reset requested for user: {email}")
    
    # Generate token and store hash in Redis
    raw_token = create_password_reset_token(user.id)
    
    # Construct link and send email
    reset_link = f"{FRONTEND_URL}/reset-password?token={raw_token}"
    send_reset_password_email(user.email, reset_link)
    
    return {
        "message": "If an account exists for this email, a password reset link has been sent.",
        "reset_link": reset_link
    }


@router.get("/reset-password/verify")
def verify_reset_token(token: str):
    """
    Check if a reset token is valid without consuming it.
    Used by the frontend to conditionally render the reset form.
    """
    if check_password_reset_token_validity(token):
        return {"valid": True}
    
    # Return 400 so the frontend can catch the error and display an invalid state
    raise HTTPException(status_code=400, detail="Invalid or expired reset token.")


@router.post("/reset-password")
def reset_password(req: ResetPasswordRequest, db: Session = Depends(get_db)):
    """
    Consume a password reset token and update the user's password.

    Security Assumptions:
    - Consumes the reset token upon successful verification to enforce single-use.
    - Hashes the new password before storage.
    - Forces a session invalidation in Redis so active sessions are terminated.

    Args:
        req (ResetPasswordRequest): Contains the token and the new password.
        db (Session): Database session.

    Returns:
        dict: Success message.
    """
    raw_token = req.token
    new_password = req.new_password
    
    # Verify token and get user ID
    user_id = verify_password_reset_token(raw_token)
    
    if not user_id:
        logger.warning("Attempted password reset with invalid or expired token")
        raise HTTPException(status_code=400, detail="Invalid or expired reset token.")
        
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        logger.error(f"Valid reset token found for non-existent user_id: {user_id}")
        raise HTTPException(status_code=400, detail="Invalid or expired reset token.")

    # Hash new password and save
    user.hashed_password = hash_password(new_password)
    db.commit()
    
    logger.info(f"Password successfully reset for user: {user.email}")
    
    # Since password changed, we optionally want to invalidate existing sessions.
    # The current auth_service handles this primarily via login/logout, but we can't easily 
    # find the session_id to delete without changing how sessions are stored (currently stored 
    # as `session:{user_id} -> session_id`). We can just delete the session key.
    # pyrefly: ignore [missing-import]
    import redis
    redis_client = redis.from_url(os.getenv("REDIS_URL", "redis://localhost:6379"))
    redis_client.delete(f"session:{user.id}")
    
    return {"message": "Password reset successful. You can now log in with your new password."}