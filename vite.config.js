import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import basicSsl from "@vitejs/plugin-basic-ssl";

// HTTPS + escuchar en todas las interfaces de red, pero SOLO cuando se pide
// explícitamente (`npm run dev:lan`). El día a día (`npm run dev`) no
// cambia: sigue siendo HTTP en localhost, como siempre. Ver "Probar la
// cámara desde un celular real" en el README para el porqué y el paso a
// paso completo (incluye el firewall de Windows, que bloquea esto por
// defecto).
const lan = process.env.VITE_LAN_HTTPS === "1";

export default defineConfig({
  plugins: [react(), tailwindcss(), ...(lan ? [basicSsl()] : [])],
  server: {
    host: lan || undefined,
    proxy: {
      // El proxy preserva el prefijo: /api/auth/x llega al backend como
      // /api/auth/x, igual que a través de Nginx en el stack de Docker.
      "/api": "http://localhost:4000",
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/tests/setup.js"],
    css: true,
    coverage: {
      provider: "v8",
      include: ["src/**/*.{js,jsx}"],
      exclude: ["src/main.jsx", "src/tests/**"],
    },
  },
});
