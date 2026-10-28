/// <reference types="vitest/config" />
import { defineConfig } from "vite";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    // The overlay's test command passes --reporter=junit, which takes its options from this
    // entry: stdout keeps the report on the run's output instead of a file under .vitest/.
    reporters: ["default", ["junit", { stdout: true }]],
  },
});
