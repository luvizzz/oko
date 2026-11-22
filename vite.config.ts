import { defineConfig } from "vite";

export default defineConfig({
  base: "/oko/", // servido em subpath (tailscale serve /oko); dev também cai em /oko/
  server: {
    host: "0.0.0.0",
    port: 5173,
    watch: { usePolling: true }, // obrigatório no macOS: inotify não atravessa o volume Docker
  },
  test: {
    environment: "node", // core/ roda headless: proibido jsdom aqui
    include: ["tests/**/*.test.ts"],
  },
});
