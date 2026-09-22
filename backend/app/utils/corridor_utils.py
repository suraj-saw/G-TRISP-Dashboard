# backend/app/utils/corridor_utils.py

"""
Legacy Shim: Corridor Utilities.

Re-exports segment blackspots utilities under the legacy corridor names
for backward compatibility.
"""

from app.utils.segment_blackspot_utils import (
    _generate_corridor_id,
    _generate_segment_id,
    generate_risk_corridors,
    generate_segment_blackspots,
    rank_corridors,
    rank_segment_blackspots,
)

__all__ = [
    "_generate_corridor_id",
    "_generate_segment_id",
    "generate_risk_corridors",
    "generate_segment_blackspots",
    "rank_corridors",
    "rank_segment_blackspots",
]
