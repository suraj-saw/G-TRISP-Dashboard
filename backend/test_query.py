import traceback
import sys

with open("test_output2.txt", "w") as f:
    try:
        from app.database import SessionLocal
        from app.models.accident import Accident
        from app.models.snapped_accident import SnappedAccident
        from sqlalchemy import func

        db = SessionLocal()
        
        query = db.query(
            Accident.accident_id,
            Accident.severity,
            Accident.district,
            Accident.police_station,
            Accident.road_name,
            Accident.road_classification,
            Accident.weather_condition,
            Accident.light_condition,
            Accident.type_of_collision.label("collision_type"),
            Accident.accident_date_time,
            Accident.pedestrian_killed,
            Accident.pedestrian_grievous_injury,
            Accident.pedestrian_minor_injury,
            func.ST_Y(SnappedAccident.snapped_location).label("latitude"),
            func.ST_X(SnappedAccident.snapped_location).label("longitude"),
            func.ST_Y(SnappedAccident.original_location).label("original_latitude"),
            func.ST_X(SnappedAccident.original_location).label("original_longitude"),
            SnappedAccident.distance_meters
        ).join(
            SnappedAccident, Accident.id == SnappedAccident.accident_id
        ).limit(5)
        
        rows = query.all()
        f.write(f"Rows count: {len(rows)}\n")
        
        for r in rows:
            f.write(f"Row: {r.collision_type}\n")
    except Exception as e:
        f.write(traceback.format_exc())
