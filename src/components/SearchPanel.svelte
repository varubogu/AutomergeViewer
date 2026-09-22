<script>
  let {
    mode = $bindable("js"),
    pattern = $bindable(""),
    replacement = $bindable(""),
    caseSensitive = $bindable(true),
    asJson = $bindable(false),
    matchCount = 0,
    queryError = "",
    onreplace,
    onjump,
  } = $props()

  const placeholder = $derived(
    mode === "regex" ? "課長|主任" : mode === "xpath" ? "/company/seizoubu/tanaka" : "company.seizoubu.tanaka",
  )
</script>

<section class="search" aria-label="検索と置換">
  <div class="search-row">
    <label class="grow">
      <span>検索</span>
      <input id="search-input" bind:value={pattern} placeholder={placeholder} spellcheck="false" autocomplete="off" />
    </label>
    <label>
      <span>方式</span>
      <select bind:value={mode} aria-label="検索方式">
        <option value="regex">正規表現</option>
        <option value="xpath">XPath</option>
        <option value="js">JSパス</option>
      </select>
    </label>
    <label class="check">
      <input type="checkbox" bind:checked={caseSensitive} />
      大文字と小文字を区別
    </label>
  </div>
  <div class="search-row">
    <label class="grow">
      <span>置換</span>
      <input bind:value={replacement} placeholder={mode === "regex" ? "置換後の文字" : "新しい値"} spellcheck="false" />
    </label>
    <label class="check" class:disabled={mode === "regex"}>
      <input type="checkbox" bind:checked={asJson} disabled={mode === "regex"} />
      置換値をJSONとして解釈
    </label>
    <button type="button" onclick={onreplace}>すべて置換</button>
    <button type="button" class="ghost" onclick={() => onjump(-1)} disabled={matchCount === 0}>前へ</button>
    <button type="button" class="ghost" onclick={() => onjump(1)} disabled={matchCount === 0}>次へ</button>
  </div>
  <div class="search-meta">
    {#if queryError}
      <p class="query-error" role="alert">{queryError}</p>
    {:else if pattern.trim()}
      <p>{matchCount}件一致</p>
    {:else}
      <p>未入力のあいだは文書全体を表示します</p>
    {/if}
    <details>
      <summary>検索の書き方</summary>
      <div class="help">
        <div>
          <h3>正規表現</h3>
          <p><code>課長|主任</code> のように、見えているキーと値を検索します。置換は一致した文字を置き換え、<code>$1</code> も使えます。</p>
        </div>
        <div>
          <h3>XPath（配列は1始まり）</h3>
          <p><code>/company/seizoubu/tanaka</code></p>
          <p><code>//tanaka</code> <code>/company/*/tanaka</code></p>
          <p><code>/company/employees[1]/name</code></p>
          <p><code>//*[name="tanaka"]</code></p>
        </div>
        <div>
          <h3>JSパス（配列は0始まり）</h3>
          <p><code>company.seizoubu.tanaka</code></p>
          <p><code>company.employees[0].name</code></p>
          <p><code>company.employees[*].dept</code> <code>**.note</code></p>
          <p><code>company["seizoubu"].tanaka</code></p>
        </div>
      </div>
    </details>
  </div>
</section>
