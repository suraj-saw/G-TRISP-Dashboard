# backend/app/routes/geo.py
"""
Geometry / GeoJSON endpoints.
Serves boundary polygons stored in PostGIS as standard GeoJSON so the
frontend can use them directly in MapLibre GL sources.

District boundaries are derived from ST_Union of their constituent taluka
polygons (from gujarat_talukas) rather than the raw gujarat_districts rows.
This correctly places enclaves inside the district they administratively
belong to, eliminating the "hole" artefact on the district view maps.
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
from app.models.gujarat_taluka import GujaratTaluka
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

    Geometries are computed as ST_Union of constituent talukas so that
    enclaves appear inside the district they belong to (no holes).
    Falls back to the raw gujarat_districts row if no talukas are found.
    """
    # Build a lookup: district_name (upper) -> union GeoJSON from talukas
    taluka_rows = (
        db.query(
            GujaratTaluka.district_name,
            func.ST_AsGeoJSON(
                func.ST_Multi(func.ST_Union(GujaratTaluka.geometry))
            ).label("geojson"),
        )
        .group_by(GujaratTaluka.district_name)
        .all()
    )
    taluka_geom_by_district = {
        r.district_name.upper(): r.geojson for r in taluka_rows if r.geojson
    }

    district_rows = db.query(
        GujaratDistrict.id,
        GujaratDistrict.shape_name,
        ST_AsGeoJSON(GujaratDistrict.geometry).label("geojson"),
    ).order_by(GujaratDistrict.shape_name).all()

    if not district_rows:
        raise HTTPException(status_code=404, detail="No Gujarat districts found in database")

    features = []
    for row in district_rows:
        geojson_str = (
            taluka_geom_by_district.get(row.shape_name.upper())
            or row.geojson
        )
        features.append({
            "type": "Feature",
            "id": row.id,
            "geometry": json.loads(geojson_str),
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

    The geometry is computed as ST_Union of all talukas belonging to the
    district, so enclaves (pockets of district A sitting inside district B's
    bounding box) are correctly shown as part of district A. Falls back to
    the raw gujarat_districts row if no taluka data is available.

    The `district_slug` is a URL-friendly version of the district name,
    e.g. `ahmadabad`, `the-dangs`, `kachchh`.

    Use `GET /api/geo/districts` to discover valid slugs.
    """
    # 1. Resolve the slug to a district row (for metadata)
    district_rows = db.query(
        GujaratDistrict.id,
        GujaratDistrict.shape_name,
        GujaratDistrict.shape_iso,
        GujaratDistrict.shape_id,
        GujaratDistrict.shape_type,
        ST_AsGeoJSON(GujaratDistrict.geometry).label("geojson"),
    ).all()

    matched = None
    for row in district_rows:
        if _slugify(row.shape_name) == district_slug.lower():
            matched = row
            break

    if matched is None:
        raise HTTPException(
            status_code=404,
            detail=f"District '{district_slug}' not found. "
                   f"Use GET /api/geo/districts for valid slugs.",
        )

    # 2. Try to build the boundary from the union of this district's talukas.
    #    ST_Multi ensures the result is always a MULTIPOLYGON even when the
    #    union collapses to a single Polygon (keeps the frontend type stable).
    taluka_union_row = (
        db.query(
            func.ST_AsGeoJSON(
                func.ST_Multi(func.ST_Union(GujaratTaluka.geometry))
            ).label("geojson")
        )
        .filter(GujaratTaluka.district_name.ilike(matched.shape_name))
        .scalar()
    )

    # Fall back to the raw district polygon when no talukas are seeded yet.
    geometry_geojson = taluka_union_row if taluka_union_row else matched.geojson

    feature = {
        "type": "Feature",
        "id": matched.id,
        "geometry": json.loads(geometry_geojson),
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

from app.utils.taluka_utils import list_talukas

# ---------------------------------------------------------------------------
# Talukas — cascading admin level beneath District
# ---------------------------------------------------------------------------

@router.get("/talukas", summary="List Talukas (optionally scoped to a district)")
def list_taluka_names(district: str | None = None, db: Session = Depends(get_db)):
    """
    Returns taluka name/slug pairs. Pass `?district=<name>` to power the
    cascading District → Taluka dropdown; omit it to list all talukas.
    """
    rows = list_talukas(db, district=district)
    talukas = [
        {
            "id": r.id,
            "name": r.taluka_name,
            "slug": _slugify(r.taluka_name),
            "district": r.district_name,
        }
        for r in rows
    ]
    return JSONResponse(
        content={"talukas": talukas, "count": len(talukas)},
        headers={"Cache-Control": f"public, max-age={GEO_CACHE_MAX_AGE_SECONDS}"},
    )


@router.get("/all-talukas", summary="Get All Gujarat Taluka Boundaries")
def get_all_taluka_boundaries(district: str | None = None, db: Session = Depends(get_db)):
    """
    Returns taluka polygons as one GeoJSON FeatureCollection, optionally
    filtered to a single district — mirrors /all-districts but one level
    deeper in the hierarchy.
    """
    query = db.query(
        GujaratTaluka.id,
        GujaratTaluka.taluka_name,
        GujaratTaluka.district_name,
        ST_AsGeoJSON(GujaratTaluka.geometry).label("geojson"),
    )
    if district:
        query = query.filter(GujaratTaluka.district_name.ilike(district))
    rows = query.order_by(GujaratTaluka.taluka_name).all()

    if not rows:
        raise HTTPException(status_code=404, detail="No talukas found for the given filter.")

    features = [
        {
            "type": "Feature",
            "id": row.id,
            "geometry": json.loads(row.geojson),
            "properties": {
                "name": row.taluka_name,
                "slug": _slugify(row.taluka_name),
                "district": row.district_name,
                "district_slug": _slugify(row.district_name),
            },
        }
        for row in rows
    ]

    return JSONResponse(
        content={"type": "FeatureCollection", "features": features},
        headers={"Cache-Control": f"public, max-age={GEO_CACHE_MAX_AGE_SECONDS}"},
    )


@router.get(
    "/district-boundary/{district_slug}/talukas",
    summary="Get Talukas for a District (cascading filter)",
)
def get_talukas_for_district(district_slug: str, db: Session = Depends(get_db)):
    """Resolves `district_slug` against gujarat_districts, then returns its talukas."""
    rows = db.query(GujaratTaluka.district_name).distinct().all()
    matched_district = next(
        (r[0] for r in rows if _slugify(r[0]) == district_slug.lower()), None
    )
    if matched_district is None:
        raise HTTPException(
            status_code=404,
            detail=f"No talukas found for district slug '{district_slug}'.",
        )
    return list_taluka_names(district=matched_district, db=db)


@router.get("/taluka-boundary/{taluka_slug}", summary="Get Taluka Boundary")
def get_taluka_boundary(taluka_slug: str, db: Session = Depends(get_db)):
    rows = db.query(
        GujaratTaluka.id,
        GujaratTaluka.taluka_name,
        GujaratTaluka.district_name,
        ST_AsGeoJSON(GujaratTaluka.geometry).label("geojson"),
    ).all()

    matched = next((r for r in rows if _slugify(r.taluka_name) == taluka_slug.lower()), None)
    if matched is None:
        raise HTTPException(
            status_code=404,
            detail=f"Taluka '{taluka_slug}' not found. Use GET /api/geo/talukas for valid slugs.",
        )

    feature = {
        "type": "Feature",
        "id": matched.id,
        "geometry": json.loads(matched.geojson),
        "properties": {
            "name": matched.taluka_name,
            "slug": _slugify(matched.taluka_name),
            "district": matched.district_name,
        },
    }
    return JSONResponse(
        content={"type": "FeatureCollection", "features": [feature]},
        headers={"Cache-Control": f"public, max-age={GEO_CACHE_MAX_AGE_SECONDS}"},
    )