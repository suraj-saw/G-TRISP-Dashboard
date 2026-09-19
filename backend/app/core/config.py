# backend/app/core/config.py
"""
Central application configuration constants.
"""

import os
# pyrefly: ignore [missing-import]
from dotenv import load_dotenv

load_dotenv()

# ---------------------------------------------------------------------------
# Project Branding & Identity
# Single source of truth for dashboard name, API title, and team labels.
# ---------------------------------------------------------------------------
PROJECT_NAME: str = os.getenv("PROJECT_NAME", "ASTRA")
PROJECT_DISPLAY_NAME: str = os.getenv("PROJECT_DISPLAY_NAME", "ASTRA (अस्त्र)")
APP_TITLE: str = os.getenv("APP_TITLE", "ASTRA Dashboard API")
PROJECT_FULL_NAME: str = os.getenv(
    "PROJECT_FULL_NAME", "Advance Spatiotemporal Traffic Risk Analytics"
)
TEAM_NAME: str = os.getenv("TEAM_NAME", "ASTRA Team")

# ---------------------------------------------------------------------------
# PostGIS / Geometry
# ---------------------------------------------------------------------------

# EPSG:4326 — WGS-84 geographic coordinate system (standard GPS lat/lon).
# All geometry columns (accident points, boundary polygons, district polygons)
# are stored using this SRID for compatibility with GeoJSON and Leaflet maps.
POSTGIS_SRID: int = int(os.getenv("POSTGIS_SRID", "4326"))