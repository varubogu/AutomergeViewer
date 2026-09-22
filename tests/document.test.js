import { describe, expect, it } from "vitest"
import * as Automerge from "@automerge/automerge"
import {
  applyReplacements,
  automergeToData,
  automergeToTree,
  createSample,
  insertInto,
  openBytes,
  removeAtPath,
  renameAtPath,
  saveBytes,
  setAtPath,
} from "../src/lib/document.js"
import { planReplacements } from "../src/lib/search.js"

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
