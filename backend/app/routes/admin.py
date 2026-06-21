# backend/app/routes/admin.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.notification import Notification
from app.routes.auth import get_current_admin_user
from app.schemas.user_schema import UserResponse
from app.schemas.notification_schema import NotificationResponse

router = APIRouter(prefix="/api/admin", tags=["Admin"])


@router.get("/dashboard")
def get_admin_dashboard_data(current_user: User = Depends(get_current_admin_user)):
    return {
        "message": "Welcome to the Admin Dashboard",
        "admin": current_user.username,
        "role": current_user.role,
    }


@router.get("/users/pending", response_model=list[UserResponse])
def list_pending_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    return (
        db.query(User)
        .filter(User.status == "pending")
        .order_by(User.created_at.desc())
        .all()
    )


@router.get("/users", response_model=list[UserResponse])
def list_all_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    return db.query(User).order_by(User.created_at.desc()).all()


def _set_user_status(
    user_id: int,
    new_status: str,
    db: Session,
    decided_by: User,
) -> User:
    target = db.query(User).filter(User.id == user_id).first()

    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    if target.role == "admin":
        raise HTTPException(status_code=400, detail="Cannot change status of an admin account")

    # Guards against two admins acting on the same user at the same time,
    # and against re-approving/re-rejecting an already-decided user.
    if target.status != "pending":
        raise HTTPException(
            status_code=400,
            detail=f"This user has already been {target.status} (by another admin).",
        )

    target.status = new_status

    # Resolve the original registration notification so it stops showing
    # as an unread, actionable item for every other admin.
    related_notifications = (
        db.query(Notification)
        .filter(
            Notification.related_user_id == user_id,
            Notification.type == "user_registration",
        )
        .all()
    )

    verb = "approved" if new_status == "approved" else "rejected"
    for notif in related_notifications:
        notif.is_read = True
        notif.message = (
            f"User '{target.username}' ({target.email}) was {verb} by {decided_by.username}."
        )

    db.commit()
    db.refresh(target)
    return target


@router.post("/users/{user_id}/approve", response_model=UserResponse)
def approve_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    return _set_user_status(user_id, "approved", db, decided_by=current_user)


@router.post("/users/{user_id}/reject", response_model=UserResponse)
def reject_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    return _set_user_status(user_id, "rejected", db, decided_by=current_user)


@router.get("/notifications", response_model=list[NotificationResponse])
def list_notifications(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    return (
        db.query(Notification)
        .order_by(Notification.created_at.desc())
        .limit(50)
        .all()
    )


@router.post("/notifications/{notification_id}/read", response_model=NotificationResponse)
def mark_notification_read(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user),
):
    notif = db.query(Notification).filter(Notification.id == notification_id).first()

    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")

    notif.is_read = True
    db.commit()
    db.refresh(notif)
    return notif