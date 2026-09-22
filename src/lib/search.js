import { pathKey, isStrictPrefix } from "./format.js"
import { childNodes, displayLiteral, isPrimitive, rawText } from "./tree.js"
import { matchJsPath, parseJsPath } from "./jsPath.js"
import { matchXPath, parseXPath } from "./xpath.js"

/**
 * @typedef {import("./tree.js").TreeNode} TreeNode
 * @typedef {import("./format.js").DocPath} DocPath
 * @typedef {"regex" | "xpath" | "js"} QueryMode
 * @typedef {{ mode: QueryMode, pattern: string, caseSensitive: boolean }} Query
 * @typedef {{ paths: string[], keyPaths: string[] }} MatchSets
 * @typedef {{ op: "set", path: DocPath, value: unknown } | { op: "rename", path: DocPath, newKey: string }} EditOp
 */

/**
 * @param {TreeNode} tree
 * @param {Query} query
 * @returns {MatchSets}
 */
export function findMatches(tree, query) {
  const pattern = query.pattern.trim()
  if (!pattern) return { paths: [], keyPaths: [] }
  if (query.mode === "regex") {
    const hits = matchRegex(tree, pattern, query.caseSensitive)
    return {
      paths: hits.map((hit) => pathKey(hit.node.path)),
      keyPaths: hits.filter((hit) => hit.keyHit).map((hit) => pathKey(hit.node.path)),
    }
  }
  const nodes =
    query.mode === "xpath"
      ? matchXPath(tree, parseXPath(pattern), query.caseSensitive)
      : matchJsPath(tree, parseJsPath(pattern), query.caseSensitive)
  return { paths: nodes.map((node) => pathKey(node.path)), keyPaths: [] }
}

/**
 * @param {TreeNode} tree
 * @param {Query} query
 * @param {string} replacement
 * @param {boolean} asJson
 * @returns {EditOp[]}
 */
export function planReplacements(tree, query, replacement, asJson) {
  const pattern = query.pattern.trim()
  if (!pattern) throw new Error("検索条件を入力してください")
  if (query.mode === "regex") {
    return planRegexReplace(tree, pattern, query.caseSensitive, replacement)
  }
  const nodes =
    query.mode === "xpath"
      ? matchXPath(tree, parseXPath(pattern), query.caseSensitive)
      : matchJsPath(tree, parseJsPath(pattern), query.caseSensitive)
  const kept = mostGeneral(nodes)
  if (kept.some((node) => node.path.length === 0)) {
    throw new Error("ルート全体は置換できません。より具体的なパスを指定してください")
  }
  const value = asJson ? parseJson(replacement) : replacement
  return kept.map((node) => ({ op: "set", path: node.path, value }))
}

/**
 * @param {TreeNode[]} nodes
 * @returns {TreeNode[]}
 */
function mostGeneral(nodes) {
  const paths = nodes.map((node) => node.path)
  return nodes.filter((node) => !paths.some((other) => isStrictPrefix(other, node.path)))
}

/**
 * @param {string} replacement
 * @returns {unknown}
 */
function parseJson(replacement) {
  try {
    return JSON.parse(replacement)
  } catch {
    throw new Error("置換値のJSONが不正です")
  }
}

/**
 * @param {TreeNode} tree
 * @param {string} pattern
 * @param {boolean} caseSensitive
 * @returns {{ node: TreeNode, keyHit: boolean, valueHit: boolean }[]}
 */
function matchRegex(tree, pattern, caseSensitive) {
  const flags = caseSensitive ? "" : "i"
  const tester = compile(pattern, flags)
  if (tester.test("")) throw new Error("空文字に一致する正規表現は使えません")
  /** @type {{ node: TreeNode, keyHit: boolean, valueHit: boolean }[]} */
  const hits = []
  const visit = (/** @type {TreeNode} */ node) => {
    const key = node.path.at(-1)
    const keyHit =
      typeof key === "string" &&
      (tester.test(key) || tester.test(JSON.stringify(key)))
    const valueHit =
      isPrimitive(node) &&
      (tester.test(rawText(node)) || tester.test(displayLiteral(node)))
    if (keyHit || valueHit) hits.push({ node, keyHit, valueHit })
    for (const child of childNodes(node)) visit(child)
  }
  visit(tree)
  return hits
}

/**
 * @param {TreeNode} tree
 * @param {string} pattern
 * @param {boolean} caseSensitive
 * @param {string} replacement
 * @returns {EditOp[]}
 */
function planRegexReplace(tree, pattern, caseSensitive, replacement) {
  const hits = matchRegex(tree, pattern, caseSensitive)
  const testFlags = caseSensitive ? "" : "i"
  const replaceFlags = caseSensitive ? "g" : "gi"
  /** @type {EditOp[]} */
  const ops = []
  for (const hit of hits) {
    if (hit.valueHit && isPrimitive(hit.node)) {
      const raw = rawText(hit.node)
      const shown = displayLiteral(hit.node)
      const source = compile(pattern, testFlags).test(raw) ? raw : shown
      const next = parseReplacedLiteral(source.replace(compile(pattern, replaceFlags), replacement))
      if (!sameValue(next, hit.node.value)) {
        ops.push({ op: "set", path: hit.node.path, value: next })
      }
    }
    const key = hit.node.path.at(-1)
    if (hit.keyHit && typeof key === "string") {
      const shown = JSON.stringify(key)
      const source = compile(pattern, testFlags).test(key) ? key : shown
      const newKey = parseReplacedKey(source.replace(compile(pattern, replaceFlags), replacement))
      if (newKey !== key) ops.push({ op: "rename", path: hit.node.path, newKey })
    }
  }
  return ops
}

/**
 * @param {string} pattern
 * @param {string} flags
 * @returns {RegExp}
 */
function compile(pattern, flags) {
  try {
    return new RegExp(pattern, flags)
  } catch {
    throw new Error("正規表現が不正です")
  }
}

/**
 * @param {string} text
 * @returns {unknown}
 */
function parseReplacedLiteral(text) {
  const trimmed = text.trim()
  if (trimmed === "null") return null
  if (trimmed === "true") return true
  if (trimmed === "false") return false
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(trimmed)) return Number(trimmed)
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      return JSON.parse(trimmed)
    } catch {
      return text
    }
  }
  return text
}

/**
 * @param {string} text
 * @returns {string}
 */
function parseReplacedKey(text) {
  const value = parseReplacedLiteral(text)
  return typeof value === "string" ? value : String(value)
}

/**
 * @param {unknown} next
 * @param {unknown} previous
 * @returns {boolean}
 */
function sameValue(next, previous) {
  return Object.is(next, previous)
}
