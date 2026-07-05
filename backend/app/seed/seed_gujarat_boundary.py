# backend/app/seed/seed_gujarat_boundary.py
"""
Seeds the official Gujarat state boundary (ADM1, MultiPolygon) from
the GeoJSON file into the `gujarat_boundary` table.

Run directly:
    python -m app.seed.seed_gujarat_boundary

Or import and call seed_gujarat_boundary() from your startup / seeder entrypoint.
"""

import json
import os
from pathlib import Path

from geoalchemy2.shape import from_shape
from shapely.geometry import shape as shapely_shape

from app.database import Base, engine, SessionLocal
from app.models.gujarat_boundary import GujaratBoundary
from app.core.config import POSTGIS_SRID
from app.seed.geojson_geometry import SOI_SOURCE_SRID, normalize_gujarat_geometry

# ---------------------------------------------------------------------------
# Resolve file paths
# ---------------------------------------------------------------------------

_THIS_DIR    = Path(__file__).resolve().parent          # app/seed/
_APP_DIR     = _THIS_DIR.parent                         # app/
_BACKEND_DIR = _APP_DIR.parent                         # backend/

# Allow override via env var; default to the bundled data/ directory
BOUNDARY_GEOJSON = Path(
    os.getenv(
        "GUJARAT_BOUNDARY_GEOJSON",
        str(_BACKEND_DIR / "data" / "gujarat_boundary_soi.geojson"),
    )
).resolve()
BOUNDARY_SOURCE_SRID = int(
    os.getenv("GUJARAT_BOUNDARY_SOURCE_SRID", str(SOI_SOURCE_SRID))
)


# ---------------------------------------------------------------------------
# Seeder
# ---------------------------------------------------------------------------

def seed_gujarat_boundary(force: bool = False) -> None:
    """
    Insert the Gujarat state boundary into `gujarat_boundary`.

    Parameters
    ----------
    force : bool
        If True, drop existing rows and re-seed.
        If False (default), skip seeding when a row already exists.
    """
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    try:
        existing = db.query(GujaratBoundary).count()

        if existing > 0 and not force:
            print(
                f"[seed_gujarat_boundary] Table already contains {existing} "
                "row(s). Skipping. Pass force=True to re-seed."
            )
            return

        if force and existing > 0:
            print("[seed_gujarat_boundary] force=True — deleting existing rows …")
            db.query(GujaratBoundary).delete()
            db.commit()

        # ---- Load GeoJSON ------------------------------------------------
        if not BOUNDARY_GEOJSON.exists():
            raise FileNotFoundError(
                f"Gujarat boundary GeoJSON not found at:\n  {BOUNDARY_GEOJSON}\n"
                "Set GUJARAT_BOUNDARY_GEOJSON env var or place the file at the "
                "default path."
            )

        print(f"[seed_gujarat_boundary] Reading: {BOUNDARY_GEOJSON}")

        with BOUNDARY_GEOJSON.open("r", encoding="utf-8") as fh:
            geojson = json.load(fh)

        features = geojson.get("features", [])
        if not features:
            raise ValueError("GeoJSON contains no features.")

        # The boundary file has exactly 1 feature (Gujarat state)
        feature    = features[0]
        props      = feature.get("properties", {})
        geom_dict  = feature["geometry"]

        # Convert to Shapely then to PostGIS WKBElement
        shp_geom = normalize_gujarat_geometry(
            shapely_shape(geom_dict), source_srid=BOUNDARY_SOURCE_SRID
        )
        postgis_geom = from_shape(shp_geom, srid=POSTGIS_SRID)

        record = GujaratBoundary(
            shape_name=(
                props.get("shapeName")
                or props.get("STATE")
                or "GUJARAT"
            ),
            shape_iso=props.get("shapeISO", "IN-GJ"),
            shape_id=(
                props.get("shapeID")
                or props.get("OBJECTID")
            ),
            shape_group=props.get("shapeGroup", "IND"),
            shape_type=props.get("shapeType", "ADM1"),
            geometry=postgis_geom,
        )

        db.add(record)
        db.commit()

        print("[seed_gujarat_boundary] ✓ Gujarat boundary seeded successfully.")

    except Exception as exc:
        db.rollback()
        print(f"[seed_gujarat_boundary] ERROR: {exc}")
        raise

    finally:
        db.close()


# ---------------------------------------------------------------------------
# CLI entry-point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="Seed the Gujarat state boundary into the database."
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Delete existing rows and re-seed.",
    )
    args = parser.parse_args()

    seed_gujarat_boundary(force=args.force)
