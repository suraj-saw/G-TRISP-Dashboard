import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
  // Load .env so VITE_PROXY_TARGET is available at config time
  const env = loadEnv(mode, process.cwd(), "");

  const proxyTarget = env.VITE_PROXY_TARGET || "http://localhost:8080";

  return {
    plugins: [react(), tailwindcss()],
    server: {
      allowedHosts: true,
      proxy: {
        "/api": {
          target: proxyTarget,
          changeOrigin: true,
        },
      },
    },
  };
});
