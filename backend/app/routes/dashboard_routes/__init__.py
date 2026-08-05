# backend/app/routes/dashboard_routes/__init__.py

"""
Dashboard Aggregated Router.

Combines modular sub-routers under DASHBOARD_PREFIX into a single composite router instance.
"""

# pyrefly: ignore [missing-import]
from fastapi import APIRouter

from app.core.constants import DASHBOARD_PREFIX
from app.routes.dashboard_routes import (
    filters_routes,
    analytics_routes,
    breakdowns_routes,
    spatial_routes,
    blackspots_routes,
    corridors_routes,
    temporal_routes,
    export_routes,
)

router = APIRouter(
    prefix=DASHBOARD_PREFIX,
    tags=["Dashboard"],
)

router.include_router(filters_routes.router)
router.include_router(analytics_routes.router)
router.include_router(breakdowns_routes.router)
router.include_router(spatial_routes.router)
router.include_router(blackspots_routes.router)
router.include_router(corridors_routes.router)
router.include_router(temporal_routes.router)
router.include_router(export_routes.router)
