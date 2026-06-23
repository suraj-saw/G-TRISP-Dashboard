# backend/app/seed/seed_surat_boundary.py
"""
Seeds the official Surat district boundary (ADM2, Polygon) from
the GeoJSON file into the `surat_boundary` table.

Run directly:
    python -m app.seed.seed_surat_boundary
"""

import json
import os
from pathlib import Path

from geoalchemy2.shape import from_shape
from shapely.geometry import shape as shapely_shape

from app.database import Base, engine, SessionLocal
from app.models.surat_boundary import SuratBoundary
from app.core.config import POSTGIS_SRID

# Resolve file paths
_THIS_DIR    = Path(__file__).resolve().parent
_APP_DIR     = _THIS_DIR.parent
_BACKEND_DIR = _APP_DIR.parent

SURAT_BOUNDARY_GEOJSON = Path(
    os.getenv(
        "SURAT_BOUNDARY_GEOJSON",
        str(_BACKEND_DIR / "data" / "surat_district_boundary.geojson"),
    )
).resolve()


def seed_surat_boundary(force: bool = False) -> None:
    """
    Insert the Surat district boundary into `surat_boundary`.
    """
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    try:
        existing = db.query(SuratBoundary).count()

        if existing > 0 and not force:
            print(
                f"[seed_surat_boundary] Table already contains {existing} "
                "row(s). Skipping. Pass force=True to re-seed."
            )
            return

        if force and existing > 0:
            print("[seed_surat_boundary] force=True — deleting existing rows …")
            db.query(SuratBoundary).delete()
            db.commit()

        if not SURAT_BOUNDARY_GEOJSON.exists():
            raise FileNotFoundError(
                f"Surat boundary GeoJSON not found at:\n  {SURAT_BOUNDARY_GEOJSON}"
            )

        print(f"[seed_surat_boundary] Reading: {SURAT_BOUNDARY_GEOJSON}")

        with SURAT_BOUNDARY_GEOJSON.open("r", encoding="utf-8") as fh:
            geojson = json.load(fh)

        features = geojson.get("features", [])
        if not features:
            raise ValueError("GeoJSON contains no features.")

        feature    = features[0]
        props      = feature.get("properties", {})
        geom_dict  = feature["geometry"]

        shp_geom     = shapely_shape(geom_dict)
        postgis_geom = from_shape(shp_geom, srid=POSTGIS_SRID)

        record = SuratBoundary(
            shape_name  = props.get("shapeName",  "Surat"),
            shape_iso   = props.get("shapeISO",   ""),
            shape_id    = props.get("shapeID",    None),
            shape_group = props.get("shapeGroup", "IND"),
            shape_type  = props.get("shapeType",  "ADM2"),
            geometry    = postgis_geom,
        )

        db.add(record)
        db.commit()

        print("[seed_surat_boundary] ✓ Surat boundary seeded successfully.")

    except Exception as exc:
        db.rollback()
        print(f"[seed_surat_boundary] ERROR: {exc}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="Seed the Surat district boundary into the database."
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Delete existing rows and re-seed.",
    )
    args = parser.parse_args()

    seed_surat_boundary(force=args.force)