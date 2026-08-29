import json
import logging
import os
from pathlib import Path

# pyrefly: ignore [missing-import]
from geoalchemy2.shape import from_shape
from shapely.geometry import shape as shapely_shape
from shapely.geometry import MultiLineString, LineString

from app.database import Base, engine, SessionLocal
from app.core.config import POSTGIS_SRID
from app.models.gujarat_merged_road import GujaratMergedRoad

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("seed_osm_merged")

_THIS_DIR = Path(__file__).resolve().parent
_APP_DIR = _THIS_DIR.parent
_BACKEND_DIR = _APP_DIR.parent

DATA_FILE = _BACKEND_DIR / "data" / "Gujarat_Roads_OSM_Western.geojson"
CHUNK_SIZE = 500

def run_seed():
    if not DATA_FILE.exists():
        logger.error(f"Data file not found: {DATA_FILE}")
        return

    logger.info("Dropping and recreating gujarat_merged_roads table...")
    GujaratMergedRoad.__table__.drop(engine, checkfirst=True)
    GujaratMergedRoad.__table__.create(engine)

    logger.info(f"Reading features from {DATA_FILE}...")
    
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)
    
    features = data.get("features", [])
    logger.info(f"Found {len(features)} features. Seeding...")

    session = SessionLocal()
    try:
        objects_to_insert = []
        count = 0
        
        for feature in features:
            geom_dict = feature.get("geometry")
            if not geom_dict:
                continue
                
            try:
                s_geom = shapely_shape(geom_dict)
            except Exception:
                continue

            if s_geom.is_empty:
                continue
                
            # Convert to MultiLineString if it's a LineString
            if isinstance(s_geom, LineString):
                s_geom = MultiLineString([s_geom])
            elif not isinstance(s_geom, MultiLineString):
                continue
                
            props = feature.get("properties", {})
            r_name = props.get("name", "")
            if not r_name:
                r_name = props.get("ref", "Unknown")
                
            r_class = props.get("road_classification", "Other")
            r_type = props.get("highway", "Local")

            obj = GujaratMergedRoad(
                road_name=r_name,
                road_classification=r_class,
                road_type=r_type,
                geometry=from_shape(s_geom, srid=POSTGIS_SRID)
            )
            objects_to_insert.append(obj)
            count += 1
            
            if len(objects_to_insert) >= CHUNK_SIZE:
                session.bulk_save_objects(objects_to_insert)
                session.commit()
                objects_to_insert.clear()
                if count % 10000 == 0:
                    logger.info(f"Inserted {count} features...")
        
        if objects_to_insert:
            session.bulk_save_objects(objects_to_insert)
            session.commit()
            
        logger.info(f"Successfully seeded {count} OSM merged roads!")

    except Exception as e:
        logger.error(f"Error during seeding: {e}")
        session.rollback()
    finally:
        session.close()

if __name__ == "__main__":
    run_seed()
