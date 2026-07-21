from typing import List, Dict, Any, Tuple
import math

def get_severity_score(severity: str) -> int:
    """Returns a numeric score for accident severity."""
    s = (severity or "").lower()
    if "fatal" in s:
        return 6
    if "grievous" in s:
        return 3
    if "minor injury hospitalized" in s:
        return 2
    if "minor injury non" in s:
        return 1
    return 0

def network_sliding_window(
    accidents: List[Dict[str, Any]],
    window_size_m: float = 500.0,
    score_threshold: int = 15
) -> List[Dict[str, Any]]:
    """
    Applies a sliding window analysis along road networks.
    
    Args:
        accidents: List of dictionaries with keys:
            - accident_id
            - road_id
            - fraction (0 to 1, position on road)
            - road_length_m
            - severity
        window_size_m: Size of the sliding window in meters.
        score_threshold: Minimum severity score to be considered a candidate.
        
    Returns:
        List of merged candidate segments (dictionaries).
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
        roads[r_id]["accidents"].append({
            "id": acc["accident_id"],
            "distance_m": distance_m,
            "fraction": acc["fraction"],
            "score": get_severity_score(acc.get("severity", "")),
            "severity": acc.get("severity", "Unknown")
        })

    candidate_segments = []

    for r_id, road_data in roads.items():
        road_accidents = sorted(road_data["accidents"], key=lambda x: x["distance_m"])
        if not road_accidents:
            continue
            
        length_m = road_data["length_m"]
        road_candidates = []
        
        for i, start_acc in enumerate(road_accidents):
            start_m = start_acc["distance_m"]
            end_m = start_m + window_size_m
            
            # Find all accidents in [start_m, end_m]
            window_score = 0
            window_acc_ids = []
            
            for j in range(i, len(road_accidents)):
                acc = road_accidents[j]
                if acc["distance_m"] <= end_m:
                    window_score += acc["score"]
                    window_acc_ids.append(acc["id"])
                else:
                    break
                    
            if window_score >= score_threshold:
                road_candidates.append({
                    "start_m": start_m,
                    "end_m": end_m,
                    "score": window_score,
                    "count": len(window_acc_ids),
                    "acc_ids": window_acc_ids
                })
                
        # Merge overlapping/adjacent candidate windows
        if road_candidates:
            merged = []
            curr = road_candidates[0]
            
            for next_cand in road_candidates[1:]:
                if next_cand["start_m"] <= curr["end_m"]:
                    curr["end_m"] = max(curr["end_m"], next_cand["end_m"])
                    unique_acc = set(curr["acc_ids"] + next_cand["acc_ids"])
                    curr["acc_ids"] = list(unique_acc)
                else:
                    merged.append(curr)
                    curr = next_cand
            
            merged.append(curr)
            
            for m in merged:
                acc_in_segment = [a for a in road_accidents if a["id"] in m["acc_ids"]]
                total_score = sum(a["score"] for a in acc_in_segment)
                
                final_start_m = m["start_m"]
                final_end_m = min(m["end_m"], length_m)
                
                start_frac = final_start_m / length_m if length_m > 0 else 0.0
                end_frac = final_end_m / length_m if length_m > 0 else 0.0
                
                candidate_segments.append({
                    "road_id": r_id,
                    "start_m": final_start_m,
                    "end_m": final_end_m,
                    "start_fraction": max(0.0, min(1.0, start_frac)),
                    "end_fraction": max(0.0, min(1.0, end_frac)),
                    "score": total_score,
                    "accident_count": len(acc_in_segment),
                    "accident_ids": m["acc_ids"]
                })

    return candidate_segments
