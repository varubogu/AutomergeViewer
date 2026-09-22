<script>
  import { formatActor, formatTime } from "../lib/format.js"

  let { popover, onenter, onleave, onclose } = $props()

  const width = 380

  const position = $derived.by(() => {
    const rect = popover?.rect
    if (!rect) return { left: 12, top: 12 }
    const margin = 12
    const estimated = Math.min(420, 96 + (popover.events?.length ?? 1) * 88)
    let left = rect.left
    let top = rect.bottom + 6
    if (left + width > window.innerWidth - margin) {
      left = Math.max(margin, window.innerWidth - width - margin)
    }
    if (top + estimated > window.innerHeight - margin) {
      top = Math.max(margin, rect.top - estimated - 6)
    }
    return { left, top }
  })
</script>

{#if popover}
  <div
    class="popover"
    style:left="{position.left}px"
    style:top="{position.top}px"
    style:width="{width}px"
    role="dialog"
    aria-label="編集履歴"
    tabindex="-1"
    onpointerenter={onenter}
    onpointerleave={onleave}
  >
    <div class="popover-head">
      <div>
        <p class="popover-kicker">編集履歴</p>
        <strong>{popover.label}</strong>
      </div>
      <button type="button" class="ghost" onclick={onclose}>閉じる</button>
    </div>
    {#if popover.events.length === 0}
      <p class="empty">この値の履歴はありません</p>
    {:else}
      <p class="count">{popover.events.length}件 · 古い順</p>
      <ol>
        {#each popover.events as event, index (`${event.time}-${index}`)}
          <li>
            <div class="when">
              <time datetime={event.time ? new Date(event.time * 1000).toISOString() : undefined}>
                {formatTime(event.time)}
              </time>
              <span class="action action-{event.action}">{event.action}</span>
            </div>
            <p class="diff">
              <span>{event.beforeText}</span>
              <span aria-hidden="true">→</span>
              <span>{event.afterText}</span>
            </p>
            {#if event.message}<p class="message">{event.message}</p>{/if}
            {#if event.actor}<p class="actor">actor {formatActor(event.actor)}</p>{/if}
          </li>
        {/each}
      </ol>
    {/if}
  </div>
{/if}
