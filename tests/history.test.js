import { describe, expect, it } from "vitest"
import { diffHistory } from "../src/lib/history.js"
import { formatTime, pathKey } from "../src/lib/format.js"
import { buildHistoryIndex, createSample } from "../src/lib/document.js"

describe("履歴の差分", () => {
  it("追加と更新を時系列で残す", () => {
    const index = diffHistory([
      { time: 100, message: "作成", actor: "aaaaaaaa", data: { company: { name: "北風" } } },
      { time: 200, message: "改名", actor: "bbbbbbbb", data: { company: { name: "南風" } } },
    ])
    const events = index.get(pathKey(["company", "name"]))
    expect(events?.map((event) => event.action)).toEqual(["追加", "更新"])
    expect(events?.[1]).toMatchObject({
      time: 200,
      message: "改名",
      actor: "bbbbbbbb",
      beforeText: '"北風"',
      afterText: '"南風"',
    })
  })

  it("時刻0は時刻なしと表示する", () => {
    expect(formatTime(0)).toBe("時刻なし")
    const seconds = Math.floor(Date.parse("2025-04-01T09:00:00+09:00") / 1000)
    const date = new Date(seconds * 1000)
    const text = formatTime(seconds)
    expect(text).toContain(String(date.getFullYear()))
    expect(text).toContain(String(date.getDate()).padStart(2, "0"))
  })
})

describe("Automergeの履歴", () => {
  it("サンプルの昇進が時刻とメッセージ付きで残る", () => {
    const { byPath } = buildHistoryIndex(createSample())
    const events = byPath.get(pathKey(["company", "seizoubu", "tanaka", "role"]))
    const promotion = events?.find((event) => event.message === "田中を課長に昇進")
    expect(promotion).toMatchObject({
      action: "更新",
      beforeText: '"主任"',
      afterText: '"課長"',
      time: Math.floor(Date.parse("2025-04-01T09:00:00+09:00") / 1000),
    })
    expect(promotion?.actor).toMatch(/^[0-9a-f]+$/)
  })
})
