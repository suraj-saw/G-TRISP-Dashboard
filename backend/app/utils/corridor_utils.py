from typing import List, Dict, Any, Optional
import hashlib
from app.core.constants import CORRIDOR_MERGE_THRESHOLD_M
from app.core.gis_config import (
    PRIORITY_WEIGHT_FATAL,
    PRIORITY_WEIGHT_GRIEVOUS,
    PRIORITY_WEIGHT_MINOR_HOSP,
    PRIORITY_WEIGHT_MINOR_NON_HOSP
)

def _generate_corridor_id(road_id: int, start_m: float, end_m: float) -> str:
    """
    Generates a stable, deterministic corridor ID based on the road and normalized bounds.
    Bounds are rounded to the nearest integer meter to avoid floating-point drift.
    """
    normalized_start = round(start_m)
    normalized_end = round(end_m)
    raw_str = f"corridor_{road_id}_{normalized_start}_{normalized_end}"
    return hashlib.md5(raw_str.encode('utf-8')).hexdigest()[:12]

def generate_risk_corridors(
    blackspot_segments: List[Dict[str, Any]],
    merge_distance_threshold_m: float = CORRIDOR_MERGE_THRESHOLD_M
) -> List[Dict[str, Any]]:
    """
    Consumes raw blackspot segments and merges adjacent/overlapping segments on the same road
    into continuous risk corridors. 
    Returns raw aggregated statistics.
    """
    # Group segments by road_id
    roads = {}
    for seg in blackspot_segments:
        r_id = seg["road_id"]
        if r_id not in roads:
            roads[r_id] = []
        roads[r_id].append(seg)
        
    corridors = []
    
    for r_id, segments in roads.items():
        # Sort deterministically by start_m, then end_m
        segments.sort(key=lambda x: (x["start_m"], x["end_m"]))
        
        current_corridor = None
        
        for seg in segments:
            if current_corridor is None:
                current_corridor = {
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
                    "accident_ids": set(seg.get("accident_ids", []) or seg.get("accident_ids", []))
                }
            else:
                # Check for overlap or adjacency within threshold
                gap = seg["start_m"] - current_corridor["end_m"]
                
                if gap <= merge_distance_threshold_m:
                    # Merge segment into current corridor
                    current_corridor["end_m"] = max(current_corridor["end_m"], seg["end_m"])
                    current_corridor["start_fraction"] = min(current_corridor["start_fraction"], seg.get("start_fraction", 1.0))
                    current_corridor["end_fraction"] = max(current_corridor["end_fraction"], seg.get("end_fraction", 0.0))
                    
                    # Accumulate unique accidents to prevent double counting
                    new_acc_ids = set(seg.get("accident_ids", [])) - current_corridor["accident_ids"]
                    
                    if new_acc_ids:
                        current_corridor["accident_ids"].update(new_acc_ids)
                        current_corridor["accident_count"] += seg.get("accident_count", 0)
                        current_corridor["fatal_count"] += seg.get("fatal_count", 0)
                        current_corridor["grievous_count"] += seg.get("grievous_count", 0)
                        current_corridor["minor_hospitalized_count"] += seg.get("minor_hospitalized_count", 0)
                        current_corridor["minor_non_hospitalized_count"] += seg.get("minor_non_hospitalized_count", 0)
                        current_corridor["qualifying_count"] += seg.get("qualifying_count", 0)
                else:
                    # Gap too large, finalize current corridor and start new one
                    corridors.append(current_corridor)
                    current_corridor = {
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
                    
        if current_corridor is not None:
            corridors.append(current_corridor)

    # Finalize corridors with ID and list of accident ids
    for c in corridors:
        c["corridor_id"] = _generate_corridor_id(c["road_id"], c["start_m"], c["end_m"])
        c["corridor_length_m"] = max(0.0, c["end_m"] - c["start_m"])
        c["accident_ids"] = list(c["accident_ids"])
    return corridors

def rank_corridors(corridors: List[Dict[str, Any]], road_lengths_map: Optional[Dict[int, float]] = None) -> List[Dict[str, Any]]:
    """
    Ranks corridors by calculating priority scores, densities, and assigning priority levels.
    road_lengths_map provides total road length for context (road_id -> length).
    """
    if road_lengths_map is None:
        road_lengths_map = {}
        
    for c in corridors:
        # 1. Weighted severity score (using MoRTH standard weights)
        weighted_score = (
            c.get("fatal_count", 0) * PRIORITY_WEIGHT_FATAL +
            c.get("grievous_count", 0) * PRIORITY_WEIGHT_GRIEVOUS +
            c.get("minor_hospitalized_count", 0) * PRIORITY_WEIGHT_MINOR_HOSP +
            c.get("minor_non_hospitalized_count", 0) * PRIORITY_WEIGHT_MINOR_NON_HOSP
        )
        c["weighted_score"] = weighted_score
        
        # 2. Accident density (accidents per km)
        length_km = c["corridor_length_m"] / 1000.0
        c["accident_density"] = c["accident_count"] / length_km if length_km > 0 else 0.0
        
        # 3. Priority score calculation
        c["priority_score"] = weighted_score
        
        # 4. Add road total length for context
        c["road_length"] = road_lengths_map.get(c["road_id"], 0.0)

    # 5. Calculate Dynamic Priority Levels (Equal Interval Binning)
    if corridors:
        min_score = min(c["priority_score"] for c in corridors)
        max_score = max(c["priority_score"] for c in corridors)
        
        if max_score == min_score:
            # Fallback if all corridors have identical scores
            for c in corridors:
                c["priority_level"] = "Medium"
        else:
            interval = (max_score - min_score) / 5.0
            thresholds = {
                "Low": min_score + interval,
                "Medium": min_score + 2 * interval,
                "High": min_score + 3 * interval,
                "Very High": min_score + 4 * interval
                # Anything above Very High is Critical
            }
            
            for c in corridors:
                score = c["priority_score"]
                if score < thresholds["Low"]:
                    c["priority_level"] = "Low"
                elif score < thresholds["Medium"]:
                    c["priority_level"] = "Medium"
                elif score < thresholds["High"]:
                    c["priority_level"] = "High"
                elif score < thresholds["Very High"]:
                    c["priority_level"] = "Very High"
                else:
                    c["priority_level"] = "Critical"

    # Sort deterministically: highest priority score, then highest density, then ID
    corridors.sort(
        key=lambda x: (x["priority_score"], x["accident_density"], x["corridor_id"]), 
        reverse=True
    )
    
    # Assign rank
    for idx, c in enumerate(corridors):
        c["corridor_rank"] = idx + 1
        
    return corridors
