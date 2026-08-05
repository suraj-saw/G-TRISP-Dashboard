# backend/app/services/admin_service.py

"""
Admin Business Logic & Operations Service.

Handles user status updates, approval/rejection workflows, role changes, and notification tracking.
"""

# pyrefly: ignore [missing-import]
from fastapi import HTTPException
# pyrefly: ignore [missing-import]
from sqlalchemy.orm import Session

from app.models.user import User
from app.models.notification import Notification


def set_user_status(
    user_id: int,
    new_status: str,
    db: Session,
    decided_by: User,
) -> User:
    """Used for first-time decisions on pending users."""
    target = db.query(User).filter(User.id == user_id).first()

    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    if target.role == "superadmin" or (target.role == "admin" and decided_by.role != "superadmin"):
        raise HTTPException(status_code=400, detail="Not enough privileges to change status of this account")

    if target.status != "pending":
        raise HTTPException(
            status_code=400,
            detail=f"This user has already been {target.status} (by another admin).",
        )

    target.status = new_status

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


def force_set_user_status(
    user_id: int,
    new_status: str,
    db: Session,
    decided_by: User,
) -> User:
    """Used for re-decisions on already approved/rejected users."""
    target = db.query(User).filter(User.id == user_id).first()

    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    if target.role == "superadmin" or (target.role == "admin" and decided_by.role != "superadmin"):
        raise HTTPException(status_code=400, detail="Not enough privileges to change status of this account")

    if target.status == "pending":
        raise HTTPException(
            status_code=400,
            detail="Use the standard approve/reject endpoints for pending users.",
        )

    if target.status == new_status:
        raise HTTPException(
            status_code=400,
            detail=f"User is already {new_status}.",
        )

    old_status = target.status
    target.status = new_status

    db.add(Notification(
        type="status_change",
        message=(
            f"User '{target.username}' ({target.email}) status changed "
            f"from {old_status} to {new_status} by {decided_by.username}."
        ),
        related_user_id=target.id,
        acted_by_admin_id=decided_by.id,
        is_read=False,
    ))

    db.commit()
    db.refresh(target)
    return target
