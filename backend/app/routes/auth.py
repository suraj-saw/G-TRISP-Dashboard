# backend/app/routes/auth.py

from fastapi import APIRouter, Depends, HTTPException, status, Request, Response
from sqlalchemy.orm import Session
from jose import JWTError

from app.database import get_db
from app.models.user import User
from app.schemas.user_schema import UserCreate, UserLogin, UserResponse
from app.services.auth_service import (
    hash_password,
    verify_password,
    create_token_pair,
    decode_token,
    blacklist_refresh_token,
    is_token_blacklisted,
    is_session_valid,
    ACCESS_TOKEN_EXPIRE_MINUTES,
    REFRESH_TOKEN_EXPIRE_HOURS,
)

router = APIRouter(prefix="/api/auth", tags=["Auth"])


def get_current_user(request: Request, db: Session = Depends(get_db)):
    token = request.cookies.get("access_token")

    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    try:
        payload = decode_token(token)

        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")

        username = payload.get("sub")

        if not username:
            raise HTTPException(status_code=401, detail="Invalid token")

    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired access token")

    if not is_session_valid(token):
        raise HTTPException(
            status_code=401,
            detail="Session invalidated. Please log in again."
        )

    user = db.query(User).filter(User.username == username).first()

    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    return user


@router.post("/register", status_code=status.HTTP_201_CREATED)
def register(user: UserCreate, db: Session = Depends(get_db)):
    existing = db.query(User).filter(
        (User.username == user.username) | (User.email == user.email)
    ).first()

    if existing:
        raise HTTPException(status_code=400, detail="Username or email already exists")

    new_user = User(
        username=user.username,
        email=user.email,
        hashed_password=hash_password(user.password),
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return {"message": "User registered successfully", "user_id": new_user.id}


@router.post("/login")
def login(user: UserLogin, response: Response, db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.username == user.username).first()

    if not db_user or not verify_password(user.hashed_password, db_user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    access_token, refresh_token = create_token_pair({
        "sub": db_user.username,
        "id": db_user.id,
    })

    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        secure=False,
        samesite="strict",
        path="/",
    )

    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        max_age=REFRESH_TOKEN_EXPIRE_HOURS * 3600,
        secure=False,
        samesite="strict",
        path="/",
    )

    return {"message": "Logged in successfully"}


@router.post("/refresh")
def refresh(request: Request, response: Response):
    token = request.cookies.get("refresh_token")

    if not token:
        raise HTTPException(status_code=401, detail="Refresh token missing")

    if is_token_blacklisted(token):
        raise HTTPException(status_code=401, detail="Refresh token has been revoked")

    if not is_session_valid(token):
        raise HTTPException(
            status_code=401,
            detail="Session invalidated. Please log in again."
        )

    try:
        payload = decode_token(token)

        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")

        username = payload.get("sub")
        user_id = payload.get("id")

        if not username or not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")

    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")

    blacklist_refresh_token(token, revoke_session=False)

    access_token, refresh_token = create_token_pair({
        "sub": username,
        "id": user_id,
    })

    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        samesite="lax",
        path="/",
    )

    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        max_age=REFRESH_TOKEN_EXPIRE_HOURS * 3600,
        samesite="lax",
        path="/",
    )

    return {"message": "Token refreshed successfully"}


@router.post("/logout")
def logout(request: Request, response: Response):
    token = request.cookies.get("refresh_token")

    if token:
        blacklist_refresh_token(token, revoke_session=True)

    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")

    return {"message": "Logged out successfully"}


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user