import * as Automerge from "@automerge/automerge"
import { formatPath, pathKey, truncate } from "./format.js"
import { diffHistory } from "./history.js"
import { plainToTree } from "./tree.js"

/**
 * @typedef {import("./format.js").DocPath} DocPath
 * @typedef {import("./tree.js").TreeNode} TreeNode
 * @typedef {import("./search.js").EditOp} EditOp
 * @typedef {import("@automerge/automerge").Doc<any>} AmDoc
 * @typedef {{ type: string, value?: unknown }} EditPayload
 */

/**
 * @returns {AmDoc}
 */
export function createSample() {
  const at = (/** @type {string} */ iso) => Math.floor(Date.parse(iso) / 1000)
  let doc = Automerge.from({
    company: {
      name: "北風製作所",
      seizoubu: {
        tanaka: { role: "主任", years: 5, note: "旋盤担当" },
        suzuki: { role: "担当", years: 2, note: "検査" },
      },
      eigyobu: {
        sato: { role: "課長", years: 11, note: "東日本" },
      },
      employees: [
        { id: "E-01", name: "tanaka", dept: "seizoubu" },
        { id: "E-02", name: "suzuki", dept: "seizoubu" },
        { id: "E-03", name: "sato", dept: "eigyobu" },
      ],
    },
  })
  doc = Automerge.change(doc, { message: "田中を課長に昇進", time: at("2025-04-01T09:00:00+09:00") }, (draft) => {
    draft.company.seizoubu.tanaka.role = "課長"
    draft.company.seizoubu.tanaka.years = 6
  })
  doc = Automerge.change(doc, { message: "佐藤の勤続年数を修正", time: at("2025-11-20T15:30:00+09:00") }, (draft) => {
    draft.company.eigyobu.sato.years = 12
  })
  doc = Automerge.change(doc, { message: "製造部メモを更新", time: at("2026-02-02T11:12:00+09:00") }, (draft) => {
    draft.company.seizoubu.tanaka.note = "ライン責任者"
  })
  return doc
}

/**
 * @param {Uint8Array} bytes
 * @returns {{ doc: AmDoc, kind: "automerge" | "base64" | "json" }}
 */
export function openBytes(bytes) {
  try {
    return { doc: Automerge.load(bytes), kind: "automerge" }
  } catch (first) {
    const text = new TextDecoder().decode(bytes).trim()
    if (!text) throw first
    if (text.startsWith("{") || text.startsWith("[")) {
      let json
      try {
        json = JSON.parse(text)
      } catch {
        throw new Error("JSONとして解釈できません")
      }
      if (!json || typeof json !== "object" || Array.isArray(json)) {
        throw new Error("JSONのルートはオブジェクトにしてください")
      }
      return { doc: Automerge.from(json), kind: "json" }
    }
    const compact = text.replace(/\s+/g, "")
    if (compact.length >= 16 && /^[A-Za-z0-9+/]+={0,2}$/.test(compact)) {
      try {
        const binary = Uint8Array.from(atob(compact), (char) => char.charCodeAt(0))
        return { doc: Automerge.load(binary), kind: "base64" }
      } catch {
        throw new Error("Base64のAutomergeデータとして読み込めません")
      }
    }
    throw new Error("Automergeファイルではありません")
  }
}

/**
 * @param {AmDoc} doc
 * @returns {Uint8Array}
 */
export function saveBytes(doc) {
  return Automerge.save(doc)
}

/**
 * @param {AmDoc} doc
 * @returns {TreeNode}
 */
export function automergeToTree(doc) {
  const tree = plainToTree(automergeToData(doc))
  attachConflicts(tree, doc)
  return tree
}

/**
 * @param {AmDoc} doc
 * @returns {Map<string, import("./history.js").HistoryEvent[]>}
 */
export function buildHistoryIndex(doc) {
  const history = Automerge.getHistory(doc)
  const byPath = diffHistory(
    history.map((entry) => ({
      time: entry.change.time,
      message: entry.change.message,
      actor: entry.change.actor,
      data: automergeToData(entry.snapshot),
    })),
  )
  return { byPath, changeCount: history.length }
}

/**
 * @param {unknown} value
 * @returns {unknown}
 */
export function automergeToData(value) {
  if (Automerge.isCounter(value)) {
    return { __type: "counter", value: /** @type {{ value: number }} */ (value).value }
  }
  if (value instanceof Uint8Array) {
    return { __type: "bytes", value: bytesToBase64(value) }
  }
  if (Array.isArray(value)) return value.map((item) => automergeToData(item))
  if (value && typeof value === "object") {
    /** @type {Record<string, unknown>} */
    const result = {}
    for (const key of Object.keys(value)) {
      result[key] = automergeToData(/** @type {Record<string, unknown>} */ (value)[key])
    }
    return result
  }
  return value
}

/**
 * @param {TreeNode} node
 * @param {any} live
 */
function attachConflicts(node, live) {
  if (node.type === "object" && live && typeof live === "object") {
    for (const entry of node.entries ?? []) {
      entry.child.conflicts = formatConflicts(Automerge.getConflicts(live, entry.key))
      attachConflicts(entry.child, live[entry.key])
    }
  } else if (node.type === "array" && live) {
    for (const child of node.children ?? []) {
      const index = /** @type {number} */ (child.path.at(-1))
      child.conflicts = formatConflicts(Automerge.getConflicts(live, index))
      attachConflicts(child, live[index])
    }
  }
}

/**
 * @param {Record<string, unknown> | undefined} conflicts
 * @returns {{ id: string, text: string }[]}
 */
function formatConflicts(conflicts) {
  if (!conflicts) return []
  return Object.entries(conflicts).map(([id, value]) => ({
    id: String(id),
    text: truncate(JSON.stringify(automergeToData(value)), 180),
  }))
}

/**
 * @param {AmDoc} doc
 * @param {DocPath} path
 * @param {EditPayload} payload
 * @returns {AmDoc}
 */
export function setAtPath(doc, path, payload) {
  const value = payloadToValue(payload)
  if (path.length === 0) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("ルートはオブジェクトにしてください")
    }
    return Automerge.change(doc, "ルートを更新", (draft) => {
      for (const key of Object.keys(draft)) delete draft[key]
      for (const [key, item] of Object.entries(value)) draft[key] = item
    })
  }
  return Automerge.change(doc, `値を更新 (${formatPath(path)})`, (draft) => {
    const parent = getIn(draft, path.slice(0, -1))
    parent[path.at(-1)] = toAutomergeValue(value)
  })
}

/**
 * @param {AmDoc} doc
 * @param {DocPath} path
 * @returns {AmDoc}
 */
export function removeAtPath(doc, path) {
  if (path.length === 0) throw new Error("ルートは削除できません")
  return Automerge.change(doc, `削除 (${formatPath(path)})`, (draft) => {
    const parent = getIn(draft, path.slice(0, -1))
    const key = path.at(-1)
    if (Array.isArray(parent)) Automerge.deleteAt(parent, /** @type {number} */ (key), 1)
    else delete parent[key]
  })
}

/**
 * @param {AmDoc} doc
 * @param {DocPath} containerPath
 * @param {string | null} key
 * @param {unknown} value
 * @returns {AmDoc}
 */
export function insertInto(doc, containerPath, key, value) {
  return Automerge.change(doc, `追加 (${formatPath(key == null ? containerPath : containerPath.concat(key))})`, (draft) => {
    const parent = getIn(draft, containerPath)
    if (Array.isArray(parent)) {
      Automerge.insertAt(parent, parent.length, toAutomergeValue(value))
      return
    }
    if (typeof key !== "string" || key.length === 0) throw new Error("キーを入力してください")
    if (Object.prototype.hasOwnProperty.call(parent, key)) throw new Error(`キー「${key}」は既にあります`)
    parent[key] = toAutomergeValue(value)
  })
}

/**
 * @param {AmDoc} doc
 * @param {DocPath} path
 * @param {string} newKey
 * @returns {AmDoc}
 */
export function renameAtPath(doc, path, newKey) {
  if (typeof path.at(-1) !== "string") throw new Error("配列の添字は変更できません")
  if (!newKey) throw new Error("キーを空にはできません")
  return applyOps(doc, [{ op: "rename", path, newKey }], `キーを変更 (${formatPath(path)} → ${newKey})`)
}

/**
 * @param {AmDoc} doc
 * @param {EditOp[]} ops
 * @returns {AmDoc}
 */
export function applyReplacements(doc, ops) {
  if (ops.length === 0) return doc
  return applyOps(doc, ops, "検索置換")
}

/**
 * @param {AmDoc} doc
 * @param {EditOp[]} ops
 * @param {string} message
 * @returns {AmDoc}
 */
function applyOps(doc, ops, message) {
  const renames = ops.filter((op) => op.op === "rename")
  const sets = ops.filter((op) => op.op === "set")
  return Automerge.change(doc, message, (draft) => {
    const planned = renames.map((op) => {
      if (op.op !== "rename") throw new Error("内部エラー")
      const oldKey = op.path.at(-1)
      if (typeof oldKey !== "string") throw new Error("配列の添字は変更できません")
      if (!op.newKey) throw new Error("キーを空にはできません")
      const parent = getIn(draft, op.path.slice(0, -1))
      if (parent == null || Array.isArray(parent)) throw new Error("この場所のキーは変更できません")
      return { op, parent, oldKey }
    })
    for (const item of planned) {
      if (item.op.newKey === item.oldKey) continue
      const parentKey = pathKey(item.op.path.slice(0, -1))
      const freed = planned.some(
        (other) =>
          pathKey(other.op.path.slice(0, -1)) === parentKey &&
          other.oldKey === item.op.newKey &&
          other.op.newKey !== item.op.newKey,
      )
      if (Object.prototype.hasOwnProperty.call(item.parent, item.op.newKey) && !freed) {
        throw new Error(`キー「${item.op.newKey}」は既にあります`)
      }
    }
    const clones = planned.map((item) => ({
      parentPath: item.op.path.slice(0, -1),
      oldKey: item.oldKey,
      newKey: item.op.newKey,
      value: cloneValue(item.parent[item.oldKey]),
    }))
    for (const item of clones) {
      const parent = getIn(draft, item.parentPath)
      delete parent[item.oldKey]
    }
    for (const item of clones) {
      const parent = getIn(draft, item.parentPath)
      parent[item.newKey] = toAutomergeValue(item.value)
    }
    for (const op of sets) {
      if (op.op !== "set") continue
      const path = rewritePath(op.path, renames)
      if (path.length === 0) throw new Error("ルート全体は置換できません")
      const parent = getIn(draft, path.slice(0, -1))
      if (parent == null) throw new Error("置換先が見つかりません")
      parent[path.at(-1)] = toAutomergeValue(op.value)
    }
  })
}

/**
 * @param {DocPath} path
 * @param {EditOp[]} renames
 * @returns {DocPath}
 */
function rewritePath(path, renames) {
  const next = path.slice()
  for (const op of renames) {
    if (op.op !== "rename") continue
    const at = op.path.length - 1
    if (path.length > at && op.path.every((segment, index) => segment === path[index])) {
      next[at] = op.newKey
    }
  }
  return next
}

/**
 * @param {any} draft
 * @param {DocPath} path
 * @returns {any}
 */
function getIn(draft, path) {
  let current = draft
  for (const segment of path) {
    if (current == null) throw new Error("パスが見つかりません")
    current = current[segment]
  }
  return current
}

/**
 * @param {EditPayload} payload
 * @returns {unknown}
 */
function payloadToValue(payload) {
  if (payload.type === "null") return null
  if (payload.type === "json") return payload.value
  if (payload.type === "counter") return { __type: "counter", value: Number(payload.value) }
  if (payload.type === "bytes") return { __type: "bytes", value: String(payload.value ?? "") }
  return payload.value
}

/**
 * @param {unknown} value
 * @returns {unknown}
 */
function cloneValue(value) {
  if (Automerge.isCounter(value)) {
    return { __type: "counter", value: /** @type {{ value: number }} */ (value).value }
  }
  if (value instanceof Uint8Array) return new Uint8Array(value)
  if (value && typeof value === "object") return JSON.parse(JSON.stringify(automergeToData(value)))
  return value
}

/**
 * @param {unknown} value
 * @returns {unknown}
 */
function toAutomergeValue(value) {
  if (value instanceof Uint8Array) return value
  if (isMarker(value, "counter")) {
    const number = Number(value.value)
    if (!Number.isFinite(number)) throw new Error("カウンターの値が不正です")
    return new Automerge.Counter(number)
  }
  if (isMarker(value, "bytes")) return base64ToBytes(String(value.value))
  if (Array.isArray(value)) return value.map((item) => toAutomergeValue(item))
  if (value && typeof value === "object") {
    /** @type {Record<string, unknown>} */
    const result = {}
    for (const [key, item] of Object.entries(value)) result[key] = toAutomergeValue(item)
    return result
  }
  return value
}

/**
 * @param {unknown} value
 * @param {string} marker
 * @returns {value is { __type: string, value: unknown }}
 */
function isMarker(value, marker) {
  return Boolean(value && typeof value === "object" && /** @type {{ __type?: string }} */ (value).__type === marker)
}

/**
 * @param {Uint8Array} bytes
 * @returns {string}
 */
function bytesToBase64(bytes) {
  let binary = ""
  const chunk = 0x8000
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk))
  }
  return btoa(binary)
}

/**
 * @param {string} text
 * @returns {Uint8Array}
 */
function base64ToBytes(text) {
  try {
    const binary = atob(text)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
    return bytes
  } catch {
    throw new Error("Base64として解釈できません")
  }
}
