"""
Standalone script to compute and persist snapped accident locations.
This script performs a high-performance spatial cross-join lateral in PostGIS
to snap every accident point to its nearest road network segment.
"""

import sys
import logging
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
        
        logger.info("Executing spatial snapping query (this may take a minute)...")
        # Query uses CROSS JOIN LATERAL with <-> operator for KNN (K-Nearest Neighbors) spatial index lookup
        query = text("""
            INSERT INTO snapped_accidents (accident_id, road_id, original_location, snapped_location, distance_meters)
            SELECT 
                a.id AS accident_id,
                nearest_road.id AS road_id,
                a.location AS original_location,
                ST_ClosestPoint(nearest_road.geometry, a.location) AS snapped_location,
                ST_Distance(a.location::geography, nearest_road.geometry::geography) AS distance_meters
            FROM accidents a
            CROSS JOIN LATERAL (
                SELECT r.id, r.geometry
                FROM gujarat_roads r
                ORDER BY r.geometry <-> a.location
                LIMIT 1
            ) AS nearest_road
            WHERE a.location IS NOT NULL;
        """)
        
        result = conn.execute(query)
        conn.commit()
        logger.info(f"Successfully snapped and inserted {result.rowcount} accident records.")

if __name__ == "__main__":
    try:
        run_snapping()
        logger.info("Snapping process completed successfully.")
    except Exception as e:
        logger.error(f"Error during snapping process: {e}")
        sys.exit(1)
