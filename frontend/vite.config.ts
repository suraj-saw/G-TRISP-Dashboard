// frontend/vite.config.ts
//
// Vite Configuration File (Local/Development Build Tooling)
// Designed for the G-TRISP Dashboard frontend application.
//
// Context within the stack:
// - Configures the fast bundler and development server for the React application.
// - Loads context-specific environment variables during the initial build/startup phase.
// - Sets up a development proxy targeting the local Nginx stack or backend API to prevent CORS issues.
// - Integrates the React compiler/refresh framework and Tailwind CSS utility styling engine.

import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vitejs.dev/config/
// The `defineConfig` helper provides IDE type hints and supports conditional config based on the execution mode (e.g., 'development', 'production').
export default defineConfig(({ mode }) => {
  // ------------------------------------------------------------------
  // Environment Variables Initialization
  // ------------------------------------------------------------------
  // Vite natively restricts environment variables to those prefixed with `VITE_` inside the client app.
  // Using `loadEnv` explicitly exposes variables to the Node.js configuration context before setup.
  // - mode: The current execution mode (e.g., 'development').
  // - process.cwd(): The directory where the command was run (frontend root).
  // - "": Passing an empty string as the third argument tells Vite to load ALL variables regardless of the prefix.
  const env = loadEnv(mode, process.cwd(), "");

  // Fallback target for local routing. If VITE_PROXY_TARGET is not defined in the environment files,
  // it defaults to the local Nginx container/ingress router port (8080).
  const proxyTarget = env.VITE_PROXY_TARGET || "http://localhost:8080";

  return {
    // ----------------------------------------------------------------------
    // Core Plugins Block
    // ----------------------------------------------------------------------
    plugins: [
      // Enables JSX/TSX compilation and Fast Refresh support for efficient hot reloading during development
      react(),

      // Integrates Tailwind CSS build-time optimizations directly into Vite's asset handling pipeline
      tailwindcss(),
    ],

    // ----------------------------------------------------------------------
    // Development Server Settings
    // ----------------------------------------------------------------------
    server: {
      // Bypasses the strict host header verification check.
      // Essential when accessing the Vite development server through Docker hostnames,
      // custom local domain aliases, or external tunneling tools (e.g., ngrok).
      allowedHosts: true,

      // ------------------------------------------------------------------
      // Local Development Proxy Rules
      // ------------------------------------------------------------------
      // Emulates the production routing environment by intercepting specific paths during local development.
      // This eliminates the need to configure cross-origin resource sharing (CORS) header profiles on the backend API locally.
      proxy: {
        // Intercepts any frontend network requests starting with "/api"
        "/api": {
          // Specifies the destination server where the requests should be transparently forwarded
          target: proxyTarget,

          // Rewrites the origin of the host header to match the target URL.
          // Crucial when the backend enforces strict origin/host validation.
          changeOrigin: true,
        },
      },
    },
  };
});
