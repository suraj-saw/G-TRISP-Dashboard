import io
import matplotlib.pyplot as plt
import matplotlib
# Use Agg backend to avoid requiring GUI libraries on server
matplotlib.use('Agg')
from collections import defaultdict
from datetime import datetime

CHART_BLUE = "#3b82f6"
CHART_TEAL = "#14b8a6"
CHART_INDIGO = "#6366f1"
CHART_PURPLE = "#a855f7"
SEVERITY_COLORS = {
    "Fatal": "#ef4444",
    "Grievous Injury": "#f97316",
    "Minor Injury": "#f59e0b",
    "Damage Only": "#94a3b8"
}

def _get_top_n(counts: dict, n: int = 10):
    sorted_items = sorted(counts.items(), key=lambda x: x[1], reverse=True)
    if len(sorted_items) <= n:
        return sorted_items
    top = sorted_items[:n]
    others = sum(v for k, v in sorted_items[n:])
    if others > 0:
        top.append(("Others", others))
    return top

def _plot_pie(data_dict, title, colors=None):
    labels, values = zip(*data_dict.items()) if data_dict else ([], [])
    plt.figure(figsize=(6, 5))
    if values:
        plt.pie(values, labels=labels, autopct='%1.1f%%', startangle=140, colors=colors)
    plt.title(title, fontsize=12, fontweight='bold')
    plt.tight_layout()
    buf = io.BytesIO()
    plt.savefig(buf, format="png", bbox_inches="tight")
    plt.close()
    buf.seek(0)
    return buf

def _plot_horizontal_bar(data_dict, title, color=CHART_BLUE, n=10):
    top_items = _get_top_n(data_dict, n)
    labels = [k for k, v in reversed(top_items)]
    values = [v for k, v in reversed(top_items)]
    
    plt.figure(figsize=(7, 5))
    plt.barh(labels, values, color=color)
    plt.title(title, fontsize=12, fontweight='bold')
    plt.xlabel("Accidents", fontsize=10)
    plt.tight_layout()
    buf = io.BytesIO()
    plt.savefig(buf, format="png", bbox_inches="tight")
    plt.close()
    buf.seek(0)
    return buf

def _plot_vertical_bar(data_dict, title, color=CHART_BLUE):
    labels, values = zip(*data_dict.items()) if data_dict else ([], [])
    plt.figure(figsize=(7, 5))
    plt.bar(labels, values, color=color)
    plt.title(title, fontsize=12, fontweight='bold')
    plt.ylabel("Accidents", fontsize=10)
    plt.xticks(rotation=45, ha='right')
    plt.tight_layout()
    buf = io.BytesIO()
    plt.savefig(buf, format="png", bbox_inches="tight")
    plt.close()
    buf.seek(0)
    return buf

def _plot_line(data_dict, title, color=CHART_PURPLE):
    labels, values = zip(*data_dict.items()) if data_dict else ([], [])
    plt.figure(figsize=(7, 5))
    plt.plot(labels, values, marker='o', color=color, linewidth=2)
    plt.title(title, fontsize=12, fontweight='bold')
    plt.ylabel("Accidents", fontsize=10)
    plt.grid(True, linestyle='--', alpha=0.5)
    plt.xticks(rotation=45, ha='right')
    plt.tight_layout()
    buf = io.BytesIO()
    plt.savefig(buf, format="png", bbox_inches="tight")
    plt.close()
    buf.seek(0)
    return buf

def generate_all_charts(accidents: list) -> dict:
    if not accidents:
        return {}
        
    charts = {}
    
    # 1. Severity Distribution (Pie)
    sev_counts = defaultdict(int)
    for a in accidents:
        sev = getattr(a, "severity", "Unknown") or "Unknown"
        sev_counts[sev] += 1
    colors = [SEVERITY_COLORS.get(k, "#64748b") for k in sev_counts.keys()]
    charts["severity"] = _plot_pie(sev_counts, "Severity Distribution", colors)
    
    # 2. Road Classification (H-Bar)
    rc_counts = defaultdict(int)
    for a in accidents:
        rc = getattr(a, "road_classification", "Unknown") or "Unknown"
        rc_counts[rc] += 1
    charts["road_type"] = _plot_horizontal_bar(rc_counts, "Road Classification", CHART_PURPLE)
    
    # 3. Collision Type (H-Bar)
    ct_counts = defaultdict(int)
    for a in accidents:
        ct = getattr(a, "type_of_collision", "Unknown") or "Unknown"
        ct_counts[ct] += 1
    charts["collision_type"] = _plot_horizontal_bar(ct_counts, "Collision Type Distribution", CHART_TEAL)
    
    # 4. Vehicles Involved (V-Bar)
    vi_counts = defaultdict(int)
    for a in accidents:
        v = getattr(a, "number_of_vehicles", 1)
        if v is None: v = 1
        label = f"{int(v)} Vehicle(s)" if int(v) <= 3 else "4+ Vehicles"
        vi_counts[label] += 1
    charts["vehicles_involved"] = _plot_vertical_bar(vi_counts, "Vehicles Involved", CHART_BLUE)
    
    # 5. Weather Condition (H-Bar)
    wc_counts = defaultdict(int)
    for a in accidents:
        wc = getattr(a, "weather_condition", "Unknown") or "Unknown"
        wc_counts[wc] += 1
    charts["weather"] = _plot_horizontal_bar(wc_counts, "Weather Condition Breakdown", CHART_BLUE)
    
    # 6. Light Condition (H-Bar)
    lc_counts = defaultdict(int)
    for a in accidents:
        lc = getattr(a, "light_condition", "Unknown") or "Unknown"
        lc_counts[lc] += 1
    charts["light"] = _plot_horizontal_bar(lc_counts, "Light Condition Analysis", CHART_PURPLE)
    
    # 7. Collision Nature (H-Bar)
    cn_counts = defaultdict(int)
    for a in accidents:
        cn = getattr(a, "nature_of_accident", "Unknown") or "Unknown"
        cn_counts[cn] += 1
    charts["collision_nature"] = _plot_horizontal_bar(cn_counts, "Collision Nature Analysis", CHART_INDIGO)
    
    import calendar
    # Temporal Processing
    month_counts = defaultdict(int)
    year_counts = defaultdict(int)
    dow_counts = {"Weekday": 0, "Weekend": 0}
    tod_counts = {"Morning (6a-12p)": 0, "Afternoon (12p-4p)": 0, "Evening (4p-8p)": 0, "Night (8p-6a)": 0}
    
    for a in accidents:
        dt = getattr(a, "accident_date_time", None)
        if isinstance(dt, datetime):
            # Monthly
            month_abbr = calendar.month_abbr[dt.month]
            month_counts[month_abbr] += 1
            # Annual
            year_counts[dt.year] += 1
            # Weekend vs Weekday
            if dt.weekday() >= 5:
                dow_counts["Weekend"] += 1
            else:
                dow_counts["Weekday"] += 1
            # Time of Day
            h = dt.hour
            if 6 <= h < 12: tod_counts["Morning (6a-12p)"] += 1
            elif 12 <= h < 16: tod_counts["Afternoon (12p-4p)"] += 1
            elif 16 <= h < 20: tod_counts["Evening (4p-8p)"] += 1
            else: tod_counts["Night (8p-6a)"] += 1
            
    # 8. Monthly Seasonality (V-Bar)
    months_ordered = [calendar.month_abbr[i] for i in range(1, 13)]
    monthly_ordered = {m: month_counts.get(m, 0) for m in months_ordered}
    charts["monthly_seasonality"] = _plot_vertical_bar(monthly_ordered, "Monthly Seasonality", CHART_TEAL)
    
    # 9. Annual Trend (Line)
    years_ordered = sorted(year_counts.keys())
    yearly_ordered = {y: year_counts[y] for y in years_ordered}
    charts["annual_trend"] = _plot_line(yearly_ordered, "Annual Trend", CHART_PURPLE)
    
    # 10. Weekend vs Weekday (Pie)
    charts["weekend_vs_weekday"] = _plot_pie(dow_counts, "Weekend vs Weekday", [CHART_BLUE, CHART_TEAL])
    
    # 11. Time of Day (V-Bar)
    charts["time_of_day"] = _plot_vertical_bar(tod_counts, "Time of Day Distribution", CHART_INDIGO)

    return charts
