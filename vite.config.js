import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vite"
import { svelte } from "@sveltejs/vite-plugin-svelte"
import wasm from "vite-plugin-wasm"

const root = dirname(fileURLToPath(import.meta.url))

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
    alias: [
      // jsdom のコンポーネントテストで `svelte` が server エントリに解決されないようにする
      { find: /^svelte$/, replacement: resolve(root, "node_modules/svelte/src/index-client.js") },
    ],
  },
})
