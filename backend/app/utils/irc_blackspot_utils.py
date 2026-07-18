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

# Fallback road network length if the district is not specifically listed above
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

def compute_M(total_crashes: int, road_network_km: float = 1900.0, years_of_data: float = 3.0) -> float:
    if road_network_km <= 0 or years_of_data <= 0:
        return 0.0
    return total_crashes / road_network_km / 2.0 / years_of_data

def assign_category(aatc: float, M: float) -> Optional[int]:
    if M <= 0:
        return None
    if aatc >= 15.0 * M:
        return 1
    if aatc >= 10.0 * M:
        return 2
    if aatc >= 5.0 * M:
        return 3
    if aatc >= 3.0 * M:
        return 4
    return None

def irc_greedy_blackspots(
    points: List[CrashPoint],
    radius_m: float = 250.0,
    road_network_km: float = 1900.0,
    years_of_data: float = 3.0,
) -> List[IrcBlackspot]:
    n = len(points)
    if n == 0:
        return []

    M = compute_M(n, road_network_km, years_of_data)
    min_crashes = int(math.ceil(3.0 * M * years_of_data))
    if min_crashes < 1:
        min_crashes = 1

    neighbours = _build_grid_neighbours(points, radius_m)
    density = [len(neighbours[i]) + 1 for i in range(n)]

    pool = set(range(n))
    raw_clusters = []

    while pool:
        best = max(pool, key=lambda i: density[i])
        if density[best] < min_crashes:
            break

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
            for i in pool:
                neighbours[i] -= circle_set
                density[i] = len(neighbours[i]) + 1
        else:
            pool.discard(best)
            density[best] = 0

    # Sort raw clusters by AATC descending (Category 1 before 4)
    raw_clusters.sort(key=lambda c: c["aatc"], reverse=True)

    # Suppress overlapping circles (2 * radius_m)
    suppress_m = 2 * radius_m
    kept_clusters = []
    kept_xy = []

    for c in raw_clusters:
        p = points[c["anchor"]]
        px, py = _project_xy(p.lat, p.lon, 0.0) # Using simple projection for distance check
        
        ok = True
        for (kx, ky) in kept_xy:
            if math.hypot(px - kx, py - ky) < suppress_m:
                ok = False
                break
        
        if ok:
            kept_clusters.append(c)
            kept_xy.append((px, py))

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
            crash_ids=[str(points[j].accident_db_id) for j in c["members"]]
        ))

    return blackspots

def irc_grid_blackspots(
    points: List[CrashPoint],
    radius_m: float = 250.0,
    spacing_m: float = 50.0,
    road_network_km: float = 1900.0,
    years_of_data: float = 3.0,
) -> List[IrcBlackspot]:
    n = len(points)
    if n == 0:
        return []

    M = compute_M(n, road_network_km, years_of_data)
    min_crashes = int(math.ceil(3.0 * M * years_of_data))
    if min_crashes < 1:
        min_crashes = 1

    ref_lat_rad = math.radians(sum(p.lat for p in points) / n)
    xs = [0.0] * n
    ys = [0.0] * n
    for i, p in enumerate(points):
        xs[i], ys[i] = _project_xy(p.lat, p.lon, ref_lat_rad)

    x0, x1 = min(xs) - radius_m, max(xs) + radius_m
    y0, y1 = min(ys) - radius_m, max(ys) + radius_m

    # Create grid points
    grid_pts = []
    cx = x0
    while cx <= x1:
        cy = y0
        while cy <= y1:
            grid_pts.append((cx, cy))
            cy += spacing_m
        cx += spacing_m

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
    kept_clusters = []
    kept_xy = []

    for c in raw_clusters:
        px, py = c["gx"], c["gy"]
        ok = True
        for (kx, ky) in kept_xy:
            if math.hypot(px - kx, py - ky) < suppress_m:
                ok = False
                break
        if ok:
            kept_clusters.append(c)
            kept_xy.append((px, py))

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
            crash_ids=[str(points[j].accident_db_id) for j in c["members"]]
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
