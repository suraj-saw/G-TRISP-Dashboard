# backend/app/database.py

"""
Database Configuration and Session Management.

This module establishes the connection to the PostgreSQL database using SQLAlchemy.
It defines the database engine, the base class for ORM models, and the dependency 
generator for injecting database sessions into FastAPI route handlers.
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import (
    sessionmaker,
    declarative_base
)

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


def get_db():
    """
    FastAPI Dependency to provide a database session per request.
    
    Creates a new database session instance, yields it to the route handler, 
    and guarantees that the session is closed cleanly after the HTTP response 
    is sent, even if an exception occurs during request processing.
    
    Yields:
        sqlalchemy.orm.Session: An active SQLAlchemy database session.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()