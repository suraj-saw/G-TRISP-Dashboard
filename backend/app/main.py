# backend/app/main.py

"""
G-TRISP Dashboard API — Application Entry Point.

This module initializes the FastAPI application instance, configures global 
middleware (CORS, GZip), registers all API routers, and manages the application 
lifecycle (e.g., database table initialization on startup).
"""

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from dotenv import load_dotenv

from app.database import engine, Base
from app import models                          # registers all ORM models
from app.routes import auth
from app.routes import admin
from app.routes import dashboard              
from app.routes import surat_dashboard         
from app.routes import geo
from app.routes import surat_accidents_admin 
from app.routes import surat_export  

load_dotenv()


# ---------------------------------------------------------------------------
# Application lifespan
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Manages the startup and shutdown lifecycle events of the FastAPI application.
    
    Startup tasks:
      1. Acquires a Postgres advisory lock to ensure that if multiple workers/pods
         start simultaneously, only one attempts to create the tables.
      2. Creates all database tables via SQLAlchemy's `create_all` (DDL is idempotent).
      3. Releases the lock.
      
    Note: Seed data is managed manually via CLI (see app/seed/seed_geo.py), not here.
    
    Args:
        app (FastAPI): The running FastAPI application instance.
    """
    from sqlalchemy import text

    with engine.connect() as conn:
        # Acquire an exclusive session-level lock (arbitrary ID: 11223344) 
        # to prevent race conditions during schema creation in multi-worker environments.
        conn.execute(text("SELECT pg_advisory_lock(11223344)"))
        try:
            Base.metadata.create_all(bind=engine)
        finally:
            # Always ensure the lock is released even if table creation fails
            conn.execute(text("SELECT pg_advisory_unlock(11223344)"))
            conn.commit()

    yield   # Yield control back to FastAPI; App is live


# ---------------------------------------------------------------------------
# App factory
# ---------------------------------------------------------------------------

# Initialize the core FastAPI application
app = FastAPI(
    title="G-TRISP Dashboard API",
    version="1.0.0",
    docs_url="/api/docs",           # Swagger UI endpoint
    openapi_url="/api/openapi.json", # OpenAPI schema endpoint
    lifespan=lifespan,
)

# ── Router Registration ─────────────────────────────────────────────────────
# Mount modular routers from app.routes onto the main application
app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(dashboard.router)         # ← /api/dashboard/*
app.include_router(surat_dashboard.router)   # ← /api/surat/dashboard/*
app.include_router(geo.router)               # ← /api/geo/*
app.include_router(surat_accidents_admin.router)
app.include_router(surat_export.router) 

# ── CORS Configuration ──────────────────────────────────────────────────────
# Parse allowed origins from environment variables, removing empty strings/spaces
allowed_origins = [
    x.strip()
    for x in os.getenv("ALLOWED_ORIGINS", "").split(",")
    if x.strip()
]

# Fail fast if CORS is not explicitly configured to prevent insecure defaults
if not allowed_origins:
    raise RuntimeError(
        "ALLOWED_ORIGINS is not set. "
        "Example: ALLOWED_ORIGINS=http://localhost:5173"
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Response Compression ────────────────────────────────────────────────────
# Compress HTTP responses larger than 1000 bytes to reduce bandwidth, 
# especially useful for large JSON payloads from the dashboard/geo endpoints.
app.add_middleware(GZipMiddleware, minimum_size=1000)


# ---------------------------------------------------------------------------
# Basic health endpoints
# ---------------------------------------------------------------------------

@app.get("/api/")
def home():
    """
    Root API endpoint to verify routing is working.
    
    Returns:
        dict: A welcome message indicating the API is reachable.
    """
    return {"message": "G-TRISP Dashboard API is running"}


@app.get("/health")
def health():
    """
    Health check endpoint for load balancers and container orchestrators (e.g., Kubernetes).
    
    Returns:
        dict: A simple status dictionary.
    """
    return {"status": "healthy"}