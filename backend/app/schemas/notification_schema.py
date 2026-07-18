# backend/app/schemas/notification_schema.py

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict


class NotificationResponse(BaseModel):
    """
    Schema for serializing SQLAlchemy Notification model instances into JSON responses.
    
    Attributes:
        id (int): The unique notification ID.
        type (str): The event category (e.g., "user_registration").
        message (str): The human-readable notification payload.
        related_user_id (int, optional): The user this notification pertains to.
        acted_by_admin_id (int, optional): The admin who processed this notification.
        is_read (bool): The global read-status flag.
        created_at (datetime): Timestamp of notification creation.
    """
    # Enables ORM attribute extraction
    model_config = ConfigDict(from_attributes=True)

    id: int
    type: str
    message: str
    related_user_id: Optional[int]
    acted_by_admin_id: Optional[int]
    is_read: bool
    created_at: datetime