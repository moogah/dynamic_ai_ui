import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Task worktrees live under .worktrees/ inside the home; their copies of the tests are not this tree's.
    exclude: [...configDefaults.exclude, ".worktrees/**"],
  },
});
