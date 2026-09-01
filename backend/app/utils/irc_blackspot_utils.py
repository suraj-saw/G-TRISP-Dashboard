import math
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Optional, List, Set, Tuple

# We can import CrashPoint and basic spatial helpers from blackspot_utils
from app.utils.blackspot_utils import CrashPoint, _haversine_m, _build_grid_neighbours, _project_xy, _build_grid, _neighbours_within, _cell_of

EARTH_RADIUS_M: float = 6_371_000.0

# ═══════════════════════════════════════════════════════════════════════════════
# CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════════
# Road network lengths for different districts (in kilometers).
# Used to calculate the baseline Average Annual Total Crashes (AATC).
# Developers can easily update or add new district lengths here.
DISTRICT_ROAD_NETWORK_KM = {
    "Surat": 1900.0,
    "Ahmadabad": 2500.0,
    "Vadodara": 1800.0,
    "Rajkot": 1600.0,
}

# Fallback road network lengths
DEFAULT_DISTRICT_ROAD_NETWORK_KM = 1900.0
DEFAULT_STATE_ROAD_NETWORK_KM = 75000.0
DEFAULT_ROAD_NETWORK_KM = 1900.0


@dataclass
class IrcBlackspot:
    bs_id: int
    crash_count: int
    aatc: float
    category: int
    anchor_lat: float
    anchor_lon: float
    fatal_count: int = 0
    grievous_count: int = 0
    minor_hospitalized_count: int = 0
    minor_non_hospitalized_count: int = 0
    no_injury_count: int = 0
    crash_ids: List[str] = field(default_factory=list)
    vehicle_count: int = 0

def compute_M(total_crashes: int, road_network_km: float = 75000.0, years_of_data: float = 3.0) -> float:
    if road_network_km <= 0 or years_of_data <= 0:
        return 0.0
    return total_crashes / road_network_km / 2.0 / years_of_data

from app.core.gis_config import (
    IRC_CAT_1_MULTIPLIER,
    IRC_CAT_2_MULTIPLIER,
    IRC_CAT_3_MULTIPLIER,
    IRC_CAT_4_MULTIPLIER,
)

def assign_category(aatc: float, M: float) -> Optional[int]:
    if M <= 0:
        return None
    if aatc >= IRC_CAT_1_MULTIPLIER * M:
        return 1
    if aatc >= IRC_CAT_2_MULTIPLIER * M:
        return 2
    if aatc >= IRC_CAT_3_MULTIPLIER * M:
        return 3
    if aatc >= IRC_CAT_4_MULTIPLIER * M:
        return 4
    return None

def irc_greedy_blackspots(
    points: List[CrashPoint],
    radius_m: float = 250.0,
    road_network_km: float = 75000.0,
    years_of_data: float = 3.0,
    total_network_crashes: Optional[int] = None,
) -> List[IrcBlackspot]:
    n = len(points)
    if n == 0:
        return []

    crashes_for_m = total_network_crashes if total_network_crashes is not None else n
    M = compute_M(crashes_for_m, road_network_km, years_of_data)
    min_crashes = int(math.ceil(3.0 * M * years_of_data))
    if min_crashes < 1:
        min_crashes = 1

    neighbours = _build_grid_neighbours(points, radius_m)
    density = [len(neighbours[i]) + 1 for i in range(n)]

    pool = set(range(n))
    raw_clusters = []

    # Bucket queue for O(1) density lookup
    max_d = max(density) if density else 0
    buckets = [set() for _ in range(max_d + 1)]
    for i in range(n):
        buckets[density[i]].add(i)

    current_max_d = max_d
    while current_max_d >= min_crashes:
        if not buckets[current_max_d]:
            current_max_d -= 1
            continue

        best = buckets[current_max_d].pop()
        if best not in pool:
            continue

        circle_set = (neighbours[best] & pool) | {best}
        circle = list(circle_set)

        aatc = len(circle) / years_of_data
        cat = assign_category(aatc, M)
        if cat is not None:
            raw_clusters.append({
                "anchor": best,
                "members": circle,
                "aatc": aatc,
                "category": cat
            })
            pool -= circle_set
            
            # Localized neighbor update
            affected = set()
            for c in circle_set:
                affected.update(neighbours[c])
            
            for i in (affected & pool):
                old_d = density[i]
                neighbours[i] -= circle_set
                new_d = len(neighbours[i]) + 1
                if new_d != old_d:
                    buckets[old_d].discard(i)
                    density[i] = new_d
                    buckets[new_d].add(i)
        else:
            pool.discard(best)
            density[best] = 0

    # Sort raw clusters by AATC descending (Category 1 before 4)
    raw_clusters.sort(key=lambda c: c["aatc"], reverse=True)

    # Suppress overlapping circles using 2D spatial grid (2 * radius_m)
    suppress_m = 2 * radius_m
    ref_lat_rad = math.radians(sum(p.lat for p in points) / n) if points else math.radians(22.5)
    
    grid_cell = max(suppress_m, 100.0)
    suppress_grid = defaultdict(list)
    kept_clusters = []

    for c in raw_clusters:
        p = points[c["anchor"]]
        px, py = _project_xy(p.lat, p.lon, ref_lat_rad)
        gx, gy = int(math.floor(px / grid_cell)), int(math.floor(py / grid_cell))
        
        ok = True
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for (kx, ky) in suppress_grid.get((gx + dx, gy + dy), []):
                    if (px - kx) ** 2 + (py - ky) ** 2 < suppress_m * suppress_m:
                        ok = False
                        break
                if not ok:
                    break
            if not ok:
                break
        
        if ok:
            kept_clusters.append(c)
            suppress_grid[(gx, gy)].append((px, py))

    # Build final list
    blackspots = []
    for i, c in enumerate(kept_clusters, 1):
        severities = [points[j].severity for j in c["members"]]
        fatal = sum(1 for s in severities if s == "Fatal")
        grievous = sum(1 for s in severities if s == "Grievous Injury")
        min_hosp = sum(1 for s in severities if s == "Minor Injury Hospitalized")
        min_non = sum(1 for s in severities if s == "Minor Injury Non Hospitalized")
        no_inj = sum(1 for s in severities if s in ["No Injury", "Damage Only"])
        
        blackspots.append(IrcBlackspot(
            bs_id=i,
            crash_count=len(c["members"]),
            aatc=c["aatc"],
            category=c["category"],
            anchor_lat=points[c["anchor"]].lat,
            anchor_lon=points[c["anchor"]].lon,
            fatal_count=fatal,
            grievous_count=grievous,
            minor_hospitalized_count=min_hosp,
            minor_non_hospitalized_count=min_non,
            no_injury_count=no_inj,
            crash_ids=[str(points[j].accident_db_id) for j in c["members"]],
            vehicle_count=sum(points[j].number_of_vehicles for j in c["members"])
        ))

    return blackspots

def irc_grid_blackspots(
    points: List[CrashPoint],
    radius_m: float = 250.0,
    spacing_m: float = 50.0,
    road_network_km: float = 75000.0,
    years_of_data: float = 3.0,
    total_network_crashes: Optional[int] = None,
) -> List[IrcBlackspot]:
    n = len(points)
    if n == 0:
        return []

    crashes_for_m = total_network_crashes if total_network_crashes is not None else n
    M = compute_M(crashes_for_m, road_network_km, years_of_data)
    min_crashes = int(math.ceil(3.0 * M * years_of_data))
    if min_crashes < 1:
        min_crashes = 1

    ref_lat_rad = math.radians(sum(p.lat for p in points) / n) if points else math.radians(22.5)
    xs = [0.0] * n
    ys = [0.0] * n
    for i, p in enumerate(points):
        xs[i], ys[i] = _project_xy(p.lat, p.lon, ref_lat_rad)

    eff_spacing = max(spacing_m, 100.0) if n > 10000 else spacing_m

    x0, x1 = min(xs) - radius_m, max(xs) + radius_m
    y0, y1 = min(ys) - radius_m, max(ys) + radius_m

    # Create grid points only around actual crash locations
    valid_grid_indices = set()
    for x, y in zip(xs, ys):
        min_i = int(math.floor((x - radius_m - x0) / eff_spacing))
        max_i = int(math.ceil((x + radius_m - x0) / eff_spacing))
        min_j = int(math.floor((y - radius_m - y0) / eff_spacing))
        max_j = int(math.ceil((y + radius_m - y0) / eff_spacing))
        
        for i in range(min_i, max_i + 1):
            for j in range(min_j, max_j + 1):
                valid_grid_indices.add((i, j))
                
    grid_pts = [(x0 + i * eff_spacing, y0 + j * eff_spacing) for (i, j) in valid_grid_indices]

    # Bucket crashes into spatial grid for fast radius lookup
    cell_size = max(radius_m, 1.0)
    crash_grid = _build_grid(xs, ys, cell_size)

    raw_clusters = []
    
    # Check each grid point
    for gidx, (gx, gy) in enumerate(grid_pts):
        members = []
        cell_x, cell_y = _cell_of(gx, gy, cell_size)
        span = int(math.ceil(radius_m / cell_size))
        r2 = radius_m * radius_m
        
        for ix in range(cell_x - span, cell_x + span + 1):
            for iy in range(cell_y - span, cell_y + span + 1):
                for j in crash_grid.get((ix, iy), ()):
                    dx = gx - xs[j]
                    dy = gy - ys[j]
                    if dx * dx + dy * dy <= r2:
                        members.append(j)
        
        if len(members) >= min_crashes:
            aatc = len(members) / years_of_data
            cat = assign_category(aatc, M)
            if cat is not None:
                raw_clusters.append({
                    "gx": gx,
                    "gy": gy,
                    "members": members,
                    "aatc": aatc,
                    "category": cat
                })

    raw_clusters.sort(key=lambda c: c["aatc"], reverse=True)

    suppress_m = 2 * radius_m
    grid_cell = max(suppress_m, 100.0)
    suppress_grid = defaultdict(list)
    kept_clusters = []

    for c in raw_clusters:
        px, py = c["gx"], c["gy"]
        gx, gy = int(math.floor(px / grid_cell)), int(math.floor(py / grid_cell))
        
        ok = True
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for (kx, ky) in suppress_grid.get((gx + dx, gy + dy), []):
                    if (px - kx) ** 2 + (py - ky) ** 2 < suppress_m * suppress_m:
                        ok = False
                        break
                if not ok:
                    break
            if not ok:
                break
                
        if ok:
            kept_clusters.append(c)
            suppress_grid[(gx, gy)].append((px, py))

    # Convert back from projection to lat/lon for centroids
    def inv_project(gx, gy, ref_lat):
        lat = gy / 110_540.0
        lon = gx / (111_320.0 * math.cos(ref_lat))
        return lat, lon

    blackspots = []
    for i, c in enumerate(kept_clusters, 1):
        lat, lon = inv_project(c["gx"], c["gy"], ref_lat_rad)
        severities = [points[j].severity for j in c["members"]]
        fatal = sum(1 for s in severities if s == "Fatal")
        grievous = sum(1 for s in severities if s == "Grievous Injury")
        min_hosp = sum(1 for s in severities if s == "Minor Injury Hospitalized")
        min_non = sum(1 for s in severities if s == "Minor Injury Non Hospitalized")
        no_inj = sum(1 for s in severities if s in ["No Injury", "Damage Only"])
        
        blackspots.append(IrcBlackspot(
            bs_id=i,
            crash_count=len(c["members"]),
            aatc=c["aatc"],
            category=c["category"],
            anchor_lat=lat,
            anchor_lon=lon,
            fatal_count=fatal,
            grievous_count=grievous,
            minor_hospitalized_count=min_hosp,
            minor_non_hospitalized_count=min_non,
            no_injury_count=no_inj,
            crash_ids=[str(points[j].accident_db_id) for j in c["members"]],
            vehicle_count=sum(points[j].number_of_vehicles for j in c["members"])
        ))

    return blackspots

def irc_blackspots_to_geojson(blackspots: List[IrcBlackspot], radius_m: float) -> dict:
    from app.utils.blackspot_utils import circle_polygon_geojson
    
    CATEGORY_COLORS = {
        4: "#91CF60", # light green
        3: "#FFEB64", # yellow
        2: "#FD8D3C", # orange
        1: "#D73027", # red
    }
    CATEGORY_LABELS = {
        1: "Category 1 (highest priority)",
        2: "Category 2",
        3: "Category 3",
        4: "Category 4 (lowest priority)",
    }
    
    circle_features = []
    centroid_features = []

    for bs in blackspots:
        props = {
            "bs_id": bs.bs_id,
            "crash_count": bs.crash_count,
            "aatc": round(bs.aatc, 2),
            "category": bs.category,
            "category_label": CATEGORY_LABELS.get(bs.category, "Unknown"),
            "category_color": CATEGORY_COLORS.get(bs.category, "#000000"),
            "fatal_count": bs.fatal_count,
            "grievous_count": bs.grievous_count,
            "minor_hospitalized_count": bs.minor_hospitalized_count,
            "minor_non_hospitalized_count": bs.minor_non_hospitalized_count,
            "no_injury_count": bs.no_injury_count,
            "crash_ids": ", ".join(bs.crash_ids),
            "vehicle_count": bs.vehicle_count,
            "label": f"IRC-BS#{bs.bs_id} | Cat {bs.category} | AATC {round(bs.aatc, 2)}",
        }
        
        circle_features.append({
            "type": "Feature",
            "properties": props,
            "geometry": circle_polygon_geojson(bs.anchor_lat, bs.anchor_lon, radius_m),
        })
        centroid_features.append({
            "type": "Feature",
            "properties": props,
            "geometry": {
                "type": "Point",
                "coordinates": [bs.anchor_lon, bs.anchor_lat],
            },
        })

    return {
        "circles": {"type": "FeatureCollection", "features": circle_features},
        "centroids": {"type": "FeatureCollection", "features": centroid_features},
    }
