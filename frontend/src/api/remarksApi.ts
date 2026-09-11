/**
 * @file remarksApi.ts
 * @description API client for blackspot remark CRUD operations.
 *
 * Remarks are anchored to blackspot clusters via a deterministic SHA-256 hash
 * of their sorted crash IDs. This module provides functions to compute that
 * hash client-side (using the Web Crypto API) and to interact with the backend
 * remarks endpoints.
 */

import API from "./axios";
import { GUJARAT_API_BASE } from "../config/constants";

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export interface Remark {
  id: number;
  crash_ids_hash: string;
  crash_ids: string;
  visualization_type: string;
  district: string | null;
  centroid_lat: number;
  centroid_lon: number;
  remark: string;
  created_by: number;
  created_by_username: string;
  updated_by: number | null;
  updated_by_username: string | null;
  created_at: string;
  updated_at: string | null;
  match_type?: "exact" | "spatial";
  distance_m?: number | null;
}

export interface RemarkClusterSummary {
  count: number;
  latest_remark: Remark | null;
}

export interface ClusterLookupItem {
  bs_id: string;
  hash: string;
  centroid_lat: number;
  centroid_lon: number;
  radius_m?: number;
}

export interface RemarkCreatePayload {
  crash_ids: string[];
  visualization_type: string;
  district?: string | null;
  centroid_lat: number;
  centroid_lon: number;
  remark: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HASH UTILITY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Compute a deterministic SHA-256 hex hash from a list of crash ID strings.
 * Uses the Web Crypto API (SubtleCrypto) available in all modern browsers.
 *
 * The IDs are deduplicated, sorted numerically, and joined with commas —
 * matching the backend `compute_crash_ids_hash` implementation exactly.
 */
export async function computeCrashIdsHash(crashIds: string[]): Promise<string> {
  const unique = [...new Set(crashIds)];
  unique.sort((a, b) => {
    const na = Number(a);
    const nb = Number(b);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return a.localeCompare(b);
  });
  const joined = unique.join(",");
  const encoded = new TextEncoder().encode(joined);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ═══════════════════════════════════════════════════════════════════════════════
// API FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Fetch the full chronological remarks timeline for a blackspot cluster by its crash IDs
 * and optional spatial centroid (Two-Tier matching).
 * Returns an array of Remark objects sorted newest first.
 */
export async function fetchRemarksTimeline(
  crashIds: string[],
  centroidLat?: number,
  centroidLon?: number,
  radiusM?: number
): Promise<Remark[]> {
  try {
    const joined = crashIds.join(",");
    const params: Record<string, any> = { crash_ids: joined };
    if (centroidLat !== undefined && centroidLon !== undefined) {
      params.centroid_lat = centroidLat;
      params.centroid_lon = centroidLon;
      params.radius_m = radiusM ?? 250;
    }
    const { data } = await API.get(`${GUJARAT_API_BASE}/remarks/timeline`, {
      params,
    });
    return data || [];
  } catch (err: any) {
    if (err?.response?.status === 404) return [];
    throw err;
  }
}

/**
 * Fetch the latest single remark by crash IDs.
 * Returns the remark if found, or null if no remark exists.
 */
export async function fetchRemarkByCrashIds(
  crashIds: string[]
): Promise<Remark | null> {
  try {
    const joined = crashIds.join(",");
    const { data } = await API.get(`${GUJARAT_API_BASE}/remarks/by-crash-ids`, {
      params: { crash_ids: joined },
    });
    return data;
  } catch (err: any) {
    if (err?.response?.status === 404) return null;
    throw err;
  }
}

/**
 * Bulk lookup remarks summary by a list of crash_ids_hash values OR clusters with spatial coordinates.
 * Returns a map of hash → RemarkClusterSummary for all matches.
 */
export async function fetchRemarksBulk(
  payload: string[] | ClusterLookupItem[]
): Promise<Record<string, RemarkClusterSummary>> {
  if (payload.length === 0) return {};
  try {
    const isClusters = typeof payload[0] !== "string";
    const body = isClusters ? { clusters: payload } : { hashes: payload };
    const { data } = await API.post(`${GUJARAT_API_BASE}/remarks/bulk`, body);
    return data.remarks || {};
  } catch {
    // Silently return empty on failure to avoid breaking the map layer
    return {};
  }
}

/**
 * Create a new remark for a blackspot cluster.
 */
export async function createRemark(
  payload: RemarkCreatePayload
): Promise<Remark> {
  const { data } = await API.post(`${GUJARAT_API_BASE}/remarks`, payload);
  return data;
}

/**
 * Update the text of an existing remark.
 */
export async function updateRemark(
  remarkId: number,
  remarkText: string
): Promise<Remark> {
  const { data } = await API.put(`${GUJARAT_API_BASE}/remarks/${remarkId}`, {
    remark: remarkText,
  });
  return data;
}

/**
 * Delete a remark by ID.
 */
export async function deleteRemark(remarkId: number): Promise<void> {
  await API.delete(`${GUJARAT_API_BASE}/remarks/${remarkId}`);
}
