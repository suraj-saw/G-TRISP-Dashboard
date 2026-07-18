# backend/app/utils/taluka_utils.py
"""
Taluka (Subdistrict) Utility Module

Provides reusable helper functions for Taluka-level lookups, validation, 
and advanced spatial filtering within the State (Gujarat) → District → Taluka 
administrative hierarchy.

The `GujaratTaluka` model serves as the single authoritative source for 
taluka names, Local Government Directory (LGD) codes, and geographic boundaries. 
By centralizing spatial-join logic here, all dashboard visualizations can 
perform consistent GIS-based filtering without duplicating complex PostGIS logic.
"""

from __future__ import annotations

from typing import Optional, Sequence, Union

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.gujarat_taluka import GujaratTaluka


def list_talukas(db: Session, district: Optional[str] = None) -> list[GujaratTaluka]:
    """
    Retrieve full Taluka records, optionally filtered by a specific district.
    
    This powers cascading UI dropdowns where selecting a district dynamically
    restricts the available subdistricts.

    Parameters
    ----------
    db : Session
        The active SQLAlchemy database session.
    district : str, optional
        The name of the parent district to filter by. Case-insensitive.

    Returns
    -------
    list[GujaratTaluka]
        A list of GujaratTaluka ORM objects sorted alphabetically by name.
    """
    query = db.query(GujaratTaluka)
    
    # Apply case-insensitive filter if a district constraint is provided
    if district:
        query = query.filter(GujaratTaluka.district_name.ilike(district))
        
    # Ensure consistent alphabetical sorting for UI consistency
    return query.order_by(GujaratTaluka.taluka_name).all()


def resolve_taluka_names(db: Session, district: Optional[str] = None) -> list[str]:
    """
    Extract a flat list of unique, distinct taluka names.

    Parameters
    ----------
    db : Session
        The active SQLAlchemy database session.
    district : str, optional
        The name of the parent district to filter by. Case-insensitive.

    Returns
    -------
    list[str]
        An alphabetically sorted list of unique taluka name strings.
    """
    # Optimize performance by querying only the name column rather than whole entities
    query = db.query(GujaratTaluka.taluka_name).distinct()
    
    if district:
        query = query.filter(GujaratTaluka.district_name.ilike(district))
        
    # Flatten the list of tuples returned by SQLAlchemy (e.g., [('Taluka A',), ('Taluka B',)] -> ['Taluka A', 'Taluka B'])
    return [row[0] for row in query.order_by(GujaratTaluka.taluka_name).all()]


def is_valid_taluka(db: Session, taluka_name: str, district: Optional[str] = None) -> bool:
    """
    Validate whether a given taluka name exists in the database.

    Used as a guard check to validate user-supplied filter parameters 
    before executing resource-intensive analytics queries.

    Parameters
    ----------
    db : Session
        The active SQLAlchemy database session.
    taluka_name : str
        The name of the taluka to validate. Case-insensitive.
    district : str, optional
        The optional parent district to ensure the taluka belongs to it.

    Returns
    -------
    bool
        True if the taluka exists (and matches the district if provided), False otherwise.
    """
    # Check existence by targeting only the primary key column for speed
    query = db.query(GujaratTaluka.id).filter(GujaratTaluka.taluka_name.ilike(taluka_name))
    
    if district:
        query = query.filter(GujaratTaluka.district_name.ilike(district))
        
    # Emits an optimized SQL EXISTS query, returning a boolean via .scalar()
    return db.query(query.exists()).scalar()


def apply_taluka_spatial_filter(
    query,
    model,
    location_column,
    taluka: Optional[Union[Sequence[str], str]],
    db: Session,
):
    """
    Restrict a query to rows whose geographic points fall within specified taluka polygons.

    This acts as the application's unified spatial-join implementation. Any dataset 
    containing PostGIS geometry coordinates (e.g., accident coordinates, infrastructure locations) 
    can pass its query here to filter records dynamically by administrative boundaries.

    Parameters
    ----------
    query : sqlalchemy.orm.query.Query
        The base SQLAlchemy query currently being constructed.
    model : DeclarativeMeta
        The database ORM model class backing the query (must expose an `.id` column).
    location_column : sqlalchemy.orm.attributes.InstrumentedAttribute
        The specific PostGIS Geometry/Point column on the target model (e.g., `Accident.location`).
    taluka : str or Sequence[str], optional
        A single taluka name string or a list/sequence of names. If falsy, the filter is a no-op.
    db : Session
        The active database session required to execute subqueries.

    Returns
    -------
    sqlalchemy.orm.query.Query
        The modified query containing the spatial join and subquery filter logic.
    """
    # If no taluka filter criteria is provided, return the query unmodified (no-op)
    if not taluka:
        return query

    # Normalize input: coerce a single string into a single-element list for uniform processing
    names = [taluka] if isinstance(taluka, str) else list(taluka)

    # Build an optimized subquery to identify matching record IDs via a PostGIS spatial join.
    # func.ST_Within evaluates if the point coordinate lies within the multipolygon geometry boundary.
    matching_ids = (
        db.query(model.id)
        .join(GujaratTaluka, func.ST_Within(location_column, GujaratTaluka.geometry))
        .filter(GujaratTaluka.taluka_name.in_(names))
        .subquery()
    )

    # Filter the main query using the subquery results (WHERE model.id IN (SELECT ...))
    return query.filter(model.id.in_(matching_ids))