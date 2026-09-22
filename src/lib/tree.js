/**
 * @typedef {import("./format.js").DocPath} DocPath
 * @typedef {"object" | "array" | "string" | "number" | "boolean" | "null" | "counter" | "bytes"} NodeType
 * @typedef {{ id: string, text: string }} ConflictInfo
 * @typedef {{
 *   type: NodeType,
 *   path: DocPath,
 *   conflicts: ConflictInfo[],
 *   value?: unknown,
 *   entries?: { key: string, child: TreeNode }[],
 *   children?: TreeNode[],
 * }} TreeNode
 */

/**
 * @param {NodeType} type
 * @param {DocPath} path
 * @param {Record<string, unknown>} extra
 * @returns {TreeNode}
 */
function node(type, path, extra) {
  return { type, path, conflicts: [], ...extra }
}

/**
 * @param {unknown} value
 * @param {DocPath} [path]
 * @returns {TreeNode}
 */
export function plainToTree(value, path = []) {
  if (isMarker(value, "counter")) {
    return node("counter", path, { value: value.value })
  }
  if (isMarker(value, "bytes")) {
    return node("bytes", path, { value: value.value })
  }
  if (Array.isArray(value)) {
    return node("array", path, {
      children: value.map((child, index) => plainToTree(child, path.concat(index))),
    })
  }
  if (value && typeof value === "object") {
    return node("object", path, {
      entries: Object.keys(value).map((key) => ({
        key,
        child: plainToTree(/** @type {Record<string, unknown>} */ (value)[key], path.concat(key)),
      })),
    })
  }
  if (value === null) return node("null", path, { value: null })
  return node(/** @type {NodeType} */ (typeof value), path, { value })
}

/**
 * @param {unknown} value
 * @param {string} marker
 * @returns {value is { __type: string, value: any }}
 */
function isMarker(value, marker) {
  return Boolean(
    value &&
      typeof value === "object" &&
      /** @type {{ __type?: string }} */ (value).__type === marker,
  )
}

/**
 * @param {TreeNode} treeNode
 * @returns {TreeNode[]}
 */
export function childNodes(treeNode) {
  if (treeNode.type === "array") return treeNode.children ?? []
  if (treeNode.type === "object") return (treeNode.entries ?? []).map((entry) => entry.child)
  return []
}

/**
 * @param {TreeNode} treeNode
 * @returns {boolean}
 */
export function isBranch(treeNode) {
  return treeNode.type === "object" || treeNode.type === "array"
}

/**
 * @param {TreeNode} treeNode
 * @returns {boolean}
 */
export function isPrimitive(treeNode) {
  return !isBranch(treeNode)
}

/**
 * 画面に出している字面。文字列は JSON の引用符付き。
 * @param {TreeNode} treeNode
 * @returns {string}
 */
export function displayLiteral(treeNode) {
  if (treeNode.type === "string" || treeNode.type === "bytes") {
    return JSON.stringify(treeNode.value ?? "")
  }
  if (treeNode.type === "null") return "null"
  if (treeNode.type === "counter" || treeNode.type === "number" || treeNode.type === "boolean") {
    return String(treeNode.value)
  }
  return String(treeNode.value ?? "")
}

/**
 * @param {TreeNode} treeNode
 * @returns {string}
 */
export function rawText(treeNode) {
  if (treeNode.type === "string" || treeNode.type === "bytes") return String(treeNode.value ?? "")
  if (treeNode.type === "null") return "null"
  return String(treeNode.value ?? "")
}

/**
 * @param {TreeNode} treeNode
 * @returns {unknown}
 */
export function treeToValue(treeNode) {
  if (treeNode.type === "object") {
    /** @type {Record<string, unknown>} */
    const result = {}
    for (const entry of treeNode.entries ?? []) {
      result[entry.key] = treeToValue(entry.child)
    }
    return result
  }
  if (treeNode.type === "array") {
    return (treeNode.children ?? []).map((child) => treeToValue(child))
  }
  return treeNode.value
}

/**
 * @param {TreeNode} treeNode
 * @param {(node: TreeNode, depth: number) => void} visit
 * @param {number} [depth]
 */
export function walkTree(treeNode, visit, depth = 0) {
  visit(treeNode, depth)
  for (const child of childNodes(treeNode)) walkTree(child, visit, depth + 1)
}

/**
 * @param {string} type
 * @returns {unknown}
 */
export function defaultValue(type) {
  switch (type) {
    case "string":
      return ""
    case "number":
      return 0
    case "boolean":
      return false
    case "null":
      return null
    case "object":
      return {}
    case "array":
      return []
    case "counter":
      return 0
    default:
      throw new Error("未知の型です")
  }
}
