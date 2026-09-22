# backend/app/utils/segment_blackspot_utils.py

"""
Segment Blackspots Utilities.

Contains aggregation, merging, density calculation, and priority ranking
algorithms for continuous road segment blackspots.
"""

from typing import List, Dict, Any, Optional
import hashlib
from app.core.constants import (
    SEGMENT_BLACKSPOT_MERGE_THRESHOLD_M,
    CORRIDOR_MERGE_THRESHOLD_M,
)
from app.core.gis_config import (
    PRIORITY_WEIGHT_FATAL,
    PRIORITY_WEIGHT_GRIEVOUS,
    PRIORITY_WEIGHT_MINOR_HOSP,
    PRIORITY_WEIGHT_MINOR_NON_HOSP
)

def _generate_segment_id(road_id: int, start_m: float, end_m: float) -> str:
    """
    Generates a stable, deterministic segment blackspot ID based on the road and normalized bounds.
    Bounds are rounded to the nearest integer meter to avoid floating-point drift.
    """
    normalized_start = round(start_m)
    normalized_end = round(end_m)
    raw_str = f"segment_{road_id}_{normalized_start}_{normalized_end}"
    return hashlib.md5(raw_str.encode('utf-8')).hexdigest()[:12]

# Alias for backward compatibility
_generate_corridor_id = _generate_segment_id

def generate_segment_blackspots(
    blackspot_segments: List[Dict[str, Any]],
    merge_distance_threshold_m: float = SEGMENT_BLACKSPOT_MERGE_THRESHOLD_M
) -> List[Dict[str, Any]]:
    """
    Consumes candidate blackspot segments and merges adjacent/overlapping segments on the same road
    into continuous segment blackspots. 
    Returns raw aggregated statistics.
    """
    # Group segments by road_id
    roads = {}
    for seg in blackspot_segments:
        r_id = seg["road_id"]
        if r_id not in roads:
            roads[r_id] = []
        roads[r_id].append(seg)
        
    segments_out = []
    
    for r_id, segments in roads.items():
        # Sort deterministically by start_m, then end_m
        segments.sort(key=lambda x: (x["start_m"], x["end_m"]))
        
        current_segment = None
        
        for seg in segments:
            if current_segment is None:
                current_segment = {
                    "road_id": r_id,
                    "start_m": seg["start_m"],
                    "end_m": seg["end_m"],
                    "start_fraction": seg.get("start_fraction", 0.0),
                    "end_fraction": seg.get("end_fraction", 0.0),
                    "accident_count": seg.get("accident_count", 0),
                    "fatal_count": seg.get("fatal_count", 0),
                    "grievous_count": seg.get("grievous_count", 0),
                    "minor_hospitalized_count": seg.get("minor_hospitalized_count", 0),
                    "minor_non_hospitalized_count": seg.get("minor_non_hospitalized_count", 0),
                    "qualifying_count": seg.get("qualifying_count", 0),
                    "accident_ids": set(seg.get("accident_ids", []) or [])
                }
            else:
                # Check for overlap or adjacency within threshold
                gap = seg["start_m"] - current_segment["end_m"]
                
                if gap <= merge_distance_threshold_m:
                    # Merge segment into current segment blackspot
                    current_segment["end_m"] = max(current_segment["end_m"], seg["end_m"])
                    current_segment["start_fraction"] = min(current_segment["start_fraction"], seg.get("start_fraction", 1.0))
                    current_segment["end_fraction"] = max(current_segment["end_fraction"], seg.get("end_fraction", 0.0))
                    
                    # Accumulate unique accidents to prevent double counting
                    new_acc_ids = set(seg.get("accident_ids", [])) - current_segment["accident_ids"]
                    
                    if new_acc_ids:
                        current_segment["accident_ids"].update(new_acc_ids)
                        current_segment["accident_count"] += seg.get("accident_count", 0)
                        current_segment["fatal_count"] += seg.get("fatal_count", 0)
                        current_segment["grievous_count"] += seg.get("grievous_count", 0)
                        current_segment["minor_hospitalized_count"] += seg.get("minor_hospitalized_count", 0)
                        current_segment["minor_non_hospitalized_count"] += seg.get("minor_non_hospitalized_count", 0)
                        current_segment["qualifying_count"] += seg.get("qualifying_count", 0)
                else:
                    # Gap too large, finalize current segment and start new one
                    segments_out.append(current_segment)
                    current_segment = {
                        "road_id": r_id,
                        "start_m": seg["start_m"],
                        "end_m": seg["end_m"],
                        "start_fraction": seg.get("start_fraction", 0.0),
                        "end_fraction": seg.get("end_fraction", 0.0),
                        "accident_count": seg.get("accident_count", 0),
                        "fatal_count": seg.get("fatal_count", 0),
                        "grievous_count": seg.get("grievous_count", 0),
                        "minor_hospitalized_count": seg.get("minor_hospitalized_count", 0),
                        "minor_non_hospitalized_count": seg.get("minor_non_hospitalized_count", 0),
                        "qualifying_count": seg.get("qualifying_count", 0),
                        "accident_ids": set(seg.get("accident_ids", []))
                    }
                    
        if current_segment is not None:
            segments_out.append(current_segment)

    # Finalize segments with ID and list of accident ids
    for c in segments_out:
        seg_id = _generate_segment_id(c["road_id"], c["start_m"], c["end_m"])
        length_m = max(0.0, c["end_m"] - c["start_m"])
        c["segment_id"] = seg_id
        c["segment_length_m"] = length_m
        # Backward compatibility fields
        c["corridor_id"] = seg_id
        c["corridor_length_m"] = length_m
        c["accident_ids"] = list(c["accident_ids"])

    return segments_out


def rank_segment_blackspots(
    segments: List[Dict[str, Any]], 
    road_lengths_map: Optional[Dict[int, float]] = None
) -> List[Dict[str, Any]]:
    """
    Ranks segment blackspots by calculating priority scores, crash densities, and assigning 3-class priority levels:
    - "Critical Blackspot" (Brown)
    - "High-Priority" (Orange)
    - "Moderate-Priority" (Yellow)

    Classification formula based on crash density with average Fatal + Grievous (FG) crashes in 500m as base:
    - 10 FG crashes in 1 km (5 FG in 500m, density = 10 FG/km) -> Moderate-Priority (< 20 FG/km)
    - 40 FG crashes in 2 km (10 FG in 500m, density = 20 FG/km) -> High-Priority (20 to < 25 FG/km)
    - >= 25 FG crashes in 1 km (>= 12.5 FG in 500m, density >= 25 FG/km) -> Critical Blackspot
    """
    if road_lengths_map is None:
        road_lengths_map = {}
        
    for c in segments:
        # 1. Weighted severity score (using MoRTH standard weights)
        weighted_score = (
            c.get("fatal_count", 0) * PRIORITY_WEIGHT_FATAL +
            c.get("grievous_count", 0) * PRIORITY_WEIGHT_GRIEVOUS +
            c.get("minor_hospitalized_count", 0) * PRIORITY_WEIGHT_MINOR_HOSP +
            c.get("minor_non_hospitalized_count", 0) * PRIORITY_WEIGHT_MINOR_NON_HOSP
        )
        c["weighted_score"] = weighted_score
        
        # 2. Crash density based on 500m base segment
        seg_len = c.get("segment_length_m", c.get("corridor_length_m", 0.0))
        effective_length_km = max(seg_len, 500.0) / 1000.0
        fg_count = c.get("fatal_count", 0) + c.get("grievous_count", 0)
        fg_density = fg_count / effective_length_km if effective_length_km > 0 else 0.0
        
        c["fg_count"] = fg_count
        c["fg_density"] = round(fg_density, 2)
        c["fg_per_500m"] = round(fg_density * 0.5, 2)
        c["accident_density"] = round(c["accident_count"] / effective_length_km, 2) if effective_length_km > 0 else 0.0
        
        # Priority score reflects the FG crash density
        c["priority_score"] = round(fg_density, 2)
        
        # 3. Add road total length for context
        c["road_length"] = road_lengths_map.get(c.get("road_id"), 0.0) if road_lengths_map else 0.0

        # 4. 3-class priority classification:
        # Base: 500m segment
        # < 20 FG/km (< 10 FG in 500m) -> Moderate-Priority (e.g. 10 FG in 1 km -> 10 FG/km)
        # 20 to < 25 FG/km (10 to < 12.5 FG in 500m) -> High-Priority (e.g. 40 FG in 2 km -> 20 FG/km)
        # >= 25 FG/km (>= 12.5 FG in 500m) -> Critical Blackspot
        if fg_density >= 25.0:
            c["priority_level"] = "Critical Blackspot"
        elif fg_density >= 20.0:
            c["priority_level"] = "High-Priority"
        else:
            c["priority_level"] = "Moderate-Priority"

    # Sort deterministically: highest priority score (FG density), then total FG crashes, then ID
    segments.sort(
        key=lambda x: (x["priority_score"], x.get("fg_count", 0), x.get("segment_id", x.get("corridor_id", ""))), 
        reverse=True
    )
    
    # Assign rank
    for idx, c in enumerate(segments):
        c["segment_rank"] = idx + 1
        c["corridor_rank"] = idx + 1
        
    return segments


# Backward compatibility aliases
generate_risk_corridors = generate_segment_blackspots
rank_corridors = rank_segment_blackspots
