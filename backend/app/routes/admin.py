# backend/app/routes/admin.py
from fastapi import APIRouter, Depends
from app.models.user import User
from app.routes.auth import get_current_admin_user

router = APIRouter(prefix="/api/admin", tags=["Admin"])

@router.get("/dashboard")
def get_admin_dashboard_data(current_user: User = Depends(get_current_admin_user)):
    return {
        "message": "Welcome to the Admin Dashboard",
        "admin": current_user.username,
        "role": current_user.role
    }