# backend/app/models/notification.py
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from sqlalchemy.sql import func

from app.database import Base


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    type = Column(String, nullable=False, default="user_registration")
    message = Column(String, nullable=False)
    related_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    # For status_change notifications: the admin who performed the action.
    # Used to mark the notification as already-read for that admin while
    # keeping it unread for all other concurrent admins.
    acted_by_admin_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    is_read = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())