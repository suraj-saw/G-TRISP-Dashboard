"""
Segment Blackspots Service.

Computes continuous high-risk segment blackspots along road centerlines (e.g. NH-48, NE-1)
using dynamic sliding window spatial analysis on PostGIS geometries.
"""

from __future__ import annotations

import json
import os
import logging
from typing import List, Dict, Any, Optional, Union

# pyrefly: ignore [missing-import]
from sqlalchemy import func, text
# pyrefly: ignore [missing-import]
from sqlalchemy.orm import Session

from app.models.accident import Accident
from app.utils.accident_utils import apply_filters
from app.utils.network_blackspot_utils import network_sliding_window
from app.utils.segment_blackspot_utils import generate_segment_blackspots, rank_segment_blackspots
from app.utils.district_utils import get_canonical_district, normalize_district_key

logger = logging.getLogger(__name__)

# Cache for Centerline (NH48, NE1) GeoJSON datasets
_NH48_DISTRICTS_GEOJSON: Optional[Dict[str, Any]] = None
_NH48_STATE_GEOJSON: Optional[Dict[str, Any]] = None
_NE1_DISTRICTS_GEOJSON: Optional[Dict[str, Any]] = None
_NE1_STATE_GEOJSON: Optional[Dict[str, Any]] = None


def _get_data_path(filename: str) -> str:
    """Check container /app/data path first, then relative local paths."""
    candidates = [
        os.path.join("/app", "data", filename),
        os.path.join(os.path.dirname(__file__), "..", "..", "data", filename),
        os.path.join(os.path.dirname(__file__), "..", "data", filename),
        os.path.join(os.getcwd(), "backend", "data", filename),
        os.path.join(os.getcwd(), "data", filename),
    ]
    for c in candidates:
        if os.path.exists(c):
            return c
    return candidates[0]


def load_nh48_districts_geojson() -> Dict[str, Any]:
    global _NH48_DISTRICTS_GEOJSON
    if _NH48_DISTRICTS_GEOJSON is None:
        path = _get_data_path("NH48_Gujarat_Districts.geojson")
        with open(path, "r", encoding="utf-8") as f:
            _NH48_DISTRICTS_GEOJSON = json.load(f)
    return _NH48_DISTRICTS_GEOJSON


def load_nh48_state_geojson() -> Optional[Dict[str, Any]]:
    global _NH48_STATE_GEOJSON
    if _NH48_STATE_GEOJSON is None:
        for fname in ["NH 48.geojson", "NH48_Gujarat.geojson"]:
            path = _get_data_path(fname)
            if os.path.exists(path) and os.path.getsize(path) > 1000:
                with open(path, "r", encoding="utf-8") as f:
                    _NH48_STATE_GEOJSON = json.load(f)
                    break
    return _NH48_STATE_GEOJSON


def load_ne1_districts_geojson() -> Dict[str, Any]:
    global _NE1_DISTRICTS_GEOJSON
    if _NE1_DISTRICTS_GEOJSON is None:
        path = _get_data_path("NE1_Gujarat_Districts.geojson")
        with open(path, "r", encoding="utf-8") as f:
            _NE1_DISTRICTS_GEOJSON = json.load(f)
    return _NE1_DISTRICTS_GEOJSON


def load_ne1_state_geojson() -> Optional[Dict[str, Any]]:
    global _NE1_STATE_GEOJSON
    if _NE1_STATE_GEOJSON is None:
        for fname in ["NE 1.geojson", "NE1_Gujarat.geojson"]:
            path = _get_data_path(fname)
            if os.path.exists(path) and os.path.getsize(path) > 1000:
                with open(path, "r", encoding="utf-8") as f:
                    _NE1_STATE_GEOJSON = json.load(f)
                    break
    return _NE1_STATE_GEOJSON


def get_centerline_features_for_districts(
    district_names: Optional[List[str]] = None,
    db: Optional[Session] = None
) -> List[Dict[str, Any]]:
    """
    Returns centerline GeoJSON features (NH-48, NE-1) matching the requested district(s).
    First attempts to load from the PostGIS gujarat_roads table where road_source_id matches centerline patterns.
    Falls back to the GeoJSON file on disk if db is unavailable or no records found in table.
    """
    all_features = []
    if db is not None:
        try:
            from app.models.gujarat_road import GujaratRoad
            # pyrefly: ignore [missing-import]
            from sqlalchemy import or_
            roads = db.query(
                GujaratRoad.id,
                GujaratRoad.road_source_id,
                GujaratRoad.road_name,
                GujaratRoad.road_classification,
                GujaratRoad.properties,
                func.ST_AsGeoJSON(GujaratRoad.geometry).label("geom_json")
            ).filter(
                or_(
                    GujaratRoad.road_source_id.like("nh48-centerline-%"),
                    GujaratRoad.road_source_id.like("ne1-centerline-%"),
                    GujaratRoad.road_type == "Centerline"
                )
            ).all()

            for r in roads:
                props = dict(r.properties or {})
                dist = props.get("DISTRICT") or props.get("district", "")
                props["DISTRICT"] = dist
                props["road_db_id"] = r.id
                props["road_source_id"] = r.road_source_id
                props["road_name"] = r.road_name or ("NE 1" if "ne1" in (r.road_source_id or "").lower() else "NH 48")
                props["road_classification"] = r.road_classification or ("Expressway" if "ne1" in (r.road_source_id or "").lower() else "National Highway")

                geom = json.loads(r.geom_json)
                all_features.append({
                    "type": "Feature",
                    "properties": props,
                    "geometry": geom
                })
        except Exception as e:
            logger.warning(f"Failed to query centerline roads from gujarat_roads table: {e}")
            all_features = []

    if not all_features:
        data_nh48 = load_nh48_districts_geojson()
        features_nh48 = []
        for feat in (data_nh48.get("features", []) if data_nh48 else []):
            feat_copy = dict(feat)
            p = dict(feat.get("properties", {}) or {})
            p.setdefault("road_name", "NH 48")
            p.setdefault("road_classification", "National Highway")
            feat_copy["properties"] = p
            features_nh48.append(feat_copy)

        features_ne1 = []
        try:
            data_ne1 = load_ne1_districts_geojson()
            for feat in (data_ne1.get("features", []) if data_ne1 else []):
                feat_copy = dict(feat)
                p = dict(feat.get("properties", {}) or {})
                p.setdefault("road_name", "NE 1")
                p.setdefault("road_classification", "Expressway")
                feat_copy["properties"] = p
                features_ne1.append(feat_copy)
        except Exception as ex:
            logger.warning(f"Could not load fallback NE1 GeoJSON: {ex}")

        all_features = features_nh48 + features_ne1

    if not district_names:
        return all_features

    canonical_requested = set()
    for d in district_names:
        key = normalize_district_key(d)
        canonical_requested.add(key)
        canon = get_canonical_district(d)
        if canon:
            canonical_requested.add(canon.lower())
            canonical_requested.add(normalize_district_key(canon))

    matched_features = []
    for feat in all_features:
        feat_dist = feat.get("properties", {}).get("DISTRICT", "") or feat.get("properties", {}).get("district", "")
        feat_key = normalize_district_key(feat_dist)
        feat_canon = get_canonical_district(feat_dist)
        feat_canon_lower = feat_canon.lower() if feat_canon else ""

        match = False
        if feat_key in canonical_requested or feat_canon_lower in canonical_requested:
            match = True
        else:
            for req in canonical_requested:
                if req and (req in feat_key or feat_key in req or req == feat_canon_lower):
                    match = True
                    break

        if match:
            matched_features.append(feat)

    return matched_features


def decompose_to_linestrings(features: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Decomposes any MultiLineString features into discrete LineString features
    so PostGIS linear referencing (ST_LineLocatePoint, ST_LineSubstring) operates cleanly.
    """
    decomp = []
    for feat in features:
        geom = feat.get("geometry", {})
        gtype = geom.get("type")
        if gtype == "MultiLineString":
            for i, line_coords in enumerate(geom.get("coordinates", [])):
                sub_feat = {
                    "type": "Feature",
                    "properties": dict(feat.get("properties", {})),
                    "geometry": {
                        "type": "LineString",
                        "coordinates": line_coords
                    }
                }
                decomp.append(sub_feat)
        elif gtype == "LineString":
            decomp.append(feat)
    return decomp


def snap_segment_blackspot_gaps(
    segments: List[Dict[str, Any]],
    road_lengths_map: Dict[int, float],
    max_snap_gap_m: float = 50.0
) -> List[Dict[str, Any]]:
    """
    Eliminates small gaps (<= max_snap_gap_m, e.g. sliding window stepping offsets or junction splits)
    between adjacent segment blackspots along the same road.
    1. If two adjacent segments have the same priority level, they merge cleanly.
    2. If they have different priority levels, their boundaries snap to the midpoint so they meet seamlessly with 0 gap.
    """
    if not segments:
        return []

    roads: Dict[int, List[Dict[str, Any]]] = {}
    for c in segments:
        r_id = c.get("road_id", 0)
        if r_id not in roads:
            roads[r_id] = []
        roads[r_id].append(c)

    refined_segments: List[Dict[str, Any]] = []

    for r_id, road_segs in roads.items():
        road_len = road_lengths_map.get(r_id, 0.0)
        road_segs.sort(key=lambda x: (x["start_m"], x["end_m"]))
        
        # Pass 1: Merge adjacent segments of the same priority if gap <= max_snap_gap_m
        merged: List[Dict[str, Any]] = []
        for c in road_segs:
            if not merged:
                merged.append(dict(c))
                continue
            
            prev = merged[-1]
            gap = c["start_m"] - prev["end_m"]
            
            if gap <= max_snap_gap_m and prev.get("priority_level") == c.get("priority_level"):
                prev["end_m"] = max(prev["end_m"], c["end_m"])
                prev["end_fraction"] = max(prev["end_fraction"], c.get("end_fraction", 0.0))
                length_m = max(0.0, prev["end_m"] - prev["start_m"])
                prev["segment_length_m"] = length_m
                prev["corridor_length_m"] = length_m
                prev["accident_count"] += c.get("accident_count", 0)
                prev["fatal_count"] += c.get("fatal_count", 0)
                prev["grievous_count"] += c.get("grievous_count", 0)
                prev["minor_hospitalized_count"] += c.get("minor_hospitalized_count", 0)
                prev["minor_non_hospitalized_count"] += c.get("minor_non_hospitalized_count", 0)
                prev["qualifying_count"] += c.get("qualifying_count", 0)
                prev["fg_count"] = prev.get("fatal_count", 0) + prev.get("grievous_count", 0)
                eff_len = max(length_m, 500.0) / 1000.0
                prev["fg_density"] = round(prev["fg_count"] / eff_len, 2)
                prev["fg_per_500m"] = round(prev["fg_density"] * 0.5, 2)
                prev["accident_density"] = round(prev["accident_count"] / eff_len, 2)
                prev["priority_score"] = prev["fg_density"]
            else:
                merged.append(dict(c))

        # Pass 2: Snap different-priority adjacent segments that have a small gap <= max_snap_gap_m
        for i in range(len(merged) - 1):
            c1 = merged[i]
            c2 = merged[i + 1]
            gap = c2["start_m"] - c1["end_m"]
            if 0.0 < gap <= max_snap_gap_m:
                mid_m = (c1["end_m"] + c2["start_m"]) / 2.0
                if road_len > 0:
                    mid_frac = mid_m / road_len
                else:
                    mid_frac = (c1["end_fraction"] + c2["start_fraction"]) / 2.0
                c1["end_m"] = mid_m
                c1["end_fraction"] = mid_frac
                c1_len = max(0.0, c1["end_m"] - c1["start_m"])
                c1["segment_length_m"] = c1_len
                c1["corridor_length_m"] = c1_len
                
                c2["start_m"] = mid_m
                c2["start_fraction"] = mid_frac
                c2_len = max(0.0, c2["end_m"] - c2["start_m"])
                c2["segment_length_m"] = c2_len
                c2["corridor_length_m"] = c2_len

        refined_segments.extend(merged)

    return refined_segments

# Backward compatibility alias
snap_corridor_gaps = snap_segment_blackspot_gaps


def compute_segment_blackspots(
    db: Session,
    district: Optional[Union[str, List[str]]] = None,
    year: Optional[Union[str, List[str], int, List[int]]] = None,
    road_classification: Optional[Union[str, List[str]]] = None,
    weather_condition: Optional[Union[str, List[str]]] = None,
    light_condition: Optional[Union[str, List[str]]] = None,
    collision_type: Optional[Union[str, List[str]]] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    taluka: Optional[Union[str, List[str]]] = None,
    number_of_vehicles: Optional[Union[str, List[str]]] = None,
    police_station: Optional[Union[str, List[str]]] = None,
    visibility: Optional[Union[str, List[str]]] = None,
    severity: Optional[Union[str, List[str]]] = None,
    is_pedestrian: bool = False,
    window_size_m: float = 500.0,
    merge_threshold_m: float = 100.0,
    min_qualifying_crashes: int = 3,
    buffer_distance_m: float = 100.0
) -> Dict[str, Any]:
    """
    Computes continuous segment blackspots using centerline road datasets.
    Accidents within buffer_distance_m (default 100m) are snapped and analyzed along the road segments.
    """
    # Base window is strictly 500m as specified.
    effective_window_size_m = 500.0
    effective_merge_threshold_m = 0.0 if (merge_threshold_m is None or merge_threshold_m > 50.0) else merge_threshold_m

    dist_list = []
    if district:
        dist_list = district if isinstance(district, list) else [district]

    raw_features = get_centerline_features_for_districts(dist_list if dist_list else None, db=db)
    target_features = decompose_to_linestrings(raw_features)
    if not target_features:
        logger.info(f"No centerline road segments found for districts: {dist_list}")
        return {"type": "FeatureCollection", "features": []}

    all_segments = []
    road_lengths_map = {}
    feature_geoms_map = {}

    for idx, road_feat in enumerate(target_features):
        props = road_feat.get("properties", {}) or {}
        road_id = props.get("road_db_id") or (48000 + idx)
        district_name = props.get("DISTRICT", "Gujarat")

        r_name = props.get("road_name")
        r_source = str(props.get("road_source_id", "")).lower()
        if not r_name or r_name == "Unknown":
            r_name = "NE 1" if ("ne1" in r_source or "ne 1" in r_source) else "NH 48"

        r_class = props.get("road_classification")
        if not r_class or r_class == "Unknown":
            r_class = "Expressway" if ("ne1" in r_source or "ne 1" in r_source) else "National Highway"

        geom_json_str = json.dumps(road_feat.get("geometry", {}))

        # 1. Compute segment length in meters
        length_query = db.execute(
            text("SELECT ST_Length(ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON(:geom), 4326), 3857))"),
            {"geom": geom_json_str}
        ).scalar()
        road_length_m = float(length_query or 0.0)
        if road_length_m <= 0.0:
            continue

        road_lengths_map[road_id] = road_length_m
        feature_geoms_map[road_id] = {
            "geom_json_str": geom_json_str,
            "district": district_name,
            "road_name": r_name,
            "road_classification": r_class,
        }

        # 2. Query accidents within buffer_distance_m of this segment
        base_query = db.query(
            Accident.id.label("accident_id"),
            Accident.severity,
            Accident.number_of_vehicles,
            Accident.accident_date_time,
            func.ST_LineLocatePoint(
                func.ST_SetSRID(func.ST_GeomFromGeoJSON(geom_json_str), 4326),
                Accident.location
            ).label("fraction"),
        ).filter(
            Accident.location.isnot(None),
            Accident.requires_attention == False,
            func.ST_DWithin(
                func.ST_Transform(Accident.location, 3857),
                func.ST_Transform(func.ST_SetSRID(func.ST_GeomFromGeoJSON(geom_json_str), 4326), 3857),
                buffer_distance_m
            )
        )

        if is_pedestrian:
            base_query = base_query.filter(
                (
                    func.coalesce(Accident.pedestrian_killed, 0) +
                    func.coalesce(Accident.pedestrian_grievous_injury, 0) +
                    func.coalesce(Accident.pedestrian_minor_injury, 0)
                ) > 0
            )

        # Apply filters (district, year, severity, weather, etc.)
        filtered_query = apply_filters(
            base_query,
            district=district,
            year=year,
            road_classification=road_classification,
            weather_condition=weather_condition,
            light_condition=light_condition,
            collision_type=collision_type,
            date_from=date_from,
            date_to=date_to,
            taluka=taluka,
            db=db,
            number_of_vehicles=number_of_vehicles,
            police_station=police_station,
            visibility=visibility,
        )

        if severity:
            if isinstance(severity, list):
                filtered_query = filtered_query.filter(Accident.severity.in_(severity))
            else:
                filtered_query = filtered_query.filter(Accident.severity == severity)

        rows = filtered_query.all()
        if not rows:
            continue

        accidents_data = [
            {
                "accident_id": r.accident_id,
                "road_id": road_id,
                "severity": r.severity,
                "fraction": float(r.fraction),
                "road_length_m": road_length_m,
                "number_of_vehicles": r.number_of_vehicles or 0,
            }
            for r in rows
        ]

        # 3. Sliding window analysis (strictly 500m base window)
        candidates = network_sliding_window(
            accidents_data,
            window_size_m=effective_window_size_m,
            min_qualifying_crashes=min_qualifying_crashes
        )

        if not candidates:
            continue

        # 4. Merge candidate segments
        segments = generate_segment_blackspots(
            candidates,
            merge_distance_threshold_m=effective_merge_threshold_m
        )
        all_segments.extend(segments)

    if not all_segments:
        return {"type": "FeatureCollection", "features": []}

    # 5. Rank and assign 3-class priority levels
    ranked_segments = rank_segment_blackspots(all_segments, road_lengths_map)

    # 5b. Close any small gaps (<= 50m) between adjacent segments along the same road
    seamless_segments = snap_segment_blackspot_gaps(ranked_segments, road_lengths_map, max_snap_gap_m=50.0)

    # 6. Extract geometries for each segment blackspot
    features = []
    for c in seamless_segments:
        road_id = c["road_id"]
        meta = feature_geoms_map.get(road_id)
        if not meta:
            continue

        geom_str = meta["geom_json_str"]
        district_name = meta["district"]
        r_name = meta.get("road_name", "NH 48")
        r_class = meta.get("road_classification", "National Highway")

        # PostGIS query to get the sliced segment LineString geometry and start/end coordinates
        geom_res = db.execute(
            text("""
                SELECT 
                    ST_AsGeoJSON(ST_LineSubstring(geom, :start_f, :end_f)) AS geom_json,
                    ST_Y(ST_StartPoint(ST_LineSubstring(geom, :start_f, :end_f))) AS start_lat,
                    ST_X(ST_StartPoint(ST_LineSubstring(geom, :start_f, :end_f))) AS start_lon,
                    ST_Y(ST_EndPoint(ST_LineSubstring(geom, :start_f, :end_f))) AS end_lat,
                    ST_X(ST_EndPoint(ST_LineSubstring(geom, :start_f, :end_f))) AS end_lon
                FROM (
                    SELECT ST_SetSRID(ST_GeomFromGeoJSON(:geom_json_str), 4326) AS geom
                ) sub
            """),
            {
                "geom_json_str": geom_str,
                "start_f": max(0.0, min(1.0, c["start_fraction"])),
                "end_f": max(0.0, min(1.0, c["end_fraction"]))
            }
        ).first()

        if geom_res and geom_res.geom_json:
            seg_id = c.get("segment_id", c.get("corridor_id"))
            seg_len = round(c.get("segment_length_m", c.get("corridor_length_m", 0.0)), 2)
            seg_rank = c.get("segment_rank", c.get("corridor_rank"))

            features.append({
                "type": "Feature",
                "geometry": json.loads(geom_res.geom_json),
                "properties": {
                    "segment_id": seg_id,
                    "corridor_id": seg_id,
                    "road_id": c["road_id"],
                    "road_name": f"{r_name} ({district_name.title()})",
                    "road_classification": r_class,
                    "district": district_name,
                    "road_length": round(c.get("road_length", 0.0), 2),
                    "segment_length": seg_len,
                    "corridor_length": seg_len,
                    "start_m": round(c["start_m"], 2),
                    "end_m": round(c["end_m"], 2),
                    "accident_count": c["accident_count"],
                    "fatal_count": c["fatal_count"],
                    "grievous_count": c["grievous_count"],
                    "minor_hospitalized_count": c["minor_hospitalized_count"],
                    "minor_non_hospitalized_count": c["minor_non_hospitalized_count"],
                    "qualifying_count": c["qualifying_count"],
                    "weighted_score": c.get("weighted_score", 0),
                    "accident_density": round(c.get("accident_density", 0.0), 2),
                    "fg_count": c.get("fg_count", c["fatal_count"] + c["grievous_count"]),
                    "fg_density": round(c.get("fg_density", 0.0), 2),
                    "fg_per_500m": round(c.get("fg_per_500m", 0.0), 2),
                    "priority_score": c["priority_score"],
                    "priority_level": c["priority_level"],
                    "segment_rank": seg_rank,
                    "corridor_rank": seg_rank,
                    "start_coordinate": [geom_res.start_lon, geom_res.start_lat],
                    "end_coordinate": [geom_res.end_lon, geom_res.end_lat],
                }
            })

    return {
        "type": "FeatureCollection",
        "features": features
    }


# Backwards compatibility aliases
compute_risk_corridors = compute_segment_blackspots
get_nh48_features_for_districts = get_centerline_features_for_districts
compute_nh48_risk_corridors = compute_segment_blackspots
