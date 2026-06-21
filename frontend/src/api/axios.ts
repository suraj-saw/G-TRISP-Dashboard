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
const BASE_URL = import.meta.env.VITE_API_URL || "/api";

const API = axios.create({
    baseURL: BASE_URL,
    withCredentials: true
});

let isRefreshing = false;

let failedQueue: Array<{
    resolve: () => void;
    reject: (reason?: unknown) => void;
}> = [];

function processQueue(error?: unknown) {
    failedQueue.forEach(({ resolve, reject }) => {
        if (error) reject(error);
        else resolve();
    });

    failedQueue = [];
}

function isAuthEndpoint(url?: string) {
    return (
        url?.includes("/auth/login") ||
        url?.includes("/auth/register") ||
        url?.includes("/auth/refresh") ||
        url?.includes("/auth/logout") ||
        url?.includes("/auth/me")
    );
}

API.interceptors.response.use(
    (response: AxiosResponse) => response,
    async (error: AxiosError) => {
        const originalRequest = error.config as InternalAxiosRequestConfig | undefined;

        if (!originalRequest) {
            return Promise.reject(error);
        }

        const shouldTryRefresh =
            error.response?.status === 401 &&
            !originalRequest._retry &&
            !originalRequest.skipAuthRefresh &&
            !isAuthEndpoint(originalRequest.url);

        if (!shouldTryRefresh) {
            return Promise.reject(error);
        }

        if (isRefreshing) {
            return new Promise<void>((resolve, reject) => {
                failedQueue.push({ resolve, reject });
            }).then(() => API(originalRequest));
        }

        originalRequest._retry = true;
        isRefreshing = true;

        try {
            await axios.post(`${BASE_URL}/auth/refresh`, {}, { withCredentials: true });

            processQueue();
            return API(originalRequest);
        } catch (refreshError) {
            processQueue(refreshError);
            return Promise.reject(refreshError);
        } finally {
            isRefreshing = false;
        }
    }
);

export default API;