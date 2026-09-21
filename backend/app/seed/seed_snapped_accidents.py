"""
Standalone script to compute and persist snapped accident locations.
This script performs a high-performance spatial cross-join lateral in PostGIS
to snap every accident point to its nearest road network segment.
"""

import sys
import logging
# pyrefly: ignore [missing-import]
from sqlalchemy import text
from app.database import engine
from app.models.snapped_accident import SnappedAccident

# Configure logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

def run_snapping():
    logger.info("Ensuring snapped_accidents table exists...")
    # Create the table if it doesn't exist
    SnappedAccident.__table__.create(engine, checkfirst=True)
    
    with engine.connect() as conn:
        logger.info("Truncating existing snapped_accidents data...")
        conn.execute(text("TRUNCATE TABLE snapped_accidents CASCADE;"))
        
        logger.info("Executing spatial snapping query to centerline road network...")
        query = text("""
            INSERT INTO snapped_accidents (accident_id, road_id, original_location, snapped_location, distance_meters)
            SELECT 
                DISTINCT ON (a.id)
                a.id AS accident_id,
                r.id AS road_id,
                a.location AS original_location,
                ST_ClosestPoint(r.geometry, a.location) AS snapped_location,
                ROUND(ST_Distance(a.location::geography, r.geometry::geography)::numeric, 2) AS distance_meters
            FROM gujarat_roads r
            JOIN accidents a 
              ON a.location && ST_Expand(r.geometry, 0.0025) 
              AND ST_DWithin(a.location::geography, r.geometry::geography, 200)
            WHERE (r.road_type = 'Centerline' OR r.road_source_id LIKE '%centerline%')
              AND a.location IS NOT NULL
            ORDER BY a.id, ST_Distance(a.location::geography, r.geometry::geography);
        """)
        
        result = conn.execute(query)
        conn.commit()
        logger.info(f"Successfully snapped and inserted {result.rowcount} accident records to centerline network.")

if __name__ == "__main__":
    try:
        run_snapping()
        logger.info("Snapping process completed successfully.")
    except Exception as e:
        logger.error(f"Error during snapping process: {e}")
        sys.exit(1)
