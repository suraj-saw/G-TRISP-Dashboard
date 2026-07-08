# backend/app/utils/export_utils.py
"""
Shared export helpers for building CSV / Excel files of accident records.
Used by the blackspot-export endpoints in both the Gujarat and Surat dashboards.
"""

import csv
import io
from datetime import datetime

from app.utils.text_utils import safe_text

# Column definitions: (CSV/Excel header, ORM attribute name)
EXPORT_COLUMNS = [
    ("Blackspot #",                "__bs_id__"),
    ("Accident ID",               "accident_id"),
    ("District",                  "district"),
    ("Police Station",            "police_station"),
    ("Accident Date Time",        "accident_date_time"),
    ("Latitude",                  "latitude"),
    ("Longitude",                 "longitude"),
    ("Road Name",                 "road_name"),
    ("Road Classification",       "road_classification"),
    ("Severity",                  "severity"),
    ("No of Vehicles",            "number_of_vehicles"),
    # Driver
    ("Drivers Killed",            "driver_killed"),
    ("Drivers Grievous Injury",   "driver_grievous_injury"),
    ("Drivers Minor Injury",      "driver_minor_injury"),
    # Passenger
    ("Passengers Killed",         "passenger_killed"),
    ("Passengers Grievous Injury","passenger_grievous_injury"),
    ("Passengers Minor Injury",   "passenger_minor_injury"),
    # Pedestrian
    ("Pedestrians Killed",        "pedestrian_killed"),
    ("Pedestrians Grievous Injury","pedestrian_grievous_injury"),
    ("Pedestrians Minor Injury",  "pedestrian_minor_injury"),
    # Collision
    ("Collision Type",            "type_of_collision"),
    ("Collision Nature",          "collision_feature"),
    # Conditions
    ("Weather Condition",         "weather_condition"),
    ("Light Condition",           "light_condition"),
    ("Visibility",                "visibility"),
    ("Traffic Violation",         "traffic_violation"),
]

HEADERS = [col[0] for col in EXPORT_COLUMNS]
FIELDS  = [col[1] for col in EXPORT_COLUMNS]


def row_values(accident, bs_id: int) -> list:
    """Convert an ORM accident object into an ordered list of cell values.
    
    The first column is the blackspot number (bs_id), which is injected
    rather than read from the model.
    """
    values = []
    for header, field in EXPORT_COLUMNS:
        if field == "__bs_id__":
            values.append(bs_id)
            continue
        raw = getattr(accident, field, None)
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


def build_accident_csv(accidents_with_bs: list[tuple[int, object]]) -> str:
    """Build a CSV string from a list of (bs_id, accident_orm_obj) tuples."""
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(HEADERS)
    for bs_id, acc in accidents_with_bs:
        writer.writerow(row_values(acc, bs_id))
    output.seek(0)
    return output.getvalue()


def build_accident_excel(
    accidents_with_bs: list[tuple[int, object]],
    meta_rows: list[tuple[str, object]],
    charts_dict: dict = None,
) -> io.BytesIO:
    """Build a styled Excel workbook from (bs_id, accident_orm_obj) tuples.
    
    Returns a BytesIO buffer ready to stream.
    """
    import openpyxl
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from openpyxl.utils import get_column_letter

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Accident Data"

    header_fill  = PatternFill("solid", fgColor="1E3A8A")
    header_font  = Font(bold=True, color="FFFFFF", size=10)
    header_align = Alignment(horizontal="center", vertical="center", wrap_text=True)
    thin_side    = Side(style="thin", color="D1D5DB")
    thin_border  = Border(left=thin_side, right=thin_side,
                          top=thin_side, bottom=thin_side)
    alt_fill     = PatternFill("solid", fgColor="F8FAFC")

    ws.append(HEADERS)
    for cell in ws[1]:
        cell.fill      = header_fill
        cell.font      = header_font
        cell.alignment = header_align
        cell.border    = thin_border
    ws.row_dimensions[1].height = 36

    for row_idx, (bs_id, acc) in enumerate(accidents_with_bs, start=2):
        ws.append(row_values(acc, bs_id))
        for cell in ws[row_idx]:
            cell.border    = thin_border
            cell.alignment = Alignment(vertical="center")
            if row_idx % 2 == 0:
                cell.fill = alt_fill

    WIDTHS = {
        "Blackspot #": 12, "Accident ID": 18, "District": 14,
        "Police Station": 20, "Accident Date Time": 22,
        "Latitude": 12, "Longitude": 12, "Road Name": 22,
        "Road Classification": 20, "Severity": 18, "No of Vehicles": 12,
    }
    for col_idx, header in enumerate(HEADERS, start=1):
        ws.column_dimensions[get_column_letter(col_idx)].width = WIDTHS.get(header, 14)

    ws.freeze_panes = "A2"
    ws.auto_filter.ref = ws.dimensions

    # Summary sheet
    meta = wb.create_sheet("Summary")
    meta.column_dimensions["A"].width = 24
    meta.column_dimensions["B"].width = 36
    bold = Font(bold=True, size=10)
    for r, (label, value) in enumerate(meta_rows, start=1):
        meta.cell(r, 1, label).font = bold
        meta.cell(r, 2, str(value))

    buf = io.BytesIO()
    
    if charts_dict:
        try:
            from openpyxl.drawing.image import Image as OpenpyxlImage
            viz_sheet = wb.create_sheet("Visualizations")
            
            # Map chart keys to cell positions
            positions = {
                "severity": "B2",
                "road_type": "K2",
                "collision_type": "T2",
                "vehicles_involved": "B25",
                "weather": "K25",
                "light": "T25",
                "collision_nature": "B48",
                "time_of_day": "K48",
                "monthly_seasonality": "B71",
                "annual_trend": "K71",
                "weekend_vs_weekday": "T71",
            }
            
            for key, chart_buf in charts_dict.items():
                if key in positions:
                    img = OpenpyxlImage(chart_buf)
                    viz_sheet.add_image(img, positions[key])
        except ImportError:
            pass # Pillow not installed

    wb.save(buf)
    buf.seek(0)
    return buf
