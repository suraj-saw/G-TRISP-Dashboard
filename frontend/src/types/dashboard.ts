export interface DashboardFilters {
  district: string[];
  year: string[];
  month?: string[];
  day?: string[];
  time_period?: string[];
  severity: string[];
  road_classification: string[];
  weather_condition: string[];
  light_condition: string[];
  collision_type: string[];
  police_station?: string[]; // NEW
  taluka?: string[]; // NEW
  baseMap?: string;
  visualization_type?: string;
  visualization_variant?: string;
  date_from?: string;
  date_to?: string;
}

export interface FilterOptions {
  road_classifications: string[];
  weather_conditions: string[];
  light_conditions: string[];
  collision_types: string[];
  police_stations?: string[]; // NEW
  severities: string[];
  years: number[];
  min_date?: string;
  max_date?: string;
}

export interface SummaryData {
  total_accidents: number;
  total_fatalities: number;
  total_grievous: number;
  total_minor: number;
  total_damage_only: number;
  total_vehicles: number;
  districts_covered: number;
  police_stations: number;
}

export interface TimeSeriesPoint {
  year: number;
  month: number;
  month_label: string;
  accident_count: number;
  fatalities: number;
}

export interface SeverityCount {
  severity: string;
  count: number;
}

export interface DistrictCount {
  district: string;
  accident_count: number;
  fatalities: number;
}

export interface HeatmapPoint {
  accident_id: string | null;
  latitude: number;
  longitude: number;
  severity: string;
  district: string;
  police_station?: string | null;
  road_name?: string | null;
  road_classification?: string | null;
  weather_condition?: string | null;
  light_condition?: string | null;
  collision_type?: string | null;
  accident_date_time?: string | null;
  pedestrian_killed?: number | null;
  pedestrian_grievous_injury?: number | null;
  pedestrian_minor_injury?: number | null;
}

export interface CasualtyBreakdown {
  category: string;
  killed: number;
  grievous: number;
  minor: number;
}

export interface WeatherCount {
  weather_condition: string;
  name: string;
  count: number;
}

export interface LightCount {
  light_condition: string;
  name: string;
  count: number;
}

export interface DangerousDistrict {
  rank: number;
  district: string;
  fatal_accidents: number;
  total_killed: number;
}

export interface RoadClassCount {
  road_classification: string;
  accident_count: number;
  fatalities: number;
}

export interface ViolationCount {
  traffic_violation: string;
  name: string;
  count: number;
}

export interface DashboardData {
  summary: SummaryData;
  timeSeries: TimeSeriesPoint[];
  severity: SeverityCount[];
  districts: DistrictCount[];
  heatmap: HeatmapPoint[];
  casualty: CasualtyBreakdown[];
  weather: WeatherCount[];
  light: LightCount[];
  dangerous: DangerousDistrict[];
  roads: RoadClassCount[];
  violations: ViolationCount[];
}

export interface HourDayCount {
  hour: number;
  day: string;
  count: number;
}

export interface HourlyAccidentCount {
  hour: number;
  count: number;
}

export interface MonthlyAccidentCount {
  year: number;
  month: number;
  month_label: string;
  count: number;
}

export interface PeakSummary {
  peak_hour: string;
  peak_hour_count: number;
  peak_day: string;
  peak_day_count: number;
  peak_month: string;
  peak_month_count: number;
  peak_time_period: string;
  peak_time_period_count: number;
  total_accidents: number;
}

export interface TemporalAnalysisData {
  hour_day: HourDayCount[];
  hourly: HourlyAccidentCount[];
  monthly: MonthlyAccidentCount[];
  summary: PeakSummary;
  day_of_week_distribution?: { day: string; count: number }[];
  time_period_distribution?: { period: string; count: number }[];
  monthly_seasonality?: { month: string; count: number }[];
  annual_trend?: { year: number; count: number }[];
  weekend_vs_weekday?: { label: string; count: number }[];
  severity_by_hour?: {
    hour: number;
    hour_label: string;
    Fatal: number;
    "Grievous Injury": number;
    "Minor Injury": number;
    "Damage Only": number;
  }[];
  temporal_insights?: string[];
}
