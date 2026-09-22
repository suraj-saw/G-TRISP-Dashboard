# backend/app/services/corridor_service.py

"""
Legacy Shim: Corridor Service.

Re-exports segment blackspot service functions under legacy corridor names.
"""

from app.services.segment_blackspot_service import (
    load_nh48_districts_geojson,
    load_nh48_state_geojson,
    load_ne1_districts_geojson,
    load_ne1_state_geojson,
    get_centerline_features_for_districts,
    decompose_to_linestrings,
    snap_segment_blackspot_gaps,
    snap_corridor_gaps,
    compute_segment_blackspots,
    compute_risk_corridors,
    get_nh48_features_for_districts,
    compute_nh48_risk_corridors,
)

__all__ = [
    "load_nh48_districts_geojson",
    "load_nh48_state_geojson",
    "load_ne1_districts_geojson",
    "load_ne1_state_geojson",
    "get_centerline_features_for_districts",
    "decompose_to_linestrings",
    "snap_segment_blackspot_gaps",
    "snap_corridor_gaps",
    "compute_segment_blackspots",
    "compute_risk_corridors",
    "get_nh48_features_for_districts",
    "compute_nh48_risk_corridors",
]
