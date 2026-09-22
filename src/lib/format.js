/**
 * @typedef {(string | number)[]} DocPath
 */

/**
 * @param {DocPath} path
 * @returns {string}
 */
export function pathKey(path) {
  return JSON.stringify(path)
}

/**
 * @param {DocPath} prefix
 * @param {DocPath} path
 * @returns {boolean}
 */
export function isStrictPrefix(prefix, path) {
  if (prefix.length >= path.length) return false
  return prefix.every((segment, index) => segment === path[index])
}

/**
 * @param {DocPath} path
 * @returns {string}
 */
export function formatPath(path) {
  if (path.length === 0) return "(ルート)"
  let text = ""
  for (const segment of path) {
    if (typeof segment === "number") {
      text += `[${segment}]`
      continue
    }
    if (/^[\p{L}_$][\p{L}\p{N}_$]*$/u.test(segment)) {
      text += text ? `.${segment}` : segment
      continue
    }
    text += `[${JSON.stringify(segment)}]`
  }
  return text
}

/**
 * Automerge の change.time は UNIX 秒。
 * @param {number | null | undefined} seconds
 * @returns {string}
 */
export function formatTime(seconds) {
  if (!seconds) return "時刻なし"
  const date = new Date(seconds * 1000)
  if (Number.isNaN(date.getTime())) return "時刻なし"
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date)
}

/**
 * @param {string | null | undefined} actor
 * @returns {string}
 */
export function formatActor(actor) {
  if (!actor) return ""
  return String(actor).slice(0, 8)
}

/**
 * @param {number} size
 * @returns {string}
 */
export function formatBytes(size) {
  if (size < 1024) return `${size} B`
  return `${(size / 1024).toFixed(1)} KB`
}

/**
 * @param {string} text
 * @param {number} max
 * @returns {string}
 */
export function truncate(text, max) {
  if (text.length <= max) return text
  return `${text.slice(0, max)}…`
}
