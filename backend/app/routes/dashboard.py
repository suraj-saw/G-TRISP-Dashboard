# backend/app/routes/dashboard.py

"""
Dashboard API router — Gujarat-wide endpoints.

Refactored entry point: Exports the aggregated router defined in app.routes.dashboard_routes.
"""

from app.routes.dashboard_routes import router  # noqa: F401
