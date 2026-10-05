import { describe, expect, it } from "vitest"
import * as Automerge from "@automerge/automerge"
import {
  applyReplacements,
  automergeToData,
  automergeToTree,
  buildHistoryIndex,
  createSample,
  insertInto,
  openBytes,
  removeAtPath,
  renameAtPath,
  saveBytes,
  setAtPath,
} from "../src/lib/document.js"
import { pathKey } from "../src/lib/format.js"
import { findMatches, planReplacements } from "../src/lib/search.js"

describe("Automerge文書の編集", () => {
  it("値の更新、追加、削除、キー変更を保存して読み戻せる", () => {
    let doc = createSample()
    doc = setAtPath(doc, ["company", "seizoubu", "tanaka", "role"], { type: "string", value: "部長" })
    doc = insertInto(doc, ["company", "seizoubu"], "kobayashi", { role: "担当" })
    doc = removeAtPath(doc, ["company", "employees", 2])
    doc = renameAtPath(doc, ["company", "eigyobu"], "sales")
    const loaded = openBytes(saveBytes(doc)).doc
    expect(automergeToData(loaded)).toMatchObject({
      company: {
        seizoubu: { tanaka: { role: "部長" }, kobayashi: { role: "担当" } },
        sales: { sato: { years: 12 } },
      },
    })
    expect(loaded.company.employees).toHaveLength(2)
    expect(loaded.company.eigyobu).toBeUndefined()
  })

  it("JSONとBase64もAutomerge文書として開く", () => {
    const fromJson = openBytes(new TextEncoder().encode(JSON.stringify({ company: { name: "北風" } })))
    expect(fromJson.kind).toBe("json")
    expect(fromJson.doc.company.name).toBe("北風")
    const bytes = saveBytes(createSample())
    const base64 = Buffer.from(bytes).toString("base64")
    const fromBase64 = openBytes(new TextEncoder().encode(base64))
    expect(fromBase64.kind).toBe("base64")
    expect(fromBase64.doc.company.seizoubu.tanaka.role).toBe("課長")
  })

  it("検索置換を1件の変更として反映する", () => {
    let doc = createSample()
    const tree = automergeToTree(doc)
    const ops = planReplacements(tree, { mode: "regex", pattern: "ライン", caseSensitive: true }, "工場", false)
    doc = applyReplacements(doc, ops)
    expect(doc.company.seizoubu.tanaka.note).toBe("工場責任者")
    const last = Automerge.getHistory(doc).at(-1)
    expect(last?.change.message).toBe("検索置換")
  })

  it("同時編集の競合をノードに載せる", () => {
    let base = Automerge.from({ name: "元" })
    let left = Automerge.clone(base)
    let right = Automerge.clone(base)
    left = Automerge.change(left, (draft) => {
      draft.name = "左"
    })
    right = Automerge.change(right, (draft) => {
      draft.name = "右"
    })
    const merged = Automerge.merge(left, right)
    const tree = automergeToTree(merged)
    const name = tree.entries?.find((entry) => entry.key === "name")?.child
    expect(name?.conflicts.length).toBeGreaterThan(1)
  })
})

describe("スカラー文字列", () => {
  /**
   * @returns {import("@automerge/automerge").Doc<any>}
   */
  function scalarDoc() {
    return Automerge.change(Automerge.init(), (draft) => {
      draft.id = new Automerge.ImmutableString("abc")
      draft.createdAt = new Automerge.ImmutableString("2026-09-19T01:29:04.646970Z")
      draft.nested = { note: new Automerge.ImmutableString("hello") }
    })
  }

  it("スカラー文字列を含む文書を開いてツリーと履歴を作れる", () => {
    const opened = openBytes(saveBytes(scalarDoc()))
    expect(opened.kind).toBe("automerge")
    expect(() => {
      buildHistoryIndex(opened.doc)
      automergeToTree(opened.doc)
    }).not.toThrow()
    expect(automergeToData(opened.doc)).toEqual({
      id: "abc",
      createdAt: "2026-09-19T01:29:04.646970Z",
      nested: { note: "hello" },
    })
    const tree = automergeToTree(opened.doc)
    const id = tree.entries?.find((entry) => entry.key === "id")?.child
    expect(id?.type).toBe("string")
    expect(id?.value).toBe("abc")
    expect(id?.entries).toBeUndefined()
    const nested = tree.entries?.find((entry) => entry.key === "nested")?.child
    const note = nested?.entries?.find((entry) => entry.key === "note")?.child
    expect(note?.type).toBe("string")
    expect(note?.value).toBe("hello")
  })

  it("履歴と検索置換がスカラー文字列の値にも効く", () => {
    let doc = scalarDoc()
    const { byPath } = buildHistoryIndex(doc)
    expect(byPath.get(pathKey(["id"]))?.[0]).toMatchObject({
      action: "追加",
      afterText: '"abc"',
    })
    const tree = automergeToTree(doc)
    expect(findMatches(tree, { mode: "regex", pattern: "abc", caseSensitive: true }).paths).toEqual([
      pathKey(["id"]),
    ])
    expect(findMatches(tree, { mode: "js", pattern: "nested.note", caseSensitive: true }).paths).toEqual([
      pathKey(["nested", "note"]),
    ])
    expect(findMatches(tree, { mode: "xpath", pattern: "/createdAt", caseSensitive: true }).paths).toEqual([
      pathKey(["createdAt"]),
    ])
    const ops = planReplacements(tree, { mode: "regex", pattern: "hello", caseSensitive: true }, "world", false)
    doc = applyReplacements(doc, ops)
    expect(String(doc.nested.note)).toBe("world")
    expect(Automerge.isImmutableString(doc.nested.note)).toBe(true)
  })

  it("スカラー文字列を編集しても型を保つ", () => {
    let doc = scalarDoc()
    doc = setAtPath(doc, ["id"], { type: "string", value: "xyz" })
    expect(String(doc.id)).toBe("xyz")
    expect(Automerge.isImmutableString(doc.id)).toBe(true)
    doc = renameAtPath(doc, ["id"], "code")
    expect(String(doc.code)).toBe("xyz")
    expect(Automerge.isImmutableString(doc.code)).toBe(true)
  })

  it("Date を含む文書でもツリーを作れる", () => {
    const doc = Automerge.change(Automerge.init(), (draft) => {
      draft.when = new Date("2026-09-19T01:29:04.646Z")
    })
    expect(() => automergeToTree(doc)).not.toThrow()
    const when = automergeToTree(doc).entries?.find((entry) => entry.key === "when")?.child
    expect(when?.type).toBe("string")
    expect(String(when?.value)).toContain("2026-09-19")
  })
})
