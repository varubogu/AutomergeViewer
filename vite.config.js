import { defineConfig } from "vite"
import { svelte } from "@sveltejs/vite-plugin-svelte"
import wasm from "vite-plugin-wasm"

export default defineConfig({
  base: "/",
  plugins: [wasm(), svelte()],
  optimizeDeps: {
    exclude: ["@automerge/automerge"],
  },
  build: {
    target: "esnext",
  },
  worker: {
    format: "es",
    plugins: () => [wasm()],
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.js"],
  },
})
