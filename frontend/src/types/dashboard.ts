/**
 * @file dashboard.ts
 * @description Centralized TypeScript definitions for dashboard data structures, filter criteria, and API response payloads.
 * @responsibility Ensures type safety across all charting components, map layers, and temporal/statistical analysis modules.
 */

/**
 * Dashboard filter options used to query accident data
 */
export interface DashboardFilters {
  /** Districts to include in the filter */
  district: string[];
  /** Years to include in the filter */
  year: string[];
  /** Months to include in the filter (optional) */
  month?: string[];
  /** Days of the week to include in the filter (optional) */
  day?: string[];
  /** Time periods to include in the filter (optional) */
  time_period?: string[];
  /** Severity levels to include in the filter */
  severity: string[];
  /** Road classifications to include in the filter */
  road_classification: string[];
  /** Weather conditions to include in the filter */
  weather_condition: string[];
  /** Light conditions to include in the filter */
  light_condition: string[];
  /** Collision types to include in the filter */
  collision_type: string[];
  /** Police stations to include in the filter (optional) */
  police_station?: string[];
  /** Talukas to include in the filter (optional) */
  taluka?: string[];
  /** Base map type (optional) */
  baseMap?: string;
  /** Visualization type (optional) */
  visualization_type?: string;
  /** Visualization variant (optional) */
  visualization_variant?: string;
  /** Start date for the filter (optional) */
  date_from?: string;
  /** End date for the filter (optional) */
  date_to?: string;
}

/**
 * Available filter options retrieved from the API
 */
export interface FilterOptions {
  /** Available road classification options */
  road_classifications: string[];
  /** Available weather condition options */
  weather_conditions: string[];
  /** Available light condition options */
  light_conditions: string[];
  /** Available collision type options */
  collision_types: string[];
  /** Available police station options (optional) */
  police_stations?: string[];
  /** Available severity options */
  severities: string[];
  /** Available year options */
  years: number[];
  /** Minimum date available in the data (optional) */
  min_date?: string;
  /** Maximum date available in the data (optional) */
  max_date?: string;
}

/**
 * Summary statistics for the dashboard
 */
export interface SummaryData {
  /** Total number of accidents */
  total_accidents: number;
  /** Total number of fatalities */
  total_fatalities: number;
  /** Total number of grievous injuries */
  total_grievous: number;
  /** Total number of minor injuries */
  total_minor: number;
  /** Total number of damage-only accidents */
  total_damage_only: number;
  /** Total number of vehicles involved */
  total_vehicles: number;
  /** Number of districts covered in the data */
  districts_covered: number;
  /** Number of police stations covered in the data */
  police_stations: number;
}

/**
 * Single point in the time series chart
 */
export interface TimeSeriesPoint {
  /** Year of the data point */
  year: number;
  /** Month of the data point */
  month: number;
  /** Human-readable label for the month */
  month_label: string;
  /** Number of accidents in this time period */
  accident_count: number;
  /** Number of fatalities in this time period */
  fatalities: number;
}

/**
 * Count of accidents by severity level
 */
export interface SeverityCount {
  /** Severity level (e.g., Fatal, Grievous) */
  severity: string;
  /** Number of accidents with this severity */
  count: number;
}

/**
 * Accident and fatality counts by district
 */
export interface DistrictCount {
  /** District name */
  district: string;
  /** Number of accidents in this district */
  accident_count: number;
  /** Number of fatalities in this district */
  fatalities: number;
}

/**
 * Single point in the accident heatmap
 */
export interface HeatmapPoint {
  /** Unique identifier for the accident */
  accident_id: string | null;
  /** Latitude coordinate of the accident */
  latitude: number;
  /** Longitude coordinate of the accident */
  longitude: number;
  /** Severity of the accident */
  severity: string;
  /** District where the accident occurred */
  district: string;
  /** Police station jurisdiction (optional) */
  police_station?: string | null;
  /** Road name (optional) */
  road_name?: string | null;
  /** Road classification (optional) */
  road_classification?: string | null;
  /** Weather condition at the time of the accident (optional) */
  weather_condition?: string | null;
  /** Light condition at the time of the accident (optional) */
  light_condition?: string | null;
  /** Type of collision (optional) */
  collision_type?: string | null;
  /** Date and time of the accident (optional) */
  accident_date_time?: string | null;
  /** Number of pedestrians killed (optional) */
  pedestrian_killed?: number | null;
  /** Number of pedestrians with grievous injuries (optional) */
  pedestrian_grievous_injury?: number | null;
  /** Number of pedestrians with minor injuries (optional) */
  pedestrian_minor_injury?: number | null;
}

/**
 * Snapped point in the accident heatmap network visualization
 */
export interface SnappedHeatmapPoint extends HeatmapPoint {
  /** Original un-snapped latitude coordinate */
  original_latitude: number;
  /** Original un-snapped longitude coordinate */
  original_longitude: number;
  /** Distance moved during snapping in meters */
  distance_meters: number;
}

/**
 * Casualty breakdown by category (Driver, Passenger, Pedestrian)
 */
export interface CasualtyBreakdown {
  /** Category of casualty (Driver, Passenger, Pedestrian) */
  category: string;
  /** Number of fatalities in this category */
  killed: number;
  /** Number of grievous injuries in this category */
  grievous: number;
  /** Number of minor injuries in this category */
  minor: number;
}

/**
 * Accident count by weather condition
 */
export interface WeatherCount {
  /** Weather condition (e.g., Clear, Rainy) */
  weather_condition: string;
  /** Display name for the weather condition */
  name: string;
  /** Number of accidents in this weather condition */
  count: number;
}

/**
 * Accident count by light condition
 */
export interface LightCount {
  /** Light condition (e.g., Daylight, Night) */
  light_condition: string;
  /** Display name for the light condition */
  name: string;
  /** Number of accidents in this light condition */
  count: number;
}

/**
 * Ranking of districts by number of fatal accidents
 */
export interface DangerousDistrict {
  /** Rank of the district (1 = most dangerous) */
  rank: number;
  /** District name */
  district: string;
  /** Number of fatal accidents in this district */
  fatal_accidents: number;
  /** Total number of people killed in this district */
  total_killed: number;
}

/**
 * Accident and fatality counts by road classification
 */
export interface RoadClassCount {
  /** Road classification (e.g., NH, SH) */
  road_classification: string;
  /** Number of accidents on this type of road */
  accident_count: number;
  /** Number of fatalities on this type of road */
  fatalities: number;
}

/**
 * Accident count by traffic violation
 */
export interface ViolationCount {
  /** Type of traffic violation (e.g., Speeding) */
  traffic_violation: string;
  /** Display name for the violation */
  name: string;
  /** Number of accidents involving this violation */
  count: number;
}

/**
 * Complete dashboard data structure
 */
export interface DashboardData {
  /** Summary statistics */
  summary: SummaryData;
  /** Time series data for trends */
  timeSeries: TimeSeriesPoint[];
  /** Severity breakdown */
  severity: SeverityCount[];
  /** District-wise accident counts */
  districts: DistrictCount[];
  /** Heatmap points for map visualization */
  heatmap: HeatmapPoint[];
  /** Casualty breakdown by category */
  casualty: CasualtyBreakdown[];
  /** Weather condition counts */
  weather: WeatherCount[];
  /** Light condition counts */
  light: LightCount[];
  /** Dangerous districts ranking */
  dangerous: DangerousDistrict[];
  /** Road classification counts */
  roads: RoadClassCount[];
  /** Traffic violation counts */
  violations: ViolationCount[];
}

/**
 * Hour/day grid count for temporal heatmap
 */
export interface HourDayCount {
  /** Hour of the day (0-23) */
  hour: number;
  /** Day of the week */
  day: string;
  /** Number of accidents in this hour/day cell */
  count: number;
}

/**
 * Hourly accident count
 */
export interface HourlyAccidentCount {
  /** Hour of the day (0-23) */
  hour: number;
  /** Number of accidents in this hour */
  count: number;
}

/**
 * Monthly accident count
 */
export interface MonthlyAccidentCount {
  /** Year of the data point */
  year: number;
  /** Month of the data point (1-12) */
  month: number;
  /** Human-readable label for the month */
  month_label: string;
  /** Number of accidents in this month */
  count: number;
}

/**
 * Summary of peak accident times
 */
export interface PeakSummary {
  /** Peak accident hour */
  peak_hour: string;
  /** Number of accidents at peak hour */
  peak_hour_count: number;
  /** Peak accident day of the week */
  peak_day: string;
  /** Number of accidents on peak day */
  peak_day_count: number;
  /** Peak accident month */
  peak_month: string;
  /** Number of accidents in peak month */
  peak_month_count: number;
  /** Peak accident time period (Morning, Afternoon, Evening, Night) */
  peak_time_period: string;
  /** Number of accidents in peak time period */
  peak_time_period_count: number;
  /** Total number of accidents in the analysis */
  total_accidents: number;
}

/**
 * Complete temporal analysis data structure
 */
export interface TemporalAnalysisData {
  /** Hour/day grid counts */
  hour_day: HourDayCount[];
  /** Hourly counts */
  hourly: HourlyAccidentCount[];
  /** Monthly counts */
  monthly: MonthlyAccidentCount[];
  /** Peak summary statistics */
  summary: PeakSummary;
  /** Day of week distribution (optional) */
  day_of_week_distribution?: { day: string; count: number }[];
  /** Time period distribution (optional) */
  time_period_distribution?: { period: string; count: number }[];
  /** Monthly seasonality (optional) */
  monthly_seasonality?: { month: string; count: number }[];
  /** Annual trend (optional) */
  annual_trend?: { year: number; count: number }[];
  /** Weekend vs weekday comparison (optional) */
  weekend_vs_weekday?: { label: string; count: number }[];
  /** Severity distribution by weekend vs weekday (optional) */
  severity_by_weekend_weekday?: {
    /** Label (Weekday or Weekend) */
    label: string;
    /** Number of fatal accidents */
    Fatal: number;
    /** Number of grievous injury accidents */
    "Grievous Injury": number;
    /** Number of minor injury accidents */
    "Minor Injury": number;
    /** Number of damage-only accidents */
    "Damage Only": number;
  }[];
  /** Severity distribution by hour (optional) */
  severity_by_hour?: {
    /** Hour of the day (0-23) */
    hour: number;
    /** Human-readable label for the hour */
    hour_label: string;
    /** Number of fatal accidents in this hour */
    Fatal: number;
    /** Number of grievous injury accidents in this hour */
    "Grievous Injury": number;
    /** Number of minor injury accidents in this hour */
    "Minor Injury": number;
    /** Number of damage-only accidents in this hour */
    "Damage Only": number;
  }[];
  /** Temporal insights (optional) */
  temporal_insights?: string[];
}
