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
# API route prefixes
# ---------------------------------------------------------------------------

AUTH_PREFIX          = "/api/auth"
ADMIN_PREFIX         = "/api/admin"
DASHBOARD_PREFIX     = "/api/dashboard"
SURAT_DASH_PREFIX    = "/api/surat/dashboard"
GEO_PREFIX           = "/api/geo"

# ---------------------------------------------------------------------------
# Redis key prefixes
# ---------------------------------------------------------------------------

REDIS_SESSION_PREFIX   = "session:"
REDIS_BLACKLIST_PREFIX = "blacklist:"

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
# API / pagination defaults
# ---------------------------------------------------------------------------

# Default and maximum values for the top-N dangerous locations endpoint.
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