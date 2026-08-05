# backend/app/schemas/__init__.py

"""
Schemas Package Initialization.

Exports Pydantic schemas for request validation and response serialization across the API.
"""

from app.schemas.user_schema import (
    UserCreate,
    UserLogin,
    UserResponse,
    ForgotPasswordRequest,
    ResetPasswordRequest,
)
from app.schemas.notification_schema import NotificationResponse
from app.schemas.dashboard_schema import (
    FilterOptions,
    SummaryResponse,
    DistrictResponse,
    SeverityResponse,
    TimeSeriesResponse,
    CollisionResponse,
    HeatmapResponse,
    WeatherResponse,
    LightResponse,
    PoliceStationResponse,
    CasualtyResponse,
    TopDangerousResponse,
    YearlyResponse,
    SnappedAccidentResponse,
)
from app.schemas.gujarat_insights_schema import DistrictInsightsResponse
