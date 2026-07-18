/**
 * @file axios.ts
 * @description Configures and exports a centralized Axios instance for making API requests.
 * 
 * Main Responsibilities:
 * - Establish base URL and default credentials setting for CORS.
 * - Implement global response interceptors.
 * - Handle automatic JWT token refresh on 401 Unauthorized errors.
 * 
 * Important Dependencies:
 * - axios: HTTP client for making API requests.
 */

import axios, {
    type AxiosError,
    type AxiosResponse,
    type InternalAxiosRequestConfig
} from "axios";

declare module "axios" {
    export interface AxiosRequestConfig {
        skipAuthRefresh?: boolean;
    }

    export interface InternalAxiosRequestConfig {
        skipAuthRefresh?: boolean;
        _retry?: boolean;
    }
}

// Fixed: Removed hardcoded "http://localhost:8080/api"
// Resolves base URL from environment variables, falling back to relative '/api'
const BASE_URL = import.meta.env.VITE_API_URL || "/api";

/**
 * The main Axios instance to be used across the frontend.
 * Configured to send cookies (`withCredentials: true`) which is required
 * for cookie-based JWT authentication sessions.
 */
const API = axios.create({
    baseURL: BASE_URL,
    withCredentials: true
});

// --- Token Refresh State Management ---

/** Flag to prevent multiple simultaneous refresh requests */
let isRefreshing = false;

/** Queue to hold pending requests while a token refresh is in progress */
let failedQueue: Array<{
    resolve: () => void;
    reject: (reason?: unknown) => void;
}> = [];

/**
 * Processes the queue of suspended requests after a refresh attempt.
 * @param error - If present, rejects all queued requests; otherwise resolves them.
 */
function processQueue(error?: unknown) {
    failedQueue.forEach(({ resolve, reject }) => {
        if (error) reject(error);
        else resolve();
    });

    failedQueue = [];
}

/**
 * Helper to determine if a URL belongs to the authentication flow.
 * We do not attempt to refresh tokens for these endpoints to prevent infinite loops.
 */
function isAuthEndpoint(url?: string) {
    return (
        url?.includes("/auth/login") ||
        url?.includes("/auth/register") ||
        url?.includes("/auth/refresh") ||
        url?.includes("/auth/logout") ||
        url?.includes("/auth/me")
    );
}

/**
 * Global Response Interceptor
 * 
 * JWT Flow Logic:
 * 1. Let successful responses pass through.
 * 2. Intercept errors. If the error is a 401 (Unauthorized) and the request hasn't been retried yet,
 *    it indicates an expired access token.
 * 3. Pause the current request and any subsequent requests by adding them to `failedQueue`.
 * 4. Initiate a single `/auth/refresh` request.
 * 5. If refresh succeeds, flush the queue and replay the suspended requests.
 * 6. If refresh fails, reject all queued requests (user must log in again).
 */
API.interceptors.response.use(
    (response: AxiosResponse) => response,
    async (error: AxiosError) => {
        const originalRequest = error.config as InternalAxiosRequestConfig | undefined;

        if (!originalRequest) {
            return Promise.reject(error);
        }

        // Determine if we should attempt a token refresh based on strict business rules.
        const shouldTryRefresh =
            error.response?.status === 401 &&
            !originalRequest._retry &&
            !originalRequest.skipAuthRefresh &&
            !isAuthEndpoint(originalRequest.url);

        if (!shouldTryRefresh) {
            return Promise.reject(error);
        }

        // If a refresh is already happening, suspend this request until it finishes.
        if (isRefreshing) {
            return new Promise<void>((resolve, reject) => {
                failedQueue.push({ resolve, reject });
            }).then(() => API(originalRequest));
        }

        originalRequest._retry = true;
        isRefreshing = true;

        try {
            // Attempt to obtain a new access token via the refresh endpoint.
            // Assumes the browser will automatically send the HttpOnly refresh token cookie.
            await axios.post(`${BASE_URL}/auth/refresh`, {}, { withCredentials: true });

            processQueue();
            return API(originalRequest);
        } catch (refreshError) {
            // Refresh failed (e.g., refresh token expired or invalid).
            processQueue(refreshError);
            return Promise.reject(refreshError);
        } finally {
            isRefreshing = false;
        }
    }
);

export default API;