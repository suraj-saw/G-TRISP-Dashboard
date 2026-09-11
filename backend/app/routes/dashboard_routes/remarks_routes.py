# backend/app/routes/dashboard_routes/remarks_routes.py

"""
Blackspot Remarks CRUD Endpoints.

Provides endpoints for creating, reading, updating, and deleting user-authored
remarks on blackspot clusters. Remarks are anchored to clusters via a deterministic
SHA-256 hash of their constituent crash IDs, making them resilient to changes in
filter parameters and bs_id renumbering.
"""

import hashlib
import math
from datetime import datetime, timedelta, timezone
from typing import List, Optional

# pyrefly: ignore [missing-import]
from fastapi import APIRouter, Depends, HTTPException, Query, Body
# pyrefly: ignore [missing-import]
from fastapi.responses import JSONResponse
# pyrefly: ignore [missing-import]
from pydantic import BaseModel, Field
# pyrefly: ignore [missing-import]
from sqlalchemy import func, cast, or_, and_
# pyrefly: ignore [missing-import]
from sqlalchemy.orm import Session
# pyrefly: ignore [missing-import]
from geoalchemy2 import Geography

from app.core.dependencies import get_db, get_current_user
from app.models.blackspot_remark import BlackspotRemark
from app.models.user import User

router = APIRouter()


# ═══════════════════════════════════════════════════════════════════════════════
# UTILITIES
# ═══════════════════════════════════════════════════════════════════════════════

def compute_crash_ids_hash(crash_ids: List[str]) -> str:
    """
    Compute a deterministic SHA-256 hash from a list of crash ID strings.

    The IDs are deduplicated, sorted numerically (falling back to lexicographic
    for non-numeric values), and joined with commas before hashing. This ensures
    that the same set of crash IDs always produces the same hash regardless of
    input ordering.
    """
    unique_ids = sorted(set(crash_ids), key=lambda x: (int(x) if x.isdigit() else float('inf'), x))
    joined = ",".join(unique_ids)
    return hashlib.sha256(joined.encode("utf-8")).hexdigest()


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate the great-circle distance between two points on Earth in meters."""
    R = 6371000.0  # Earth radius in meters
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2.0) ** 2
    return 2.0 * R * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))


# ═══════════════════════════════════════════════════════════════════════════════
# REQUEST / RESPONSE SCHEMAS
# ═══════════════════════════════════════════════════════════════════════════════

class RemarkCreateRequest(BaseModel):
    """Schema for creating a new remark."""
    crash_ids: List[str] = Field(..., min_length=1, description="List of crash/accident DB IDs forming the cluster")
    visualization_type: str = Field(..., description="Visualization type (e.g., 'blackspot', 'dbscan_blackspot')")
    district: Optional[str] = Field(None, description="District name")
    centroid_lat: float = Field(..., description="Latitude of the cluster centroid")
    centroid_lon: float = Field(..., description="Longitude of the cluster centroid")
    remark: str = Field(..., min_length=1, max_length=2000, description="The remark text")


class RemarkUpdateRequest(BaseModel):
    """Schema for updating an existing remark."""
    remark: str = Field(..., min_length=1, max_length=2000, description="Updated remark text")


class ClusterLookupItem(BaseModel):
    """Cluster descriptor for 2-tier spatial + fingerprint lookup."""
    bs_id: str = Field(..., description="Cluster bs_id")
    hash: str = Field(..., description="crash_ids_hash value")
    centroid_lat: float = Field(..., description="Latitude of the cluster centroid")
    centroid_lon: float = Field(..., description="Longitude of the cluster centroid")
    radius_m: Optional[float] = Field(250.0, description="Detection radius in meters (default 250m)")


class BulkLookupRequest(BaseModel):
    """Schema for bulk remark lookup supporting both hash lists and spatial clusters."""
    hashes: Optional[List[str]] = Field(None, description="List of crash_ids_hash values to look up")
    clusters: Optional[List[ClusterLookupItem]] = Field(None, description="List of clusters with spatial coordinates for 2-tier matching")


class RemarkResponse(BaseModel):
    """Schema for remark responses."""
    id: int
    crash_ids_hash: str
    crash_ids: str
    visualization_type: str
    district: Optional[str]
    centroid_lat: float
    centroid_lon: float
    remark: str
    created_by: int
    created_by_username: str
    updated_by: Optional[int] = None
    updated_by_username: Optional[str] = None
    created_at: str
    updated_at: Optional[str] = None
    match_type: Optional[str] = "exact"  # "exact" or "spatial"
    distance_m: Optional[float] = None

    class Config:
        from_attributes = True


def _remark_to_response(
    remark: BlackspotRemark,
    match_type: str = "exact",
    distance_m: Optional[float] = None
) -> dict:
    """Convert a BlackspotRemark ORM instance to a response dict with matching metadata."""
    return {
        "id": remark.id,
        "crash_ids_hash": remark.crash_ids_hash,
        "crash_ids": remark.crash_ids,
        "visualization_type": remark.visualization_type,
        "district": remark.district,
        "centroid_lat": remark.centroid_lat,
        "centroid_lon": remark.centroid_lon,
        "remark": remark.remark,
        "created_by": remark.created_by,
        "created_by_username": remark.creator.username if remark.creator else "Unknown",
        "updated_by": remark.updated_by,
        "updated_by_username": remark.updater.username if remark.updater else None,
        "created_at": remark.created_at.isoformat() if remark.created_at else None,
        "updated_at": remark.updated_at.isoformat() if remark.updated_at else None,
        "match_type": match_type,
        "distance_m": round(distance_m, 1) if distance_m is not None else None,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/remarks/timeline", summary="Get remarks timeline for a specific blackspot cluster")
def get_remarks_timeline(
    crash_ids: str = Query(..., description="Comma-separated crash IDs"),
    centroid_lat: Optional[float] = Query(None, description="Cluster centroid latitude"),
    centroid_lon: Optional[float] = Query(None, description="Cluster centroid longitude"),
    radius_m: Optional[float] = Query(250.0, description="Spatial search radius in meters (default 250m)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Look up all remarks for a blackspot cluster using Two-Tier matching:
    1. Tier 1 (Exact): Exact crash_ids_hash match.
    2. Tier 2 (Spatial): Remarks whose recorded location is within radius_m of the centroid.
    Returns remarks ordered chronologically (newest first).
    """
    ids_list = [id.strip() for id in crash_ids.split(",") if id.strip()]
    if not ids_list:
        raise HTTPException(status_code=400, detail="No valid crash IDs provided.")

    hash_value = compute_crash_ids_hash(ids_list)

    if centroid_lat is not None and centroid_lon is not None:
        cluster_point = func.ST_SetSRID(func.ST_MakePoint(centroid_lon, centroid_lat), 4326)
        remarks = (
            db.query(BlackspotRemark)
            .filter(
                or_(
                    BlackspotRemark.crash_ids_hash == hash_value,
                    func.ST_DWithin(
                        cast(BlackspotRemark.geom, Geography),
                        cast(cluster_point, Geography),
                        radius_m or 250.0
                    )
                )
            )
            .order_by(BlackspotRemark.created_at.desc())
            .all()
        )

        response_items = []
        for r in remarks:
            is_exact = (r.crash_ids_hash == hash_value)
            dist = haversine_m(centroid_lat, centroid_lon, r.centroid_lat, r.centroid_lon)
            m_type = "exact" if is_exact else "spatial"
            response_items.append(_remark_to_response(r, match_type=m_type, distance_m=dist))
        return response_items
    else:
        remarks = (
            db.query(BlackspotRemark)
            .filter(BlackspotRemark.crash_ids_hash == hash_value)
            .order_by(BlackspotRemark.created_at.desc())
            .all()
        )
        return [_remark_to_response(r, match_type="exact", distance_m=0.0) for r in remarks]


@router.get("/remarks/by-crash-ids", summary="Get latest remark for a specific blackspot cluster")
def get_remark_by_crash_ids(
    crash_ids: str = Query(..., description="Comma-separated crash IDs"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Look up the latest remark by computing the hash of the provided crash IDs.
    Returns the latest remark if found, or 404 if no remark exists for this cluster.
    """
    ids_list = [id.strip() for id in crash_ids.split(",") if id.strip()]
    if not ids_list:
        raise HTTPException(status_code=400, detail="No valid crash IDs provided.")

    hash_value = compute_crash_ids_hash(ids_list)
    remark = (
        db.query(BlackspotRemark)
        .filter(BlackspotRemark.crash_ids_hash == hash_value)
        .order_by(BlackspotRemark.created_at.desc())
        .first()
    )

    if not remark:
        return JSONResponse(status_code=404, content={"detail": "No remark found for this cluster."})

    return _remark_to_response(remark)


@router.post("/remarks/bulk", summary="Bulk lookup remarks summary supporting spatial & hash matching")
def bulk_lookup_remarks(
    body: BulkLookupRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Accepts either a list of clusters with coordinates (for 2-tier spatial lookup)
    or a legacy list of crash_ids_hash values. Returns summary information
    (count and latest remark) for each cluster hash.
    """
    grouped = {}

    if body.clusters and len(body.clusters) > 0:
        clusters = body.clusters
        hashes = [c.hash for c in clusters]

        # Calculate bounding envelope with padding (~1 km padding)
        min_lat = min(c.centroid_lat for c in clusters) - 0.01
        max_lat = max(c.centroid_lat for c in clusters) + 0.01
        min_lon = min(c.centroid_lon for c in clusters) - 0.01
        max_lon = max(c.centroid_lon for c in clusters) + 0.01

        envelope = func.ST_MakeEnvelope(min_lon, min_lat, max_lon, max_lat, 4326)

        # Query all remarks matching any hash OR inside the bounding envelope using spatial GiST index
        candidate_remarks = (
            db.query(BlackspotRemark)
            .filter(
                or_(
                    BlackspotRemark.crash_ids_hash.in_(hashes),
                    func.ST_Intersects(BlackspotRemark.geom, envelope),
                )
            )
            .order_by(BlackspotRemark.created_at.desc())
            .all()
        )

        # Match remarks to each cluster using Tier 1 (exact) and Tier 2 (spatial)
        for cluster in clusters:
            radius = cluster.radius_m or 250.0
            matched = []
            seen_ids = set()

            # Check candidate remarks
            for r in candidate_remarks:
                if r.id in seen_ids:
                    continue

                # Tier 1: exact hash match
                if r.crash_ids_hash == cluster.hash:
                    dist = haversine_m(cluster.centroid_lat, cluster.centroid_lon, r.centroid_lat, r.centroid_lon)
                    matched.append((r, "exact", dist))
                    seen_ids.add(r.id)
                    continue

                # Tier 2: spatial proximity match
                dist = haversine_m(cluster.centroid_lat, cluster.centroid_lon, r.centroid_lat, r.centroid_lon)
                if dist <= radius:
                    matched.append((r, "spatial", dist))
                    seen_ids.add(r.id)

            if matched:
                # Sort matched: newest first
                matched.sort(key=lambda x: x[0].created_at or func.now(), reverse=True)
                latest_r, match_type, dist = matched[0]
                grouped[cluster.hash] = {
                    "count": len(matched),
                    "latest_remark": _remark_to_response(latest_r, match_type=match_type, distance_m=dist),
                }

        return {"remarks": grouped}

    elif body.hashes and len(body.hashes) > 0:
        remarks = (
            db.query(BlackspotRemark)
            .filter(BlackspotRemark.crash_ids_hash.in_(body.hashes))
            .order_by(BlackspotRemark.created_at.desc())
            .all()
        )

        for r in remarks:
            h = r.crash_ids_hash
            if h not in grouped:
                grouped[h] = {
                    "count": 0,
                    "latest_remark": _remark_to_response(r, match_type="exact", distance_m=0.0),
                }
            grouped[h]["count"] += 1

        return {"remarks": grouped}

    return {"remarks": {}}


@router.post("/remarks", summary="Create a remark for a blackspot cluster", status_code=201)
def create_remark(
    body: RemarkCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Create a new remark anchored to a blackspot cluster via its crash IDs hash and spatial geometry.
    Appends the remark to the cluster's timeline.
    Includes an idempotency guard against rapid duplicate submissions (within 5 seconds).
    """
    cleaned_remark = body.remark.strip()
    hash_value = compute_crash_ids_hash(body.crash_ids)

    # Concurrency guard: check for rapid duplicate submission by the same user within 5 seconds
    recent_cutoff = datetime.now(timezone.utc) - timedelta(seconds=5)
    existing_duplicate = (
        db.query(BlackspotRemark)
        .filter(
            BlackspotRemark.crash_ids_hash == hash_value,
            BlackspotRemark.created_by == current_user.id,
            BlackspotRemark.remark == cleaned_remark,
            BlackspotRemark.created_at >= recent_cutoff,
        )
        .first()
    )
    if existing_duplicate:
        existing_duplicate.creator = current_user
        return _remark_to_response(existing_duplicate, match_type="exact", distance_m=0.0)

    sorted_ids = sorted(set(body.crash_ids), key=lambda x: (int(x) if x.isdigit() else float('inf'), x))
    point_geom = func.ST_SetSRID(func.ST_MakePoint(body.centroid_lon, body.centroid_lat), 4326)

    new_remark = BlackspotRemark(
        crash_ids_hash=hash_value,
        crash_ids=",".join(sorted_ids),
        visualization_type=body.visualization_type,
        district=body.district,
        centroid_lat=body.centroid_lat,
        centroid_lon=body.centroid_lon,
        geom=point_geom,
        remark=cleaned_remark,
        created_by=current_user.id,
    )

    try:
        db.add(new_remark)
        db.commit()
        db.refresh(new_remark)
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Database transaction failed while creating remark.") from exc

    new_remark.creator = current_user
    return _remark_to_response(new_remark, match_type="exact", distance_m=0.0)


@router.put("/remarks/{remark_id}", summary="Update an existing remark")
def update_remark(
    remark_id: int,
    body: RemarkUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Update the text of an existing remark.
    Uses pessimistic row locking (FOR UPDATE) to prevent concurrent update races.
    Only the original creator or an admin/superadmin user can update.
    """
    try:
        remark = (
            db.query(BlackspotRemark)
            .filter(BlackspotRemark.id == remark_id)
            .with_for_update()
            .first()
        )

        if not remark:
            raise HTTPException(status_code=404, detail="Remark not found.")

        # Authorization: creator or admin
        if remark.created_by != current_user.id and current_user.role not in ("admin", "superadmin"):
            raise HTTPException(status_code=403, detail="You do not have permission to update this remark.")

        remark.remark = body.remark.strip()
        remark.updated_by = current_user.id
        db.commit()
        db.refresh(remark)
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Database transaction failed while updating remark.") from exc

    return _remark_to_response(remark)


@router.delete("/remarks/{remark_id}", summary="Delete a remark", status_code=200)
def delete_remark(
    remark_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Delete an existing remark.
    Uses pessimistic row locking (FOR UPDATE) to prevent delete/update race conditions.
    Only the original creator or an admin/superadmin user can delete.
    """
    try:
        remark = (
            db.query(BlackspotRemark)
            .filter(BlackspotRemark.id == remark_id)
            .with_for_update()
            .first()
        )

        if not remark:
            raise HTTPException(status_code=404, detail="Remark not found.")

        # Authorization: creator or admin
        if remark.created_by != current_user.id and current_user.role not in ("admin", "superadmin"):
            raise HTTPException(status_code=403, detail="You do not have permission to delete this remark.")

        db.delete(remark)
        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail="Database transaction failed while deleting remark.") from exc

    return {"detail": "Remark deleted successfully."}
