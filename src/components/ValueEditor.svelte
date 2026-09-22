<script>
  import { untrack } from "svelte"

  /**
   * @typedef {{ type: string, value?: unknown }} EditPayload
   */
  let { type, value = undefined, jsonText = "", oncommit, oncancel } = $props()

  const initialType = untrack(() => type)
  const initialValue = untrack(() => value)
  const initialJson = untrack(() => jsonText)
  const options = typeOptions(initialType)
  let nextType = $state(initialType)
  let draft = $state(initialDraft(initialType, initialValue, initialJson))
  let localError = $state("")
  let committed = false
  /** @type {HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null} */
  let field = $state(null)

  $effect(() => {
    field?.focus()
  })

  /**
   * @param {string} current
   */
  function typeOptions(current) {
    const base = [
      ["string", "文字列"],
      ["number", "数値"],
      ["boolean", "真偽値"],
      ["null", "null"],
      ["object", "オブジェクト"],
      ["array", "配列"],
      ["json", "JSON"],
    ]
    if (current === "counter") base.splice(2, 0, ["counter", "カウンター"])
    if (current === "bytes") base.push(["bytes", "バイナリ"])
    return base
  }

  /**
   * @param {string} current
   * @param {unknown} currentValue
   * @param {string} currentJson
   */
  function initialDraft(current, currentValue, currentJson) {
    if (currentJson) return currentJson
    if (current === "string" || current === "bytes") return String(currentValue ?? "")
    if (current === "number" || current === "counter") return String(currentValue ?? 0)
    if (current === "boolean") return currentValue ? "true" : "false"
    if (current === "json") return String(currentValue ?? "")
    return ""
  }

  /**
   * @param {FocusEvent} event
   */
  function onFocusOut(event) {
    const next = /** @type {Node | null} */ (event.relatedTarget)
    if (next && event.currentTarget instanceof Node && event.currentTarget.contains(next)) return
    commit()
  }

  /**
   * @param {KeyboardEvent} event
   */
  function onKeyDown(event) {
    if (event.isComposing) return
    if (event.key === "Escape") {
      event.preventDefault()
      oncancel()
      return
    }
    if (event.key === "Enter" && (nextType !== "json" || event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      commit()
    }
  }

  function commit() {
    if (committed) return
    try {
      const payload = buildPayload()
      committed = true
      oncommit(payload)
      localError = ""
    } catch (error) {
      committed = false
      localError = error instanceof Error ? error.message : "値を解釈できません"
    }
  }

  /**
   * @returns {EditPayload}
   */
  function buildPayload() {
    if (nextType === "string") return { type: "string", value: draft }
    if (nextType === "bytes") return { type: "bytes", value: draft.trim() }
    if (nextType === "number" || nextType === "counter") {
      const number = Number(draft)
      if (!Number.isFinite(number)) throw new Error("数値として解釈できません")
      return { type: nextType, value: number }
    }
    if (nextType === "boolean") return { type: "boolean", value: draft === "true" }
    if (nextType === "null") return { type: "null" }
    if (nextType === "object") return { type: "object", value: {} }
    if (nextType === "array") return { type: "array", value: [] }
    try {
      return { type: "json", value: JSON.parse(draft) }
    } catch {
      throw new Error("JSONとして解釈できません")
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="editor" onfocusout={onFocusOut} onkeydown={onKeyDown}>
  <label>
    <span class="sr-only">型</span>
    <select bind:value={nextType}>
      {#each options as option (option[0])}
        <option value={option[0]}>{option[1]}</option>
      {/each}
    </select>
  </label>
  {#if nextType === "boolean"}
    <select bind:value={draft} bind:this={field}>
      <option value="true">true</option>
      <option value="false">false</option>
    </select>
  {:else if nextType === "null" || nextType === "object" || nextType === "array"}
    <span class="hint">
      {nextType === "null" ? "null になります" : nextType === "object" ? "空のオブジェクトになります" : "空の配列になります"}
    </span>
  {:else if nextType === "json"}
    <textarea bind:value={draft} bind:this={field} rows="6" spellcheck="false" aria-label="JSON"></textarea>
  {:else}
    <input bind:value={draft} bind:this={field} spellcheck="false" aria-label="値" />
  {/if}
  <button type="button" onclick={commit}>確定</button>
  <button type="button" class="ghost" onclick={oncancel}>取消</button>
  {#if localError}<span class="editor-error">{localError}</span>{/if}
</div>
