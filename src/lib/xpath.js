import { childNodes, isPrimitive } from "./tree.js"
import { keysEqual } from "./jsPath.js"

/**
 * @typedef {import("./tree.js").TreeNode} TreeNode
 * @typedef {{ type: "key", value: string } | { type: "wild" } | { type: "text" }} StepName
 * @typedef {{ type: "index", index: number } | { type: "eq", key: string, value: unknown }} Predicate
 * @typedef {{ axis: "child" | "descendant" | "self", name: StepName, predicates: Predicate[] }} XStep
 */

/**
 * JSON 向けの XPath サブセット。
 * 配列の `[1]` は 1 始まりで、その配列の要素を指す。
 * `[name="tanaka"]` は子プロパティが一致するオブジェクトを選ぶ。
 * @param {string} source
 * @returns {{ steps: XStep[] }}
 */
export function parseXPath(source) {
  const text = source.trim()
  if (!text) throw new Error("XPathが空です")
  let index = 0
  /** @type {XStep[]} */
  const steps = []

  const skip = () => {
    while (text[index] === " " || text[index] === "\t" || text[index] === "\n") index += 1
  }

  const readString = () => {
    const quote = text[index]
    if (quote !== "'" && quote !== '"') throw new Error("文字列は引用符で囲んでください")
    index += 1
    let value = ""
    while (index < text.length && text[index] !== quote) {
      if (text[index] === "\\" && index + 1 < text.length) {
        value += text[index + 1]
        index += 2
        continue
      }
      value += text[index]
      index += 1
    }
    if (text[index] !== quote) throw new Error("文字列が閉じられていません")
    index += 1
    return value
  }

  const readName = () => {
    skip()
    if (text.startsWith("text()", index)) {
      index += 6
      return /** @type {StepName} */ ({ type: "text" })
    }
    if (text[index] === "*") {
      index += 1
      return /** @type {StepName} */ ({ type: "wild" })
    }
    if (text[index] === "'" || text[index] === '"') {
      return /** @type {StepName} */ ({ type: "key", value: readString() })
    }
    const start = index
    while (
      index < text.length &&
      text[index] !== "/" &&
      text[index] !== "[" &&
      text[index] !== " " &&
      text[index] !== "\t" &&
      text[index] !== "\n"
    ) {
      index += 1
    }
    if (index === start) throw new Error("ステップ名がありません")
    return /** @type {StepName} */ ({ type: "key", value: text.slice(start, index) })
  }

  const readPredicate = () => {
    index += 1
    skip()
    if (/[0-9]/.test(text[index] ?? "")) {
      const start = index
      while (/[0-9]/.test(text[index] ?? "")) index += 1
      const position = Number(text.slice(start, index))
      if (position < 1) throw new Error("添字は1以上です")
      skip()
      if (text[index] !== "]") throw new Error("] がありません")
      index += 1
      return /** @type {Predicate} */ ({ type: "index", index: position })
    }
    const keyStart = index
    while (
      index < text.length &&
      text[index] !== "=" &&
      text[index] !== "]" &&
      text[index] !== " " &&
      text[index] !== "\t"
    ) {
      index += 1
    }
    const key = text.slice(keyStart, index)
    if (!key) throw new Error("述語のプロパティ名がありません")
    skip()
    if (text[index] !== "=") throw new Error("述語は name='value' の形です")
    index += 1
    skip()
    let value
    if (text[index] === "'" || text[index] === '"') value = readString()
    else if (text[index] === "-" || /[0-9]/.test(text[index] ?? "")) {
      const start = index
      if (text[index] === "-") index += 1
      let dotted = false
      while (index < text.length && /[0-9.]/.test(text[index])) {
        if (text[index] === ".") {
          if (dotted) break
          dotted = true
        }
        index += 1
      }
      value = Number(text.slice(start, index))
      if (!Number.isFinite(value)) throw new Error("数値が不正です")
    } else if (text.startsWith("true", index) && !isIdentPart(text[index + 4])) {
      value = true
      index += 4
    } else if (text.startsWith("false", index) && !isIdentPart(text[index + 5])) {
      value = false
      index += 5
    } else if (text.startsWith("null", index) && !isIdentPart(text[index + 4])) {
      value = null
      index += 4
    } else {
      throw new Error("述語の値が不正です")
    }
    skip()
    if (text[index] !== "]") throw new Error("] がありません")
    index += 1
    return /** @type {Predicate} */ ({ type: "eq", key, value })
  }

  const readStep = () => {
    const name = readName()
    /** @type {Predicate[]} */
    const predicates = []
    while (true) {
      skip()
      if (text[index] !== "[") break
      predicates.push(readPredicate())
    }
    return { name, predicates }
  }

  skip()
  if (text[index] !== "/") {
    steps.push({ axis: "child", ...readStep() })
  } else {
    index += 1
    if (text[index] === "/") {
      index += 1
      skip()
      if (index >= text.length) {
        steps.push({ axis: "self", name: { type: "wild" }, predicates: [] })
      } else {
        steps.push({ axis: "descendant", ...readStep() })
      }
    } else if (index >= text.length) {
      steps.push({ axis: "self", name: { type: "wild" }, predicates: [] })
    } else {
      steps.push({ axis: "child", ...readStep() })
    }
  }

  while (index < text.length) {
    skip()
    if (index >= text.length) break
    if (text[index] !== "/") throw new Error(`「${text.slice(index, index + 12)}」付近を解釈できません`)
    index += 1
    let axis = /** @type {"child" | "descendant"} */ ("child")
    if (text[index] === "/") {
      axis = "descendant"
      index += 1
    }
    skip()
    if (index >= text.length) throw new Error("パスが / で終わっています")
    steps.push({ axis, ...readStep() })
  }

  return { steps }
}

/**
 * @param {string | undefined} char
 * @returns {boolean}
 */
function isIdentPart(char) {
  return Boolean(char && /[A-Za-z0-9_]/.test(char))
}

/**
 * @param {TreeNode} root
 * @param {{ steps: XStep[] }} ast
 * @param {boolean} caseSensitive
 * @returns {TreeNode[]}
 */
export function matchXPath(root, ast, caseSensitive) {
  /** @type {TreeNode[]} */
  let contexts = [root]
  for (const step of ast.steps) {
    /** @type {TreeNode[]} */
    const next = []
    for (const context of contexts) {
      if (step.name.type === "text") {
        const pool =
          step.axis === "descendant"
            ? descendants(context).filter((item) => isPrimitive(item))
            : isPrimitive(context)
              ? [context]
              : []
        next.push(...applyPredicates(pool, step.predicates, caseSensitive))
        continue
      }
      const pool =
        step.axis === "descendant"
          ? descendants(context)
          : step.axis === "self"
            ? [context]
            : childNodes(context)
      const matched = pool.filter((item) => nameMatches(item, step.name, caseSensitive))
      next.push(...applyPredicates(matched, step.predicates, caseSensitive))
    }
    contexts = dedupe(next)
  }
  return contexts
}

/**
 * @param {TreeNode} current
 * @param {StepName} name
 * @param {boolean} caseSensitive
 * @returns {boolean}
 */
function nameMatches(current, name, caseSensitive) {
  if (name.type === "wild") return true
  if (name.type === "text") return false
  const key = current.path.at(-1)
  if (key === undefined) return false
  return keysEqual(key, name.value, caseSensitive)
}

/**
 * @param {TreeNode[]} nodes
 * @param {Predicate[]} predicates
 * @param {boolean} caseSensitive
 * @returns {TreeNode[]}
 */
function applyPredicates(nodes, predicates, caseSensitive) {
  let current = nodes
  for (const predicate of predicates) {
    if (predicate.type === "index") {
      if (current.length === 1 && current[0].type === "array") {
        const child = current[0].children?.[predicate.index - 1]
        current = child ? [child] : []
      } else {
        const picked = current[predicate.index - 1]
        current = picked ? [picked] : []
      }
      continue
    }
    /** @type {TreeNode[]} */
    const filtered = []
    for (const item of current) {
      if (item.type === "array") {
        for (const child of item.children ?? []) {
          if (propertyEquals(child, predicate.key, predicate.value, caseSensitive)) filtered.push(child)
        }
      } else if (propertyEquals(item, predicate.key, predicate.value, caseSensitive)) {
        filtered.push(item)
      }
    }
    current = filtered
  }
  return current
}

/**
 * @param {TreeNode} current
 * @param {string} key
 * @param {unknown} expected
 * @param {boolean} caseSensitive
 * @returns {boolean}
 */
function propertyEquals(current, key, expected, caseSensitive) {
  if (current.type !== "object") return false
  const entry = (current.entries ?? []).find((item) => keysEqual(item.key, key, caseSensitive))
  if (!entry) return false
  return scalarEquals(entry.child, expected, caseSensitive)
}

/**
 * @param {TreeNode} current
 * @param {unknown} expected
 * @param {boolean} caseSensitive
 * @returns {boolean}
 */
function scalarEquals(current, expected, caseSensitive) {
  if (!isPrimitive(current)) return false
  const actual = current.value
  if (typeof actual === "string" || typeof expected === "string") {
    const left = String(actual)
    const right = String(expected)
    return caseSensitive ? left === right : left.toLowerCase() === right.toLowerCase()
  }
  return actual === expected
}

/**
 * @param {TreeNode} current
 * @returns {TreeNode[]}
 */
function descendants(current) {
  /** @type {TreeNode[]} */
  const result = []
  const visit = (/** @type {TreeNode} */ node) => {
    for (const child of childNodes(node)) {
      result.push(child)
      visit(child)
    }
  }
  visit(current)
  return result
}

/**
 * @param {TreeNode[]} nodes
 * @returns {TreeNode[]}
 */
function dedupe(nodes) {
  const seen = new Set()
  /** @type {TreeNode[]} */
  const result = []
  for (const item of nodes) {
    const key = JSON.stringify(item.path)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(item)
  }
  return result
}
