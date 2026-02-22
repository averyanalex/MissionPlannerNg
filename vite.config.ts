import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: process.env.TAURI_ENV_PLATFORM === "android" ? "0.0.0.0" : "localhost",
  },
});
