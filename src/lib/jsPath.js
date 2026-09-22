/**
 * @typedef {import("./tree.js").TreeNode} TreeNode
 * @typedef {{ type: "key", value: string } | { type: "index", value: number } | { type: "wild" } | { type: "deep" }} JsSegment
 */

/**
 * `company.seizoubu.tanaka` や `employees[0].name`、`**.note` を解釈する。
 * 配列添字は JavaScript と同じ 0 始まり。
 * @param {string} source
 * @returns {JsSegment[]}
 */
export function parseJsPath(source) {
  const text = source.trim()
  if (!text) throw new Error("JSパスが空です")
  let index = 0
  /** @type {JsSegment[]} */
  const segments = []

  const readSegment = () => {
    if (text.startsWith("**", index)) {
      index += 2
      segments.push({ type: "deep" })
      return
    }
    if (text[index] === "*") {
      index += 1
      segments.push({ type: "wild" })
      return
    }
    if (text[index] === "[") {
      readBracket()
      return
    }
    if (isIdentStart(text[index])) {
      const start = index
      index += 1
      while (isIdentPart(text[index])) index += 1
      segments.push({ type: "key", value: text.slice(start, index) })
      return
    }
    throw new Error(`「${text.slice(index, index + 12)}」を解釈できません`)
  }

  const readBracket = () => {
    index += 1
    while (text[index] === " ") index += 1
    if (text.startsWith("**", index)) {
      index += 2
      segments.push({ type: "deep" })
    } else if (text[index] === "*") {
      index += 1
      segments.push({ type: "wild" })
    } else if (text[index] === "'" || text[index] === '"') {
      segments.push({ type: "key", value: readQuoted() })
    } else if (/[0-9]/.test(text[index] ?? "")) {
      const start = index
      while (/[0-9]/.test(text[index] ?? "")) index += 1
      segments.push({ type: "index", value: Number(text.slice(start, index)) })
    } else {
      throw new Error("[] の中は数値、文字列、* のいずれかです")
    }
    while (text[index] === " ") index += 1
    if (text[index] !== "]") throw new Error("] がありません")
    index += 1
  }

  const readQuoted = () => {
    const quote = text[index]
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

  readSegment()
  while (index < text.length) {
    if (text[index] === ".") {
      index += 1
      if (index >= text.length) throw new Error("パスが . で終わっています")
      if (text[index] === "[") throw new Error("[ ] の前に . は不要です")
      readSegment()
      continue
    }
    if (text[index] === "[") {
      readSegment()
      continue
    }
    throw new Error(`位置 ${index + 1} 付近が不正です`)
  }
  return segments
}

/**
 * @param {string | undefined} char
 * @returns {boolean}
 */
function isIdentStart(char) {
  return Boolean(char && /[\p{L}_$]/u.test(char))
}

/**
 * @param {string | undefined} char
 * @returns {boolean}
 */
function isIdentPart(char) {
  return Boolean(char && /[\p{L}\p{N}_$]/u.test(char))
}

/**
 * @param {TreeNode} root
 * @param {JsSegment[]} segments
 * @param {boolean} caseSensitive
 * @returns {TreeNode[]}
 */
export function matchJsPath(root, segments, caseSensitive) {
  /** @type {TreeNode[]} */
  const found = []
  const seen = new Set()
  const states = new Set()

  /**
   * @param {TreeNode} current
   * @param {JsSegment[]} rest
   */
  const walk = (current, rest) => {
    const state = `${JSON.stringify(current.path)}\n${rest
      .map((segment) => `${segment.type}:${"value" in segment ? segment.value : ""}`)
      .join("/")}`
    if (states.has(state)) return
    states.add(state)
    if (rest.length === 0) {
      const key = JSON.stringify(current.path)
      if (!seen.has(key)) {
        seen.add(key)
        found.push(current)
      }
      return
    }
    const [head, ...tail] = rest
    if (head.type === "deep") {
      walk(current, tail)
      for (const child of children(current)) walk(child, rest)
      return
    }
    for (const child of children(current)) {
      if (segmentMatches(child, head, caseSensitive)) walk(child, tail)
    }
  }

  walk(root, segments)
  return found
}

/**
 * @param {TreeNode} current
 * @returns {TreeNode[]}
 */
function children(current) {
  if (current.type === "array") return current.children ?? []
  if (current.type === "object") return (current.entries ?? []).map((entry) => entry.child)
  return []
}

/**
 * @param {TreeNode} current
 * @param {JsSegment} segment
 * @param {boolean} caseSensitive
 * @returns {boolean}
 */
function segmentMatches(current, segment, caseSensitive) {
  const key = current.path.at(-1)
  if (key === undefined) return false
  if (segment.type === "wild") return true
  if (segment.type === "index") return key === segment.value
  if (segment.type === "key") return keysEqual(key, segment.value, caseSensitive)
  return false
}

/**
 * @param {string | number} actual
 * @param {string} expected
 * @param {boolean} caseSensitive
 * @returns {boolean}
 */
export function keysEqual(actual, expected, caseSensitive) {
  if (typeof actual === "number") return String(actual) === expected
  return caseSensitive ? actual === expected : actual.toLowerCase() === expected.toLowerCase()
}
