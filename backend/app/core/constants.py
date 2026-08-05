# backend/app/core/constants.py

# ---------------------------------------------------------------------------
# Accident severity labels (iRAD)
# ---------------------------------------------------------------------------

SEVERITY_FATAL = "Fatal"
SEVERITY_DAMAGE_ONLY = "Damage Only"

# Maps display category → iRAD field names on the Accident model
CASUALTY_TYPES = {
    "Drivers": {
        "killed":   "driver_killed",
        "grievous": "driver_grievous_injury",
        "minor":    "driver_minor_injury",
    },
    "Passengers": {
        "killed":   "passenger_killed",
        "grievous": "passenger_grievous_injury",
        "minor":    "passenger_minor_injury",
    },
    "Pedestrians": {
        "killed":   "pedestrian_killed",
        "grievous": "pedestrian_grievous_injury",
        "minor":    "pedestrian_minor_injury",
    },
}

# ---------------------------------------------------------------------------
# Auth / session cookie names
# ---------------------------------------------------------------------------

ACCESS_TOKEN_COOKIE  = "access_token"
REFRESH_TOKEN_COOKIE = "refresh_token"

# ---------------------------------------------------------------------------
# Auth / token lifetime defaults
# These mirror the environment-variable defaults in auth_service.py so there
# is a single source of truth for the magic numbers.
# ---------------------------------------------------------------------------

# Short-lived access token (minutes).  Override via ACCESS_TOKEN_EXPIRE_MINUTES env var.
DEFAULT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 40

# Refresh token lifetime (hours).  Override via REFRESH_TOKEN_EXPIRE_HOURS env var.
DEFAULT_REFRESH_TOKEN_EXPIRE_HOURS: int = 8

# Idle-session timeout (minutes).  Override via IDLE_TIMEOUT_MINUTES env var.
# After this period of inactivity the Redis session key expires and the user
# must log in again even if the access token is still technically valid.
DEFAULT_IDLE_TIMEOUT_MINUTES: int = 30

# ---------------------------------------------------------------------------
# Password-reset constants
# ---------------------------------------------------------------------------

# How long a password-reset token remains valid (seconds).
PASSWORD_RESET_TOKEN_TTL_SECONDS: int = 900  # 15 minutes

# Sliding window (seconds) used by the forgot-password rate limiter.
FORGOT_PASSWORD_RATE_WINDOW_SECONDS: int = 3_600  # 1 hour

# Maximum forgot-password requests allowed within the sliding window.
FORGOT_PASSWORD_MAX_REQUESTS: int = 3

# ---------------------------------------------------------------------------
# API route prefixes
# ---------------------------------------------------------------------------

AUTH_PREFIX          = "/api/auth"
ADMIN_PREFIX         = "/api/admin"
ADMIN_SURAT_PREFIX   = "/api/admin/surat"   # admin endpoints specific to Surat data
DASHBOARD_PREFIX     = "/api/dashboard"
SURAT_DASH_PREFIX    = "/api/surat/dashboard"
GEO_PREFIX           = "/api/geo"

# ---------------------------------------------------------------------------
# Redis key prefixes & Session Grace
# ---------------------------------------------------------------------------

REDIS_SESSION_PREFIX   = "session:"
REDIS_BLACKLIST_PREFIX = "blacklist:"
REDIS_GRACE_PREFIX     = "grace:"

# Grace period (seconds) for multi-tab token refresh rotation handling
TOKEN_REFRESH_GRACE_PERIOD_SECONDS: int = 15

# ---------------------------------------------------------------------------
# Sentinel / placeholder values used in data cleaning
# ---------------------------------------------------------------------------

NULL_TEXT_SENTINEL = "nan"          # Excel/pandas NaN serialised as string
UNKNOWN_LABEL      = "Unknown"      # Safe default for missing text fields

# ---------------------------------------------------------------------------
# Spatial / PostGIS
# ---------------------------------------------------------------------------

# Small buffer (~1 m at Gujarat's latitude) to handle floating-point edge
# cases where a coordinate sits exactly on a polygon boundary.
BOUNDARY_TOLERANCE_DEGREES: float = 0.00001

# ---------------------------------------------------------------------------
# Temporal helpers
# ---------------------------------------------------------------------------

# Day names ordered Monday → Sunday (ISO weekday order)
WEEKDAY_ORDER = [
    "Monday", "Tuesday", "Wednesday", "Thursday",
    "Friday", "Saturday", "Sunday",
]

# Datetime format strings tried when parsing accident date/time strings.
# Ordered from most-specific to most-generic.
ACCIDENT_DATETIME_FORMATS = [
    "%d-%b-%Y : %I:%M %p",   # 17-Jan-2023 : 11:00 AM
    "%d-%b-%Y: %I:%M %p",
    "%d-%b-%Y %I:%M %p",
    "%d/%m/%Y : %I:%M %p",
    "%d/%m/%Y %I:%M %p",
    "%d-%m-%Y : %I:%M %p",
    "%d-%m-%Y %I:%M %p",
    "%Y-%m-%d %H:%M:%S",
    "%Y-%m-%d %I:%M:%S %p",
]

# ---------------------------------------------------------------------------
# Surat-specific labels
# ---------------------------------------------------------------------------

SURAT_DISTRICT_NAME = "Surat"

# ---------------------------------------------------------------------------
# Time-period bucket boundaries (hour ranges, inclusive lower bound)
# ---------------------------------------------------------------------------

# Maps time-period label → (start_hour_inclusive, end_hour_exclusive)
TIME_PERIOD_RANGES = {
    "Morning":   (5,  12),
    "Afternoon": (12, 17),
    "Evening":   (17, 21),
    "Night":     (21, 24),   # 21-23 + 0-4 handled by fallback below
}

# Hour range treated as "Night" when hour < NIGHT_MORNING_CUTOFF
NIGHT_MORNING_CUTOFF = 5

# ---------------------------------------------------------------------------
# API / pagination defaults
# ---------------------------------------------------------------------------
# Database & Lifespan Initialization
# ---------------------------------------------------------------------------

DB_RETRY_ATTEMPTS: int = 5
DB_RETRY_DELAY_SECONDS: int = 2
DB_ADVISORY_LOCK_ID: int = 11223344

# ---------------------------------------------------------------------------
# Middleware & HTTP Response Compression
# ---------------------------------------------------------------------------

GZIP_MINIMUM_SIZE_BYTES: int = 1000

# ---------------------------------------------------------------------------
# File Upload Validation
# ---------------------------------------------------------------------------

ALLOWED_FILE_UPLOAD_EXTENSIONS = ("xlsx", "csv")
MAX_FILE_UPLOAD_SIZE_BYTES: int = 50 * 1024 * 1024  # 50 MB

# ---------------------------------------------------------------------------
# API / pagination defaults
# ---------------------------------------------------------------------------

# Default and maximum values for pagination and data limits.
DEFAULT_PAGE_SIZE: int = 50
MAX_PAGE_SIZE: int     = 1000
TOP_DANGEROUS_DEFAULT_N = 10
TOP_DANGEROUS_MAX_N     = 50

# HTTP cache lifetime for GeoJSON boundary responses (seconds).
GEO_CACHE_MAX_AGE_SECONDS = 86_400  # 1 day

# ---------------------------------------------------------------------------
# Data seeder defaults
# ---------------------------------------------------------------------------

# Number of rows committed to the DB in a single batch during seeding.
# Override via the SEED_BATCH_SIZE environment variable.
DEFAULT_SEED_BATCH_SIZE = 500

# How often (in rows) the batch validator logs progress.
VALIDATION_LOG_INTERVAL = 500

# ---------------------------------------------------------------------------
# Coordinate validation
# ---------------------------------------------------------------------------

# Fallback label used when a coordinate cannot be matched to a district.
NO_DISTRICT_LABEL = "Unknown"

# ---------------------------------------------------------------------------
# Hour-label formatting
# ---------------------------------------------------------------------------

HOURS_IN_DAY = 24

# ---------------------------------------------------------------------------
# Re-export GIS / Spatial Configuration for Backward Compatibility
# ---------------------------------------------------------------------------

from app.core.gis_config import (
    BLACKSPOT_RADIUS_METERS,
    BLACKSPOT_MIN_CRASHES,
    PEDESTRIAN_BLACKSPOT_MIN_CRASHES,
    MIN_ANALYSIS_YEARS,
    KDE_RADIUS_METERS,
    KDE_PIXEL_METERS,
    CORRIDOR_MERGE_THRESHOLD_M,
    CORRIDOR_PRIORITY_THRESHOLDS,
)

