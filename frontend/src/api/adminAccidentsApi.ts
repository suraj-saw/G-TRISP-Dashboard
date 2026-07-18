// frontend/src/api/adminAccidentsApi.ts
import API from "./axios";

/**
 * Interface representing a single accident record from the admin API
 */
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

/**
 * Interface for filtering accident records in admin API
 */
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

/**
 * Interface for getAccidents API response
 */
export interface GetAccidentsResponse {
  total: number;
  skip: number;
  limit: number;
  data: AccidentRecord[];
}

/**
 * Interface for file upload validation response
 */
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

/**
 * Interface representing a single row with validation issues (invalid or duplicate)
 */
export interface ValidationIssueRow {
  row: number;
  accident_id?: string;
  errors: string[];
  data?: Record<string, any>;
}

/**
 * Interface for import records API response
 */
export interface ImportResponse {
  message: string;
  inserted: number;
}

/**
 * Interface for available filter options for accident records
 */
export interface AccidentFilterOptions {
  severities: string[];
  police_stations: string[];
  districts: string[];
  road_names: string[];
  collision_types: string[];
  collision_features: string[];
  weather_conditions: string[];
  light_conditions: string[];
  visibilities: string[];
}

export const adminAccidentsApi = {
  /**
   * Fetch paginated list of accident records with optional search and filters
   * @param skip - Number of records to skip (default 0)
   * @param limit - Max number of records per page (default 50)
   * @param search - Search query string
   * @param filters - Filter options for accident records
   */
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

  /**
   * Add a new accident record
   * @param payload - Partial accident record data to create
   */
  addAccident: async (payload: Partial<AccidentRecord>) => {
    const res = await API.post("/admin/surat/accidents", payload);
    return res.data;
  },

  /**
   * Update an existing accident record by ID
   * @param id - ID of the accident record to update
   * @param payload - Partial accident record data with updates
   */
  updateAccident: async (id: number, payload: Partial<AccidentRecord>) => {
    const res = await API.put(`/admin/surat/accidents/${id}`, payload);
    return res.data;
  },

  /**
   * Delete a single accident record by ID
   * @param id - ID of the accident record to delete
   */
  deleteAccident: async (id: number) => {
    const res = await API.delete(`/admin/surat/accidents/${id}`);
    return res.data;
  },

  /**
   * Bulk delete multiple accident records by IDs
   * @param ids - Array of accident record IDs to delete
   */
  bulkDeleteAccidents: async (ids: number[]) => {
    const res = await API.post<{ message: string; deleted: number }>(
      "/admin/surat/accidents/bulk-delete",
      { ids }
    );
    return res.data;
  },

  /**
   * Upload an Excel file to validate and preview accident records
   * @param file - File object containing accident data
   */
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

  /**
   * Import validated accident records from an uploaded file
   * @param records - Array of accident records to import
   */
  importRecords: async (records: Record<string, any>[]) => {
    const res = await API.post<ImportResponse>(
      "/admin/surat/accidents/import",
      { records }
    );
    return res.data;
  },

  /**
   * Get the list of available columns for accident records
   */
  getColumns: async () => {
    const res = await API.get<{ columns: string[] }>(
      "/admin/surat/accidents/columns"
    );
    return res.data.columns;
  },

  /**
   * Get the list of available filter options for accident records
   */
  getFilterOptions: async () => {
    const res = await API.get<AccidentFilterOptions>(
      "/admin/surat/accidents/filter-options"
    );
    return res.data;
  },
};
