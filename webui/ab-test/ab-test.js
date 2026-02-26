/**
 * AgentLoop Model Arena — N-way A/B Testing
 *
 * Send the same prompt to 2–8 models simultaneously, compare responses
 * side-by-side, vote on the best, and track results over time.
 *
 * Reuses providers.js for API dispatch (buildRequest, getStreamParser, etc.)
 */

// ─── Constants ──────────────────────────────────────────────────────────────

const MAX_SLOTS = 8;
const MIN_SLOTS = 2;
const SLOT_COLORS = [
  { color: "var(--slot-0)", bg: "var(--slot-0-bg)" },
  { color: "var(--slot-1)", bg: "var(--slot-1-bg)" },
  { color: "var(--slot-2)", bg: "var(--slot-2-bg)" },
  { color: "var(--slot-3)", bg: "var(--slot-3-bg)" },
  { color: "var(--slot-4)", bg: "var(--slot-4-bg)" },
  { color: "var(--slot-5)", bg: "var(--slot-5-bg)" },
  { color: "var(--slot-6)", bg: "var(--slot-6-bg)" },
  { color: "var(--slot-7)", bg: "var(--slot-7-bg)" },
];
const SLOT_LETTERS = "ABCDEFGH";

const DEFAULT_PROVIDERS = Object.keys(CATALOG_PROVIDERS); // from catalog.generated.js

// ─── State ──────────────────────────────────────────────────────────────────

const state = {
  /**
   * slots: Array of model configurations.
   * Each slot: { id, provider, model, temp, maxTokens, response }
   * response: { text, usage, error, ttft, totalTime, startedAt, abortController }
   */
  slots: [],

  // Shared settings
  systemMessage: "",
  corsProxy: "",

  // Mode
  mode: "side-by-side", // "side-by-side" | "blind"
  blindRevealed: false,

  // Current test
  messages: [],
  isGenerating: false,

  // Verdict: index of winning slot, or "tie" / "all_bad" / null
  verdict: null,

  // History
  history: [],
};

// ─── DOM refs (static elements only; dynamic ones are queried as needed) ────

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const dom = {
  configPanel: $("#config-panel"),
  arena: $("#arena"),
  verdictBar: $("#verdict-bar"),
  verdictButtons: $("#verdict-buttons"),
  metricsBar: $("#metrics-bar"),
  metricsTable: $("#metrics-table"),

  systemMsg: $("#system-msg"),
  systemMsgToggle: $("#system-msg-toggle"),
  systemMsgPanel: $("#system-msg-panel"),

  userInput: $("#user-input"),
  sendBtn: $("#send-btn"),
  stopBtn: $("#stop-btn"),
  clearBtn: $("#clear-btn"),
  slotCountLabel: $("#slot-count-label"),

  historyBtn: $("#history-btn"),
  historyCount: $("#history-count"),
  historyOverlay: $("#history-overlay"),
  historyClose: $("#history-close"),
  historyList: $("#history-list"),
  historySummary: $("#history-summary"),
  exportHistoryBtn: $("#export-history-btn"),
  clearHistoryBtn: $("#clear-history-btn"),

  themeToggle: $("#theme-toggle"),
};

// ─── Init ───────────────────────────────────────────────────────────────────

function init() {
  loadState();

  // Ensure at least 2 slots
  if (state.slots.length < MIN_SLOTS) {
    state.slots = [
      makeSlot("openai", ""),
      makeSlot("anthropic", ""),
    ];
  }

  renderConfigPanel();
  renderArena();
  setupStaticListeners();
  updateTheme();
  updateHistoryBadge();
  updateSlotCountLabel();

  if (typeof marked !== "undefined") {
    marked.setOptions({
      breaks: true, gfm: true,
      highlight: (code, lang) => {
        if (typeof hljs !== "undefined" && lang && hljs.getLanguage(lang)) {
          try { return hljs.highlight(code, { language: lang }).value; } catch {}
        }
        return code;
      },
    });
  }
}

function makeSlot(provider, model) {
  return {
    id: genId(),
    provider: provider || "openai",
    model: model || "",
    temp: 0.7,
    maxTokens: null,
    response: null,
  };
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// ─── Static Event Listeners ─────────────────────────────────────────────────

function setupStaticListeners() {
  // System message
  dom.systemMsgToggle.addEventListener("click", () => {
    const open = dom.systemMsgPanel.style.display !== "none";
    dom.systemMsgPanel.style.display = open ? "none" : "block";
    dom.systemMsgToggle.classList.toggle("open", !open);
  });
  dom.systemMsg.addEventListener("input", () => {
    state.systemMessage = dom.systemMsg.value;
    saveState();
  });

  // Mode tabs
  $$(".mode-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      state.mode = tab.dataset.mode;
      $$(".mode-tab").forEach(t => t.classList.toggle("active", t === tab));
      applyMode();
      saveState();
    });
  });

  // Send
  dom.sendBtn.addEventListener("click", sendPrompt);
  dom.userInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendPrompt(); }
  });
  dom.userInput.addEventListener("input", autoResize);

  // Stop
  dom.stopBtn.addEventListener("click", stopAll);

  // Clear
  dom.clearBtn.addEventListener("click", clearArena);

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

  // Keyboard
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && dom.historyOverlay.style.display !== "none") {
      closeHistory(); return;
    }
    const isInput = e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT";
    if (!isInput && e.key === "/" && !state.isGenerating) {
      e.preventDefault(); dom.userInput.focus();
    }
  });
}

// ─── Config Panel Rendering ─────────────────────────────────────────────────

function renderConfigPanel() {
  dom.configPanel.innerHTML = "";

  state.slots.forEach((slot, idx) => {
    const letter = SLOT_LETTERS[idx] || `${idx + 1}`;
    const c = SLOT_COLORS[idx % SLOT_COLORS.length];
    const displayName = getModelDisplayName(slot.provider, slot.model);

    const card = document.createElement("div");
    card.className = "slot-card";
    card.dataset.slotId = slot.id;
    card.innerHTML = `
      <div class="slot-header">
        <span class="slot-label" style="background:${c.bg};color:${c.color}">Model ${letter}</span>
        <span class="slot-model-name">${esc(displayName)}</span>
        ${state.slots.length > MIN_SLOTS ? `<button class="slot-remove" data-slot-id="${slot.id}" title="Remove model"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>` : ""}
      </div>
      <div class="slot-selects">
        <select class="provider-select" data-slot-id="${slot.id}" title="Provider"></select>
        <span class="slot-sep">/</span>
        <select class="model-select" data-slot-id="${slot.id}" title="Model"></select>
      </div>
      <div class="slot-params">
        <label class="slot-param">
          <span>Temp</span>
          <input type="number" class="temp-input" data-slot-id="${slot.id}" min="0" max="2" step="0.1" value="${slot.temp}">
        </label>
        <label class="slot-param">
          <span>Max Tok</span>
          <input type="number" class="max-tokens-input" data-slot-id="${slot.id}" placeholder="auto" min="1" max="200000" value="${slot.maxTokens || ""}">
        </label>
        <label class="slot-param">
          <span>API Key</span>
          <input type="password" class="key-input" data-slot-id="${slot.id}" placeholder="sk-..." autocomplete="off" value="${getApiKey(slot.provider)}">
        </label>
      </div>`;

    dom.configPanel.appendChild(card);

    // Populate selects
    const provSelect = card.querySelector(".provider-select");
    const modelSelect = card.querySelector(".model-select");
    populateProviderSelect(provSelect, slot.provider);
    populateModelSelectForSlot(modelSelect, slot);

    // Event listeners
    provSelect.addEventListener("change", () => {
      slot.provider = provSelect.value;
      slot.model = "";
      populateModelSelectForSlot(modelSelect, slot);
      card.querySelector(".key-input").value = getApiKey(slot.provider);
      card.querySelector(".slot-model-name").textContent = getModelDisplayName(slot.provider, slot.model);
      updatePaneLabel(slot);
      saveState();
    });

    modelSelect.addEventListener("change", () => {
      slot.model = modelSelect.value;
      card.querySelector(".slot-model-name").textContent = getModelDisplayName(slot.provider, slot.model);
      updatePaneLabel(slot);
      saveState();
    });

    card.querySelector(".temp-input").addEventListener("change", (e) => {
      slot.temp = parseFloat(e.target.value) || 0.7;
      saveState();
    });

    card.querySelector(".max-tokens-input").addEventListener("change", (e) => {
      slot.maxTokens = e.target.value ? parseInt(e.target.value) : null;
      saveState();
    });

    card.querySelector(".key-input").addEventListener("change", (e) => {
      setApiKey(slot.provider, e.target.value);
    });

    // Remove button
    const removeBtn = card.querySelector(".slot-remove");
    if (removeBtn) {
      removeBtn.addEventListener("click", () => removeSlot(slot.id));
    }
  });

  // Add Model button
  if (state.slots.length < MAX_SLOTS) {
    const addBtn = document.createElement("button");
    addBtn.className = "add-slot-card";
    addBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Add Model`;
    addBtn.addEventListener("click", addSlot);
    dom.configPanel.appendChild(addBtn);
  }

  applyMode();
}

function populateProviderSelect(select, currentProvider) {
  const builtIn = ["openai", "anthropic", "google", "groq", "together", "mistral", "deepseek", "fireworks", "perplexity", "cohere", "xai", "ollama"];
  let html = "";
  for (const id of builtIn) {
    const p = PROVIDERS[id];
    if (p) html += `<option value="${id}" ${id === currentProvider ? "selected" : ""}>${p.name}</option>`;
  }
  select.innerHTML = html;
}

function populateModelSelectForSlot(select, slot) {
  const models = getModelsForProvider(slot.provider, "chat", "");
  let html = "";
  for (const m of models) {
    html += `<option value="${esc(m.id)}">${esc(m.name)}</option>`;
  }
  html += `<option value="">Custom...</option>`;
  select.innerHTML = html;

  if (slot.model && [...select.options].some(o => o.value === slot.model)) {
    select.value = slot.model;
  } else if (models.length > 0) {
    const def = models.find(m => m.isDefault) || models[0];
    select.value = def.id;
    slot.model = def.id;
  }
}

function addSlot() {
  if (state.slots.length >= MAX_SLOTS) return;

  // Pick a provider not yet used, falling back to the list
  const usedProviders = new Set(state.slots.map(s => s.provider));
  const nextProvider = DEFAULT_PROVIDERS.find(p => !usedProviders.has(p)) || "openai";

  state.slots.push(makeSlot(nextProvider, ""));
  renderConfigPanel();
  renderArena();
  updateSlotCountLabel();
  saveState();

  // Scroll config panel to the right to show the new card
  dom.configPanel.scrollLeft = dom.configPanel.scrollWidth;
}

function removeSlot(slotId) {
  if (state.slots.length <= MIN_SLOTS) return;
  state.slots = state.slots.filter(s => s.id !== slotId);
  renderConfigPanel();
  renderArena();
  updateSlotCountLabel();
  saveState();
}

function updateSlotCountLabel() {
  dom.slotCountLabel.textContent = `Same prompt sent to ${state.slots.length} model${state.slots.length > 1 ? "s" : ""} simultaneously`;
}

// ─── Arena Rendering ────────────────────────────────────────────────────────

function renderArena() {
  dom.arena.innerHTML = "";

  state.slots.forEach((slot, idx) => {
    const letter = SLOT_LETTERS[idx] || `${idx + 1}`;
    const c = SLOT_COLORS[idx % SLOT_COLORS.length];
    const displayName = (state.mode === "blind" && !state.blindRevealed)
      ? `Model ${letter}`
      : (getModelDisplayName(slot.provider, slot.model) || `Model ${letter}`);

    const pane = document.createElement("div");
    pane.className = "arena-pane";
    pane.dataset.slotId = slot.id;
    pane.innerHTML = `
      <div class="pane-header">
        <span class="pane-label" data-slot-id="${slot.id}" style="background:${c.bg};color:${c.color}">${esc(displayName)}</span>
        <span class="pane-status" data-slot-id="${slot.id}"></span>
      </div>
      <div class="pane-messages" data-slot-id="${slot.id}">
        <div class="arena-welcome"><p>Model ${letter}</p></div>
      </div>`;
    dom.arena.appendChild(pane);
  });
}

function updatePaneLabel(slot) {
  const label = dom.arena.querySelector(`.pane-label[data-slot-id="${slot.id}"]`);
  if (!label) return;
  const idx = state.slots.findIndex(s => s.id === slot.id);
  const letter = SLOT_LETTERS[idx] || `${idx + 1}`;

  if (state.mode === "blind" && !state.blindRevealed) {
    label.textContent = `Model ${letter}`;
  } else {
    label.textContent = getModelDisplayName(slot.provider, slot.model) || `Model ${letter}`;
  }
}

// ─── Send Prompt (N-way parallel dispatch) ──────────────────────────────────

async function sendPrompt() {
  const text = dom.userInput.value.trim();
  if (!text || state.isGenerating) return;

  state.isGenerating = true;
  state.verdict = null;
  state.blindRevealed = false;

  // Initialize response objects for each slot
  const now = performance.now();
  for (const slot of state.slots) {
    slot.response = {
      text: "", usage: null, error: null,
      ttft: null, totalTime: null, startedAt: now,
      abortController: new AbortController(),
    };
  }

  state.messages.push({ role: "user", content: text });

  // Clear input
  dom.userInput.value = "";
  autoResize();

  // Hide previous verdict/metrics
  dom.verdictBar.style.display = "none";
  dom.metricsBar.style.display = "none";

  // Render user message and streaming placeholder in each pane
  const streamEls = {};
  for (const slot of state.slots) {
    const paneMessages = dom.arena.querySelector(`.pane-messages[data-slot-id="${slot.id}"]`);
    if (!paneMessages) continue;
    appendUserMessage(paneMessages, text);
    streamEls[slot.id] = appendStreamingPlaceholder(paneMessages);
  }

  updateUI(true);

  // Dispatch to all slots in parallel
  const promises = state.slots.map(slot =>
    dispatchToSlot(slot, text, streamEls[slot.id])
  );

  await Promise.allSettled(promises);

  state.isGenerating = false;
  updateUI(false);

  // Show verdict and metrics
  renderVerdictButtons();
  dom.verdictBar.style.display = "flex";
  showMetrics();

  saveState();
}

async function dispatchToSlot(slot, text, streamEl) {
  const statusEl = dom.arena.querySelector(`.pane-status[data-slot-id="${slot.id}"]`);
  const paneMessages = dom.arena.querySelector(`.pane-messages[data-slot-id="${slot.id}"]`);
  const response = slot.response;
  const signal = response.abortController.signal;
  const model = slot.model || PROVIDERS[slot.provider]?.defaultModel || "";

  if (statusEl) { statusEl.textContent = "connecting..."; statusEl.className = "pane-status streaming"; }

  try {
    const apiMessages = state.messages
      .filter(m => m.role === "user")
      .map(m => ({ role: "user", content: m.content }));

    const { url, headers, body } = buildRequest({
      provider: slot.provider,
      model,
      messages: apiMessages,
      systemMessage: state.systemMessage,
      temperature: slot.temp,
      maxTokens: slot.maxTokens,
      topP: 1,
      stream: true,
      corsProxy: state.corsProxy,
    });

    const fetchResp = await fetch(url, {
      method: "POST", headers, body: JSON.stringify(body), signal,
    });

    if (!fetchResp.ok) {
      const errBody = await fetchResp.text();
      let errMsg;
      try {
        const p = JSON.parse(errBody);
        errMsg = p.error?.message || p.message || p.error || errBody;
        if (typeof errMsg === "object") errMsg = JSON.stringify(errMsg);
      } catch { errMsg = errBody; }
      throw new Error(`${fetchResp.status}: ${errMsg}`);
    }

    const reader = fetchResp.body.getReader();
    const parser = getStreamParser(slot.provider);
    let fullText = "";
    let rawUsage = null;
    let firstToken = true;

    if (statusEl) statusEl.textContent = "streaming...";

    for await (const event of parser(reader)) {
      if (signal.aborted) break;
      switch (event.type) {
        case "delta":
          if (firstToken) { response.ttft = performance.now() - response.startedAt; firstToken = false; }
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
    response.usage = normalizeUsage(slot.provider, rawUsage);
    finalizeStreamingContent(streamEl, fullText);

    if (statusEl) { statusEl.textContent = formatMs(response.totalTime); statusEl.className = "pane-status"; }
  } catch (err) {
    if (err.name === "AbortError") {
      response.error = "Cancelled";
      if (statusEl) statusEl.textContent = "cancelled";
    } else {
      response.error = err.message;
      if (statusEl) { statusEl.textContent = "error"; statusEl.className = "pane-status error"; }
      appendError(paneMessages, streamEl, err.message);
    }
    response.totalTime = performance.now() - response.startedAt;
  }
}

// ─── Message Rendering ──────────────────────────────────────────────────────

function appendUserMessage(container, text) {
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
  const content = el?.querySelector(".streaming-content");
  if (!content) return;
  content.innerHTML = renderMarkdown(text);
  content.classList.add("streaming-cursor");
  const pane = el.closest(".pane-messages");
  if (pane) pane.scrollTop = pane.scrollHeight;
}

function finalizeStreamingContent(el, text) {
  const content = el?.querySelector(".streaming-content");
  if (!content) return;
  content.innerHTML = renderMarkdown(text);
  content.classList.remove("streaming-cursor");
  content.querySelectorAll("pre code").forEach(block => {
    if (typeof hljs !== "undefined") hljs.highlightElement(block);
  });
  addCopyButtons(content);
}

function appendError(container, streamEl, message) {
  if (streamEl) { streamEl.className = "msg error"; streamEl.innerHTML = esc(message); }
}

function renderMarkdown(text) {
  if (!text) return "";
  if (typeof marked !== "undefined") { try { return marked.parse(text); } catch {} }
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

function renderVerdictButtons() {
  let html = "";

  // One button per slot: "A wins", "B wins", "C wins"...
  state.slots.forEach((slot, idx) => {
    const letter = SLOT_LETTERS[idx] || `${idx + 1}`;
    const c = SLOT_COLORS[idx % SLOT_COLORS.length];
    html += `<button class="verdict-btn" data-verdict="${idx}" style="--v-color:${c.color};--v-bg:${c.bg}">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>
      ${letter} wins</button>`;
  });

  // Tie and All Bad
  html += `<button class="verdict-btn verdict-tie" data-verdict="tie">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/></svg>
    Tie</button>`;
  html += `<button class="verdict-btn verdict-bad" data-verdict="all_bad">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 15V9a3 3 0 0 1 3-3l4 9v-11H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3z"/><path d="M17 2h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3"/></svg>
    All Bad</button>`;

  dom.verdictButtons.innerHTML = html;

  // Attach listeners
  dom.verdictButtons.querySelectorAll(".verdict-btn").forEach(btn => {
    btn.addEventListener("click", () => recordVerdict(btn.dataset.verdict));
  });
}

function recordVerdict(verdict) {
  state.verdict = verdict;

  // Highlight selected
  dom.verdictButtons.querySelectorAll(".verdict-btn").forEach(btn => {
    const isSelected = btn.dataset.verdict === verdict;
    btn.classList.toggle("selected", isSelected);
    // For slot-specific buttons, apply slot color on select
    if (isSelected && verdict !== "tie" && verdict !== "all_bad") {
      const idx = parseInt(verdict);
      const c = SLOT_COLORS[idx % SLOT_COLORS.length];
      btn.style.borderColor = `${c.color}`;
      btn.style.background = `${c.bg}`;
      btn.style.color = `${c.color}`;
    } else if (!isSelected && verdict !== "tie" && verdict !== "all_bad") {
      // Reset non-selected slot buttons
    }
  });

  // In blind mode, reveal
  if (state.mode === "blind" && !state.blindRevealed) {
    state.blindRevealed = true;
    document.body.classList.add("revealed");
    state.slots.forEach(slot => updatePaneLabel(slot));
    renderConfigPanel();
  }

  // Save to history
  const lastPrompt = state.messages.filter(m => m.role === "user").pop()?.content || "";
  const entry = {
    id: genId(),
    prompt: lastPrompt,
    slots: state.slots.map((slot, idx) => ({
      provider: slot.provider,
      model: slot.model,
      label: SLOT_LETTERS[idx] || `${idx + 1}`,
      responseText: slot.response?.text || "",
      responseError: slot.response?.error || null,
      ttft: slot.response?.ttft,
      totalTime: slot.response?.totalTime,
      outputTokens: slot.response?.usage?.output_tokens || 0,
    })),
    verdict,
    timestamp: Date.now(),
  };

  state.history.push(entry);
  saveState();
  updateHistoryBadge();
}

// ─── Metrics ────────────────────────────────────────────────────────────────

function showMetrics() {
  dom.metricsBar.style.display = "block";

  const slots = state.slots;
  const n = slots.length;

  // Column headers: one per slot
  let headerRow = `<tr><th></th>`;
  slots.forEach((slot, idx) => {
    const c = SLOT_COLORS[idx % SLOT_COLORS.length];
    const letter = SLOT_LETTERS[idx] || `${idx + 1}`;
    headerRow += `<th style="color:${c.color}">${letter}</th>`;
  });
  headerRow += `</tr>`;

  // Metrics rows
  const metrics = [
    { label: "TTFT", key: "ttft", format: formatMs, winRule: "lower" },
    { label: "Total Time", key: "totalTime", format: formatMs, winRule: "lower" },
    { label: "Output Tokens", key: "tokens", format: fmtNum, winRule: null },
    { label: "Tokens/sec", key: "tps", format: v => v ? v.toFixed(1) : "—", winRule: "higher" },
  ];

  let bodyRows = "";
  for (const m of metrics) {
    const values = slots.map(slot => {
      const r = slot.response;
      if (!r) return null;
      if (m.key === "ttft") return r.ttft;
      if (m.key === "totalTime") return r.totalTime;
      if (m.key === "tokens") return r.usage?.output_tokens || 0;
      if (m.key === "tps") {
        const tok = r.usage?.output_tokens || 0;
        return (r.totalTime && tok) ? (tok / (r.totalTime / 1000)) : 0;
      }
      return null;
    });

    // Determine winner
    let winnerIdx = -1;
    if (m.winRule) {
      const validValues = values.map((v, i) => (v != null && v > 0) ? { v, i } : null).filter(Boolean);
      if (validValues.length > 0) {
        if (m.winRule === "lower") {
          validValues.sort((a, b) => a.v - b.v);
        } else {
          validValues.sort((a, b) => b.v - a.v);
        }
        winnerIdx = validValues[0].i;
      }
    }

    bodyRows += `<tr><td class="metric-label-cell">${m.label}</td>`;
    values.forEach((v, idx) => {
      const c = SLOT_COLORS[idx % SLOT_COLORS.length];
      const cls = (idx === winnerIdx) ? " winner" : "";
      const display = (v != null && v > 0) ? m.format(v) : "—";
      bodyRows += `<td style="color:${c.color}" class="${cls}">${display}</td>`;
    });
    bodyRows += `</tr>`;
  }

  dom.metricsTable.innerHTML = headerRow + bodyRows;
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
  for (const slot of state.slots) {
    if (slot.response?.abortController) slot.response.abortController.abort();
  }
}

function clearArena() {
  state.messages = [];
  state.verdict = null;
  state.blindRevealed = false;
  for (const slot of state.slots) slot.response = null;

  renderArena();
  dom.verdictBar.style.display = "none";
  dom.metricsBar.style.display = "none";
  applyMode();
  saveState();
}

function getModelDisplayName(provider, modelId) {
  if (!modelId) return "";
  const cat = MODEL_CATALOG.find(m => m.provider === provider && m.id === modelId);
  return cat ? cat.name : modelId;
}

// ─── Mode ───────────────────────────────────────────────────────────────────

function applyMode() {
  document.body.classList.remove("blind-mode", "revealed");
  state.blindRevealed = false;

  if (state.mode === "blind") {
    document.body.classList.add("blind-mode");
    // Reset pane labels to generic
    state.slots.forEach((slot, idx) => {
      const label = dom.arena.querySelector(`.pane-label[data-slot-id="${slot.id}"]`);
      if (label) label.textContent = `Model ${SLOT_LETTERS[idx] || idx + 1}`;
    });
  } else {
    state.slots.forEach(slot => updatePaneLabel(slot));
  }
}

// ─── History ────────────────────────────────────────────────────────────────

function openHistory() {
  renderHistoryList();
  renderHistorySummary();
  dom.historyOverlay.style.display = "flex";
}

function closeHistory() { dom.historyOverlay.style.display = "none"; }

function updateHistoryBadge() {
  dom.historyCount.textContent = state.history.length || "";
}

function renderHistorySummary() {
  const h = state.history;
  if (h.length === 0) { dom.historySummary.innerHTML = ""; return; }

  // Count wins per model (aggregate by provider/model)
  const modelWins = {};
  let ties = 0, allBad = 0;

  for (const entry of h) {
    if (entry.verdict === "tie") { ties++; continue; }
    if (entry.verdict === "all_bad") { allBad++; continue; }
    const winIdx = parseInt(entry.verdict);
    if (isNaN(winIdx) || !entry.slots[winIdx]) continue;
    const winner = entry.slots[winIdx];
    const key = `${winner.provider}/${winner.model}`;
    modelWins[key] = (modelWins[key] || 0) + 1;
  }

  // Sort by wins
  const sorted = Object.entries(modelWins).sort((a, b) => b[1] - a[1]);

  let html = `<div class="summary-stat"><div class="summary-stat-value">${h.length}</div><div class="summary-stat-label">Tests</div></div>`;
  html += `<div class="summary-stat"><div class="summary-stat-value" style="color:var(--color-tie)">${ties}</div><div class="summary-stat-label">Ties</div></div>`;
  html += `<div class="summary-stat"><div class="summary-stat-value" style="color:var(--color-bad)">${allBad}</div><div class="summary-stat-label">All Bad</div></div>`;

  for (const [key, wins] of sorted.slice(0, 5)) {
    const name = getModelDisplayName(key.split("/")[0], key.split("/").slice(1).join("/")) || key;
    html += `<div class="summary-stat"><div class="summary-stat-value" style="color:var(--success)">${wins}</div><div class="summary-stat-label">${esc(name)}</div></div>`;
  }

  dom.historySummary.innerHTML = html;
}

function renderHistoryList() {
  const h = state.history;
  if (h.length === 0) {
    dom.historyList.innerHTML = `<div class="history-empty">No tests yet. Send a prompt to get started.</div>`;
    return;
  }

  dom.historyList.innerHTML = [...h].reverse().map(entry => {
    let verdictLabel, verdictStyle;
    if (entry.verdict === "tie") {
      verdictLabel = "Tie";
      verdictStyle = "background:rgba(139,92,246,0.15);color:var(--color-tie)";
    } else if (entry.verdict === "all_bad") {
      verdictLabel = "All Bad";
      verdictStyle = "background:rgba(239,68,68,0.1);color:var(--color-bad)";
    } else {
      const winIdx = parseInt(entry.verdict);
      const winner = entry.slots[winIdx];
      const letter = SLOT_LETTERS[winIdx] || `${winIdx + 1}`;
      const c = SLOT_COLORS[winIdx % SLOT_COLORS.length];
      verdictLabel = `${letter} Wins`;
      verdictStyle = `background:${c.bg};color:${c.color}`;
    }

    const models = entry.slots.map((s, i) => {
      const c = SLOT_COLORS[i % SLOT_COLORS.length];
      const name = getModelDisplayName(s.provider, s.model) || s.model;
      return `<span style="color:${c.color}">${esc(name)}</span>`;
    }).join(` <span style="color:var(--text-muted)">vs</span> `);

    const date = new Date(entry.timestamp).toLocaleString();

    return `
      <div class="history-item" data-id="${entry.id}">
        <div class="history-item-header">
          <span class="history-item-prompt" title="${esc(entry.prompt)}">${esc(entry.prompt)}</span>
          <span class="history-item-verdict" style="${verdictStyle}">${verdictLabel}</span>
        </div>
        <div class="history-item-models">${models}</div>
        <div class="history-item-date">${date}</div>
      </div>`;
  }).join("");

  dom.historyList.querySelectorAll(".history-item").forEach(item => {
    item.addEventListener("click", () => {
      const entry = state.history.find(e => e.id === item.dataset.id);
      if (entry) { restoreHistoryEntry(entry); closeHistory(); }
    });
  });
}

function restoreHistoryEntry(entry) {
  clearArena();

  // Show prompt and responses in each pane
  const panes = dom.arena.querySelectorAll(".pane-messages");
  entry.slots.forEach((s, idx) => {
    if (!panes[idx]) return;
    appendUserMessage(panes[idx], entry.prompt);
    if (s.responseText) {
      const div = document.createElement("div");
      div.className = "msg assistant";
      div.innerHTML = renderMarkdown(s.responseText);
      panes[idx].appendChild(div);
    }
    if (s.responseError) {
      const div = document.createElement("div");
      div.className = "msg error";
      div.textContent = s.responseError;
      panes[idx].appendChild(div);
    }
  });

  // Show verdict
  renderVerdictButtons();
  dom.verdictBar.style.display = "flex";
  dom.verdictButtons.querySelectorAll(".verdict-btn").forEach(btn => {
    btn.classList.toggle("selected", btn.dataset.verdict === entry.verdict);
  });

  // Restore metrics
  entry.slots.forEach((s, idx) => {
    if (state.slots[idx]) {
      state.slots[idx].response = {
        text: s.responseText, ttft: s.ttft, totalTime: s.totalTime,
        usage: { output_tokens: s.outputTokens },
      };
    }
  });
  showMetrics();
}

function exportHistory() {
  const data = JSON.stringify(state.history, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `arena-history-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function clearHistory() {
  if (!confirm("Clear all test history? This cannot be undone.")) return;
  state.history = [];
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

    const saved = JSON.parse(localStorage.getItem("agentloop_arena_state") || "{}");
    if (saved.slots && Array.isArray(saved.slots)) {
      state.slots = saved.slots.map(s => ({
        id: s.id || genId(),
        provider: s.provider || "openai",
        model: s.model || "",
        temp: s.temp ?? 0.7,
        maxTokens: s.maxTokens || null,
        response: null,
      }));
    }
    state.systemMessage = saved.systemMessage || "";
    state.corsProxy = saved.corsProxy || "";
    state.mode = saved.mode || "side-by-side";

    state.history = JSON.parse(localStorage.getItem("agentloop_arena_history") || "[]");

    // Migrate old A/B state if present
    if (state.slots.length === 0) {
      const old = JSON.parse(localStorage.getItem("agentloop_ab_state") || "{}");
      if (old.providerA) {
        state.slots = [
          makeSlot(old.providerA, old.modelA),
          makeSlot(old.providerB, old.modelB),
        ];
        state.slots[0].temp = old.tempA ?? 0.7;
        state.slots[1].temp = old.tempB ?? 0.7;
        state.systemMessage = old.systemMessage || "";
        state.mode = old.mode || "side-by-side";
      }
      const oldHistory = JSON.parse(localStorage.getItem("agentloop_ab_history") || "[]");
      if (oldHistory.length > 0 && state.history.length === 0) {
        state.history = oldHistory.map(e => ({
          id: e.id,
          prompt: e.prompt,
          slots: [
            { provider: e.providerA, model: e.modelA, label: "A", responseText: e.responseA?.text || "", responseError: e.responseA?.error || null, ttft: e.metrics?.ttftA, totalTime: e.metrics?.timeA, outputTokens: e.metrics?.tokensA || 0 },
            { provider: e.providerB, model: e.modelB, label: "B", responseText: e.responseB?.text || "", responseError: e.responseB?.error || null, ttft: e.metrics?.ttftB, totalTime: e.metrics?.timeB, outputTokens: e.metrics?.tokensB || 0 },
          ],
          verdict: e.verdict === "a" ? "0" : e.verdict === "b" ? "1" : e.verdict,
          timestamp: e.timestamp,
        }));
      }
    }

    // Load custom providers
    if (typeof loadCustomProviders === "function") {
      const custom = loadCustomProviders();
      for (const [id, config] of Object.entries(custom)) {
        if (typeof registerCustomProvider === "function") registerCustomProvider(id, config);
      }
    }
  } catch { /* fresh start */ }
}

function saveState() {
  try {
    localStorage.setItem("agentloop_arena_state", JSON.stringify({
      slots: state.slots.map(s => ({
        id: s.id, provider: s.provider, model: s.model,
        temp: s.temp, maxTokens: s.maxTokens,
      })),
      systemMessage: state.systemMessage,
      corsProxy: state.corsProxy,
      mode: state.mode,
    }));
    localStorage.setItem("agentloop_arena_history", JSON.stringify(state.history));
  } catch { /* localStorage might be full */ }
}

// ─── Boot ───────────────────────────────────────────────────────────────────

init();
