import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from app.database import engine, Base
from app import models
from app.routes import auth


load_dotenv()


Base.metadata.create_all(bind=engine)


app = FastAPI(
    title="G-TRISP Dashboard API",
    version="1.0.0",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json"
)


app.include_router(auth.router)


allowed_origins = [
    x.strip()
    for x in os.getenv(
        "ALLOWED_ORIGINS",
        ""
    ).split(",")
    if x.strip()
]


if not allowed_origins:
    raise RuntimeError(
        "Configure ALLOWED_ORIGINS"
    )


app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)


@app.get("/api/")
def home():
    return {
        "message": "Server Running"
    }


@app.get("/health")
def health():
    return {
        "status": "healthy"
    }