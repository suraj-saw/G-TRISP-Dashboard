"""
Models Package Initialization.

This module imports and exposes all SQLAlchemy ORM models within the application. 
Importing all models here ensures that the declarative base (`Base.metadata`) 
is fully aware of all database schemas, which is required for:
1. Automatic schema discovery by database migration tools like Alembic.
2. Simplified, clean import paths throughout the application (e.g., 
   `from app.models import User, Accident` instead of deep relative imports).

Any new database model added to the application must be registered here to be 
tracked by the SQLAlchemy metadata lifecycle.
"""

# ── Core & Authentication Models ──────────────────────────────────────────────
from app.models.user              import User
from app.models.notification      import Notification

# ── State-Level Geographic Models (Gujarat ADM1, ADM2, ADM3) ──────────────────
from app.models.gujarat_boundary  import GujaratBoundary
from app.models.gujarat_district  import GujaratDistrict
from app.models.gujarat_taluka    import GujaratTaluka
from app.models.gujarat_road      import GujaratRoad

# ── City / Local-Level Geographic Models ──────────────────────────────────────
# from app.models.surat_boundary    import SuratBoundary

# ── Incident & Accident Event Datasets ────────────────────────────────────────
from app.models.accident          import Accident
# from app.models.surat_accident    import SuratAccident
from app.models.snapped_accident  import SnappedAccident