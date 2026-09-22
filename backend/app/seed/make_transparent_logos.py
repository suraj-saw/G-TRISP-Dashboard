# backend/app/seed/make_transparent_logos.py

"""
Script to create high-precision transparent versions of the ASTRA logos
and update the app_images PostgreSQL database table.
"""

import os
from collections import deque
import numpy as np
from PIL import Image
# pyrefly: ignore [missing-import]
from sqlalchemy.orm import Session

from app.database import engine, SessionLocal, Base
from app.models.app_image import AppImage


def make_transparent_banner(input_path: str, output_path: str, text_y_cutoff: int = 220):
    img = Image.open(input_path).convert('RGBA')
    arr = np.array(img, dtype=np.uint8)
    h, w, _ = arr.shape

    # Near white detection
    is_white = (arr[:, :, 0] >= 240) & (arr[:, :, 1] >= 240) & (arr[:, :, 2] >= 240)

    # 1. Flood fill from borders to identify exterior background
    visited = np.zeros((h, w), dtype=bool)
    q = deque()
    for y in range(h):
        if is_white[y, 0] and not visited[y, 0]:
            q.append((y, 0)); visited[y, 0] = True
        if is_white[y, w-1] and not visited[y, w-1]:
            q.append((y, w-1)); visited[y, w-1] = True
    for x in range(w):
        if is_white[0, x] and not visited[0, x]:
            q.append((0, x)); visited[0, x] = True
        if is_white[h-1, x] and not visited[h-1, x]:
            q.append((h-1, x)); visited[h-1, x] = True

    while q:
        cy, cx = q.popleft()
        for dy, dx in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
            ny, nx = cy + dy, cx + dx
            if 0 <= ny < h and 0 <= nx < w and not visited[ny, nx] and is_white[ny, nx]:
                visited[ny, nx] = True
                q.append((ny, nx))

    # 2. Transparent mask:
    # Exterior white + any white in text region (below graphic cutoff)
    transparent_mask = visited.copy()
    if text_y_cutoff < h:
        transparent_mask[text_y_cutoff:, :] = transparent_mask[text_y_cutoff:, :] | is_white[text_y_cutoff:, :]

    out_arr = arr.copy()
    out_arr[transparent_mask, 3] = 0

    # 3. Antialiasing on edges to avoid harsh fringing
    for y in range(h):
        for x in range(w):
            if not transparent_mask[y, x]:
                has_trans = False
                for dy, dx in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < h and 0 <= nx < w and transparent_mask[ny, nx]:
                        has_trans = True
                        break
                if has_trans:
                    r, g, b = int(out_arr[y, x, 0]), int(out_arr[y, x, 1]), int(out_arr[y, x, 2])
                    min_c = min(r, g, b)
                    if min_c > 160:
                        alpha = max(0, 255 - min_c)
                        out_arr[y, x, 3] = alpha

    out_img = Image.fromarray(out_arr, 'RGBA')
    out_img.save(output_path, 'PNG')
    print(f"Successfully created transparent: {output_path}")
    return output_path


def make_transparent_emblem(input_path: str, output_path: str):
    """Makes exterior white of circular emblem transparent."""
    img = Image.open(input_path).convert('RGBA')
    arr = np.array(img, dtype=np.uint8)
    h, w, _ = arr.shape

    is_white = (arr[:, :, 0] >= 240) & (arr[:, :, 1] >= 240) & (arr[:, :, 2] >= 240)

    # Flood fill exterior
    visited = np.zeros((h, w), dtype=bool)
    q = deque()
    for y in range(h):
        if is_white[y, 0] and not visited[y, 0]:
            q.append((y, 0)); visited[y, 0] = True
        if is_white[y, w-1] and not visited[y, w-1]:
            q.append((y, w-1)); visited[y, w-1] = True
    for x in range(w):
        if is_white[0, x] and not visited[0, x]:
            q.append((0, x)); visited[0, x] = True
        if is_white[h-1, x] and not visited[h-1, x]:
            q.append((h-1, x)); visited[h-1, x] = True

    while q:
        cy, cx = q.popleft()
        for dy, dx in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
            ny, nx = cy + dy, cx + dx
            if 0 <= ny < h and 0 <= nx < w and not visited[ny, nx] and is_white[ny, nx]:
                visited[ny, nx] = True
                q.append((ny, nx))

    out_arr = arr.copy()
    out_arr[visited, 3] = 0

    out_img = Image.fromarray(out_arr, 'RGBA')
    out_img.save(output_path, 'PNG')
    print(f"Successfully created transparent emblem: {output_path}")
    return output_path


def run():
    logo_dir = "/app/data/logos"
    
    # 1. Process astra_logo_3.png (compact banner used on HomePage)
    p3 = os.path.join(logo_dir, "astra_logo_3.png")
    make_transparent_banner(p3, p3, text_y_cutoff=220)

    # 2. Process astra_logo_1.png (full banner)
    p1 = os.path.join(logo_dir, "astra_logo_1.png")
    if os.path.isfile(p1):
        make_transparent_banner(p1, p1, text_y_cutoff=220)

    # 3. Process astra_logo_2.png (circular emblem)
    p2 = os.path.join(logo_dir, "astra_logo_2.png")
    if os.path.isfile(p2):
        make_transparent_emblem(p2, p2)

    # Update the database
    db: Session = SessionLocal()
    try:
        from app.seed.seed_logos import seed_logos
        print("Re-seeding database with transparent images...")
        seed_logos()
        print("Database updated successfully!")
    finally:
        db.close()


if __name__ == "__main__":
    run()
