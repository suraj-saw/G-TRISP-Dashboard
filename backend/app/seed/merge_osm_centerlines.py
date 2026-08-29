import sys
import logging
# pyrefly: ignore [missing-import]
from sqlalchemy import text
from app.database import engine

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

def run_merge():
    with engine.connect() as conn:
        logger.info("Creating temporary table for new merged roads...")
        conn.execute(text("""
            DROP TABLE IF EXISTS gujarat_merged_roads_new;
            CREATE TABLE gujarat_merged_roads_new (LIKE gujarat_merged_roads INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES);
        """))
        
        # Insert minor roads all at once
        logger.info("Inserting minor roads...")
        conn.execute(text("""
            INSERT INTO gujarat_merged_roads_new (road_name, road_classification, road_type, geometry)
            SELECT 
                CASE WHEN road_name = 'Unknown' THEN NULL ELSE road_name END,
                road_classification,
                road_type,
                geometry
            FROM gujarat_merged_roads
            WHERE road_classification NOT IN ('Expressway', 'National Highway', 'State Highway') 
               OR road_classification IS NULL
        """))
        conn.commit()

        # Fetch all districts
        districts = conn.execute(text("SELECT shape_name FROM gujarat_districts ORDER BY shape_name")).fetchall()
        
        for (district,) in districts:
            logger.info(f"Processing major roads for district: {district}")
            query = text("""
                INSERT INTO gujarat_merged_roads_new (road_name, road_classification, road_type, geometry)
                WITH district_geom AS (
                    SELECT geometry FROM gujarat_districts WHERE shape_name = :district
                ),
                district_roads AS (
                    SELECT r.id, r.road_name, r.road_classification, r.road_type, r.geometry
                    FROM gujarat_merged_roads r
                    JOIN district_geom d ON ST_Intersects(r.geometry, d.geometry)
                    WHERE r.road_classification IN ('Expressway', 'National Highway', 'State Highway')
                ),
                major_roads AS (
                    SELECT 
                        road_name, 
                        road_classification, 
                        road_type, 
                        ST_ClusterDBSCAN(geometry, eps := 0.0006, minpoints := 1) OVER (PARTITION BY road_classification, COALESCE(road_name, 'Unknown')) as cluster_id,
                        geometry
                    FROM district_roads
                )
                SELECT 
                    MAX(CASE WHEN road_name = 'Unknown' THEN NULL ELSE road_name END) as road_name,
                    road_classification,
                    MAX(road_type) as road_type,
                    ST_Multi(ST_ApproximateMedialAxis(ST_Buffer(ST_Union(geometry)::geography, 30)::geometry)) as geometry
                FROM major_roads
                GROUP BY road_classification, COALESCE(road_name, 'Unknown'), cluster_id
            """)
            conn.execute(query, {"district": district})
            conn.commit()

        logger.info("Swapping data from temp table to live table...")
        conn.execute(text("""
            TRUNCATE TABLE gujarat_merged_roads CASCADE;
            INSERT INTO gujarat_merged_roads (road_name, road_classification, road_type, geometry)
            SELECT road_name, road_classification, road_type, geometry 
            FROM gujarat_merged_roads_new;
            DROP TABLE gujarat_merged_roads_new;
        """))
        conn.commit()
        
        logger.info("Table swap complete! Merged centerlines are live.")

if __name__ == "__main__":
    try:
        run_merge()
        logger.info("Merge process completed successfully.")
    except Exception as e:
        logger.error(f"Error during merge process: {e}")
        sys.exit(1)
