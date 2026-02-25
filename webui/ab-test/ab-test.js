/**
 * AgentLoop A/B Testing Arena
 *
 * Send the same prompt to two models simultaneously, compare responses
 * side-by-side, vote on quality, and track results over time.
 *
 * Reuses providers.js for API dispatch (buildRequest, getStreamParser, etc.)
 */

// ─── State ──────────────────────────────────────────────────────────────────

const abState = {
  // Model configs
  providerA: "openai",
  modelA: "",
  tempA: 0.7,
  maxTokensA: null,
  providerB: "anthropic",
  modelB: "",
  tempB: 0.7,
  maxTokensB: null,

  // Shared
  systemMessage: "",
  corsProxy: "",

  // Mode
  mode: "side-by-side", // "side-by-side" | "blind"
  blindRevealed: false,

  // Current test
  messages: [],  // shared conversation (user messages)
  responseA: null, // { text, usage, error, ttft, totalTime, startedAt }
  responseB: null,
  isGenerating: false,
  abortControllerA: null,
  abortControllerB: null,

  // Verdict for current round
  verdict: null, // "a" | "b" | "tie" | "both_bad" | null

  // History
  history: [], // [{ id, prompt, modelA, modelB, providerA, providerB, responseA, responseB, verdict, metrics, timestamp }]
};

// ─── DOM ────────────────────────────────────────────────────────────────────

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const dom = {
  // Config
  providerA: $("#provider-a"),
  modelA: $("#model-a"),
  tempA: $("#temp-a"),
  maxTokensA: $("#max-tokens-a"),
  keyA: $("#key-a"),
  providerB: $("#provider-b"),
  modelB: $("#model-b"),
  tempB: $("#temp-b"),
  maxTokensB: $("#max-tokens-b"),
  keyB: $("#key-b"),
  modelADisplay: $("#model-a-display"),
  modelBDisplay: $("#model-b-display"),

  // Shared
  systemMsg: $("#system-msg"),
  systemMsgToggle: $("#system-msg-toggle"),
  systemMsgPanel: $("#system-msg-panel"),

  // Arena
  arena: $("#arena"),
  paneA: $("#pane-a"),
  paneB: $("#pane-b"),
  messagesA: $("#messages-a"),
  messagesB: $("#messages-b"),
  paneLabelA: $("#pane-label-a"),
  paneLabelB: $("#pane-label-b"),
  statusA: $("#status-a"),
  statusB: $("#status-b"),
  arenaDivider: $("#arena-divider"),

  // Verdict
  verdictBar: $("#verdict-bar"),
  metricsBar: $("#metrics-bar"),

  // Input
  userInput: $("#user-input"),
  sendBtn: $("#send-btn"),
  stopBtn: $("#stop-btn"),
  clearBtn: $("#clear-btn"),

  // Mode
  modeTabs: $$(".mode-tab"),

  // History
  historyBtn: $("#history-btn"),
  historyCount: $("#history-count"),
  historyOverlay: $("#history-overlay"),
  historyClose: $("#history-close"),
  historyList: $("#history-list"),
  historySummary: $("#history-summary"),
  exportHistoryBtn: $("#export-history-btn"),
  clearHistoryBtn: $("#clear-history-btn"),

  // Theme
  themeToggle: $("#theme-toggle"),

  // Swap
  swapBtn: $("#swap-btn"),
};

// ─── Init ───────────────────────────────────────────────────────────────────

function init() {
  loadState();
  populateProviderSelects();
  applyConfig();
  setupEventListeners();
  updateTheme();
  updateHistoryBadge();
  setupDividerDrag();

  // Configure marked
  if (typeof marked !== "undefined") {
    marked.setOptions({
      breaks: true,
      gfm: true,
      highlight: (code, lang) => {
        if (typeof hljs !== "undefined" && lang && hljs.getLanguage(lang)) {
          try { return hljs.highlight(code, { language: lang }).value; } catch {}
        }
        return code;
      },
    });
  }
}

// ─── Event Listeners ────────────────────────────────────────────────────────

function setupEventListeners() {
  // Provider selects
  dom.providerA.addEventListener("change", () => {
    abState.providerA = dom.providerA.value;
    abState.modelA = "";
    populateModelSelect("a");
    loadKeyForSide("a");
    saveState();
  });
  dom.providerB.addEventListener("change", () => {
    abState.providerB = dom.providerB.value;
    abState.modelB = "";
    populateModelSelect("b");
    loadKeyForSide("b");
    saveState();
  });

  // Model selects
  dom.modelA.addEventListener("change", () => {
    abState.modelA = dom.modelA.value;
    updateModelDisplays();
    saveState();
  });
  dom.modelB.addEventListener("change", () => {
    abState.modelB = dom.modelB.value;
    updateModelDisplays();
    saveState();
  });

  // Parameters
  dom.tempA.addEventListener("change", () => { abState.tempA = parseFloat(dom.tempA.value) || 0.7; saveState(); });
  dom.tempB.addEventListener("change", () => { abState.tempB = parseFloat(dom.tempB.value) || 0.7; saveState(); });
  dom.maxTokensA.addEventListener("change", () => { abState.maxTokensA = dom.maxTokensA.value ? parseInt(dom.maxTokensA.value) : null; saveState(); });
  dom.maxTokensB.addEventListener("change", () => { abState.maxTokensB = dom.maxTokensB.value ? parseInt(dom.maxTokensB.value) : null; saveState(); });

  // API keys — save directly to the shared localStorage key store
  dom.keyA.addEventListener("change", () => {
    setApiKey(abState.providerA, dom.keyA.value);
  });
  dom.keyB.addEventListener("change", () => {
    setApiKey(abState.providerB, dom.keyB.value);
  });

  // System message toggle
  dom.systemMsgToggle.addEventListener("click", () => {
    const open = dom.systemMsgPanel.style.display !== "none";
    dom.systemMsgPanel.style.display = open ? "none" : "block";
    dom.systemMsgToggle.classList.toggle("open", !open);
  });
  dom.systemMsg.addEventListener("input", () => {
    abState.systemMessage = dom.systemMsg.value;
    saveState();
  });

  // Mode tabs
  dom.modeTabs.forEach(tab => {
    tab.addEventListener("click", () => {
      abState.mode = tab.dataset.mode;
      dom.modeTabs.forEach(t => t.classList.toggle("active", t === tab));
      applyMode();
      saveState();
    });
  });

  // Send message
  dom.sendBtn.addEventListener("click", sendPrompt);
  dom.userInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendPrompt();
    }
  });
  dom.userInput.addEventListener("input", autoResize);

  // Stop
  dom.stopBtn.addEventListener("click", stopAll);

  // Clear
  dom.clearBtn.addEventListener("click", clearArena);

  // Swap
  dom.swapBtn.addEventListener("click", swapSides);

  // Verdict buttons
  $$(".verdict-btn").forEach(btn => {
    btn.addEventListener("click", () => recordVerdict(btn.dataset.verdict));
  });

  // History
  dom.historyBtn.addEventListener("click", openHistory);
  dom.historyClose.addEventListener("click", closeHistory);
  dom.historyOverlay.addEventListener("click", (e) => {
    if (e.target === dom.historyOverlay) closeHistory();
  });
  dom.exportHistoryBtn.addEventListener("click", exportHistory);
  dom.clearHistoryBtn.addEventListener("click", clearHistory);

  // Theme
  dom.themeToggle.addEventListener("click", toggleTheme);

  // Keyboard shortcuts
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (dom.historyOverlay.style.display !== "none") {
        closeHistory();
        return;
      }
    }
    const isInput = e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT";
    if (isInput) return;
    if (e.key === "/" && !abState.isGenerating) {
      e.preventDefault();
      dom.userInput.focus();
    }
  });
}

// ─── Provider & Model Selects ───────────────────────────────────────────────

function populateProviderSelects() {
  const builtIn = ["openai", "anthropic", "google", "groq", "together", "mistral", "deepseek", "fireworks", "perplexity", "cohere", "xai", "ollama"];
  let html = "";
  for (const id of builtIn) {
    const p = PROVIDERS[id];
    if (p) html += `<option value="${id}">${p.name}</option>`;
  }

  dom.providerA.innerHTML = html;
  dom.providerB.innerHTML = html;
  dom.providerA.value = abState.providerA;
  dom.providerB.value = abState.providerB;

  populateModelSelect("a");
  populateModelSelect("b");
}

function populateModelSelect(side) {
  const provider = side === "a" ? abState.providerA : abState.providerB;
  const select = side === "a" ? dom.modelA : dom.modelB;
  const models = getModelsForProvider(provider, "chat", "");

  let html = "";
  for (const m of models) {
    html += `<option value="${esc(m.id)}">${esc(m.name)}</option>`;
  }
  // Allow custom model ID
  html += `<option value="">Custom...</option>`;
  select.innerHTML = html;

  // Set current value
  const current = side === "a" ? abState.modelA : abState.modelB;
  if (current && [...select.options].some(o => o.value === current)) {
    select.value = current;
  } else if (models.length > 0) {
    const def = models.find(m => m.isDefault) || models[0];
    select.value = def.id;
    if (side === "a") abState.modelA = def.id;
    else abState.modelB = def.id;
  }

  updateModelDisplays();
}

function updateModelDisplays() {
  const nameA = getModelDisplayName(abState.providerA, abState.modelA);
  const nameB = getModelDisplayName(abState.providerB, abState.modelB);
  dom.modelADisplay.textContent = nameA;
  dom.modelBDisplay.textContent = nameB;

  // Update pane labels in non-blind mode
  if (abState.mode !== "blind" || abState.blindRevealed) {
    dom.paneLabelA.textContent = nameA || "Model A";
    dom.paneLabelB.textContent = nameB || "Model B";
  }
}

function getModelDisplayName(provider, modelId) {
  if (!modelId) return "";
  const cat = MODEL_CATALOG.find(m => m.provider === provider && m.id === modelId);
  return cat ? cat.name : modelId;
}

function applyConfig() {
  dom.providerA.value = abState.providerA;
  dom.providerB.value = abState.providerB;
  dom.tempA.value = abState.tempA;
  dom.tempB.value = abState.tempB;
  dom.maxTokensA.value = abState.maxTokensA || "";
  dom.maxTokensB.value = abState.maxTokensB || "";
  dom.systemMsg.value = abState.systemMessage;

  loadKeyForSide("a");
  loadKeyForSide("b");
  updateModelDisplays();
  applyMode();
}

function loadKeyForSide(side) {
  const provider = side === "a" ? abState.providerA : abState.providerB;
  const input = side === "a" ? dom.keyA : dom.keyB;
  input.value = getApiKey(provider);
}

function applyMode() {
  const body = document.body;
  body.classList.remove("blind-mode", "revealed");
  abState.blindRevealed = false;

  if (abState.mode === "blind") {
    body.classList.add("blind-mode");
    dom.paneLabelA.textContent = "Model A";
    dom.paneLabelB.textContent = "Model B";
  } else {
    updateModelDisplays();
  }
}

// ─── Swap ───────────────────────────────────────────────────────────────────

function swapSides() {
  // Swap all config
  [abState.providerA, abState.providerB] = [abState.providerB, abState.providerA];
  [abState.modelA, abState.modelB] = [abState.modelB, abState.modelA];
  [abState.tempA, abState.tempB] = [abState.tempB, abState.tempA];
  [abState.maxTokensA, abState.maxTokensB] = [abState.maxTokensB, abState.maxTokensA];

  dom.providerA.value = abState.providerA;
  dom.providerB.value = abState.providerB;
  populateModelSelect("a");
  populateModelSelect("b");
  dom.tempA.value = abState.tempA;
  dom.tempB.value = abState.tempB;
  dom.maxTokensA.value = abState.maxTokensA || "";
  dom.maxTokensB.value = abState.maxTokensB || "";
  loadKeyForSide("a");
  loadKeyForSide("b");
  updateModelDisplays();
  saveState();
}

// ─── Send Prompt ────────────────────────────────────────────────────────────

async function sendPrompt() {
  const text = dom.userInput.value.trim();
  if (!text || abState.isGenerating) return;

  abState.isGenerating = true;
  abState.verdict = null;
  abState.blindRevealed = false;
  abState.responseA = { text: "", usage: null, error: null, ttft: null, totalTime: null, startedAt: performance.now() };
  abState.responseB = { text: "", usage: null, error: null, ttft: null, totalTime: null, startedAt: performance.now() };
  abState.abortControllerA = new AbortController();
  abState.abortControllerB = new AbortController();

  // Add user message to display
  abState.messages.push({ role: "user", content: text });

  // Clear input
  dom.userInput.value = "";
  autoResize();

  // Hide verdict/metrics from previous round
  dom.verdictBar.style.display = "none";
  dom.metricsBar.style.display = "none";

  // Render user message in both panes
  appendUserMessage(dom.messagesA, text);
  appendUserMessage(dom.messagesB, text);

  // Show streaming UI
  const streamA = appendStreamingPlaceholder(dom.messagesA);
  const streamB = appendStreamingPlaceholder(dom.messagesB);

  updateUI(true);

  // Dispatch both in parallel
  const modelA = abState.modelA || PROVIDERS[abState.providerA]?.defaultModel || "";
  const modelB = abState.modelB || PROVIDERS[abState.providerB]?.defaultModel || "";

  const promiseA = dispatchToModel("a", text, modelA, streamA);
  const promiseB = dispatchToModel("b", text, modelB, streamB);

  await Promise.allSettled([promiseA, promiseB]);

  abState.isGenerating = false;
  updateUI(false);

  // Show verdict bar
  dom.verdictBar.style.display = "flex";

  // Show metrics
  showMetrics();

  // In blind mode, the reveal happens after verdict
  saveState();
}

async function dispatchToModel(side, text, model, streamEl) {
  const provider = side === "a" ? abState.providerA : abState.providerB;
  const temp = side === "a" ? abState.tempA : abState.tempB;
  const maxTokens = side === "a" ? abState.maxTokensA : abState.maxTokensB;
  const signal = side === "a" ? abState.abortControllerA.signal : abState.abortControllerB.signal;
  const response = side === "a" ? abState.responseA : abState.responseB;
  const statusEl = side === "a" ? dom.statusA : dom.statusB;
  const messagesEl = side === "a" ? dom.messagesA : dom.messagesB;

  statusEl.textContent = "connecting...";
  statusEl.className = "pane-status streaming";

  try {
    // Build messages array (only the latest user message for simple A/B test)
    const apiMessages = abState.messages
      .filter(m => m.role === "user")
      .map(m => ({ role: "user", content: m.content }));

    const { url, headers, body } = buildRequest({
      provider,
      model,
      messages: apiMessages,
      systemMessage: abState.systemMessage,
      temperature: temp,
      maxTokens: maxTokens,
      topP: 1,
      stream: true,
      corsProxy: abState.corsProxy,
    });

    const fetchResponse = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal,
    });

    if (!fetchResponse.ok) {
      const errorBody = await fetchResponse.text();
      let errorMsg;
      try {
        const parsed = JSON.parse(errorBody);
        errorMsg = parsed.error?.message || parsed.message || parsed.error || errorBody;
        if (typeof errorMsg === "object") errorMsg = JSON.stringify(errorMsg);
      } catch {
        errorMsg = errorBody;
      }
      throw new Error(`${fetchResponse.status}: ${errorMsg}`);
    }

    // Stream the response
    const reader = fetchResponse.body.getReader();
    const parser = getStreamParser(provider);

    let fullText = "";
    let rawUsage = null;
    let firstToken = true;

    statusEl.textContent = "streaming...";

    for await (const event of parser(reader)) {
      if (signal.aborted) break;

      switch (event.type) {
        case "delta":
          if (firstToken) {
            response.ttft = performance.now() - response.startedAt;
            firstToken = false;
          }
          fullText += event.text;
          updateStreamingContent(streamEl, fullText);
          break;
        case "usage":
          rawUsage = { ...rawUsage, ...event.usage };
          break;
        case "error":
          throw new Error(event.error);
      }
    }

    response.totalTime = performance.now() - response.startedAt;
    response.text = fullText;
    response.usage = normalizeUsage(provider, rawUsage);

    // Finalize the streaming element
    finalizeStreamingContent(streamEl, fullText);

    statusEl.textContent = formatMs(response.totalTime);
    statusEl.className = "pane-status";

  } catch (err) {
    if (err.name === "AbortError") {
      response.error = "Cancelled";
      statusEl.textContent = "cancelled";
    } else {
      response.error = err.message;
      statusEl.textContent = "error";
      statusEl.className = "pane-status error";
      appendError(messagesEl, streamEl, err.message);
    }
    response.totalTime = performance.now() - response.startedAt;
  }
}

// ─── Message Rendering ──────────────────────────────────────────────────────

function appendUserMessage(container, text) {
  // Remove welcome if present
  const welcome = container.querySelector(".arena-welcome");
  if (welcome) welcome.remove();

  const div = document.createElement("div");
  div.className = "msg user";
  div.textContent = text;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function appendStreamingPlaceholder(container) {
  const div = document.createElement("div");
  div.className = "msg assistant";
  div.innerHTML = `<div class="streaming-content streaming-cursor"><span class="typing-indicator"><span></span><span></span><span></span></span></div>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  return div;
}

function updateStreamingContent(el, text) {
  const content = el.querySelector(".streaming-content");
  if (!content) return;
  content.innerHTML = renderMarkdown(text);
  content.classList.add("streaming-cursor");
  el.closest(".pane-messages").scrollTop = el.closest(".pane-messages").scrollHeight;
}

function finalizeStreamingContent(el, text) {
  const content = el.querySelector(".streaming-content");
  if (!content) return;
  content.innerHTML = renderMarkdown(text);
  content.classList.remove("streaming-cursor");

  // Highlight code blocks
  content.querySelectorAll("pre code").forEach(block => {
    if (typeof hljs !== "undefined") hljs.highlightElement(block);
  });

  addCopyButtons(content);
}

function appendError(container, streamEl, message) {
  // Replace streaming placeholder with error
  if (streamEl) {
    streamEl.className = "msg error";
    streamEl.innerHTML = esc(message);
  }
}

function renderMarkdown(text) {
  if (!text) return "";
  if (typeof marked !== "undefined") {
    try { return marked.parse(text); } catch {}
  }
  return esc(text).replace(/\n/g, "<br>");
}

function esc(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function addCopyButtons(container) {
  container.querySelectorAll("pre").forEach(pre => {
    if (pre.querySelector(".code-header")) return;
    const code = pre.querySelector("code");
    if (!code) return;

    const langClass = [...code.classList].find(c => c.startsWith("language-"));
    const lang = langClass ? langClass.replace("language-", "") : "";

    const header = document.createElement("div");
    header.className = "code-header";
    header.innerHTML = `<span>${lang}</span><button class="copy-btn" title="Copy"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy</button>`;
    pre.insertBefore(header, code);

    header.querySelector(".copy-btn").addEventListener("click", function() {
      navigator.clipboard.writeText(code.textContent).then(() => {
        this.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Copied!`;
        setTimeout(() => {
          this.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy`;
        }, 2000);
      });
    });
  });
}

// ─── Verdict ────────────────────────────────────────────────────────────────

function recordVerdict(verdict) {
  abState.verdict = verdict;

  // Highlight selected button
  $$(".verdict-btn").forEach(btn => {
    btn.classList.toggle("selected", btn.dataset.verdict === verdict);
  });

  // In blind mode, reveal the models
  if (abState.mode === "blind" && !abState.blindRevealed) {
    abState.blindRevealed = true;
    document.body.classList.add("revealed");
    updateModelDisplays();
    dom.paneLabelA.textContent = getModelDisplayName(abState.providerA, abState.modelA) || "Model A";
    dom.paneLabelB.textContent = getModelDisplayName(abState.providerB, abState.modelB) || "Model B";
  }

  // Save to history
  const lastPrompt = abState.messages.filter(m => m.role === "user").pop()?.content || "";
  const entry = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    prompt: lastPrompt,
    providerA: abState.providerA,
    modelA: abState.modelA,
    providerB: abState.providerB,
    modelB: abState.modelB,
    responseA: { text: abState.responseA?.text || "", error: abState.responseA?.error || null },
    responseB: { text: abState.responseB?.text || "", error: abState.responseB?.error || null },
    verdict,
    metrics: {
      ttftA: abState.responseA?.ttft,
      ttftB: abState.responseB?.ttft,
      timeA: abState.responseA?.totalTime,
      timeB: abState.responseB?.totalTime,
      tokensA: abState.responseA?.usage?.output_tokens || 0,
      tokensB: abState.responseB?.usage?.output_tokens || 0,
    },
    timestamp: Date.now(),
  };

  abState.history.push(entry);
  saveState();
  updateHistoryBadge();
}

// ─── Metrics Display ────────────────────────────────────────────────────────

function showMetrics() {
  const a = abState.responseA;
  const b = abState.responseB;
  if (!a && !b) return;

  dom.metricsBar.style.display = "flex";

  setMetric("ttft", a?.ttft, b?.ttft, "lower");
  setMetric("time", a?.totalTime, b?.totalTime, "lower");

  const tokA = a?.usage?.output_tokens || 0;
  const tokB = b?.usage?.output_tokens || 0;
  setMetric("tokens", tokA, tokB, null);

  const tpsA = (a?.totalTime && tokA) ? (tokA / (a.totalTime / 1000)) : 0;
  const tpsB = (b?.totalTime && tokB) ? (tokB / (b.totalTime / 1000)) : 0;
  setMetric("tps", tpsA, tpsB, "higher");
}

function setMetric(name, valA, valB, winRule) {
  const elA = $(`#metric-${name}-a`);
  const elB = $(`#metric-${name}-b`);

  if (name === "tokens") {
    elA.textContent = valA ? fmtNum(valA) : "—";
    elB.textContent = valB ? fmtNum(valB) : "—";
  } else if (name === "tps") {
    elA.textContent = valA ? valA.toFixed(1) : "—";
    elB.textContent = valB ? valB.toFixed(1) : "—";
  } else {
    elA.textContent = valA != null ? formatMs(valA) : "—";
    elB.textContent = valB != null ? formatMs(valB) : "—";
  }

  // Highlight winner
  elA.classList.remove("winner");
  elB.classList.remove("winner");
  if (valA != null && valB != null && winRule) {
    if (winRule === "lower") {
      if (valA < valB) elA.classList.add("winner");
      else if (valB < valA) elB.classList.add("winner");
    } else if (winRule === "higher") {
      if (valA > valB) elA.classList.add("winner");
      else if (valB > valA) elB.classList.add("winner");
    }
  }
}

function formatMs(ms) {
  if (ms == null) return "—";
  if (ms < 1000) return Math.round(ms) + "ms";
  return (ms / 1000).toFixed(1) + "s";
}

function fmtNum(n) {
  if (n == null) return "0";
  return n.toLocaleString();
}

// ─── UI Helpers ─────────────────────────────────────────────────────────────

function updateUI(generating) {
  dom.sendBtn.style.display = generating ? "none" : "flex";
  dom.stopBtn.style.display = generating ? "flex" : "none";
  dom.userInput.disabled = generating;
}

function autoResize() {
  const el = dom.userInput;
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 200) + "px";
}

function stopAll() {
  if (abState.abortControllerA) abState.abortControllerA.abort();
  if (abState.abortControllerB) abState.abortControllerB.abort();
}

function clearArena() {
  abState.messages = [];
  abState.responseA = null;
  abState.responseB = null;
  abState.verdict = null;
  abState.blindRevealed = false;

  dom.messagesA.innerHTML = `<div class="arena-welcome"><p>Responses from <strong>Model A</strong> will appear here.</p></div>`;
  dom.messagesB.innerHTML = `<div class="arena-welcome"><p>Responses from <strong>Model B</strong> will appear here.</p></div>`;
  dom.statusA.textContent = "";
  dom.statusA.className = "pane-status";
  dom.statusB.textContent = "";
  dom.statusB.className = "pane-status";
  dom.verdictBar.style.display = "none";
  dom.metricsBar.style.display = "none";

  $$(".verdict-btn").forEach(btn => btn.classList.remove("selected"));
  applyMode();
  saveState();
}

// ─── Divider Drag ───────────────────────────────────────────────────────────

function setupDividerDrag() {
  let isDragging = false;

  dom.arenaDivider.addEventListener("mousedown", (e) => {
    isDragging = true;
    dom.arenaDivider.classList.add("dragging");
    e.preventDefault();
  });

  document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    const arenaRect = dom.arena.getBoundingClientRect();
    const pct = ((e.clientX - arenaRect.left) / arenaRect.width) * 100;
    const clamped = Math.max(20, Math.min(80, pct));
    dom.paneA.style.flex = `0 0 ${clamped}%`;
    dom.paneB.style.flex = `0 0 ${100 - clamped}%`;
  });

  document.addEventListener("mouseup", () => {
    if (isDragging) {
      isDragging = false;
      dom.arenaDivider.classList.remove("dragging");
    }
  });
}

// ─── History ────────────────────────────────────────────────────────────────

function openHistory() {
  renderHistoryList();
  renderHistorySummary();
  dom.historyOverlay.style.display = "flex";
}

function closeHistory() {
  dom.historyOverlay.style.display = "none";
}

function updateHistoryBadge() {
  dom.historyCount.textContent = abState.history.length || "";
}

function renderHistorySummary() {
  const h = abState.history;
  if (h.length === 0) {
    dom.historySummary.innerHTML = "";
    return;
  }

  const aWins = h.filter(e => e.verdict === "a").length;
  const bWins = h.filter(e => e.verdict === "b").length;
  const ties = h.filter(e => e.verdict === "tie").length;
  const bothBad = h.filter(e => e.verdict === "both_bad").length;

  dom.historySummary.innerHTML = `
    <div class="summary-stat"><div class="summary-stat-value">${h.length}</div><div class="summary-stat-label">Tests</div></div>
    <div class="summary-stat"><div class="summary-stat-value" style="color:var(--color-a)">${aWins}</div><div class="summary-stat-label">A Wins</div></div>
    <div class="summary-stat"><div class="summary-stat-value" style="color:var(--color-b)">${bWins}</div><div class="summary-stat-label">B Wins</div></div>
    <div class="summary-stat"><div class="summary-stat-value" style="color:var(--color-tie)">${ties}</div><div class="summary-stat-label">Ties</div></div>
    <div class="summary-stat"><div class="summary-stat-value" style="color:var(--color-bad)">${bothBad}</div><div class="summary-stat-label">Both Bad</div></div>
  `;
}

function renderHistoryList() {
  const h = abState.history;
  if (h.length === 0) {
    dom.historyList.innerHTML = `<div class="history-empty">No tests yet. Send a prompt to get started.</div>`;
    return;
  }

  // Show newest first
  dom.historyList.innerHTML = [...h].reverse().map(entry => {
    const verdictClass = entry.verdict === "a" ? "a-wins" : entry.verdict === "b" ? "b-wins" : entry.verdict === "tie" ? "tie" : "both-bad";
    const verdictLabel = entry.verdict === "a" ? "A Wins" : entry.verdict === "b" ? "B Wins" : entry.verdict === "tie" ? "Tie" : "Both Bad";
    const nameA = getModelDisplayName(entry.providerA, entry.modelA) || entry.modelA;
    const nameB = getModelDisplayName(entry.providerB, entry.modelB) || entry.modelB;
    const date = new Date(entry.timestamp).toLocaleString();

    return `
      <div class="history-item" data-id="${entry.id}">
        <div class="history-item-header">
          <span class="history-item-prompt" title="${esc(entry.prompt)}">${esc(entry.prompt)}</span>
          <span class="history-item-verdict ${verdictClass}">${verdictLabel}</span>
        </div>
        <div class="history-item-models">
          <span class="history-item-model-a">${esc(nameA)}</span>
          <span>vs</span>
          <span class="history-item-model-b">${esc(nameB)}</span>
        </div>
        <div class="history-item-date">${date}</div>
      </div>`;
  }).join("");

  // Click to restore a past test
  dom.historyList.querySelectorAll(".history-item").forEach(item => {
    item.addEventListener("click", () => {
      const entry = abState.history.find(e => e.id === item.dataset.id);
      if (!entry) return;
      restoreHistoryEntry(entry);
      closeHistory();
    });
  });
}

function restoreHistoryEntry(entry) {
  // Clear arena first
  clearArena();

  // Show the prompt and responses
  appendUserMessage(dom.messagesA, entry.prompt);
  appendUserMessage(dom.messagesB, entry.prompt);

  if (entry.responseA?.text) {
    const divA = document.createElement("div");
    divA.className = "msg assistant";
    divA.innerHTML = renderMarkdown(entry.responseA.text);
    dom.messagesA.appendChild(divA);
  }
  if (entry.responseA?.error) {
    const divA = document.createElement("div");
    divA.className = "msg error";
    divA.textContent = entry.responseA.error;
    dom.messagesA.appendChild(divA);
  }

  if (entry.responseB?.text) {
    const divB = document.createElement("div");
    divB.className = "msg assistant";
    divB.innerHTML = renderMarkdown(entry.responseB.text);
    dom.messagesB.appendChild(divB);
  }
  if (entry.responseB?.error) {
    const divB = document.createElement("div");
    divB.className = "msg error";
    divB.textContent = entry.responseB.error;
    dom.messagesB.appendChild(divB);
  }

  // Show verdict
  dom.verdictBar.style.display = "flex";
  $$(".verdict-btn").forEach(btn => {
    btn.classList.toggle("selected", btn.dataset.verdict === entry.verdict);
  });

  // Show metrics
  abState.responseA = { text: entry.responseA?.text, ttft: entry.metrics?.ttftA, totalTime: entry.metrics?.timeA, usage: { output_tokens: entry.metrics?.tokensA } };
  abState.responseB = { text: entry.responseB?.text, ttft: entry.metrics?.ttftB, totalTime: entry.metrics?.timeB, usage: { output_tokens: entry.metrics?.tokensB } };
  showMetrics();
}

function exportHistory() {
  const data = JSON.stringify(abState.history, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ab-test-history-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function clearHistory() {
  if (!confirm("Clear all test history? This cannot be undone.")) return;
  abState.history = [];
  saveState();
  updateHistoryBadge();
  renderHistoryList();
  renderHistorySummary();
}

// ─── Theme ──────────────────────────────────────────────────────────────────

function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme");
  const next = current === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem("agentloop_theme", next);
  updateTheme();
}

function updateTheme() {
  const theme = document.documentElement.getAttribute("data-theme") || "dark";
  const darkIcon = $("#theme-icon-dark");
  const lightIcon = $("#theme-icon-light");
  if (darkIcon) darkIcon.style.display = theme === "dark" ? "inline" : "none";
  if (lightIcon) lightIcon.style.display = theme === "light" ? "inline" : "none";

  const hljsTheme = document.getElementById("hljs-theme");
  if (hljsTheme) {
    hljsTheme.href = theme === "dark"
      ? "https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11/build/styles/github-dark.min.css"
      : "https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11/build/styles/github.min.css";
  }
}

// ─── State Persistence ──────────────────────────────────────────────────────

function loadState() {
  try {
    const theme = localStorage.getItem("agentloop_theme") || "dark";
    document.documentElement.setAttribute("data-theme", theme);

    const saved = JSON.parse(localStorage.getItem("agentloop_ab_state") || "{}");
    abState.providerA = saved.providerA || "openai";
    abState.modelA = saved.modelA || "";
    abState.tempA = saved.tempA ?? 0.7;
    abState.maxTokensA = saved.maxTokensA || null;
    abState.providerB = saved.providerB || "anthropic";
    abState.modelB = saved.modelB || "";
    abState.tempB = saved.tempB ?? 0.7;
    abState.maxTokensB = saved.maxTokensB || null;
    abState.systemMessage = saved.systemMessage || "";
    abState.corsProxy = saved.corsProxy || "";
    abState.mode = saved.mode || "side-by-side";

    abState.history = JSON.parse(localStorage.getItem("agentloop_ab_history") || "[]");

    // Load custom providers if they exist
    if (typeof loadCustomProviders === "function") {
      const custom = loadCustomProviders();
      for (const [id, config] of Object.entries(custom)) {
        if (typeof registerCustomProvider === "function") {
          registerCustomProvider(id, config);
        }
      }
    }
  } catch {
    // Fresh start on error
  }
}

function saveState() {
  try {
    localStorage.setItem("agentloop_ab_state", JSON.stringify({
      providerA: abState.providerA,
      modelA: abState.modelA,
      tempA: abState.tempA,
      maxTokensA: abState.maxTokensA,
      providerB: abState.providerB,
      modelB: abState.modelB,
      tempB: abState.tempB,
      maxTokensB: abState.maxTokensB,
      systemMessage: abState.systemMessage,
      corsProxy: abState.corsProxy,
      mode: abState.mode,
    }));

    localStorage.setItem("agentloop_ab_history", JSON.stringify(abState.history));
  } catch {
    // localStorage might be full
  }
}

// ─── Boot ───────────────────────────────────────────────────────────────────

init();
