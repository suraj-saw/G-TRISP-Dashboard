# backend/app/routes/dashboard_routes/export_routes.py

"""
CSV and Excel Export Endpoints for Dashboard Data.
"""

import csv
import io
from datetime import datetime
from typing import List, Optional

# pyrefly: ignore [missing-import]
from fastapi import APIRouter, Depends, Query, Body
# pyrefly: ignore [missing-import]
from fastapi.responses import StreamingResponse
# pyrefly: ignore [missing-import]
from pydantic import BaseModel
# pyrefly: ignore [missing-import]
from sqlalchemy.orm import Session

from app.core.dependencies import get_db
from app.models.accident import Accident
from app.utils.accident_utils import apply_filters
from app.utils.export_utils import build_accident_csv, build_accident_excel
from app.utils.text_utils import safe_text

router = APIRouter()


class ExportCrashesRequest(BaseModel):
    crash_ids: List[str]
    filename: Optional[str] = "blackspot_crashes.csv"


@router.post("/export-crashes")
def export_specific_crashes(
    req: ExportCrashesRequest = Body(...),
    db: Session = Depends(get_db),
):
    """Export all columns for a specific set of accident IDs (blackspot cluster export)."""
    print(f"[export-crashes] Received {len(req.crash_ids)} IDs. Sample: {req.crash_ids[:5]}")

    if not req.crash_ids:
        output = io.StringIO()
        HEADERS = [
            "Accident ID", "District", "Police Station", 
            "Accident Date Time", "Latitude", "Longitude", "Road Name", 
            "Road Classification", "Severity", "No of Vehicles", 
            "Drivers Killed", "Drivers Grievous Injury", "Drivers Minor Injury", 
            "Passengers Killed", "Passengers Grievous Injury", "Passengers Minor Injury", 
            "Pedestrians Killed", "Pedestrians Grievous Injury", "Pedestrians Minor Injury", 
            "Collision Type", "Collision Nature", "Weather Condition", 
            "Light Condition", "Visibility", "Traffic Violation"
        ]
        csv.writer(output).writerow(HEADERS)
        output.seek(0)
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{req.filename}"'},
        )

    db_ids = [int(cid) for cid in req.crash_ids if cid.isdigit()]
    query = db.query(Accident)
    if db_ids:
        query = query.filter(Accident.id.in_(db_ids))
    else:
        query = query.filter(Accident.accident_id.in_(req.crash_ids))

    accidents = query.order_by(Accident.accident_date_time).all()

    if not accidents and db_ids:
        accidents = (
            db.query(Accident)
            .filter(Accident.accident_id.in_(req.crash_ids))
            .order_by(Accident.accident_date_time)
            .all()
        )

    print(f"[export-crashes] Query returned {len(accidents)} rows.")

    output = io.StringIO()
    HEADERS = [
        "Accident ID", "District", "Police Station", 
        "Accident Date Time", "Latitude", "Longitude", "Road Name", 
        "Road Classification", "Severity", "No of Vehicles", 
        "Drivers Killed", "Drivers Grievous Injury", "Drivers Minor Injury", 
        "Passengers Killed", "Passengers Grievous Injury", "Passengers Minor Injury", 
        "Pedestrians Killed", "Pedestrians Grievous Injury", "Pedestrians Minor Injury", 
        "Collision Type", "Collision Nature", "Weather Condition", 
        "Light Condition", "Visibility", "Traffic Violation"
    ]
    writer = csv.writer(output)
    writer.writerow(HEADERS)

    def row_values(acc):
        values = []
        fields = [
            "accident_id", "district", "police_station",
            "accident_date_time", "latitude", "longitude", "road_name",
            "road_classification", "severity", "number_of_vehicles",
            "driver_killed", "driver_grievous_injury", "driver_minor_injury",
            "passenger_killed", "passenger_grievous_injury", "passenger_minor_injury",
            "pedestrian_killed", "pedestrian_grievous_injury", "pedestrian_minor_injury",
            "type_of_collision", "collision_feature", "weather_condition",
            "light_condition", "visibility", "traffic_violation"
        ]
        for field in fields:
            raw = getattr(acc, field, None)
            if raw is None:
                values.append("")
            elif isinstance(raw, datetime):
                values.append(raw.strftime("%d-%b-%Y %I:%M %p"))
            elif isinstance(raw, float):
                values.append(round(raw, 6))
            else:
                cleaned = safe_text(str(raw))
                values.append("" if cleaned == "Unknown" else cleaned)
        return values

    for acc in accidents:
        writer.writerow(row_values(acc))

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="{req.filename}"',
            "Access-Control-Expose-Headers": "Content-Disposition",
        },
    )


@router.get("/export")
def export_dashboard_data(
    format: str = Query("csv", enum=["csv", "excel"]),
    district: Optional[List[str]] = Query(None),
    severity: Optional[List[str]] = Query(None),
    year: Optional[List[int]] = Query(None),
    road_classification: Optional[List[str]] = Query(None),
    weather_condition: Optional[List[str]] = Query(None),
    light_condition: Optional[List[str]] = Query(None),
    collision_type: Optional[List[str]] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    taluka: Optional[List[str]] = Query(None),
    police_station: Optional[List[str]] = Query(None),
    db: Session = Depends(get_db),
):
    query = apply_filters(
        db.query(Accident),
        district, year, road_classification,
        weather_condition, light_condition, collision_type,
        date_from, date_to,
        taluka=taluka, db=db,
        police_station=police_station
    )
    if severity and "all" not in severity:
        query = query.filter(Accident.severity.in_(severity))
        
    accidents = query.all()
    
    dist_str = district[0] if district else "gujarat"
    dist_str = dist_str.lower().replace(" ", "_")
    
    if format == "csv":
        csv_buffer = build_accident_csv([(0, acc) for acc in accidents])
        filename = f"{dist_str}_accidents_export.csv"
        return StreamingResponse(
            iter([csv_buffer]),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    else:
        charts_dict = None
        if len(accidents) > 0:
            try:
                from app.utils.chart_utils import generate_all_charts
                charts_dict = generate_all_charts(accidents)
            except Exception:
                pass

        excel_buffer = build_accident_excel(
            [(0, acc) for acc in accidents],
            meta_rows=[("Export Source", "District Dashboard General Export"), ("Total Records", len(accidents))],
            charts_dict=charts_dict
        )
        filename = f"{dist_str}_accidents_export.xlsx"
        return StreamingResponse(
            excel_buffer,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
