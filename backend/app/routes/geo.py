# backend/app/routes/geo.py
"""
Geometry / GeoJSON endpoints.
Serves boundary polygons stored in PostGIS as standard GeoJSON so the
frontend can use them directly in MapLibre GL sources.
"""

import json
import re

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy import func
from sqlalchemy.orm import Session
from geoalchemy2.functions import ST_AsGeoJSON

from app.database import get_db
from app.models.surat_boundary import SuratBoundary
from app.models.gujarat_district import GujaratDistrict
from app.core.constants import GEO_PREFIX, GEO_CACHE_MAX_AGE_SECONDS

router = APIRouter(prefix=GEO_PREFIX, tags=["Geo"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _slugify(name: str) -> str:
    """Convert a district name to a URL-friendly slug.
    e.g. "The Dangs" → "the-dangs", "Ahmadabad" → "ahmadabad"
    """
    s = name.strip().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)   # replace non-alphanumeric with hyphen
    return s.strip("-")


# ---------------------------------------------------------------------------
# Surat boundary
# ---------------------------------------------------------------------------

@router.get("/surat-boundary")
def get_surat_boundary(db: Session = Depends(get_db)):
    """
    Returns the Surat district boundary as a GeoJSON FeatureCollection.
    The geometry is reprojected to EPSG:4326 (WGS-84) by ST_AsGeoJSON.
    """
    rows = db.query(
        SuratBoundary.id,
        SuratBoundary.shape_name,
        ST_AsGeoJSON(SuratBoundary.geometry).label("geojson"),
    ).all()

    if not rows:
        raise HTTPException(status_code=404, detail="Surat boundary not found in database")

    features = []
    for row in rows:
        features.append({
            "type": "Feature",
            "id": row.id,
            "geometry": json.loads(row.geojson),
            "properties": {
                "name": row.shape_name,
            },
        })

    return JSONResponse(
        content={
            "type": "FeatureCollection",
            "features": features,
        },
        headers={
            "Cache-Control": f"public, max-age={GEO_CACHE_MAX_AGE_SECONDS}",
        },
    )


# ---------------------------------------------------------------------------
# ALL Gujarat district boundaries in one request — used by the Gujarat
# overview map so we don't do 33 separate fetches.
# ---------------------------------------------------------------------------

@router.get("/all-districts", summary="Get All Gujarat District Boundaries")
def get_all_district_boundaries(db: Session = Depends(get_db)):
    """
    Returns every Gujarat district polygon as a single GeoJSON
    FeatureCollection. Each feature's properties include `name` and `slug`
    so the frontend can match it against `/api/dashboard/by-district`
    counts and route to `/dashboard/district/{slug}` on click.
    """
    rows = db.query(
        GujaratDistrict.id,
        GujaratDistrict.shape_name,
        ST_AsGeoJSON(GujaratDistrict.geometry).label("geojson"),
    ).order_by(GujaratDistrict.shape_name).all()

    if not rows:
        raise HTTPException(status_code=404, detail="No Gujarat districts found in database")

    features = []
    for row in rows:
        features.append({
            "type": "Feature",
            "id": row.id,
            "geometry": json.loads(row.geojson),
            "properties": {
                "name": row.shape_name,
                "slug": _slugify(row.shape_name),
            },
        })

    return JSONResponse(
        content={
            "type": "FeatureCollection",
            "features": features,
        },
        headers={
            "Cache-Control": f"public, max-age={GEO_CACHE_MAX_AGE_SECONDS}",
        },
    )


# ---------------------------------------------------------------------------
# Gujarat district list
# ---------------------------------------------------------------------------

@router.get("/districts", summary="List Gujarat Districts")
def list_districts(db: Session = Depends(get_db)):
    """
    Returns all 33 Gujarat districts with their slug identifiers.
    Use the slug in `/api/geo/district-boundary/{district_slug}`.
    """
    rows = (
        db.query(GujaratDistrict.id, GujaratDistrict.shape_name)
        .order_by(GujaratDistrict.shape_name)
        .all()
    )

    districts = [
        {
            "id": row.id,
            "name": row.shape_name,
            "slug": _slugify(row.shape_name),
        }
        for row in rows
    ]

    return JSONResponse(
        content={"districts": districts, "count": len(districts)},
        headers={
            "Cache-Control": f"public, max-age={GEO_CACHE_MAX_AGE_SECONDS}",
        },
    )


# ---------------------------------------------------------------------------
# District boundary by slug
# ---------------------------------------------------------------------------

@router.get(
    "/district-boundary/{district_slug}",
    summary="Get District Boundary",
)
def get_district_boundary(district_slug: str, db: Session = Depends(get_db)):
    """
    Returns the boundary polygon for a single Gujarat district as GeoJSON.

    The `district_slug` is a URL-friendly version of the district name,
    e.g. `ahmadabad`, `the-dangs`, `kachchh`.

    Use `GET /api/geo/districts` to discover valid slugs.
    """
    rows = db.query(
        GujaratDistrict.id,
        GujaratDistrict.shape_name,
        GujaratDistrict.shape_iso,
        GujaratDistrict.shape_id,
        GujaratDistrict.shape_type,
        ST_AsGeoJSON(GujaratDistrict.geometry).label("geojson"),
    ).all()

    matched = None
    for row in rows:
        if _slugify(row.shape_name) == district_slug.lower():
            matched = row
            break

    if matched is None:
        raise HTTPException(
            status_code=404,
            detail=f"District '{district_slug}' not found. "
                   f"Use GET /api/geo/districts for valid slugs.",
        )

    feature = {
        "type": "Feature",
        "id": matched.id,
        "geometry": json.loads(matched.geojson),
        "properties": {
            "name": matched.shape_name,
            "slug": _slugify(matched.shape_name),
            "shape_iso": matched.shape_iso,
            "shape_id": matched.shape_id,
            "shape_type": matched.shape_type,
        },
    }

    return JSONResponse(
        content={
            "type": "FeatureCollection",
            "features": [feature],
        },
        headers={
            "Cache-Control": f"public, max-age={GEO_CACHE_MAX_AGE_SECONDS}",
        },
    )