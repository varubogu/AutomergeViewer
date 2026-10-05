/** @vitest-environment jsdom */

import { afterEach, describe, expect, it } from "vitest"
import { mount, tick, unmount } from "svelte"
import * as Automerge from "@automerge/automerge"
import App from "../src/App.svelte"
import { saveBytes } from "../src/lib/document.js"

/** @type {ReturnType<typeof mount> | undefined} */
let app
/** @type {HTMLElement | undefined} */
let target

afterEach(() => {
  if (app) unmount(app)
  app = undefined
  target?.remove()
  target = undefined
})

function renderApp() {
  target = document.createElement("div")
  document.body.append(target)
  app = mount(App, { target })
  return target
}

/**
 * @param {() => boolean} predicate
 * @param {number} [timeout]
 */
async function waitUntil(predicate, timeout = 2000) {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    if (predicate()) return
    await tick()
    await new Promise((resolve) => setTimeout(resolve, 15))
  }
  throw new Error("timed out waiting for the view to update")
}

/**
 * @param {HTMLElement} root
 * @param {Uint8Array} bytes
 * @param {string} name
 */
async function openFile(root, bytes, name) {
  const app = root.querySelector(".app")
  if (!(app instanceof HTMLElement)) throw new Error("app root not found")
  const file = new File([bytes], name, { type: "application/octet-stream" })
  const event = new Event("drop", { bubbles: true, cancelable: true })
  Object.defineProperty(event, "dataTransfer", {
    configurable: true,
    value: { files: [file] },
  })
  app.dispatchEvent(event)
  await waitUntil(() => (root.textContent ?? "").includes(name))
}

describe("ファイルを開いたあとの画面", () => {
  it("Automergeファイルの内容にツリー表示が切り替わる", async () => {
    const root = renderApp()
    expect(root.textContent).toContain("北風製作所")

    const loaded = Automerge.from({
      project: { name: "読み込み確認", status: "open" },
    })
    await openFile(root, saveBytes(loaded), "loaded.automerge")

    expect(root.textContent).toContain("読み込み確認")
    expect(root.textContent).toContain("loaded.automerge")
    expect(root.textContent).toContain("ファイルを読み込みました")
    expect(root.textContent).not.toContain("北風製作所")
  })

  it("JSONファイルでもツリー表示が切り替わる", async () => {
    const root = renderApp()
    const json = new TextEncoder().encode(JSON.stringify({ city: { name: "札幌" } }))
    await openFile(root, json, "sapporo.json")

    expect(root.textContent).toContain("札幌")
    expect(root.textContent).not.toContain("北風製作所")
  })
})
