"""
Standalone script to merge parallel road lanes and persist the resulting buffers.
This script performs a spatial union of buffers around road lines grouped by name.
"""

import sys
import logging
# pyrefly: ignore [missing-import]
from sqlalchemy import text
from app.database import engine
from app.models.gujarat_merged_road import GujaratMergedRoad

# Configure logging
logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

def run_merge():
    logger.info("Ensuring gujarat_merged_roads table exists...")
    # Create the table if it doesn't exist
    GujaratMergedRoad.__table__.create(engine, checkfirst=True)
    
    with engine.connect() as conn:
        logger.info("Truncating existing gujarat_merged_roads data...")
        conn.execute(text("TRUNCATE TABLE gujarat_merged_roads CASCADE;"))
        
        logger.info("Executing spatial merge query (this may take a few minutes)...")
        # Query buffers all geometry by 20m, and unions them.
        # We group by road_name for named roads to merge parallel lanes.
        # For unnamed roads, we group by ID so they are included but not improperly merged together.
        query = text("""
            INSERT INTO gujarat_merged_roads (road_name, road_classification, road_type, geometry)
            WITH major_roads AS (
                SELECT 
                    id, 
                    road_name, 
                    road_classification, 
                    road_type, 
                    geometry,
                    ST_ClusterDBSCAN(geometry, eps := 0.0003, minpoints := 1) OVER (PARTITION BY road_classification) as cluster_id
                FROM gujarat_roads
                WHERE road_classification IN ('motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary', 'tertiary_link')
            ),
            merged_major AS (
                SELECT 
                    MAX(CASE WHEN road_name = 'Unknown' THEN NULL ELSE road_name END) as road_name,
                    road_classification,
                    MAX(road_type) as road_type,
                    ST_Multi(ST_ApproximateMedialAxis(ST_Union(ST_Buffer(geometry::geography, 12)::geometry))) as geometry
                FROM major_roads
                GROUP BY road_classification, cluster_id
            ),
            minor_roads AS (
                SELECT 
                    CASE WHEN road_name = 'Unknown' THEN NULL ELSE road_name END as road_name,
                    road_classification,
                    road_type,
                    ST_Multi(geometry) as geometry
                FROM gujarat_roads
                WHERE road_classification NOT IN ('motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary', 'tertiary_link') 
                   OR road_classification IS NULL
            )
            SELECT road_name, road_classification, road_type, geometry FROM merged_major
            UNION ALL
            SELECT road_name, road_classification, road_type, geometry FROM minor_roads;
        """)
        
        result = conn.execute(query)
        conn.commit()
        logger.info(f"Successfully merged and inserted {result.rowcount} road buffer records.")

if __name__ == "__main__":
    try:
        run_merge()
        logger.info("Merge process completed successfully.")
    except Exception as e:
        logger.error(f"Error during merge process: {e}")
        sys.exit(1)
