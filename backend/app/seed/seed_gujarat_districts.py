# backend/app/seed/seed_gujarat_districts.py
"""
Seeds all 33 official Gujarat district polygons (ADM2) from the GeoJSON
file into the `gujarat_districts` table.

Run directly:
    python -m app.seed.seed_gujarat_districts

Or import and call seed_gujarat_districts() from your startup / seeder entrypoint.
"""

import json
import os
from pathlib import Path

from geoalchemy2.shape import from_shape
from shapely.geometry import shape as shapely_shape

from app.database import Base, engine, SessionLocal
from app.models.gujarat_district import GujaratDistrict
from app.core.config import POSTGIS_SRID

# ---------------------------------------------------------------------------
# Resolve file paths
# ---------------------------------------------------------------------------

_THIS_DIR    = Path(__file__).resolve().parent
_APP_DIR     = _THIS_DIR.parent
_BACKEND_DIR = _APP_DIR.parent

DISTRICTS_GEOJSON = Path(
    os.getenv(
        "GUJARAT_DISTRICTS_GEOJSON",
        str(_BACKEND_DIR / "data" / "gujarat_districts.geojson"),
    )
).resolve()


# ---------------------------------------------------------------------------
# Seeder
# ---------------------------------------------------------------------------

def seed_gujarat_districts(force: bool = False) -> None:
    """
    Insert the 33 Gujarat district polygons into `gujarat_districts`.

    Parameters
    ----------
    force : bool
        If True, drop existing rows and re-seed.
        If False (default), skip when rows already exist.
    """
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    try:
        existing = db.query(GujaratDistrict).count()

        if existing > 0 and not force:
            print(
                f"[seed_gujarat_districts] Table already contains {existing} "
                "row(s). Skipping. Pass force=True to re-seed."
            )
            return

        if force and existing > 0:
            print("[seed_gujarat_districts] force=True — deleting existing rows …")
            db.query(GujaratDistrict).delete()
            db.commit()

        # ---- Load GeoJSON ------------------------------------------------
        if not DISTRICTS_GEOJSON.exists():
            raise FileNotFoundError(
                f"Gujarat districts GeoJSON not found at:\n  {DISTRICTS_GEOJSON}\n"
                "Set GUJARAT_DISTRICTS_GEOJSON env var or place the file at the "
                "default path."
            )

        print(f"[seed_gujarat_districts] Reading: {DISTRICTS_GEOJSON}")

        with DISTRICTS_GEOJSON.open("r", encoding="utf-8") as fh:
            geojson = json.load(fh)

        features = geojson.get("features", [])
        if not features:
            raise ValueError("GeoJSON contains no features.")

        print(f"[seed_gujarat_districts] Found {len(features)} district features.")

        records = []
        skipped = 0

        for feature in features:
            props     = feature.get("properties", {})
            geom_dict = feature.get("geometry")

            shape_name = props.get("shapeName", "").strip()

            if not geom_dict:
                print(f"  [WARN] Feature '{shape_name}' has no geometry — skipping.")
                skipped += 1
                continue

            if not shape_name:
                print("  [WARN] Feature with empty shapeName — skipping.")
                skipped += 1
                continue

            shp_geom     = shapely_shape(geom_dict)
            postgis_geom = from_shape(shp_geom, srid=POSTGIS_SRID)

            records.append(
                GujaratDistrict(
                    shape_name  = shape_name,
                    shape_iso   = props.get("shapeISO",   None),
                    shape_id    = props.get("shapeID",    None),
                    shape_group = props.get("shapeGroup", "IND"),
                    shape_type  = props.get("shapeType",  "ADM2"),
                    geometry    = postgis_geom,
                )
            )

        if not records:
            raise ValueError("No valid district features found to insert.")

        db.bulk_save_objects(records)
        db.commit()

        inserted = len(records)
        print(
            f"[seed_gujarat_districts] ✓ {inserted} district(s) inserted"
            + (f" ({skipped} skipped due to missing data)." if skipped else ".")
        )

    except Exception as exc:
        db.rollback()
        print(f"[seed_gujarat_districts] ERROR: {exc}")
        raise

    finally:
        db.close()


# ---------------------------------------------------------------------------
# CLI entry-point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="Seed Gujarat district polygons into the database."
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Delete existing rows and re-seed.",
    )
    args = parser.parse_args()

    seed_gujarat_districts(force=args.force)    