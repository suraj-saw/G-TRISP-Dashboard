// frontend/src/api/adminAccidentsApi.ts
import API from "./axios";

export interface AccidentRecord {
  id: number;
  accident_id: string;
  district: string;
  police_station: string;
  accident_date_time: string;
  latitude: number | null;
  longitude: number | null;
  road_name: string | null;
  road_classification: string | null;
  severity: string | null;
  number_of_vehicles: number;
  driver_killed: number;
  driver_grievous_injury: number;
  driver_minor_injury: number;
  passenger_killed: number;
  passenger_grievous_injury: number;
  passenger_minor_injury: number;
  pedestrian_killed: number;
  pedestrian_grievous_injury: number;
  pedestrian_minor_injury: number;
  type_of_collision: string | null;
  collision_feature: string | null;
  weather_condition: string | null;
  light_condition: string | null;
  visibility: string | null;
  traffic_violation: string | null;
}

export interface AccidentFilters {
  district?: string;
  police_station?: string;
  severity?: string;
  road_name?: string;
  road_classification?: string;
  type_of_collision?: string;
  weather_condition?: string;
  light_condition?: string;
  visibility?: string;
  traffic_violation?: string;
  collision_feature?: string;
}

export interface GetAccidentsResponse {
  total: number;
  skip: number;
  limit: number;
  data: AccidentRecord[];
}

export interface UploadResponse {
  valid: boolean;
  total_rows: number;
  valid_count: number;
  invalid_count: number;
  duplicate_count: number;
  preview: Record<string, any>[];
  columns: string[];
  data: Record<string, any>[];
  invalid_rows: ValidationIssueRow[];
  duplicate_rows: ValidationIssueRow[];
  total_invalid_rows: number;
  total_duplicate_rows: number;
}

export interface ValidationIssueRow {
  row: number;
  accident_id?: string;
  errors: string[];
  data?: Record<string, any>;
}

export interface ImportResponse {
  message: string;
  inserted: number;
}

export interface AccidentFilterOptions {
  severities: string[];
  police_stations: string[];
}

export const adminAccidentsApi = {
  getAccidents: async (
    skip: number = 0,
    limit: number = 50,
    search: string = "",
    filters?: AccidentFilters
  ) => {
    const params = new URLSearchParams({
      skip: skip.toString(),
      limit: limit.toString(),
    });
    if (search) {
      params.append("search", search);
    }
    if (filters) {
      for (const [key, value] of Object.entries(filters)) {
        if (value) {
          params.append(key, value);
        }
      }
    }
    const res = await API.get<GetAccidentsResponse>(
      `/admin/surat/accidents?${params.toString()}`
    );
    return res.data;
  },

  addAccident: async (payload: Partial<AccidentRecord>) => {
    const res = await API.post("/admin/surat/accidents", payload);
    return res.data;
  },

  updateAccident: async (id: number, payload: Partial<AccidentRecord>) => {
    const res = await API.put(`/admin/surat/accidents/${id}`, payload);
    return res.data;
  },

  deleteAccident: async (id: number) => {
    const res = await API.delete(`/admin/surat/accidents/${id}`);
    return res.data;
  },

  uploadFile: async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await API.post<UploadResponse>(
      "/admin/surat/accidents/upload",
      formData,
      { headers: { "Content-Type": "multipart/form-data" } }
    );
    return res.data;
  },

  importRecords: async (records: Record<string, any>[]) => {
    const res = await API.post<ImportResponse>(
      "/admin/surat/accidents/import",
      { records }
    );
    return res.data;
  },

  getColumns: async () => {
    const res = await API.get<{ columns: string[] }>(
      "/admin/surat/accidents/columns"
    );
    return res.data.columns;
  },

  getFilterOptions: async () => {
    const res = await API.get<AccidentFilterOptions>(
      "/admin/surat/accidents/filter-options"
    );
    return res.data;
  },
};
