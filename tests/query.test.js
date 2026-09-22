import { describe, expect, it } from "vitest"
import { plainToTree } from "../src/lib/tree.js"
import { parseJsPath } from "../src/lib/jsPath.js"
import { findMatches, planReplacements } from "../src/lib/search.js"

const tree = plainToTree({
  company: {
    seizoubu: {
      tanaka: { role: "課長", years: 6, note: "ライン責任者" },
      suzuki: { role: "担当", years: 2, note: "検査" },
    },
    employees: [
      { name: "tanaka", dept: "seizoubu" },
      { name: "Tanaka", dept: "eigyobu" },
    ],
  },
})

const paths = (query) => findMatches(tree, query).paths.map((item) => JSON.parse(item))

describe("JSパス", () => {
  it("ドット区切りでオブジェクトを指す", () => {
    expect(paths({ mode: "js", pattern: "company.seizoubu.tanaka", caseSensitive: true })).toEqual([
      ["company", "seizoubu", "tanaka"],
    ])
  })

  it("配列は0始まりで、ワイルドカードと深い探索ができる", () => {
    expect(paths({ mode: "js", pattern: "company.employees[0].name", caseSensitive: true })).toEqual([
      ["company", "employees", 0, "name"],
    ])
    expect(paths({ mode: "js", pattern: "company.employees[*].dept", caseSensitive: true })).toEqual([
      ["company", "employees", 0, "dept"],
      ["company", "employees", 1, "dept"],
    ])
    expect(paths({ mode: "js", pattern: "**.note", caseSensitive: true })).toHaveLength(2)
    expect(parseJsPath('company["seizoubu"].tanaka')).toEqual([
      { type: "key", value: "company" },
      { type: "key", value: "seizoubu" },
      { type: "key", value: "tanaka" },
    ])
  })

  it("大文字小文字を区別しない", () => {
    expect(paths({ mode: "js", pattern: "Company.Seizoubu.Tanaka", caseSensitive: false })).toEqual([
      ["company", "seizoubu", "tanaka"],
    ])
  })
})

describe("XPath", () => {
  it("絶対パス、子孫、ワイルドカードを解釈する", () => {
    expect(paths({ mode: "xpath", pattern: "/company/seizoubu/tanaka", caseSensitive: true })).toEqual([
      ["company", "seizoubu", "tanaka"],
    ])
    expect(paths({ mode: "xpath", pattern: "//note", caseSensitive: true })).toHaveLength(2)
    expect(paths({ mode: "xpath", pattern: "/company/*/tanaka", caseSensitive: true })).toEqual([
      ["company", "seizoubu", "tanaka"],
    ])
  })

  it("配列添字は1始まりで、述語で要素を選べる", () => {
    expect(paths({ mode: "xpath", pattern: "/company/employees[1]/name", caseSensitive: true })).toEqual([
      ["company", "employees", 0, "name"],
    ])
    expect(paths({ mode: "xpath", pattern: '//*[name="tanaka"]', caseSensitive: true })).toEqual([
      ["company", "employees", 0],
    ])
    expect(paths({ mode: "xpath", pattern: '//*[name="TANAKA"]', caseSensitive: false })).toEqual([
      ["company", "employees", 0],
      ["company", "employees", 1],
    ])
  })
})

describe("正規表現", () => {
  it("値とキーを大文字小文字の指定どおりに探す", () => {
    const sensitive = findMatches(tree, { mode: "regex", pattern: "tanaka", caseSensitive: true })
    expect(sensitive.paths.map((item) => JSON.parse(item))).toEqual([
      ["company", "seizoubu", "tanaka"],
      ["company", "employees", 0, "name"],
    ])
    const insensitive = findMatches(tree, { mode: "regex", pattern: "^TANAKA$", caseSensitive: false })
    expect(insensitive.paths.map((item) => JSON.parse(item))).toEqual([
      ["company", "seizoubu", "tanaka"],
      ["company", "employees", 0, "name"],
      ["company", "employees", 1, "name"],
    ])
  })

  it("空文字に一致する式は拒否する", () => {
    expect(() => findMatches(tree, { mode: "regex", pattern: "a*", caseSensitive: true })).toThrow(/空文字/)
  })
})

describe("置換計画", () => {
  it("正規表現で文字列の一部を置き換える", () => {
    const ops = planReplacements(tree, { mode: "regex", pattern: "ライン", caseSensitive: true }, "工場", false)
    expect(ops).toEqual([
      { op: "set", path: ["company", "seizoubu", "tanaka", "note"], value: "工場責任者" },
    ])
  })

  it("JSパスでは一致したノードだけを置き換える", () => {
    const ops = planReplacements(
      tree,
      { mode: "js", pattern: "company.seizoubu.tanaka.role", caseSensitive: true },
      '"部長"',
      true,
    )
    expect(ops).toEqual([{ op: "set", path: ["company", "seizoubu", "tanaka", "role"], value: "部長" }])
  })

  it("祖先も一致する場合は上位だけを対象にし、ルートは拒否する", () => {
    expect(() => planReplacements(tree, { mode: "js", pattern: "**", caseSensitive: true }, "x", false)).toThrow(/ルート/)
  })
})
