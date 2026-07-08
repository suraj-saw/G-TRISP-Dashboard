# backend/app/utils/kde_utils.py
"""
Quartic-kernel KDE density surface — identical formula to QGIS's built-in
Heatmap tool and the offline notebook pipeline's build_kde_raster().

Renders the result as an RGBA PNG (encoded with stdlib zlib/struct, no
Pillow dependency) plus the geographic bounding quad needed to drop it
onto a MapLibre `image` source as a georeferenced overlay.
"""

from __future__ import annotations

import math
import struct
import zlib
from typing import Optional

import numpy as np


# ---------------------------------------------------------------------------
# Local planar projection helpers (cheap equirectangular — fine at city scale)
# ---------------------------------------------------------------------------

def _project_xy(lat: float, lon: float, ref_lat_rad: float) -> tuple[float, float]:
    x = lon * 111_320.0 * math.cos(ref_lat_rad)
    y = lat * 110_540.0
    return x, y


def _unproject_xy(x: float, y: float, ref_lat_rad: float) -> tuple[float, float]:
    lon = x / (111_320.0 * math.cos(ref_lat_rad))
    lat = y / 110_540.0
    return lat, lon


# ---------------------------------------------------------------------------
# Colour ramp — mirrors the notebook's write_kde_qml() stops
# (green, semi-transparent at the low end -> yellow -> orange -> red)
# ---------------------------------------------------------------------------

_COLOR_STOPS = [
    (0.0,   (26, 150, 65, 0)),      # zero density -> fully transparent
    (0.1,   (26, 150, 65, 90)),
    (15.0,  (145, 207, 100, 170)),
    (30.0,  (255, 255, 102, 220)),
    (50.0,  (253, 174, 97, 255)),
    (100.0, (215, 25, 28, 255)),
]


def compute_kde_heatmap(
    lats: list[float],
    lons: list[float],
    radius_m: float = 500.0,
    pixel_m: float = 25.0,
    max_pixels: int = 900_000,
) -> Optional[dict]:
    """
    Build a quartic-kernel KDE raster from accident coordinates.

    radius_m : kernel bandwidth — every crash spreads its influence over
               this radius (QGIS Heatmap "Radius" parameter; notebook
               default 500 m).
    pixel_m  : output raster cell size in metres.

    Returns a dict with PNG bytes, the four geographic corner coordinates
    (top-left, top-right, bottom-right, bottom-left — the order MapLibre's
    ImageSource expects), and basic metadata. Returns None if no points.
    """
    n = len(lats)
    if n == 0:
        return None

    ref_lat_rad = math.radians(sum(lats) / n)
    xs = np.empty(n)
    ys = np.empty(n)
    for i in range(n):
        xs[i], ys[i] = _project_xy(lats[i], lons[i], ref_lat_rad)

    pad = radius_m
    x0, x1 = float(xs.min() - pad), float(xs.max() + pad)
    y0, y1 = float(ys.min() - pad), float(ys.max() + pad)

    ncols = max(4, int(math.ceil((x1 - x0) / pixel_m)))
    nrows = max(4, int(math.ceil((y1 - y0) / pixel_m)))

    gx = x0 + (np.arange(ncols) + 0.5) * pixel_m
    gy = y1 - (np.arange(nrows) + 0.5) * pixel_m  # row 0 = north (top), matches PNG row order

    Z = np.zeros((nrows, ncols), dtype=np.float64)
    r2 = radius_m ** 2
    r_cells = int(math.ceil(radius_m / pixel_m))

    # Windowed accumulation per point — same memory-safe technique as the
    # notebook (touches only the bounding box of cells within radius_m,
    # so cost is O(n * window) rather than O(n * grid)).
    for i in range(n):
        px, py = xs[i], ys[i]
        col_f = (px - x0) / pixel_m - 0.5
        row_f = (y1 - py) / pixel_m - 0.5

        c0 = max(0, int(math.floor(col_f - r_cells)))
        c1 = min(ncols, int(math.ceil(col_f + r_cells)) + 1)
        r0 = max(0, int(math.floor(row_f - r_cells)))
        r1 = min(nrows, int(math.ceil(row_f + r_cells)) + 1)
        if c0 >= c1 or r0 >= r1:
            continue

        sub_gx = gx[c0:c1]
        sub_gy = gy[r0:r1]
        SGX, SGY = np.meshgrid(sub_gx, sub_gy)

        d2 = (SGX - px) ** 2 + (SGY - py) ** 2
        mask = d2 <= r2
        u2 = np.where(mask, d2 / r2, 0.0)
        # Quartic (biweight) kernel — identical to QGIS's built-in Heatmap tool
        kernel = np.where(mask, (3.0 / math.pi) * (1.0 - u2) ** 2, 0.0)
        Z[r0:r1, c0:c1] += kernel

    zmax = float(Z.max())
    if zmax > 0:
        Z = (Z / zmax) * 100.0

    Z = Z.astype(np.float32)

    rgba = _colorize(Z)
    png_bytes = _encode_png(rgba)

    lat_tl, lon_tl = _unproject_xy(x0, y1, ref_lat_rad)
    lat_tr, lon_tr = _unproject_xy(x1, y1, ref_lat_rad)
    lat_br, lon_br = _unproject_xy(x1, y0, ref_lat_rad)
    lat_bl, lon_bl = _unproject_xy(x0, y0, ref_lat_rad)

    return {
        "png_bytes": png_bytes,
        "coordinates": [
            [lon_tl, lat_tl],   # top-left
            [lon_tr, lat_tr],   # top-right
            [lon_br, lat_br],   # bottom-right
            [lon_bl, lat_bl],   # bottom-left
        ],
        "width": ncols,
        "height": nrows,
        "max_density": zmax,
    }


def compute_weighted_kde_heatmap(
    lats: list[float],
    lons: list[float],
    weights: list[float],
    radius_m: float = 500.0,
    pixel_m: float = 25.0,
    max_pixels: int = 900_000,
) -> Optional[dict]:
    """
    Build a quartic-kernel KDE raster from accident coordinates.

    radius_m : kernel bandwidth — every crash spreads its influence over
               this radius (QGIS Heatmap "Radius" parameter; notebook
               default 500 m).
    pixel_m  : output raster cell size in metres.

    Returns a dict with PNG bytes, the four geographic corner coordinates
    (top-left, top-right, bottom-right, bottom-left — the order MapLibre's
    ImageSource expects), and basic metadata. Returns None if no points.
    """
    n = len(lats)
    if n == 0:
        return None

    w_arr = np.asarray(weights, dtype=np.float64)
    w_arr = np.where(np.isfinite(w_arr) & (w_arr > 0), w_arr, 0.0)

    ref_lat_rad = math.radians(sum(lats) / n)
    xs = np.empty(n)
    ys = np.empty(n)
    for i in range(n):
        xs[i], ys[i] = _project_xy(lats[i], lons[i], ref_lat_rad)

    pad = radius_m
    x0, x1 = float(xs.min() - pad), float(xs.max() + pad)
    y0, y1 = float(ys.min() - pad), float(ys.max() + pad)

    ncols = max(4, int(math.ceil((x1 - x0) / pixel_m)))
    nrows = max(4, int(math.ceil((y1 - y0) / pixel_m)))

    gx = x0 + (np.arange(ncols) + 0.5) * pixel_m
    gy = y1 - (np.arange(nrows) + 0.5) * pixel_m  # row 0 = north (top), matches PNG row order

    Z = np.zeros((nrows, ncols), dtype=np.float64)
    r2 = radius_m ** 2
    r_cells = int(math.ceil(radius_m / pixel_m))

    # Windowed accumulation per point — same memory-safe technique as the
    # notebook (touches only the bounding box of cells within radius_m,
    # so cost is O(n * window) rather than O(n * grid)).
    for i in range(n):
        px, py = xs[i], ys[i]
        col_f = (px - x0) / pixel_m - 0.5
        row_f = (y1 - py) / pixel_m - 0.5

        c0 = max(0, int(math.floor(col_f - r_cells)))
        c1 = min(ncols, int(math.ceil(col_f + r_cells)) + 1)
        r0 = max(0, int(math.floor(row_f - r_cells)))
        r1 = min(nrows, int(math.ceil(row_f + r_cells)) + 1)
        if c0 >= c1 or r0 >= r1:
            continue

        sub_gx = gx[c0:c1]
        sub_gy = gy[r0:r1]
        SGX, SGY = np.meshgrid(sub_gx, sub_gy)

        d2 = (SGX - px) ** 2 + (SGY - py) ** 2
        mask = d2 <= r2
        u2 = np.where(mask, d2 / r2, 0.0)
        # Quartic (biweight) kernel — identical to QGIS's built-in Heatmap tool
        kernel = np.where(mask, (3.0 / math.pi) * (1.0 - u2) ** 2, 0.0)
        Z[r0:r1, c0:c1] += kernel * w_arr[i]

    zmax = float(Z.max())
    if zmax > 0:
        Z = (Z / zmax) * 100.0
    Z = Z.astype(np.float32)

    rgba = _colorize(Z)
    png_bytes = _encode_png(rgba)

    lat_tl, lon_tl = _unproject_xy(x0, y1, ref_lat_rad)
    lat_tr, lon_tr = _unproject_xy(x1, y1, ref_lat_rad)
    lat_br, lon_br = _unproject_xy(x1, y0, ref_lat_rad)
    lat_bl, lon_bl = _unproject_xy(x0, y0, ref_lat_rad)

    return {
        "png_bytes": png_bytes,
        "coordinates": [
            [lon_tl, lat_tl],   # top-left
            [lon_tr, lat_tr],   # top-right
            [lon_br, lat_br],   # bottom-right
            [lon_bl, lat_bl],   # bottom-left
        ],
        "width": ncols,
        "height": nrows,
        "max_density": zmax,
    }


def _colorize(Z: np.ndarray) -> np.ndarray:
    """Vectorised colour-ramp lookup across the 0-100 normalised grid."""
    stop_vals = np.array([s[0] for s in _COLOR_STOPS])
    stop_cols = np.array([s[1] for s in _COLOR_STOPS], dtype=np.float64)

    flat_z = Z.reshape(-1)
    out = np.empty((flat_z.size, 4), dtype=np.float64)
    for ch in range(4):
        out[:, ch] = np.interp(flat_z, stop_vals, stop_cols[:, ch])
    out[flat_z <= 0, 3] = 0  # force true zero density to fully transparent

    return out.reshape(Z.shape[0], Z.shape[1], 4).astype(np.uint8)


def _encode_png(rgba: np.ndarray) -> bytes:
    """Minimal stdlib-only RGBA PNG encoder — avoids a Pillow dependency."""
    height, width, _ = rgba.shape

    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    raw = bytearray()
    for row in rgba:
        raw.append(0)  # PNG filter type 0 (None) per scanline
        raw.extend(row.tobytes())

    signature = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)  # 8-bit RGBA
    idat = zlib.compress(bytes(raw), level=6)

    return signature + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")
