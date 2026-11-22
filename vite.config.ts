import { defineConfig } from "vite";

export default defineConfig({
  server: { host: "0.0.0.0", port: 5173 },
  test: {
    environment: "node", // core/ roda headless: proibido jsdom aqui
    include: ["tests/**/*.test.ts"],
  },
});
