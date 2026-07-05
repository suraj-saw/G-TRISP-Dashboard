# backend/app/seed/seed_gujarat_talukas.py
"""
Seeds Gujarat Taluka (Subdistrict) polygons into `gujarat_talukas`.

Source: Survey of India (SOI) Gujarat Taluka GeoJSON. The source file is
never modified. Instead:

  1. Every feature's geometry is validated.
  2. Invalid geometries are auto-repaired via Shapely (make_valid, then
     buffer(0) as a fallback).
  3. Repaired/valid geometries are normalised to MULTIPOLYGON.
  4. Only features that cannot be repaired are skipped — logged, not fatal.
  5. Seeding continues for all remaining features (fault tolerant).

Run directly:
    python -m app.seed.seed_gujarat_talukas
    python -m app.seed.seed_gujarat_talukas --force
"""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path

from geoalchemy2.shape import from_shape
from shapely.geometry import shape as shapely_shape

from app.database import Base, engine, SessionLocal
from app.models.gujarat_taluka import GujaratTaluka
from app.core.config import POSTGIS_SRID
from app.seed.geojson_geometry import (
    SOI_SOURCE_SRID,
    normalize_gujarat_geometry,
    repair_geometry,
    to_multipolygon,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("seed_gujarat_talukas")

# ---------------------------------------------------------------------------
# File config
# ---------------------------------------------------------------------------

_THIS_DIR    = Path(__file__).resolve().parent
_APP_DIR     = _THIS_DIR.parent
_BACKEND_DIR = _APP_DIR.parent

TALUKAS_GEOJSON = Path(
    os.getenv(
        "GUJARAT_TALUKAS_GEOJSON",
        str(_BACKEND_DIR / "data" / "gujarat_subdistricts_soi.geojson"),
    )
).resolve()

TALUKAS_SOURCE_SRID = int(
    os.getenv("GUJARAT_TALUKAS_SOURCE_SRID", str(SOI_SOURCE_SRID))
)


# ---------------------------------------------------------------------------
# Property extraction — tolerant of the various SOI export key spellings
# ---------------------------------------------------------------------------

def _first_present(props: dict, *keys: str) -> str | None:
    for key in keys:
        value = props.get(key)
        if value not in (None, ""):
            return str(value).strip()
    return None


def _extract_fields(props: dict) -> dict:
    return {
        "taluka_name": _first_present(
            props, "TALUKA", "SUB_DIST", "SUBDIST", "subDistrictName", "shapeName", "NAME"
        ),
        "taluka_lgd_code": _first_present(
            props, "SUBDIS_LGD", "SUBDIST_LGD", "TALUKA_LGD", "subDistrictCode", "shapeID"
        ),
        "district_name": _first_present(props, "DISTRICT", "District", "districtName"),
        "district_lgd_code": _first_present(props, "DIST_LGD", "districtCode"),
        "state_name": _first_present(props, "STATE", "stateName") or "Gujarat",
        "state_lgd_code": _first_present(props, "STATE_LGD", "stateCode"),
        "shape_iso": _first_present(props, "shapeISO"),
        "shape_group": _first_present(props, "shapeGroup") or "IND",
        "shape_type": _first_present(props, "shapeType") or "ADM3",
    }


# ---------------------------------------------------------------------------
# Seeder
# ---------------------------------------------------------------------------

def seed_gujarat_talukas(force: bool = False) -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    try:
        existing = db.query(GujaratTaluka).count()
        if existing > 0 and not force:
            logger.info(
                "Table already contains %d row(s). Skipping. Pass force=True to re-seed.",
                existing,
            )
            return

        if force and existing > 0:
            logger.info("force=True — deleting %d existing rows …", existing)
            db.query(GujaratTaluka).delete()
            db.commit()

        if not TALUKAS_GEOJSON.exists():
            raise FileNotFoundError(
                f"Gujarat talukas GeoJSON not found:\n  {TALUKAS_GEOJSON}\n"
                "Set GUJARAT_TALUKAS_GEOJSON env var or place the file at the default path."
            )

        logger.info("Reading dataset: %s", TALUKAS_GEOJSON)
        with TALUKAS_GEOJSON.open("r", encoding="utf-8") as fh:
            geojson = json.load(fh)

        features = geojson.get("features", [])
        if not features:
            raise ValueError("GeoJSON contains no features.")

        logger.info("Found %d taluka feature(s) in source file.", len(features))

        records: list[GujaratTaluka] = []
        repaired_count = 0
        skipped_count = 0

        for idx, feature in enumerate(features):
            props = feature.get("properties", {}) or {}
            geom_dict = feature.get("geometry")
            fields = _extract_fields(props)
            label = fields["taluka_name"] or f"feature #{idx}"

            if not geom_dict:
                logger.warning("[SKIP] %s — no geometry present.", label)
                skipped_count += 1
                continue

            if not fields["taluka_name"] or not fields["district_name"]:
                logger.warning(
                    "[SKIP] %s — missing taluka or district name in properties.", label
                )
                skipped_count += 1
                continue

            try:
                raw_geom = shapely_shape(geom_dict)
            except Exception as exc:
                logger.warning("[SKIP] %s — could not parse geometry: %s", label, exc)
                skipped_count += 1
                continue

            was_invalid = not raw_geom.is_valid

            # 1. Repair (only if actually invalid)
            geom = raw_geom if raw_geom.is_valid else repair_geometry(raw_geom)
            if geom is None:
                logger.warning(
                    "[SKIP] %s — geometry is invalid and could not be repaired.", label
                )
                skipped_count += 1
                continue

            # 2. CRS normalisation + Gujarat-bounds sanity check
            try:
                geom = normalize_gujarat_geometry(geom, source_srid=TALUKAS_SOURCE_SRID)
            except Exception as exc:
                logger.warning(
                    "[SKIP] %s — failed CRS/bounds validation: %s", label, exc
                )
                skipped_count += 1
                continue

            # 3. Re-validate post-transform (CRS transform can occasionally
            #    introduce degenerate rings) and repair again if needed
            if not geom.is_valid:
                geom = repair_geometry(geom)
                if geom is None:
                    logger.warning(
                        "[SKIP] %s — invalid after CRS normalisation and "
                        "could not be repaired.",
                        label,
                    )
                    skipped_count += 1
                    continue

            # 4. Normalise to MULTIPOLYGON
            multi_geom = to_multipolygon(geom)
            if multi_geom is None:
                logger.warning(
                    "[SKIP] %s — no polygonal parts remained after repair.", label
                )
                skipped_count += 1
                continue

            if was_invalid:
                repaired_count += 1
                logger.info("[REPAIRED] %s", label)

            records.append(
                GujaratTaluka(
                    taluka_name=fields["taluka_name"],
                    taluka_lgd_code=fields["taluka_lgd_code"],
                    district_name=fields["district_name"],
                    district_lgd_code=fields["district_lgd_code"],
                    state_name=fields["state_name"],
                    state_lgd_code=fields["state_lgd_code"],
                    shape_iso=fields["shape_iso"],
                    shape_group=fields["shape_group"],
                    shape_type=fields["shape_type"],
                    geometry=from_shape(multi_geom, srid=POSTGIS_SRID),
                )
            )

        if not records:
            raise ValueError("No valid taluka features could be seeded.")

        db.bulk_save_objects(records)
        db.commit()

        logger.info(
            "✓ Seed complete — inserted %d taluka(s) (%d repaired, %d skipped of %d total).",
            len(records), repaired_count, skipped_count, len(features),
        )

    except Exception:
        db.rollback()
        logger.exception("Seed failed — transaction rolled back.")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="Seed Gujarat taluka (subdistrict) polygons into the database."
    )
    parser.add_argument("--force", action="store_true", help="Delete existing rows and re-seed.")
    args = parser.parse_args()

    seed_gujarat_talukas(force=args.force)