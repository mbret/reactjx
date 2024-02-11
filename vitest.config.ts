/// <reference types="vitest" />
import { defineConfig } from "vite"

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["test-setup.ts"],
    testTimeout: 500
  }
})
