# backend/app/main.py
"""
G-TRISP Dashboard API — Application Entry Point
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

load_dotenv()


# ---------------------------------------------------------------------------
# Application lifespan
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Runs once on startup:
      1. Create all tables (DDL is idempotent).
      2. Seed data is managed manually via CLI — see app/seed/seed_geo.py
    """
    from sqlalchemy import text

    with engine.connect() as conn:
        conn.execute(text("SELECT pg_advisory_lock(11223344)"))
        try:
            Base.metadata.create_all(bind=engine)
        finally:
            conn.execute(text("SELECT pg_advisory_unlock(11223344)"))
            conn.commit()

    yield   # App is live


# ---------------------------------------------------------------------------
# App factory
# ---------------------------------------------------------------------------

app = FastAPI(
    title="G-TRISP Dashboard API",
    version="1.0.0",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)

# Routers
app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(dashboard.router)         # ← /api/dashboard/*
app.include_router(surat_dashboard.router)   # ← /api/surat/dashboard/*
app.include_router(geo.router)               # ← /api/geo/*

# CORS
allowed_origins = [
    x.strip()
    for x in os.getenv("ALLOWED_ORIGINS", "").split(",")
    if x.strip()
]

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

app.add_middleware(GZipMiddleware, minimum_size=1000)


# ---------------------------------------------------------------------------
# Basic health endpoints
# ---------------------------------------------------------------------------

@app.get("/api/")
def home():
    return {"message": "G-TRISP Dashboard API is running"}


@app.get("/health")
def health():
    return {"status": "healthy"}