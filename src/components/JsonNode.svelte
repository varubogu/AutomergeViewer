<script>
  import JsonNode from "./JsonNode.svelte"
  import ValueEditor from "./ValueEditor.svelte"
  import { pathKey } from "../lib/format.js"
  import { displayLiteral, isBranch, treeToValue } from "../lib/tree.js"

  let {
    node,
    name = undefined,
    depth = 0,
    trailingComma = false,
    ctx,
    actions,
  } = $props()

  const key = $derived(pathKey(node.path))
  const branch = $derived(isBranch(node))
  const expanded = $derived.by(() => {
    void ctx.tick
    void ctx.matchStamp
    return actions.isOpen(node.path, depth)
  })
  const hit = $derived.by(() => {
    void ctx.matchStamp
    return ctx.matches.has(key)
  })
  const keyHit = $derived.by(() => {
    void ctx.matchStamp
    return ctx.keyMatches.has(key)
  })
  const active = $derived.by(() => ctx.activePath === key)
  const events = $derived.by(() => {
    void ctx.tick
    return actions.historyFor(node.path)
  })

  let editing = $state(false)
  let jsonEditing = $state(false)
  let renaming = $state(false)
  let renameLock = false
  let renameDraft = $state("")
  let newKey = $state("")
  let newType = $state("string")
  let localError = $state("")
  let suppressClick = $state(false)
  /** @type {HTMLElement | null} */
  let headEl = $state(null)
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let pressTimer

  const shown = $derived.by(() => {
    if (node.type === "string") return JSON.stringify(node.value ?? "")
    if (node.type === "null") return "null"
    if (node.type === "bytes") return `"${node.value}"`
    return displayLiteral(node)
  })

  const countLabel = $derived.by(() => {
    if (node.type === "array") return `${node.children?.length ?? 0}件`
    return `${node.entries?.length ?? 0}キー`
  })

  /**
   * @param {boolean} pin
   */
  function emitHistory(pin) {
    const rect = headEl?.getBoundingClientRect()
    if (!rect) return
    actions.history({
      type: pin ? "pin" : "enter",
      pathKey: key,
      label: actions.formatPath(node.path),
      events,
      rect: {
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left,
      },
    })
  }

  /**
   * @param {PointerEvent} event
   */
  function onPointerEnter(event) {
    if (event.pointerType && event.pointerType !== "mouse") return
    emitHistory(false)
  }

  function onPointerLeave() {
    actions.history({ type: "leave" })
  }

  /**
   * @param {PointerEvent} event
   */
  function onPointerDown(event) {
    if (event.button !== 0) return
    if (event.target instanceof Element && event.target.closest("input, textarea, select, .tool, .twist")) return
    suppressClick = false
    const startX = event.clientX
    const startY = event.clientY
    clearTimeout(pressTimer)
    pressTimer = setTimeout(() => {
      suppressClick = true
      emitHistory(true)
    }, 520)
    const cancel = (/** @type {PointerEvent} */ move) => {
      if (Math.hypot(move.clientX - startX, move.clientY - startY) > 8) clearTimeout(pressTimer)
    }
    const stop = () => {
      clearTimeout(pressTimer)
      window.removeEventListener("pointermove", cancel)
      window.removeEventListener("pointerup", stop)
    }
    window.addEventListener("pointermove", cancel)
    window.addEventListener("pointerup", stop)
  }

  /**
   * @param {MouseEvent} event
   */
  function onContextMenu(event) {
    if (event.target instanceof Element && event.target.closest("input, textarea")) return
    event.preventDefault()
    emitHistory(true)
  }

  /**
   * @param {MouseEvent} event
   */
  function onClickCapture(event) {
    if (!suppressClick) return
    event.preventDefault()
    event.stopPropagation()
    suppressClick = false
  }

  /**
   * @param {{ type: string, value?: unknown }} payload
   */
  function commitValue(payload) {
    try {
      actions.edit(node.path, payload)
      editing = false
      jsonEditing = false
      localError = ""
    } catch (error) {
      localError = error instanceof Error ? error.message : "更新できません"
    }
  }

  function commitRename() {
    if (!renaming || renameLock) return
    if (renameDraft === String(name)) {
      renaming = false
      return
    }
    renameLock = true
    try {
      actions.rename(node.path, renameDraft)
      renaming = false
      localError = ""
    } catch (error) {
      localError = error instanceof Error ? error.message : "キーを変更できません"
    } finally {
      renameLock = false
    }
  }

  /**
   * @param {KeyboardEvent} event
   */
  function onRenameKey(event) {
    if (event.isComposing) return
    if (event.key === "Escape") {
      event.preventDefault()
      renaming = false
    } else if (event.key === "Enter") {
      event.preventDefault()
      commitRename()
    }
  }

  function addChild() {
    try {
      actions.add(node.path, node.type === "array" ? null : newKey, newType)
      newKey = ""
      localError = ""
    } catch (error) {
      localError = error instanceof Error ? error.message : "追加できません"
    }
  }

  /**
   * @param {KeyboardEvent} event
   */
  function onAddKey(event) {
    if (event.isComposing) return
    if (event.key === "Enter") {
      event.preventDefault()
      addChild()
    }
  }
</script>

<div class="node" class:branch data-depth={depth % 8}>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="head"
    class:hit
    class:active
    data-path={key}
    bind:this={headEl}
    onpointerenter={onPointerEnter}
    onpointerleave={onPointerLeave}
    onpointerdown={onPointerDown}
    oncontextmenu={onContextMenu}
    onclickcapture={onClickCapture}
  >
    {#if branch}
      <button
        type="button"
        class="twist"
        aria-expanded={expanded}
        aria-label={expanded ? "折りたたむ" : "展開する"}
        onclick={() => actions.toggle(node.path)}
      >
        {expanded ? "▾" : "▸"}
      </button>
    {:else}
      <span class="twist spacer"></span>
    {/if}

    {#if name !== undefined}
      {#if renaming}
        <input
          class="rename"
          bind:value={renameDraft}
          onkeydown={onRenameKey}
          onblur={commitRename}
          aria-label="キー"
        />
      {:else}
        <button
          type="button"
          class="key"
          class:mark={keyHit}
          title="キーを編集"
          onclick={() => {
            renameDraft = String(name)
            renaming = true
          }}
        >{JSON.stringify(String(name))}</button>
      {/if}
      <span class="colon">:</span>
    {/if}

    {#if editing}
      <ValueEditor type={node.type} value={node.value} oncommit={commitValue} oncancel={() => (editing = false)} />
    {:else if jsonEditing}
      <ValueEditor
        type="json"
        jsonText={JSON.stringify(treeToValue(node), null, 2)}
        oncommit={commitValue}
        oncancel={() => (jsonEditing = false)}
      />
    {:else if branch}
      <span class="punct">{node.type === "array" ? "[" : "{"}</span>
      <span class="count">{countLabel}</span>
      {#if !expanded}<span class="punct">{node.type === "array" ? "]" : "}"}</span>{/if}
    {:else}
      <button type="button" class="val {node.type}" onclick={() => (editing = true)}>{shown}</button>
      {#if node.type === "counter"}<span class="badge">counter</span>{/if}
      {#if node.type === "bytes"}<span class="badge">bytes</span>{/if}
    {/if}

    {#if !branch && !editing && trailingComma}<span class="comma">,</span>{/if}

    <span class="tools">
      {#if (node.conflicts?.length ?? 0) > 1}
        <span class="badge warn">競合 {node.conflicts.length}</span>
      {/if}
      <button type="button" class="tool history" onclick={() => emitHistory(true)}>
        履歴 {events.length}
      </button>
      {#if branch}
        <button type="button" class="tool" onclick={() => (jsonEditing = !jsonEditing)}>JSON</button>
      {/if}
      {#if !branch}
        <button type="button" class="tool" onclick={() => (editing = true)}>編集</button>
      {/if}
      {#if depth > 0}
        <button type="button" class="tool danger" onclick={() => actions.remove(node.path)}>削除</button>
      {/if}
    </span>
  </div>

  {#if localError}<p class="local-error">{localError}</p>{/if}

  {#if (node.conflicts?.length ?? 0) > 1}
    <ul class="conflicts">
      {#each node.conflicts as conflict (conflict.id)}
        <li><code>{conflict.id.slice(-8)}</code> {conflict.text}</li>
      {/each}
    </ul>
  {/if}

  {#if branch && expanded}
    <div class="body">
      {#if node.type === "object"}
        {#each node.entries ?? [] as entry, index (entry.key)}
          <JsonNode
            node={entry.child}
            name={entry.key}
            depth={depth + 1}
            trailingComma={index < (node.entries?.length ?? 0) - 1}
            {ctx}
            {actions}
          />
        {/each}
      {:else}
        {#each node.children ?? [] as child, index (pathKey(child.path))}
          <JsonNode
            node={child}
            depth={depth + 1}
            trailingComma={index < (node.children?.length ?? 0) - 1}
            {ctx}
            {actions}
          />
        {/each}
      {/if}
      <div class="add">
        {#if node.type === "object"}
          <input placeholder="新しいキー" bind:value={newKey} onkeydown={onAddKey} aria-label="新しいキー" />
        {/if}
        <select bind:value={newType} aria-label="追加する型">
          <option value="string">文字列</option>
          <option value="number">数値</option>
          <option value="boolean">真偽値</option>
          <option value="null">null</option>
          <option value="object">オブジェクト</option>
          <option value="array">配列</option>
        </select>
        <button type="button" onclick={addChild}>追加</button>
      </div>
    </div>
    <div class="head closer">
      <span class="twist spacer"></span>
      <span class="punct">{node.type === "array" ? "]" : "}"}</span>
      {#if trailingComma}<span class="comma">,</span>{/if}
    </div>
  {/if}
</div>
