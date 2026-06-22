# backend/app/main.py
"""
G-TRISP Dashboard API — Application Entry Point
"""

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from app.database import engine, Base
from app import models                          # registers all ORM models
from app.routes import auth
from app.routes import admin
from app.seed.seed_geo import run_geo_seeds     # geo seeder

load_dotenv()


# ---------------------------------------------------------------------------
# Application lifespan
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Runs once on startup:
      1. Create all tables (DDL is idempotent).
      2. Seed Gujarat boundary + districts if not already present.
    """
    # 1. DDL
    Base.metadata.create_all(bind=engine)

    # 2. Geo seeds (skips automatically if tables already populated)
    run_geo_seeds(force=False)

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

app.include_router(auth.router)
app.include_router(admin.router)

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


# ---------------------------------------------------------------------------
# Basic health endpoints
# ---------------------------------------------------------------------------

@app.get("/api/")
def home():
    return {"message": "G-TRISP Dashboard API is running"}


@app.get("/health")
def health():
    return {"status": "healthy"}