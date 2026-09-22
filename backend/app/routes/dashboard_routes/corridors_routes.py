# backend/app/routes/dashboard_routes/corridors_routes.py

"""
Legacy Shim: Corridors Routes.

Re-exports router and handler functions from segment_blackspots_routes.
"""

from app.routes.dashboard_routes.segment_blackspots_routes import (
    router,
    get_segment_blackspots,
    get_risk_corridors,
)

__all__ = [
    "router",
    "get_segment_blackspots",
    "get_risk_corridors",
]
