# backend/app/seed/seed_gujarat_districts.py
"""
Seeds all 33 Gujarat district polygons into the `gujarat_districts` table.

Supports both:
    • geoBoundaries GeoJSON
    • Survey of India (SOI) GeoJSON

Run directly:
    python -m app.seed.seed_gujarat_districts

Or import and call:
    seed_gujarat_districts(force=True)
"""

import json
import os
from pathlib import Path

from geoalchemy2.shape import from_shape
from shapely.geometry import shape as shapely_shape

from app.database import Base, engine, SessionLocal
from app.models.gujarat_district import GujaratDistrict
from app.core.config import POSTGIS_SRID
from app.seed.geojson_geometry import SOI_SOURCE_SRID, normalize_gujarat_geometry


# ---------------------------------------------------------------------------
# Resolve file paths
# ---------------------------------------------------------------------------

_THIS_DIR = Path(__file__).resolve().parent
_APP_DIR = _THIS_DIR.parent
_BACKEND_DIR = _APP_DIR.parent

DISTRICTS_GEOJSON = Path(
    os.getenv(
        "GUJARAT_DISTRICTS_GEOJSON",
        str(_BACKEND_DIR / "data" / "gujarat_districts_soi.geojson"),
    )
).resolve()
DISTRICTS_SOURCE_SRID = int(
    os.getenv("GUJARAT_DISTRICTS_SOURCE_SRID", str(SOI_SOURCE_SRID))
)


# ---------------------------------------------------------------------------
# Seeder
# ---------------------------------------------------------------------------

def seed_gujarat_districts(force: bool = False) -> None:
    """
    Insert Gujarat district polygons into `gujarat_districts`.

    Parameters
    ----------
    force : bool
        If True, delete existing rows before inserting.
    """

    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    try:
        existing = db.query(GujaratDistrict).count()

        if existing > 0 and not force:
            print(
                f"[seed_gujarat_districts] Table already contains "
                f"{existing} row(s). Skipping."
            )
            return

        if force and existing > 0:
            print("[seed_gujarat_districts] force=True — deleting existing rows...")
            db.query(GujaratDistrict).delete()
            db.commit()

        # ------------------------------------------------------------------
        # Read GeoJSON
        # ------------------------------------------------------------------

        if not DISTRICTS_GEOJSON.exists():
            raise FileNotFoundError(
                f"Gujarat districts GeoJSON not found:\n{DISTRICTS_GEOJSON}"
            )

        print(f"[seed_gujarat_districts] Reading: {DISTRICTS_GEOJSON}")

        with DISTRICTS_GEOJSON.open("r", encoding="utf-8") as f:
            geojson = json.load(f)

        features = geojson.get("features", [])

        if not features:
            raise ValueError("GeoJSON contains no features.")

        print(f"[seed_gujarat_districts] Found {len(features)} district(s).")

        records = []
        skipped = 0

        # ------------------------------------------------------------------
        # Process every feature
        # ------------------------------------------------------------------

        for feature in features:

            props = feature.get("properties", {})
            geom_dict = feature.get("geometry")

            # --------------------------------------------------------------
            # District Name
            # geoBoundaries : shapeName
            # SOI           : DISTRICT
            # --------------------------------------------------------------

            shape_name = (
                props.get("shapeName")
                or props.get("DISTRICT")
                or ""
            ).strip()

            if not geom_dict:
                print(
                    f"[WARN] District '{shape_name}' has no geometry. Skipping."
                )
                skipped += 1
                continue

            if not shape_name:
                print(
                    "[WARN] Feature has no district name. Skipping."
                )
                skipped += 1
                continue

            shp_geom = normalize_gujarat_geometry(
                shapely_shape(geom_dict), source_srid=DISTRICTS_SOURCE_SRID
            )
            postgis_geom = from_shape(
                shp_geom,
                srid=POSTGIS_SRID,
            )

            # --------------------------------------------------------------
            # Common attributes supporting both datasets
            # --------------------------------------------------------------

            shape_iso = (
                props.get("shapeISO")
                or f"IN-GJ-{props.get('DIST_LGD')}"
            )

            shape_id = (
                props.get("shapeID")
                or props.get("DIST_LGD")
                or props.get("OBJECTID_1")
            )

            shape_group = (
                props.get("shapeGroup")
                or "IND"
            )

            shape_type = (
                props.get("shapeType")
                or "ADM2"
            )

            records.append(
                GujaratDistrict(
                    shape_name=shape_name,
                    shape_iso=shape_iso,
                    shape_id=shape_id,
                    shape_group=shape_group,
                    shape_type=shape_type,
                    geometry=postgis_geom,
                )
            )

        if not records:
            raise ValueError("No valid district features found.")

        db.bulk_save_objects(records)
        db.commit()

        print(
            f"[seed_gujarat_districts] ✓ Inserted {len(records)} district(s)"
            + (
                f" ({skipped} skipped)."
                if skipped
                else "."
            )
        )

    except Exception as exc:
        db.rollback()
        print(f"[seed_gujarat_districts] ERROR: {exc}")
        raise

    finally:
        db.close()


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

if __name__ == "__main__":

    import argparse

    parser = argparse.ArgumentParser(
        description="Seed Gujarat district polygons."
    )

    parser.add_argument(
        "--force",
        action="store_true",
        help="Delete existing rows before inserting.",
    )

    args = parser.parse_args()

    seed_gujarat_districts(force=args.force)
