# backend/app/seed/migrate_to_array_columns.py
"""
Database Migration Script: Convert multi-category columns to PostgreSQL Native Array (TEXT[]) + GIN Index.

Target columns:
- type_of_collision
- collision_feature
- weather_condition
- traffic_violation

Tables handled:
- accidents
- accidents_backup (if exists)

Usage:
    python -m app.seed.migrate_to_array_columns
    or in Docker:
    docker exec g-trisp-backend python -m app.seed.migrate_to_array_columns
"""

import logging
import sys
from pathlib import Path

# Ensure backend root is on sys.path
_BACKEND = Path(__file__).resolve().parents[2]
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

# pyrefly: ignore [missing-import]
from sqlalchemy import text
from app.database import engine
from app.utils.accident_utils import split_and_clean_categories

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("migrate_to_array_columns")

TARGET_COLUMNS = [
    "type_of_collision",
    "collision_feature",
    "weather_condition",
    "traffic_violation",
]

TARGET_TABLES = ["accidents", "accidents_backup"]


def get_column_data_type(conn, table_name: str, column_name: str) -> str | None:
    res = conn.execute(
        text(
            """
            SELECT data_type 
            FROM information_schema.columns 
            WHERE table_name = :table AND column_name = :col
            """
        ),
        {"table": table_name, "col": column_name},
    ).fetchone()
    return res[0] if res else None


def table_exists(conn, table_name: str) -> bool:
    res = conn.execute(
        text(
            """
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = :table
            )
            """
        ),
        {"table": table_name},
    ).scalar()
    return bool(res)


def migrate_columns_for_table(conn, table_name: str):
    if not table_exists(conn, table_name):
        logger.info("Table '%s' does not exist. Skipping.", table_name)
        return

    logger.info("--- Processing table: '%s' ---", table_name)

    for col in TARGET_COLUMNS:
        dt = get_column_data_type(conn, table_name, col)
        if dt is None:
            logger.warning("Column '%s' not found on table '%s'. Skipping.", col, table_name)
            continue

        if dt == "ARRAY":
            logger.info("Column '%s.%s' is already an ARRAY (TEXT[]).", table_name, col)
        else:
            logger.info("Converting column '%s.%s' from %s to TEXT[]...", table_name, col, dt)
            conn.execute(
                text(
                    f"""
                    ALTER TABLE {table_name}
                      ALTER COLUMN {col} TYPE TEXT[] 
                      USING CASE 
                        WHEN {col} IS NULL OR {col} IN ('', 'nan', 'null', 'None') THEN NULL 
                        ELSE array_remove(regexp_split_to_array({col}, E'\\s*,\\s*'), '') 
                      END;
                    """
                )
            )
            logger.info("✓ Converted '%s.%s' to TEXT[].", table_name, col)

        # Clean and normalize all unique arrays present in the table
        logger.info("Normalizing category tokens in '%s.%s'...", table_name, col)
        distinct_rows = conn.execute(
            text(f"SELECT DISTINCT {col} FROM {table_name} WHERE {col} IS NOT NULL")
        ).fetchall()

        normalized_count = 0
        for (raw_arr,) in distinct_rows:
            if not raw_arr:
                continue
            cleaned = split_and_clean_categories(raw_arr)
            if cleaned != raw_arr:
                conn.execute(
                    text(
                        f"""
                        UPDATE {table_name} 
                        SET {col} = :new_val 
                        WHERE {col} = :old_val
                        """
                    ),
                    {"new_val": cleaned, "old_val": raw_arr},
                )
                normalized_count += 1

        if normalized_count > 0:
            logger.info("✓ Normalized %d distinct category group(s) in '%s.%s'.", normalized_count, table_name, col)
        else:
            logger.info("✓ '%s.%s' is already fully normalized.", table_name, col)

        # Create GIN Index
        index_name = f"idx_{table_name}_{col}_gin"
        logger.info("Ensuring GIN index '%s' exists...", index_name)
        conn.execute(
            text(
                f"""
                CREATE INDEX IF NOT EXISTS {index_name} 
                ON {table_name} USING GIN ({col});
                """
            )
        )
        logger.info("✓ GIN index '%s' ready.", index_name)


def run_migration():
    logger.info("==================================================================")
    logger.info("Starting PostgreSQL Native Array (TEXT[]) + GIN Index Migration...")
    logger.info("==================================================================")

    with engine.begin() as conn:
        for table in TARGET_TABLES:
            migrate_columns_for_table(conn, table)

    # Verification checks
    with engine.connect() as conn:
        for table in TARGET_TABLES:
            if not table_exists(conn, table):
                continue
            count = conn.execute(text(f"SELECT count(*) FROM {table}")).scalar()
            logger.info("Table '%s' contains %d total rows.", table, count)

            # Sample row
            sample = conn.execute(
                text(
                    f"""
                    SELECT {', '.join(TARGET_COLUMNS)} 
                    FROM {table} 
                    WHERE type_of_collision IS NOT NULL 
                    LIMIT 1
                    """
                )
            ).fetchone()
            if sample:
                logger.info("Sample record from '%s':", table)
                for col_name, val in zip(TARGET_COLUMNS, sample):
                    logger.info("   - %s: %s (type=%s)", col_name, val, type(val).__name__)

    logger.info("==================================================================")
    logger.info("✓ PostgreSQL TEXT[] + GIN Index migration completed successfully!")
    logger.info("==================================================================")


if __name__ == "__main__":
    run_migration()
