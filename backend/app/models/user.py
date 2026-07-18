# backend/app/models/user.py
from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.sql import func

from app.database import Base


class User(Base):
    """
    SQLAlchemy model representing a system user.

    This model stores core authentication credentials, user role assignments, 
    and account moderation states.

    Attributes:
        id (int): Primary key and indexed identifier for the user.
        username (str): Unique, indexed username required for login. Cannot be null.
        email (str): Unique, indexed email address for communications. Cannot be null.
        hashed_password (str): Securely hashed password string. Cannot be null.
        role (str): Access control role (e.g., "user", "admin"). Defaults to "user".
        status (str): Account moderation status ("pending", "approved", "rejected"). Defaults to "pending".
        created_at (datetime): Timezone-aware timestamp indicating when the user account was created.
    """
    __tablename__ = "users"

    # Core identification fields
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, nullable=False, index=True)
    
    # Security credentials
    hashed_password = Column(String, nullable=False)
    
    # Authorization and RBAC (Role-Based Access Control)
    role = Column(String, nullable=False, default="user")

    # Account moderation lifecycle state: pending | approved | rejected
    status = Column(String, nullable=False, default="pending")

    # Audit logging timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())