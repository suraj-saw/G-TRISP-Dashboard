# backend/app/core/config.py
"""
Central application configuration constants.
"""

import os
from dotenv import load_dotenv

load_dotenv()

# ---------------------------------------------------------------------------
# PostGIS / Geometry
# ---------------------------------------------------------------------------

# EPSG:4326 — WGS-84 geographic coordinate system (standard GPS lat/lon).
# All geometry columns (accident points, boundary polygons, district polygons)
# are stored using this SRID for compatibility with GeoJSON and Leaflet maps.
POSTGIS_SRID: int = int(os.getenv("POSTGIS_SRID", "4326"))