// frontend/src/components/admin/accident_form/formTypes.ts

export interface FormData {
  accident_id: string;
  police_station: string;
  accident_date_time: string;
  severity: string;
  latitude: string;
  longitude: string;
  road_name: string;
  road_classification: string;
  number_of_vehicles: string;
  driver_killed: string;
  driver_grievous_injury: string;
  driver_minor_injury: string;
  passenger_killed: string;
  passenger_grievous_injury: string;
  passenger_minor_injury: string;
  pedestrian_killed: string;
  pedestrian_grievous_injury: string;
  pedestrian_minor_injury: string;
  type_of_collision: string;
  collision_feature: string;
  weather_condition: string;
  light_condition: string;
  visibility: string;
  traffic_violation: string;
}

export const EMPTY_FORM: FormData = {
  accident_id: "",
  police_station: "",
  accident_date_time: "",
  severity: "",
  latitude: "",
  longitude: "",
  road_name: "",
  road_classification: "",
  number_of_vehicles: "1",
  driver_killed: "0",
  driver_grievous_injury: "0",
  driver_minor_injury: "0",
  passenger_killed: "0",
  passenger_grievous_injury: "0",
  passenger_minor_injury: "0",
  pedestrian_killed: "0",
  pedestrian_grievous_injury: "0",
  pedestrian_minor_injury: "0",
  type_of_collision: "",
  collision_feature: "",
  weather_condition: "",
  light_condition: "",
  visibility: "",
  traffic_violation: "",
};

export const SEVERITY_OPTIONS = [
  "Fatal",
  "Grievous Injury",
  "Minor Injury",
  "Damage Only",
];

export const ROAD_CLASS_OPTIONS = [
  "National Highway",
  "State Highway",
  "Major District Road",
  "Other District Road",
  "Village Road",
  "Urban Road",
];

export const COLLISION_OPTIONS = [
  "Right Turn",
  "Left Turn",
  "Going Straight",
  "U-Turn",
  "Overtaking",
  "Swerving",
  "Fallen Down",
  "Head On",
  "Rear Impact",
  "Side Impact",
  "Hit Object on Road",
  "Hit Parked Vehicle",
];

export const COLLISION_FEATURE_OPTIONS = [
  "Vehicle to Vehicle",
  "Vehicle to Pedestrian",
  "Vehicle to Animal",
  "Vehicle to Fixed Object",
  "Vehicle to Two Wheeler",
  "Single Vehicle",
];

export const WEATHER_OPTIONS = [
  "Clear",
  "Cloudy",
  "Light Rain",
  "Heavy Rain",
  "Fog",
  "Mist",
  "Dust Storm",
];

export const LIGHT_OPTIONS = [
  "Daylight",
  "Dawn/Dusk",
  "Darkness with Street Light",
  "Darkness without Street Light",
  "Darkness with Street Light Not Functioning",
];

export const VISIBILITY_OPTIONS = ["Good", "Moderate", "Poor"];

export const VIOLATION_OPTIONS = [
  "Drunken Driving",
  "Over Speeding",
  "Jumping Red Light",
  "Use of Mobile Phone",
  "Overloading",
  "Wrong Side Driving",
  "Without Helmet",
  "Without Seatbelt",
  "No Violation",
  "Unknown",
];
