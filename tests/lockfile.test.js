import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const packageText = readFileSync(new URL("../package.json", import.meta.url), "utf8")
const packageJson = JSON.parse(packageText)
const lock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"))

/**
 * @param {string} source
 * @param {string} section
 * @returns {string[]}
 */
function sectionKeys(source, section) {
  const match = source.match(new RegExp(`"${section}"\\s*:\\s*\\{([\\s\\S]*?)\\n\\s*\\}`))
  if (!match) return []
  return [...match[1].matchAll(/"([^"]+)"\s*:/g)].map((item) => item[1])
}

describe("package.json と lock ファイル", () => {
  it("依存関係のキーが重複していない", () => {
    for (const section of ["dependencies", "devDependencies", "optionalDependencies"]) {
      const keys = sectionKeys(packageText, section)
      const duplicates = keys.filter((key, index) => keys.indexOf(key) !== index)
      expect(duplicates, section).toEqual([])
    }
  })

  it("package.json の版指定が lock ファイルのルートと一致する", () => {
    const locked = lock.packages[""]
    expect(packageJson.dependencies ?? {}).toEqual(locked.dependencies ?? {})
    expect(packageJson.devDependencies ?? {}).toEqual(locked.devDependencies ?? {})
    expect(packageJson.optionalDependencies ?? {}).toEqual(locked.optionalDependencies ?? {})
  })
})
