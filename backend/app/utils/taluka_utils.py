# backend/app/utils/taluka_utils.py
"""
Reusable helpers for Taluka (Subdistrict)-level lookups and filtering.

    State (Gujarat) → District → Taluka

`gujarat_talukas` is the single authoritative source for taluka names,
LGD codes, and geometry. Every dashboard visualization filters "by taluka"
through the helpers here, so the spatial-join logic exists exactly once
and is trivially reusable for a future Village/Ward level.
"""

from __future__ import annotations

from typing import Optional, Sequence, Union

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.gujarat_taluka import GujaratTaluka


def list_talukas(db: Session, district: Optional[str] = None) -> list[GujaratTaluka]:
    """Talukas, optionally scoped to one district — powers cascading dropdowns."""
    query = db.query(GujaratTaluka)
    if district:
        query = query.filter(GujaratTaluka.district_name.ilike(district))
    return query.order_by(GujaratTaluka.taluka_name).all()


def resolve_taluka_names(db: Session, district: Optional[str] = None) -> list[str]:
    """Distinct taluka names, optionally scoped by district."""
    query = db.query(GujaratTaluka.taluka_name).distinct()
    if district:
        query = query.filter(GujaratTaluka.district_name.ilike(district))
    return [row[0] for row in query.order_by(GujaratTaluka.taluka_name).all()]


def is_valid_taluka(db: Session, taluka_name: str, district: Optional[str] = None) -> bool:
    """Validate a taluka name (optionally scoped to a district) before use in a filter."""
    query = db.query(GujaratTaluka.id).filter(GujaratTaluka.taluka_name.ilike(taluka_name))
    if district:
        query = query.filter(GujaratTaluka.district_name.ilike(district))
    return db.query(query.exists()).scalar()


def apply_taluka_spatial_filter(
    query,
    model,
    location_column,
    taluka: Optional[Union[Sequence[str], str]],
    db: Session,
):
    """
    Restrict `query` (any model with a PostGIS point/geometry column) to rows
    whose `location_column` falls within one of the named taluka polygons.

    This is the ONE spatial-join implementation for taluka filtering —
    Gujarat-wide accidents, Surat accidents, or any future dataset all call
    this instead of hand-rolling ST_Within joins per route.

    Parameters
    ----------
    query           : SQLAlchemy query being built.
    model           : The ORM model backing `query` (must expose `.id`).
    location_column : The geometry/point column on that model, e.g. Accident.location.
    taluka          : One or more taluka names. No-op if falsy.
    db              : Active session.
    """
    if not taluka:
        return query

    names = [taluka] if isinstance(taluka, str) else list(taluka)

    matching_ids = (
        db.query(model.id)
        .join(GujaratTaluka, func.ST_Within(location_column, GujaratTaluka.geometry))
        .filter(GujaratTaluka.taluka_name.in_(names))
        .subquery()
    )

    return query.filter(model.id.in_(matching_ids))