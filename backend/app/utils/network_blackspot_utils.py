from typing import List, Dict, Any, Tuple
import math
from app.utils.blackspot_utils import QUALIFYING_SEVERITIES, PRIORITY_WEIGHTS, priority_label_and_color

def get_severity_score(severity: str) -> int:
    """Returns a numeric score for accident severity using MoRTH weights."""
    return PRIORITY_WEIGHTS.get(severity, 0)

def is_qualifying_severity(severity: str) -> bool:
    """Checks if the accident severity qualifies for MoRTH blackspot criteria."""
    return QUALIFYING_SEVERITIES.get(severity, False)

def network_sliding_window(
    accidents: List[Dict[str, Any]],
    window_size_m: float = 500.0,
    step_size_m: float = 50.0,
    min_qualifying_crashes: int = 3
) -> List[Dict[str, Any]]:
    """
    Applies a continuous sliding window analysis along road networks.
    
    Args:
        accidents: List of dictionaries with keys:
            - accident_id
            - road_id
            - fraction (0 to 1, position on road)
            - road_length_m
            - severity
        window_size_m: Size of the sliding window in meters.
        step_size_m: Step size for the sliding window in meters.
        min_qualifying_crashes: Minimum qualifying crashes to be a blackspot candidate.
        
    Returns:
        List of distinct 500m candidate segments (dictionaries) with highest scores.
    """
    # Group accidents by road
    roads = {}
    for acc in accidents:
        r_id = acc["road_id"]
        if r_id not in roads:
            roads[r_id] = {
                "accidents": [],
                "length_m": acc.get("road_length_m", 0.0)
            }
        
        distance_m = acc["fraction"] * roads[r_id]["length_m"]
        severity = acc.get("severity", "Unknown")
        roads[r_id]["accidents"].append({
            "id": acc["accident_id"],
            "distance_m": distance_m,
            "fraction": acc["fraction"],
            "score": get_severity_score(severity),
            "is_qualifying": is_qualifying_severity(severity),
            "severity": severity
        })

    candidate_segments = []

    for r_id, road_data in roads.items():
        road_accidents = sorted(road_data["accidents"], key=lambda x: x["distance_m"])
        if not road_accidents:
            continue
            
        length_m = road_data["length_m"]
        road_candidates = []
        
        # Iterate over the road continuously in steps of step_size_m
        start_m = 0.0
        while start_m <= length_m:
            end_m = min(start_m + window_size_m, length_m)
            
            # Find all accidents in [start_m, end_m]
            window_score = 0
            qualifying_count = 0
            window_acc_ids = []
            
            for acc in road_accidents:
                if start_m <= acc["distance_m"] <= end_m:
                    window_score += acc["score"]
                    if acc["is_qualifying"]:
                        qualifying_count += 1
                    window_acc_ids.append(acc["id"])
                elif acc["distance_m"] > end_m:
                    break # since road_accidents are sorted
                    
            if qualifying_count >= min_qualifying_crashes:
                # Center the 500m segment around the actual qualifying crashes to fix visual misalignment
                accs_in_window = [a for a in road_accidents if a["id"] in window_acc_ids]
                qual_accs = [a for a in accs_in_window if a["is_qualifying"]]
                
                if qual_accs:
                    min_d = min(a["distance_m"] for a in qual_accs)
                    max_d = max(a["distance_m"] for a in qual_accs)
                else:
                    min_d = min(a["distance_m"] for a in accs_in_window)
                    max_d = max(a["distance_m"] for a in accs_in_window)
                    
                center_m = (min_d + max_d) / 2.0
                best_start_m = max(0.0, center_m - window_size_m / 2.0)
                best_end_m = min(length_m, center_m + window_size_m / 2.0)
                
                fatal_count = sum(1 for a in accs_in_window if a.get("severity") == "Fatal")
                grievous_count = sum(1 for a in accs_in_window if a.get("severity") == "Grievous Injury")
                minor_hosp_count = sum(1 for a in accs_in_window if a.get("severity") == "Minor Injury Hospitalized")
                minor_non_count = sum(1 for a in accs_in_window if a.get("severity") == "Minor Injury Non Hospitalized")

                road_candidates.append({
                    "start_m": best_start_m,
                    "end_m": best_end_m,
                    "score": window_score,
                    "qualifying_count": qualifying_count,
                    "fatal_count": fatal_count,
                    "grievous_count": grievous_count,
                    "minor_hospitalized_count": minor_hosp_count,
                    "minor_non_hospitalized_count": minor_non_count,
                    "count": len(window_acc_ids),
                    "acc_ids": window_acc_ids
                })
                
            # Advance sliding window
            if end_m == length_m:
                break # Reached the very end
            start_m += step_size_m
                
        # Overlap Suppression: Greedily pick the highest scoring non-overlapping distinct windows
        if road_candidates:
            # Sort candidates by score (descending), then qualifying_count (descending)
            road_candidates.sort(key=lambda x: (x["score"], x["qualifying_count"]), reverse=True)
            
            kept_candidates = []
            
            for cand in road_candidates:
                # Check for overlap with already kept candidates
                overlap = False
                for kept in kept_candidates:
                    # Two windows overlap if they intersect (excluding boundaries just touching)
                    # For safety, we treat touching boundaries as non-overlapping if strictly `<` is used,
                    # which is correct. A segment [0, 500] and [500, 1000] shouldn't overlap.
                    if cand["start_m"] < kept["end_m"] and cand["end_m"] > kept["start_m"]:
                        overlap = True
                        break
                        
                if not overlap:
                    kept_candidates.append(cand)
            
            # Format and add to final output
            for m in kept_candidates:
                final_start_m = m["start_m"]
                final_end_m = m["end_m"]
                
                start_frac = final_start_m / length_m if length_m > 0 else 0.0
                end_frac = final_end_m / length_m if length_m > 0 else 0.0
                
                label, color = priority_label_and_color(m["score"], m["qualifying_count"])
                
                candidate_segments.append({
                    "road_id": r_id,
                    "start_m": final_start_m,
                    "end_m": final_end_m,
                    "start_fraction": max(0.0, min(1.0, start_frac)),
                    "end_fraction": max(0.0, min(1.0, end_frac)),
                    "score": m["score"],
                    "priority_label": label,
                    "priority_color": color,
                    "qualifying_count": m["qualifying_count"],
                    "fatal_count": m["fatal_count"],
                    "grievous_count": m["grievous_count"],
                    "minor_hospitalized_count": m["minor_hospitalized_count"],
                    "minor_non_hospitalized_count": m["minor_non_hospitalized_count"],
                    "accident_count": m["count"],
                    "accident_ids": m["acc_ids"]
                })

    return candidate_segments
