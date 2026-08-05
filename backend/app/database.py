# backend/app/database.py

"""
Database Configuration and Session Management.

This module establishes the connection to the PostgreSQL database using SQLAlchemy.
It defines the database engine, the base class for ORM models, and the dependency 
generator for injecting database sessions into FastAPI route handlers.
"""

# pyrefly: ignore [missing-import]
from sqlalchemy import create_engine
# pyrefly: ignore [missing-import]
from sqlalchemy.orm import (
    sessionmaker,
    declarative_base
)

# pyrefly: ignore [missing-import]
from dotenv import load_dotenv
import os

load_dotenv()

# ── Database URL Configuration ───────────────────────────────────────────────
DATABASE_URL = os.getenv(
    "DATABASE_URL"
)
if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL missing"
    )

# ── Engine Initialization ────────────────────────────────────────────────────
# pool_pre_ping=True: Instructs SQLAlchemy to test database connections 
# before using them. This prevents "MySQL server has gone away" or similar 
# dropped connection errors by transparently recycling stale connections.
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True
)

# ── Session Factory ──────────────────────────────────────────────────────────
# autocommit=False: Ensures we manually commit transactions, keeping data safe.
# autoflush=False: Prevents SQLAlchemy from prematurely pushing changes to the 
# database before an explicit commit is called.
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

# Base class that all SQLAlchemy models will inherit from to form the schema registry
Base = declarative_base()


# Re-export get_db from app.core.dependencies for backwards compatibility
from app.core.dependencies import get_db  # noqa: F401