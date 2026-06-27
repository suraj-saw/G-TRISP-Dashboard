# backend/app/schemas/notification_schema.py

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict


class NotificationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    type: str
    message: str
    related_user_id: Optional[int]
    acted_by_admin_id: Optional[int]
    is_read: bool
    created_at: datetime