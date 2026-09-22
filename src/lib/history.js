import { pathKey, truncate } from "./format.js"

/**
 * @typedef {import("./format.js").DocPath} DocPath
 * @typedef {"追加" | "更新" | "削除"} HistoryAction
 * @typedef {{
 *   time: number,
 *   message: string,
 *   actor: string,
 *   action: HistoryAction,
 *   beforeText: string,
 *   afterText: string,
 * }} HistoryEvent
 * @typedef {{ time?: number, message?: string | null, actor?: string, data: unknown }} HistoryEntry
 */

const MISSING = Symbol("missing")

/**
 * 各パスについて、スナップショット間で値が変わった時点を時系列にまとめる。
 * @param {HistoryEntry[]} entries
 * @returns {Map<string, HistoryEvent[]>}
 */
export function diffHistory(entries) {
  /** @type {Map<string, HistoryEvent[]>} */
  const byPath = new Map()
  /** @type {Map<string, { sig: string, text: string }>} */
  let previous = new Map()
  for (const entry of entries) {
    /** @type {Map<string, { sig: string, text: string }>} */
    const current = new Map()
    flatten(entry.data, [], current)
    const keys = new Set([...previous.keys(), ...current.keys()])
    for (const key of keys) {
      const before = previous.get(key)
      const after = current.get(key)
      if ((before?.sig ?? MISSING) === (after?.sig ?? MISSING)) continue
      const list = byPath.get(key) ?? []
      list.push({
        time: entry.time || 0,
        message: entry.message || "",
        actor: entry.actor || "",
        action: !before ? "追加" : !after ? "削除" : "更新",
        beforeText: before?.text ?? "（なし）",
        afterText: after?.text ?? "（なし）",
      })
      byPath.set(key, list)
    }
    previous = current
  }
  return byPath
}

/**
 * @param {unknown} value
 * @param {DocPath} path
 * @param {Map<string, { sig: string, text: string }>} out
 */
function flatten(value, path, out) {
  out.set(pathKey(path), describe(value))
  if (Array.isArray(value)) {
    value.forEach((child, index) => flatten(child, path.concat(index), out))
    return
  }
  if (isPlainObject(value)) {
    for (const key of Object.keys(value)) flatten(value[key], path.concat(key), out)
  }
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isPlainObject(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      /** @type {{ __type?: string }} */ (value).__type == null,
  )
}

/**
 * @param {unknown} value
 * @returns {{ sig: string, text: string }}
 */
function describe(value) {
  return { sig: signature(value), text: displayText(value) }
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function signature(value) {
  return JSON.stringify(canonicalize(value))
}

/**
 * @param {unknown} value
 * @returns {unknown}
 */
function canonicalize(value) {
  if (Array.isArray(value)) return value.map((item) => canonicalize(item))
  if (isPlainObject(value)) {
    /** @type {Record<string, unknown>} */
    const result = {}
    for (const key of Object.keys(value).sort()) result[key] = canonicalize(value[key])
    return result
  }
  return value
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function displayText(value) {
  if (typeof value === "string") return JSON.stringify(value)
  if (value && typeof value === "object" && /** @type {{ __type?: string }} */ (value).__type === "counter") {
    return `Counter(${/** @type {{ value: number }} */ (value).value})`
  }
  if (value && typeof value === "object" && /** @type {{ __type?: string }} */ (value).__type === "bytes") {
    return `bytes:${truncate(String(/** @type {{ value: string }} */ (value).value), 80)}`
  }
  if (value === null) return "null"
  if (typeof value === "object") return truncate(JSON.stringify(value), 500)
  return String(value)
}
