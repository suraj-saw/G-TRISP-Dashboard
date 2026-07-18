# backend/app/schemas/user_schema.py

import re
from pydantic import BaseModel, EmailStr, field_validator
from pydantic import ConfigDict
from datetime import datetime

class UserCreate(BaseModel):
    """
    Schema for validating new user registration payloads.

    Enforces strict security policies for passwords and standard formatting 
    rules for usernames before they reach the database layer.

    Attributes:
        username (str): The desired display name for the user.
        email (EmailStr): The user's valid email address.
        password (str): The raw password input, validated for cryptographic strength.
    """
    username: str
    email: EmailStr
    password: str

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        """
        Validates that the password meets minimum security strength requirements.
        Requires at least 8 characters, 1 uppercase, 1 lowercase, 1 digit, and 1 special character.
        """
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters long")
        if not re.search(r"[A-Z]", v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not re.search(r"[a-z]", v):
            raise ValueError("Password must contain at least one lowercase letter")
        if not re.search(r"\d", v):
            raise ValueError("Password must contain at least one digit")
        if not re.search(r"[!@#$%^&*(),.?\":{}|<>]", v):
            raise ValueError("Password must contain at least one special character")
        return v

    @field_validator("username")
    @classmethod
    def username_valid(cls, v: str) -> str:
        """
        Validates username length and allowed characters.
        """
        if len(v) < 3:
            raise ValueError("Username must be at least 3 characters long")
        # Fixed: Added a space to the allowed characters regex
        if not re.match(r"^[a-zA-Z0-9_ ]+$", v):
            raise ValueError("Username can only contain letters, numbers, spaces, and underscores")
        return v


class UserLogin(BaseModel):
    """
    Schema for validating user authentication payloads.
    """
    # Changed from username: str to email: EmailStr to enforce email-based logins
    email: EmailStr
    password: str


class ForgotPasswordRequest(BaseModel):
    """
    Schema for initiating a password reset flow.
    """
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    """
    Schema for validating the final step of a password reset.

    Attributes:
        token (str): The secure, time-limited token sent to the user's email.
        new_password (str): The new password to be hashed and stored.
    """
    token: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        """
        Applies the same strict security rules to password resets as new registrations.
        """
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters long")
        if not re.search(r"[A-Z]", v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not re.search(r"[a-z]", v):
            raise ValueError("Password must contain at least one lowercase letter")
        if not re.search(r"\d", v):
            raise ValueError("Password must contain at least one digit")
        if not re.search(r"[!@#$%^&*(),.?\":{}|<>]", v):
            raise ValueError("Password must contain at least one special character")
        return v


class UserResponse(BaseModel):
    """
    Schema for serializing SQLAlchemy User model instances into JSON responses.
    Excludes sensitive data like hashed passwords.
    """
    # Enables Pydantic to read data directly from SQLAlchemy ORM object attributes
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    email: str
    role: str
    status: str
    created_at: datetime