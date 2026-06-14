import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Только UI-тесты, которым нужен JSX/DOM, живут в test/ui/**.
// Чистая логика (util, telegram, i18n) остаётся на `node --test` — см. package.json.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    include: ["test/ui/**/*.test.{js,jsx}"],
    restoreMocks: true,
  },
});
