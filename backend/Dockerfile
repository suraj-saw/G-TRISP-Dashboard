# backend/Dockerfile
#
# FastAPI Application Containerization Blueprint
#
# Context within the stack:
# - Builds the isolated environment for the Python 3.11 web service.
# - Installs native binary dependencies required for spatial data processing and database drivers.
# - Leverages Docker layer caching strategies by isolating package resolution from application changes.
# - Spawns a multi-worker production-ready Uvicorn server instances.

# Using official slim Python image to ensure a minimal, secure container footprint
FROM python:3.11-slim

# ----------------------------------------------------------------------
# Environment Optimization Flags
# ----------------------------------------------------------------------
# Prevents Python from writing .pyc compilation files to disk (keeps image lean)
ENV PYTHONDONTWRITEBYTECODE=1

# Forces standard output/error streams to flush instantly (no buffer). 
# Critical for real-time log ingestion inside Docker/Compose streams.
ENV PYTHONUNBUFFERED=1

# Establish the centralized workspace root inside the container
WORKDIR /app

# ----------------------------------------------------------------------
# System-Level Binary Dependencies
# ----------------------------------------------------------------------
# System dependencies are combined into a single RUN step to keep image layers optimal.
# - gcc: Essential compiler required to compile specific C/C++ based Python wheels.
# - libpq-dev: PostgreSQL development headers needed to build the database engine adapter (e.g., psycopg2).
# - libgeos-dev: Geometry Engine Open Source (GEOS) binary library—absolutely mandatory for parsing GIS/PostGIS spatial coordinates.
# - rm -rf ...: Housekeeping step that purges the apt package index cache to shave off container megabytes.
RUN apt-get update && apt-get install -y \
    gcc \
    libpq-dev \
    libgeos-dev \
    && rm -rf /var/lib/apt/lists/*

# ----------------------------------------------------------------------
# Python Dependency Management & Installation
# ----------------------------------------------------------------------
# Isolating the requirements file migration allows Docker to reuse cached package
# layers if requirements.txt hasn't changed, dramatically speeding up subsequent application builds.
COPY requirements.txt .

# Upgrade package installer to the newest distribution release, then install dependencies.
# The `--no-cache-dir` parameter keeps the final build lean by dumping redundant downloaded wheels.
RUN pip install --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# ----------------------------------------------------------------------
# Source Deployment & Application Startup
# ----------------------------------------------------------------------
# Copy over the rest of the application source tree into the working directory (/app)
COPY . .

# Launch command execution utilizing Uvicorn as the ASGI web server interface:
# - "app.main:app": Instructs Uvicorn to look for the FastAPI instance object named `app` inside `app/main.py`.
# - "--host 0.0.0.0": Binds server to all interfaces so external networks (and the Nginx container) can reach it.
# - "--port 8000": Standard backend API communications target port matching the Docker Compose configuration.
# - "--workers 4": Multiprocessing capability assigning 4 parallel execution workers to handle concurrent traffic.
CMD ["uvicorn", "app.main:app", \
     "--host", "0.0.0.0", \
     "--port", "8000", \
     "--workers", "4"]