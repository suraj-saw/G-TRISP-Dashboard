export interface DashboardFilters {
  district: string;
  year: string;
  severity: string;
  road_classification: string;
  weather_condition: string;
  light_condition: string;
  collision_type: string;
  baseMap?: string;
  visualization_type?: string;
}

export interface FilterOptions {
  road_classifications: string[];
  weather_conditions: string[];
  light_conditions: string[];
  collision_types: string[];
  police_stations?: string[];
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
  accident_id: number;
  latitude: number;
  longitude: number;
  severity: string;
  district: string;
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
