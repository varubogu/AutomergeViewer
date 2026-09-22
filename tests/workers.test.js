import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const config = JSON.parse(readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8"))
const headers = readFileSync(new URL("../public/_headers", import.meta.url), "utf8")

describe("Cloudflare Workers の静的配信", () => {
  it("ビルド成果物だけを静的アセットとして配信する", () => {
    expect(config.assets.directory).toBe("./dist")
    expect(config.assets.not_found_handling).toBe("single-page-application")
    expect(config.main).toBeUndefined()
    expect(config.assets.binding).toBeUndefined()
  })

  it("Wasm を application/wasm で返す", () => {
    expect(headers).toMatch(/\/assets\/\*\.wasm\s+Content-Type:\s*application\/wasm/)
  })
})
