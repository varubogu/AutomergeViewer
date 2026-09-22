<script>
  import HistoryPopover from "./components/HistoryPopover.svelte"
  import JsonNode from "./components/JsonNode.svelte"
  import SearchPanel from "./components/SearchPanel.svelte"
  import {
    applyReplacements,
    automergeToTree,
    buildHistoryIndex,
    createSample,
    insertInto,
    openBytes,
    removeAtPath,
    renameAtPath,
    saveBytes,
    setAtPath,
  } from "./lib/document.js"
  import { formatBytes, formatPath, pathKey } from "./lib/format.js"
  import { findMatches, planReplacements } from "./lib/search.js"
  import { defaultValue, isBranch, walkTree } from "./lib/tree.js"

  let doc = createSample()
  let indexed = buildHistoryIndex(doc)
  let historyIndex = indexed.byPath
  let tree = $state(automergeToTree(doc))
  let filename = $state("sample.automerge")
  let status = $state("サンプルを表示しています。内容はこのブラウザの中だけで処理されます。")
  let error = $state("")
  let byteLength = $state(saveBytes(doc).byteLength)
  let changeCount = $state(indexed.changeCount)
  let canUndo = $state(false)
  let canRedo = $state(false)
  let dragging = $state(false)
  let mode = $state("js")
  let pattern = $state("")
  let replacement = $state("")
  let caseSensitive = $state(true)
  let asJson = $state(false)
  let queryError = $state("")
  let matchCount = $state(0)
  let cursor = $state(0)
  /** @type {HTMLInputElement | null} */
  let fileInput = $state(null)
  /** @type {Uint8Array[]} */
  let undoStack = []
  /** @type {Uint8Array[]} */
  let redoStack = []
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let showTimer
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let hideTimer
  let pinned = false
  let popover = $state(/** @type {null | { pathKey: string, label: string, events: any[], rect: DOMRect | object }} */ (null))

  let ctx = $state({
    tick: 0,
    matchStamp: "",
    activePath: "",
    matches: /** @type {Set<string>} */ (new Set()),
    keyMatches: /** @type {Set<string>} */ (new Set()),
    openMap: /** @type {Record<string, boolean>} */ ({}),
  })

  let appliedSearchStamp = ""

  const actions = {
    isOpen(/** @type {import("./lib/format.js").DocPath} */ path, /** @type {number} */ depth) {
      const id = pathKey(path)
      if (Object.prototype.hasOwnProperty.call(ctx.openMap, id)) return Boolean(ctx.openMap[id])
      return depth < 2
    },
    toggle(/** @type {import("./lib/format.js").DocPath} */ path) {
      const id = pathKey(path)
      const current = actions.isOpen(path, path.length)
      ctx.openMap = { ...ctx.openMap, [id]: !current }
      ctx.tick += 1
    },
    edit(/** @type {import("./lib/format.js").DocPath} */ path, /** @type {any} */ payload) {
      const next = setAtPath(doc, path, payload)
      commitDoc(next, "値を更新しました")
    },
    remove(/** @type {import("./lib/format.js").DocPath} */ path) {
      commitDoc(removeAtPath(doc, path), "削除しました")
    },
    add(
      /** @type {import("./lib/format.js").DocPath} */ containerPath,
      /** @type {string | null} */ key,
      /** @type {string} */ type,
    ) {
      commitDoc(insertInto(doc, containerPath, key, defaultValue(type)), "追加しました")
    },
    rename(/** @type {import("./lib/format.js").DocPath} */ path, /** @type {string} */ newKey) {
      commitDoc(renameAtPath(doc, path, newKey), "キーを変更しました")
    },
    historyFor(/** @type {import("./lib/format.js").DocPath} */ path) {
      return historyIndex.get(pathKey(path)) ?? []
    },
    formatPath,
    history(/** @type {any} */ detail) {
      onHistory(detail)
    },
  }

  $effect(() => {
    try {
      const found = findMatches(tree, { mode, pattern, caseSensitive })
      queryError = ""
      matchCount = found.paths.length
      ctx.matches = new Set(found.paths)
      ctx.keyMatches = new Set(found.keyPaths)
      const stamp = `${mode}|${caseSensitive ? "1" : "0"}|${pattern}|${found.paths.join("\n")}`
      ctx.matchStamp = stamp
      if (pattern.trim() && stamp !== appliedSearchStamp) {
        const next = { ...ctx.openMap }
        for (const item of found.paths) {
          const parts = JSON.parse(item)
          for (let index = 0; index <= parts.length; index += 1) next[pathKey(parts.slice(0, index))] = true
        }
        ctx.openMap = next
        appliedSearchStamp = stamp
      }
      if (!pattern.trim()) appliedSearchStamp = ""
      if (found.paths.length === 0) {
        if (cursor !== 0) cursor = 0
      } else if (cursor >= found.paths.length) {
        cursor = 0
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "検索できません"
      queryError = message
      matchCount = 0
      ctx.matches = new Set()
      ctx.keyMatches = new Set()
      ctx.matchStamp = `error|${pattern}|${message}`
      if (cursor !== 0) cursor = 0
    }
  })

  $effect(() => {
    const id = popover?.pathKey
    if (!id) return
    const update = () => {
      const element = document.querySelector(`[data-path="${CSS.escape(id)}"]`)
      if (!element || !popover || popover.pathKey !== id) return
      const rect = element.getBoundingClientRect()
      popover = {
        ...popover,
        rect: { top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left },
      }
    }
    window.addEventListener("scroll", update, true)
    window.addEventListener("resize", update)
    return () => {
      window.removeEventListener("scroll", update, true)
      window.removeEventListener("resize", update)
    }
  })

  $effect(() => {
    const onPointerDown = (/** @type {PointerEvent} */ event) => {
      if (!popover || !pinned) return
      const target = event.target
      if (target instanceof Element && target.closest(".popover, .tool.history")) return
      closePopover()
    }
    const onKey = (/** @type {KeyboardEvent} */ event) => {
      const command = event.metaKey || event.ctrlKey
      if (command && event.key.toLowerCase() === "s") {
        event.preventDefault()
        saveFile()
      } else if (command && event.key.toLowerCase() === "z" && !event.isComposing) {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
      } else if (command && event.key.toLowerCase() === "y") {
        event.preventDefault()
        redo()
      } else if (command && event.key.toLowerCase() === "f") {
        event.preventDefault()
        document.getElementById("search-input")?.focus()
      } else if (event.key === "Escape") {
        closePopover()
      }
    }
    window.addEventListener("pointerdown", onPointerDown)
    window.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("pointerdown", onPointerDown)
      window.removeEventListener("keydown", onKey)
    }
  })

  /**
   * @param {import("@automerge/automerge").Doc<any>} next
   * @param {string} [message]
   */
  function refreshFrom(next, message) {
    doc = next
    indexed = buildHistoryIndex(doc)
    historyIndex = indexed.byPath
    tree = automergeToTree(doc)
    changeCount = indexed.changeCount
    byteLength = saveBytes(doc).byteLength
    ctx.tick += 1
    if (message) status = message
  }

  /**
   * @param {import("@automerge/automerge").Doc<any>} next
   * @param {string} [message]
   */
  function commitDoc(next, message) {
    undoStack.push(saveBytes(doc))
    if (undoStack.length > 50) undoStack.shift()
    redoStack = []
    canUndo = undoStack.length > 0
    canRedo = false
    refreshFrom(next, message)
    error = ""
  }

  function undo() {
    const previous = undoStack.pop()
    if (!previous) return
    redoStack.push(saveBytes(doc))
    canUndo = undoStack.length > 0
    canRedo = true
    refreshFrom(openBytes(previous).doc, "元に戻しました")
  }

  function redo() {
    const next = redoStack.pop()
    if (!next) return
    undoStack.push(saveBytes(doc))
    canUndo = true
    canRedo = redoStack.length > 0
    refreshFrom(openBytes(next).doc, "やり直しました")
  }

  /**
   * @param {boolean} open
   */
  function setAll(open) {
    /** @type {Record<string, boolean>} */
    const next = {}
    walkTree(tree, (node) => {
      if (isBranch(node)) next[pathKey(node.path)] = open
    })
    ctx.openMap = next
    ctx.tick += 1
  }

  function replaceAll() {
    try {
      const ops = planReplacements(tree, { mode, pattern, caseSensitive }, replacement, asJson)
      if (ops.length === 0) {
        status = "置換できる値がありません"
        error = ""
        return
      }
      commitDoc(applyReplacements(doc, ops), `${ops.length}件の変更を反映しました`)
    } catch (caught) {
      error = caught instanceof Error ? caught.message : "置換できません"
    }
  }

  /**
   * @param {number} delta
   */
  function jump(delta) {
    const paths = [...ctx.matches]
    if (paths.length === 0) return
    cursor = (cursor + delta + paths.length) % paths.length
    const id = paths[cursor]
    ctx.activePath = id
    document.querySelector(`[data-path="${CSS.escape(id)}"]`)?.scrollIntoView({
      block: "center",
      behavior: "smooth",
    })
  }

  function saveFile() {
    const bytes = saveBytes(doc)
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/octet-stream" }))
    const link = document.createElement("a")
    link.href = url
    link.download = downloadName(filename)
    link.click()
    URL.revokeObjectURL(url)
    status = "このブラウザ内で保存ファイルを作成しました"
  }

  /**
   * @param {string} name
   */
  function downloadName(name) {
    const base = (name || "document.automerge").split(/[/\\]/).pop() || "document.automerge"
    if (base.endsWith(".automerge")) return base
    return `${base.replace(/\.[^.]+$/, "")}.automerge`
  }

  function loadSample() {
    undoStack = []
    redoStack = []
    canUndo = false
    canRedo = false
    filename = "sample.automerge"
    ctx.openMap = {}
    error = ""
    refreshFrom(createSample(), "サンプルを表示しています。内容はこのブラウザの中だけで処理されます。")
  }

  /**
   * @param {File} file
   */
  async function loadFile(file) {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      const opened = openBytes(bytes)
      undoStack = []
      redoStack = []
      canUndo = false
      canRedo = false
      filename = file.name
      ctx.openMap = {}
      error = ""
      const message =
        opened.kind === "json"
          ? "JSONを新しいAutomergeドキュメントとして読み込みました。履歴はここから始まります。"
          : "ファイルを読み込みました"
      refreshFrom(opened.doc, message)
    } catch (caught) {
      error = caught instanceof Error ? caught.message : "ファイルを読み込めません"
    }
  }

  /**
   * @param {Event} event
   */
  function onFile(event) {
    const input = /** @type {HTMLInputElement} */ (event.currentTarget)
    const file = input.files?.[0]
    input.value = ""
    if (file) loadFile(file)
  }

  /**
   * @param {DragEvent} event
   */
  function onDragOver(event) {
    event.preventDefault()
    dragging = true
  }

  /**
   * @param {DragEvent} event
   */
  function onDragLeave(event) {
    if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) {
      dragging = false
    }
  }

  /**
   * @param {DragEvent} event
   */
  function onDrop(event) {
    event.preventDefault()
    dragging = false
    const file = event.dataTransfer?.files?.[0]
    if (file) loadFile(file)
  }

  /**
   * @param {any} detail
   */
  function onHistory(detail) {
    if (detail.type === "leave") {
      if (pinned) return
      clearTimeout(showTimer)
      clearTimeout(hideTimer)
      hideTimer = setTimeout(() => {
        popover = null
      }, 280)
      return
    }
    if (detail.type === "enter") {
      if (pinned) return
      clearTimeout(hideTimer)
      clearTimeout(showTimer)
      showTimer = setTimeout(() => {
        popover = detail
      }, 420)
      return
    }
    clearTimeout(showTimer)
    clearTimeout(hideTimer)
    pinned = true
    popover = detail
  }

  function closePopover() {
    pinned = false
    popover = null
    clearTimeout(showTimer)
    clearTimeout(hideTimer)
  }
</script>

<div
  class="app"
  class:dragging
  role="region"
  aria-label="Automergeビューア"
  ondragover={onDragOver}
  ondragleave={onDragLeave}
  ondrop={onDrop}
>
  <header>
    <div class="title">
      <span class="mark" aria-hidden="true"></span>
      <div>
        <p class="eyebrow">ブラウザ内だけで処理</p>
        <h1>Automergeビューア</h1>
        <p class="lede">
          ファイルの中身をJSONの形で見て、折りたたみ、検索、置換、編集ができます。データはサーバーへ送信しません。
        </p>
      </div>
    </div>
    <div class="actions">
      <button type="button" onclick={() => fileInput?.click()}>ファイルを開く</button>
      <button type="button" onclick={saveFile}>保存</button>
      <button type="button" class="ghost" onclick={loadSample}>サンプル</button>
      <button type="button" class="ghost" onclick={undo} disabled={!canUndo}>元に戻す</button>
      <button type="button" class="ghost" onclick={redo} disabled={!canRedo}>やり直す</button>
      <input bind:this={fileInput} type="file" accept=".automerge,.json,application/json" hidden onchange={onFile} />
    </div>
  </header>

  <SearchPanel
    bind:mode
    bind:pattern
    bind:replacement
    bind:caseSensitive
    bind:asJson
    {matchCount}
    {queryError}
    onreplace={replaceAll}
    onjump={jump}
  />

  <div class="toolbar">
    <button type="button" class="ghost" onclick={() => setAll(true)}>すべて展開</button>
    <button type="button" class="ghost" onclick={() => setAll(false)}>すべて折りたたむ</button>
    <p>行にマウスを乗せるか、長押しまたは右クリックで、その値の過去の状態と編集時刻を表示します。</p>
  </div>

  {#if error}<p class="banner" role="alert">{error}</p>{/if}
  <p class="status" role="status">{status}</p>

  <main>
    {#if dragging}<div class="drop">ここにファイルを放すと開きます</div>{/if}
    <JsonNode node={tree} depth={0} {ctx} {actions} />
  </main>

  <footer>
    <span>{filename}</span>
    <span>変更 {changeCount}件</span>
    <span>{formatBytes(byteLength)}</span>
    <span>保存形式は Automerge のバイナリです</span>
  </footer>

  <HistoryPopover {popover} onenter={() => clearTimeout(hideTimer)} onleave={() => onHistory({ type: "leave" })} onclose={closePopover} />
</div>
