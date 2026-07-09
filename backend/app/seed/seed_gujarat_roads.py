"""Seed Gujarat road network from a GeoJSONL file into PostGIS.

Input file (default):
  backend/data/Gujarat_Roads.geojsonl

Environment overrides:
  GUJARAT_ROADS_GEOJSONL     path to the .geojsonl file
  GUJARAT_ROADS_SOURCE_SRID  optional source SRID for CRS normalization (default: 4326)
  SEED_BATCH_SIZE            insert batch size (default: 500)

Behaviour:
  - Reads line-delimited GeoJSON features
  - For MultiLineString features, splits into individual LineString rows
  - Stores common/tolerant attributes in dedicated columns
  - Stores remaining feature properties into a metadata column

Run:
  python -m app.seed.seed_gujarat_roads
  python -m app.seed.seed_gujarat_roads --force
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import uuid
from pathlib import Path

from geoalchemy2.shape import from_shape
from shapely.geometry import shape as shapely_shape
from shapely.geometry import MultiLineString, LineString
from shapely.ops import transform as shapely_transform
from pyproj import Transformer

from app.database import Base, engine, SessionLocal
from app.core.config import POSTGIS_SRID
from app.core.constants import DEFAULT_SEED_BATCH_SIZE
from app.models.gujarat_road import GujaratRoad

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("seed_gujarat_roads")

_THIS_DIR = Path(__file__).resolve().parent
_APP_DIR = _THIS_DIR.parent
_BACKEND_DIR = _APP_DIR.parent

DEFAULT_DATA_FILE = _BACKEND_DIR / "data" / "Gujarat_Roads.geojsonl"
DATA_FILE = Path(os.getenv("GUJARAT_ROADS_GEOJSONL", str(DEFAULT_DATA_FILE))).resolve()

SOURCE_SRID = int(os.getenv("GUJARAT_ROADS_SOURCE_SRID", str(POSTGIS_SRID)))
CHUNK_SIZE = int(os.getenv("SEED_BATCH_SIZE", str(DEFAULT_SEED_BATCH_SIZE)))


def _first_present(props: dict, keys: list[str]) -> str | None:
    for k in keys:
        if k in props and props[k] not in (None, ""):
            v = props[k]
            if isinstance(v, (int, float)):
                return str(v)
            s = str(v).strip()
            if s and s.lower() != "nan":
                return s
    return None


def _remove_keys(d: dict, keys: set[str]) -> dict:
    return {k: v for k, v in d.items() if k not in keys}


def _normalize_geometry_to_postgis_4326(geom, *, source_srid: int) -> object:
    """Normalize to EPSG:4326 if input is in a different CRS.

    If SOURCE_SRID==POSTGIS_SRID, the geometry is returned unchanged.
    """
    if geom.is_empty:
        return geom

    if int(source_srid) == int(POSTGIS_SRID):
        return geom

    transformer = Transformer.from_crs(f"EPSG:{source_srid}", f"EPSG:{POSTGIS_SRID}", always_xy=True)
    # shapely_transform expects a function (x,y,...) -> (x,y)
    def _tf(x, y, z=None):
        return transformer.transform(x, y)

    return shapely_transform(_tf, geom)


def _iter_lines_from_feature_geometry(geom) -> list[LineString]:
    if isinstance(geom, LineString):
        return [geom]

    if isinstance(geom, MultiLineString):
        # explode into individual LineStrings
        lines = [ls for ls in geom.geoms if isinstance(ls, LineString) and not ls.is_empty]
        return lines

    # GeometryCollections / other types: try best-effort extraction of LineStrings
    parts = []
    for g in getattr(geom, "geoms", []) or []:
        if isinstance(g, LineString) and not g.is_empty:
            parts.append(g)
        elif isinstance(g, MultiLineString):
            parts.extend([ls for ls in g.geoms if isinstance(ls, LineString) and not ls.is_empty])

    return parts


def _stable_source_id(props: dict) -> str:
    # Try common ID fields in order.
    candidates = [
        "id",
        "ID",
        "OBJECTID",
        "OBJECT_ID",
        "fid",
        "FID",
        "road_id",
        "ROAD_ID",
        "segment_id",
        "SEGMENT_ID",
        "unique_id",
        "UNIQUE_ID",
        "source_id",
        "SOURCE_ID",
    ]

    v = _first_present(props, candidates)
    if v:
        return str(v)

    # Last resort: deterministic-ish from sorted properties.
    # (We avoid uuid4 so reruns can be stable for the same file.)
    try:
        payload = json.dumps(props, sort_keys=True, ensure_ascii=False, default=str)
        # simple deterministic hash without extra deps
        h = abs(hash(payload))
        return f"road-{h}"
    except Exception:
        return f"road-{uuid.uuid4().hex[:12]}"


def _extract_road_attributes(props: dict) -> tuple[str | None, str | None, str | None]:
    road_name = _first_present(props, ["road_name", "ROAD_NAME", "name", "Name", "ROUTE_NAME", "RoadName"])
    road_class = _first_present(
        props,
        [
            "road_classification",
            "ROAD_CLASSIFICATION",
            "classification",
            "Classification",
            "highway",
            "HIGHWAY",
        ],
    )
    road_type = _first_present(props, ["road_type", "ROAD_TYPE", "type", "Type", "feature_type", "FEATURE_TYPE"])
    return road_name, road_class, road_type


def seed_gujarat_roads(force: bool = False) -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    try:
        existing = db.query(GujaratRoad).count()
        if existing > 0 and not force:
            logger.info("Table already has %d road(s). Skipping. Use --force to reseed.", existing)
            return

        if force and existing > 0:
            logger.info("force=True — deleting %d existing rows …", existing)
            db.query(GujaratRoad).delete()
            db.commit()

        if not DATA_FILE.exists():
            raise FileNotFoundError(
                f"Gujarat roads GeoJSONL not found at:\n  {DATA_FILE}\n"
                "Set GUJARAT_ROADS_GEOJSONL env var or place the file at the default path."
            )

        logger.info("Reading road dataset: %s", DATA_FILE)

        inserted = 0
        skipped = 0
        batch: list[GujaratRoad] = []

        with DATA_FILE.open("r", encoding="utf-8") as fh:
            for line_no, line in enumerate(fh, start=1):
                s = line.strip()
                if not s:
                    continue

                try:
                    feature = json.loads(s)
                except Exception:
                    skipped += 1
                    continue

                props = feature.get("properties", {}) or {}
                geom_dict = feature.get("geometry")
                if not geom_dict:
                    skipped += 1
                    continue

                try:
                    raw_geom = shapely_shape(geom_dict)
                except Exception:
                    skipped += 1
                    continue

                if raw_geom.is_empty:
                    skipped += 1
                    continue

                # Normalize CRS if needed
                try:
                    geom = _normalize_geometry_to_postgis_4326(raw_geom, source_srid=SOURCE_SRID)
                except Exception:
                    skipped += 1
                    continue

                lines = _iter_lines_from_feature_geometry(geom)
                if not lines:
                    skipped += 1
                    continue

                road_source_id = _stable_source_id(props)
                road_name, road_class, road_type = _extract_road_attributes(props)

                # Remove keys used for dedicated columns so metadata is cleaner.
                properties = _remove_keys(
                    props,
                    keys={
                        "geometry",
                        "road_name",
                        "ROAD_NAME",
                        "name",
                        "Name",
                        "road_classification",
                        "ROAD_CLASSIFICATION",
                        "classification",
                        "Classification",
                        "road_type",
                        "ROAD_TYPE",
                        "type",
                        "Type",
                        "id",
                        "ID",
                        "OBJECTID",
                        "OBJECT_ID",
                        "fid",
                        "FID",
                    },
                )

                for ls in lines:
                    if ls.is_empty:
                        continue

                    postgis_geom = from_shape(ls, srid=POSTGIS_SRID)
                    row = GujaratRoad(
                        road_source_id=road_source_id,
                        road_name=road_name,
                        road_classification=road_class,
                        road_type=road_type,
                        properties=properties,
                        geometry=postgis_geom,
                    )
                    batch.append(row)

                if len(batch) >= CHUNK_SIZE:
                    db.bulk_save_objects(batch)
                    db.commit()
                    inserted += len(batch)
                    batch.clear()

                if (line_no % 20000) == 0:
                    logger.info("Progress: line %d — inserted so far %d (skipped %d)", line_no, inserted, skipped)

        if batch:
            db.bulk_save_objects(batch)
            db.commit()
            inserted += len(batch)

        logger.info("✓ Roads seed complete — inserted=%d, skipped=%d", inserted, skipped)

    except Exception:
        db.rollback()
        logger.exception("Road seed failed — transaction rolled back.")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed Gujarat roads GeoJSONL into PostGIS.")
    parser.add_argument("--force", action="store_true", help="Delete existing rows and re-seed.")
    args = parser.parse_args()
    seed_gujarat_roads(force=args.force)

