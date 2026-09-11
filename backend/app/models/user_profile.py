# backend/app/models/user_profile.py
# pyrefly: ignore [missing-import]
from sqlalchemy import Column, Integer, String, ForeignKey
# pyrefly: ignore [missing-import]
from sqlalchemy.orm import relationship

from app.database import Base

class UserProfile(Base):
    """
    SQLAlchemy model representing a user's extended profile information.

    Attributes:
        id (int): Primary key.
        user_id (int): Foreign key to the users table (1-to-1 relationship).
        phone_number (str): User's phone number.
        department (str): User's department or organization.
        state (str): State portion of address.
        district (str): District portion of address.
        taluka (str): Taluka portion of address.
        local_address (str): Street or local address.
    """
    __tablename__ = "user_profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    
    phone_number = Column(String, nullable=True)
    department = Column(String, nullable=True)
    state = Column(String, nullable=True)
    district = Column(String, nullable=True)
    taluka = Column(String, nullable=True)
    local_address = Column(String, nullable=True)
    post = Column(String, nullable=True)
    police_station = Column(String, nullable=True)

    # Relationship back to the User model
    user = relationship("User", back_populates="profile")
