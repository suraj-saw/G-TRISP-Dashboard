# backend/app/routes/geo.py
"""
Geometry / GeoJSON endpoints.
Serves boundary polygons stored in PostGIS as standard GeoJSON so the
frontend can use them directly in MapLibre GL sources.
"""

import json
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from geoalchemy2.functions import ST_AsGeoJSON

from app.database import get_db
from app.models.surat_boundary import SuratBoundary

router = APIRouter(prefix="/api/geo", tags=["Geo"])


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
        headers={"Cache-Control": "public, max-age=86400"},  # cache for 1 day
    )