/**
 * AgentLoop WebUI — Main Application
 *
 * Chat interface with streaming support for 12 LLM providers.
 * BYOK — API keys stored in localStorage, never leave the browser.
 */

// ─── State ──────────────────────────────────────────────────────────────────

const state = {
  provider: "openai",
  model: "",
  systemMessage: "",
  temperature: 0.7,
  maxTokens: null,
  topP: 1,
  streaming: true,
  corsProxy: "",
  chats: [],        // { id, title, provider, model, messages[] }
  activeChatId: null,
  isGenerating: false,
  abortController: null,
  modelDropdownOpen: false,
  highlightedModelIndex: -1,
};

// ─── DOM Elements ───────────────────────────────────────────────────────────

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const dom = {
  sidebar: $("#sidebar"),
  sidebarClose: $("#sidebar-close"),
  sidebarOpen: $("#sidebar-open"),
  providerSelect: $("#provider-select"),
  addProviderBtn: $("#add-provider-btn"),
  modelSelector: $("#model-selector"),
  modelTrigger: $("#model-trigger"),
  modelTriggerName: $("#model-trigger-name"),
  modelTriggerMeta: $("#model-trigger-meta"),
  modelDropdown: $("#model-dropdown"),
  modelSearch: $("#model-search"),
  modelList: $("#model-list"),
  modelDropdownFooter: $("#model-dropdown-footer"),
  apiKeyInput: $("#api-key-input"),
  toggleKeyVis: $("#toggle-key-vis"),
  systemMsg: $("#system-msg"),
  temperature: $("#temperature"),
  temperatureValue: $("#temperature-value"),
  maxTokens: $("#max-tokens"),
  topP: $("#top-p"),
  topPValue: $("#top-p-value"),
  streamToggle: $("#stream-toggle"),
  corsProxy: $("#cors-proxy"),
  customEndpoint: $("#custom-endpoint"),
  customHeaders: $("#custom-headers"),
  endpointDefault: $("#endpoint-default"),
  themeToggle: $("#theme-toggle"),
  themeLabel: $("#theme-label"),
  themeIconDark: $("#theme-icon-dark"),
  themeIconLight: $("#theme-icon-light"),
  newChatBtn: $("#new-chat-btn"),
  clearChatBtn: $("#clear-chat-btn"),
  exportBtn: $("#export-btn"),
  chatSearch: $("#chat-search"),
  chatCount: $("#chat-count"),
  chatList: $("#chat-list"),
  messages: $("#messages"),
  userInput: $("#user-input"),
  sendBtn: $("#send-btn"),
  stopBtn: $("#stop-btn"),
  tokenCount: $("#token-count"),
  topbarProvider: $("#topbar-provider"),
  topbarModel: $("#topbar-model"),
  statsToggle: $("#stats-toggle"),
  statsClose: $("#stats-close"),
  statsPopover: $("#stats-popover"),
  statsBody: $("#stats-body"),
  topbarTokenCount: $("#topbar-token-count"),
};

// ─── Initialization ─────────────────────────────────────────────────────────

function init() {
  loadState();
  rebuildProviderSelect();
  setupEventListeners();
  applyProvider(state.provider);
  updateTheme();
  renderChatList();

  if (state.activeChatId) {
    renderMessages();
  }

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
  // Sidebar toggle
  dom.sidebarClose.addEventListener("click", () => toggleSidebar(false));
  dom.sidebarOpen.addEventListener("click", () => toggleSidebar(true));

  // Click overlay to close sidebar on mobile
  document.addEventListener("click", (e) => {
    if (e.target.classList?.contains("sidebar-overlay")) {
      toggleSidebar(false);
    }
  });

  // Provider change
  dom.providerSelect.addEventListener("change", (e) => {
    state.provider = e.target.value;
    state.model = ""; // Reset model on provider change
    applyProvider(state.provider);
    saveState();
  });

  // Add custom provider button
  dom.addProviderBtn.addEventListener("click", showCustomProviderDialog);

  // Model selector
  dom.modelTrigger.addEventListener("click", toggleModelDropdown);
  dom.modelSearch.addEventListener("input", () => {
    renderModelList();
    updateCustomModelFooter();
  });
  dom.modelSearch.addEventListener("keydown", handleModelSearchKeydown);

  // Close model dropdown on click outside
  document.addEventListener("click", (e) => {
    if (state.modelDropdownOpen && !dom.modelSelector.contains(e.target)) {
      closeModelDropdown();
    }
  });

  // API key input
  dom.apiKeyInput.addEventListener("input", (e) => {
    setApiKey(state.provider, e.target.value);
  });

  // Toggle key visibility
  dom.toggleKeyVis.addEventListener("click", () => {
    const input = dom.apiKeyInput;
    input.type = input.type === "password" ? "text" : "password";
  });

  // System message
  dom.systemMsg.addEventListener("input", (e) => {
    state.systemMessage = e.target.value;
    saveState();
  });

  // Temperature
  dom.temperature.addEventListener("input", (e) => {
    state.temperature = parseFloat(e.target.value);
    dom.temperatureValue.textContent = state.temperature.toFixed(1);
    saveState();
  });

  // Max tokens
  dom.maxTokens.addEventListener("input", (e) => {
    state.maxTokens = e.target.value ? parseInt(e.target.value) : null;
    saveState();
  });

  // Top P
  dom.topP.addEventListener("input", (e) => {
    state.topP = parseFloat(e.target.value);
    dom.topPValue.textContent = state.topP.toFixed(2);
    saveState();
  });

  // Stream toggle
  dom.streamToggle.addEventListener("change", (e) => {
    state.streaming = e.target.checked;
    saveState();
  });

  // CORS proxy
  dom.corsProxy.addEventListener("input", (e) => {
    state.corsProxy = e.target.value;
    saveState();
  });

  // Custom endpoint (per-provider)
  dom.customEndpoint.addEventListener("change", (e) => {
    saveCurrentEndpointOverride();
  });

  // Custom headers (per-provider)
  dom.customHeaders.addEventListener("change", (e) => {
    saveCurrentEndpointOverride();
  });

  // Theme toggle
  dom.themeToggle.addEventListener("click", toggleTheme);

  // New chat
  dom.newChatBtn.addEventListener("click", newChat);

  // Clear chat
  dom.clearChatBtn.addEventListener("click", clearCurrentChat);

  // Export
  dom.exportBtn.addEventListener("click", exportChat);

  // Stats popover
  dom.statsToggle.addEventListener("click", toggleStatsPopover);
  dom.statsClose.addEventListener("click", () => { dom.statsPopover.style.display = "none"; });

  // Send message
  dom.sendBtn.addEventListener("click", sendMessage);
  dom.stopBtn.addEventListener("click", stopGeneration);

  // Textarea auto-resize and enter to send
  dom.userInput.addEventListener("input", autoResize);
  dom.userInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Chat search/filter
  dom.chatSearch.addEventListener("input", renderChatList);

  // Keyboard shortcuts
  document.addEventListener("keydown", handleKeyboardShortcuts);
}

// ─── Keyboard Shortcuts ──────────────────────────────────────────────────────

function handleKeyboardShortcuts(e) {
  // Don't fire shortcuts when typing in inputs (except Escape)
  const isInput = e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT";

  // Escape: close model dropdown, close sidebar, or blur active input
  if (e.key === "Escape") {
    if (state.modelDropdownOpen) {
      closeModelDropdown();
      return;
    }
    if (isInput) {
      e.target.blur();
      return;
    }
    if (window.innerWidth <= 768 && !dom.sidebar.classList.contains("collapsed")) {
      toggleSidebar(false);
      return;
    }
  }

  if (isInput) return;

  // Ctrl/Cmd + N: New chat
  if ((e.ctrlKey || e.metaKey) && e.key === "n") {
    e.preventDefault();
    newChat();
    return;
  }

  // Ctrl/Cmd + Shift + S: Toggle sidebar
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "S") {
    e.preventDefault();
    const isCollapsed = dom.sidebar.classList.contains("collapsed");
    toggleSidebar(isCollapsed);
    return;
  }

  // Ctrl/Cmd + K: Focus chat search
  if ((e.ctrlKey || e.metaKey) && e.key === "k") {
    e.preventDefault();
    if (dom.sidebar.classList.contains("collapsed")) {
      toggleSidebar(true);
    }
    dom.chatSearch.focus();
    return;
  }

  // /: Focus message input
  if (e.key === "/" && !state.isGenerating) {
    e.preventDefault();
    dom.userInput.focus();
    return;
  }
}

// ─── Sidebar ────────────────────────────────────────────────────────────────

function toggleSidebar(open) {
  dom.sidebar.classList.toggle("collapsed", !open);

  // Manage overlay for mobile
  let overlay = document.querySelector(".sidebar-overlay");
  if (open && window.innerWidth <= 768) {
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.className = "sidebar-overlay visible";
      document.body.appendChild(overlay);
    } else {
      overlay.classList.add("visible");
    }
  } else if (overlay) {
    overlay.classList.remove("visible");
  }
}

// ─── Provider Handling ──────────────────────────────────────────────────────

/** Rebuild the provider <select> to include custom providers */
function rebuildProviderSelect() {
  const builtInProviders = ["openai", "anthropic", "google", "groq", "together", "mistral", "deepseek", "fireworks", "perplexity", "cohere", "xai", "ollama"];
  const customProviders = Object.keys(PROVIDERS).filter(id => PROVIDERS[id].isCustom);

  let html = "";
  for (const id of builtInProviders) {
    const p = PROVIDERS[id];
    if (p) html += `<option value="${id}">${p.name}</option>`;
  }

  if (customProviders.length > 0) {
    html += `<optgroup label="Custom Providers">`;
    for (const id of customProviders) {
      html += `<option value="${id}">${PROVIDERS[id].name}</option>`;
    }
    html += `</optgroup>`;
  }

  dom.providerSelect.innerHTML = html;
}

function applyProvider(provider) {
  const entry = PROVIDERS[provider];
  if (!entry) return;

  dom.providerSelect.value = provider;

  // Set model — try catalog default, then provider default, then keep current
  if (!state.model) {
    const catDefault = getCatalogDefault(provider);
    state.model = catDefault ? catDefault.id : entry.defaultModel;
  }

  // Update model trigger display
  updateModelTrigger();

  // Load API key
  dom.apiKeyInput.value = getApiKey(provider);
  dom.apiKeyInput.type = "password";

  // Update CORS note
  dom.corsProxy.placeholder = entry.corsNote || "https://corsproxy.io/?";

  // System message
  dom.systemMsg.value = state.systemMessage;

  // Parameters
  dom.temperature.value = state.temperature;
  dom.temperatureValue.textContent = state.temperature.toFixed(1);
  dom.maxTokens.value = state.maxTokens || "";
  dom.topP.value = state.topP;
  dom.topPValue.textContent = state.topP.toFixed(2);
  dom.streamToggle.checked = state.streaming;
  dom.corsProxy.value = state.corsProxy;

  // Endpoint configuration
  dom.endpointDefault.textContent = entry.baseURL;
  const overrides = loadEndpointOverrides();
  const override = overrides[provider] || {};
  dom.customEndpoint.value = override.baseURL || "";
  dom.customHeaders.value = override.headers ? JSON.stringify(override.headers, null, 2) : "";

  updateTopbar();
}

function updateTopbar() {
  const entry = PROVIDERS[state.provider];
  dom.topbarProvider.textContent = entry?.name || state.provider;
  dom.topbarModel.textContent = state.model || entry?.defaultModel || "";
}

// ─── Model Selector ─────────────────────────────────────────────────────────

function updateModelTrigger() {
  const catalogModel = MODEL_CATALOG.find(m => m.provider === state.provider && m.id === state.model);
  if (catalogModel) {
    dom.modelTriggerName.textContent = catalogModel.name;
    dom.modelTriggerMeta.textContent = catalogModel.ctx ? fmtCtx(catalogModel.ctx) : "";
  } else if (state.model) {
    dom.modelTriggerName.textContent = state.model;
    dom.modelTriggerMeta.textContent = "custom";
  } else {
    dom.modelTriggerName.textContent = "Select a model";
    dom.modelTriggerMeta.textContent = "";
  }
}

function toggleModelDropdown() {
  if (state.modelDropdownOpen) {
    closeModelDropdown();
  } else {
    openModelDropdown();
  }
}

function openModelDropdown() {
  state.modelDropdownOpen = true;
  state.highlightedModelIndex = -1;
  dom.modelSelector.classList.add("open");
  dom.modelSearch.value = "";
  renderModelList();
  updateCustomModelFooter();

  // Focus search after animation
  requestAnimationFrame(() => dom.modelSearch.focus());
}

function closeModelDropdown() {
  state.modelDropdownOpen = false;
  state.highlightedModelIndex = -1;
  dom.modelSelector.classList.remove("open");
}

function selectModel(modelId) {
  state.model = modelId;
  updateModelTrigger();
  updateTopbar();
  closeModelDropdown();
  saveState();
}

function renderModelList() {
  const query = dom.modelSearch.value.trim();
  const models = getModelsForProvider(state.provider, query);

  if (models.length === 0) {
    dom.modelList.innerHTML = `<div class="model-dropdown-empty">No models found${query ? ` for "${escapeHtml(query)}"` : ""}</div>`;
    return;
  }

  const grouped = groupByCategory(models);
  let html = "";

  for (const [category, categoryModels] of grouped) {
    const meta = CATEGORY_META[category] || { label: category };
    html += `<div class="model-group-header">${escapeHtml(meta.label)}</div>`;

    for (const model of categoryModels) {
      const isSelected = model.id === state.model;
      const isDefault = model.isDefault;
      html += `<div class="model-option${isSelected ? " selected" : ""}" data-model-id="${escapeHtml(model.id)}">`;
      html += `<div class="model-option-info">`;
      html += `<div class="model-option-name">${escapeHtml(model.name)}</div>`;
      html += `<div class="model-option-id">${escapeHtml(model.id)}</div>`;
      html += `</div>`;
      html += `<div class="model-option-badges">`;
      if (isDefault) {
        html += `<span class="model-badge model-badge-default">default</span>`;
      }
      if (model.ctx) {
        html += `<span class="model-badge model-badge-ctx">${fmtCtx(model.ctx)}</span>`;
      }
      html += `</div>`;
      html += `</div>`;
    }
  }

  dom.modelList.innerHTML = html;

  // Attach click listeners
  dom.modelList.querySelectorAll(".model-option").forEach(el => {
    el.addEventListener("click", () => {
      selectModel(el.dataset.modelId);
    });
  });
}

function updateCustomModelFooter() {
  const query = dom.modelSearch.value.trim();
  if (!query) {
    dom.modelDropdownFooter.innerHTML = "";
    return;
  }

  // Check if query matches an existing model exactly
  const exactMatch = MODEL_CATALOG.find(m => m.provider === state.provider && m.id === query);
  if (exactMatch) {
    dom.modelDropdownFooter.innerHTML = "";
    return;
  }

  dom.modelDropdownFooter.innerHTML = `
    <div class="model-custom-option" id="model-custom-use">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
      Use custom model: <span class="model-custom-id">${escapeHtml(query)}</span>
    </div>`;

  dom.modelDropdownFooter.querySelector("#model-custom-use").addEventListener("click", () => {
    selectModel(query);
  });
}

function handleModelSearchKeydown(e) {
  const options = dom.modelList.querySelectorAll(".model-option");
  const count = options.length;

  if (e.key === "ArrowDown") {
    e.preventDefault();
    state.highlightedModelIndex = Math.min(state.highlightedModelIndex + 1, count - 1);
    highlightModelOption(options);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    state.highlightedModelIndex = Math.max(state.highlightedModelIndex - 1, 0);
    highlightModelOption(options);
  } else if (e.key === "Enter") {
    e.preventDefault();
    if (state.highlightedModelIndex >= 0 && state.highlightedModelIndex < count) {
      const selected = options[state.highlightedModelIndex];
      selectModel(selected.dataset.modelId);
    } else {
      // Use the search query as custom model
      const query = dom.modelSearch.value.trim();
      if (query) selectModel(query);
    }
  } else if (e.key === "Escape") {
    closeModelDropdown();
  }
}

function highlightModelOption(options) {
  options.forEach((el, i) => {
    el.classList.toggle("highlighted", i === state.highlightedModelIndex);
  });

  // Scroll into view
  if (state.highlightedModelIndex >= 0 && options[state.highlightedModelIndex]) {
    options[state.highlightedModelIndex].scrollIntoView({ block: "nearest" });
  }
}

// ─── Endpoint Override ──────────────────────────────────────────────────────

function saveCurrentEndpointOverride() {
  const baseURL = dom.customEndpoint.value.trim();
  let headers = {};
  const headersStr = dom.customHeaders.value.trim();
  if (headersStr) {
    try {
      headers = JSON.parse(headersStr);
    } catch {
      // Invalid JSON — ignore
    }
  }
  setEndpointOverride(state.provider, baseURL, headers);
}

// ─── Custom Provider Dialog ─────────────────────────────────────────────────

function showCustomProviderDialog(editId) {
  // Remove any existing dialog
  const existing = document.querySelector(".confirm-overlay");
  if (existing) existing.remove();

  const isEdit = typeof editId === "string" && PROVIDERS[editId]?.isCustom;
  const editConfig = isEdit ? loadCustomProviders()[editId] : null;

  const overlay = document.createElement("div");
  overlay.className = "confirm-overlay";
  overlay.innerHTML = `
    <div class="custom-provider-dialog">
      <h3>${isEdit ? "Edit" : "Add"} Custom Provider</h3>
      <div class="custom-provider-form">
        <div class="form-row">
          <label for="cp-name">Provider Name</label>
          <input type="text" id="cp-name" placeholder="My Local LLM" value="${isEdit ? escapeHtml(editConfig.name) : ""}">
        </div>
        <div class="form-row">
          <label for="cp-url">Base URL</label>
          <input type="text" id="cp-url" placeholder="http://localhost:8080/v1" value="${isEdit ? escapeHtml(editConfig.baseURL) : ""}">
          <div class="hint">The API base URL (e.g. http://localhost:11434/v1 for Ollama)</div>
        </div>
        <div class="form-row">
          <label for="cp-format">API Format</label>
          <select id="cp-format">
            <option value=""${!editConfig?.transform ? " selected" : ""}>OpenAI-Compatible</option>
            <option value="anthropic"${editConfig?.transform === "anthropic" ? " selected" : ""}>Anthropic</option>
            <option value="google"${editConfig?.transform === "google" ? " selected" : ""}>Google Gemini</option>
          </select>
          <div class="hint">Most local servers (Ollama, vLLM, LM Studio, llama.cpp) use OpenAI format.</div>
        </div>
        <div class="form-row">
          <label for="cp-auth">Authentication</label>
          <select id="cp-auth">
            <option value="bearer"${(!editConfig?.auth || editConfig?.auth === "bearer") ? " selected" : ""}>Bearer Token</option>
            <option value="x-api-key"${editConfig?.auth === "x-api-key" ? " selected" : ""}>X-API-Key</option>
            <option value="none"${editConfig?.auth === "none" ? " selected" : ""}>None</option>
          </select>
        </div>
        <div class="form-row">
          <label for="cp-default-model">Default Model</label>
          <input type="text" id="cp-default-model" placeholder="e.g. llama3.2" value="${isEdit && editConfig?.defaultModel ? escapeHtml(editConfig.defaultModel) : ""}">
          <div class="hint">The model ID to use by default.</div>
        </div>
        <div class="form-actions">
          ${isEdit ? `<button class="btn btn-danger" id="cp-delete">Delete</button>` : ""}
          <button class="btn" id="cp-cancel">Cancel</button>
          <button class="btn btn-primary" id="cp-save">${isEdit ? "Save" : "Add Provider"}</button>
        </div>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  const cancel = () => overlay.remove();
  overlay.querySelector("#cp-cancel").addEventListener("click", cancel);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) cancel();
  });
  overlay.addEventListener("keydown", (e) => {
    if (e.key === "Escape") cancel();
  });

  if (isEdit) {
    overlay.querySelector("#cp-delete").addEventListener("click", () => {
      removeCustomProvider(editId);
      rebuildProviderSelect();
      if (state.provider === editId) {
        state.provider = "openai";
        state.model = "";
        applyProvider("openai");
      }
      saveState();
      overlay.remove();
    });
  }

  overlay.querySelector("#cp-save").addEventListener("click", () => {
    const name = overlay.querySelector("#cp-name").value.trim();
    const baseURL = overlay.querySelector("#cp-url").value.trim();
    const transform = overlay.querySelector("#cp-format").value || undefined;
    const auth = overlay.querySelector("#cp-auth").value;
    const defaultModel = overlay.querySelector("#cp-default-model").value.trim();

    if (!name || !baseURL) return;

    const config = { name, baseURL, auth, defaultModel, transform, models: defaultModel ? [defaultModel] : [] };

    if (isEdit) {
      // Update existing
      const custom = loadCustomProviders();
      custom[editId] = config;
      saveCustomProviders(custom);
      registerCustomProvider(editId, config);
      rebuildProviderSelect();
      if (state.provider === editId) {
        applyProvider(editId);
      }
    } else {
      const id = addCustomProvider(config);
      rebuildProviderSelect();
      state.provider = id;
      state.model = defaultModel || "";
      applyProvider(id);
    }

    saveState();
    overlay.remove();
  });

  // Focus the name input
  overlay.querySelector("#cp-name").focus();
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
  dom.themeLabel.textContent = theme === "dark" ? "Light Mode" : "Dark Mode";
  dom.themeIconDark.style.display = theme === "dark" ? "inline" : "none";
  dom.themeIconLight.style.display = theme === "light" ? "inline" : "none";

  // Update highlight.js theme
  const hljsTheme = document.getElementById("hljs-theme");
  if (hljsTheme) {
    hljsTheme.href = theme === "dark"
      ? "https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11/build/styles/github-dark.min.css"
      : "https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11/build/styles/github.min.css";
  }
}

// ─── Chat Management ────────────────────────────────────────────────────────

function newChat() {
  const chat = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    title: "New Chat",
    provider: state.provider,
    model: state.model,
    messages: [],
    createdAt: Date.now(),
  };
  state.chats.unshift(chat);
  state.activeChatId = chat.id;
  renderMessages();
  renderChatList();
  saveState();
  dom.userInput.focus();
}

function getActiveChat() {
  return state.chats.find(c => c.id === state.activeChatId);
}

function switchChat(chatId) {
  if (state.isGenerating) return;
  state.activeChatId = chatId;
  const chat = getActiveChat();
  if (chat) {
    state.provider = chat.provider;
    state.model = chat.model;
    applyProvider(chat.provider);
  }
  renderMessages();
  renderChatList();
  saveState();
}

function deleteChat(chatId) {
  const chat = state.chats.find(c => c.id === chatId);
  const title = chat ? chat.title : "this chat";
  showConfirmDialog(
    "Delete chat?",
    `"${title}" will be permanently deleted.`,
    "Delete",
    () => {
      state.chats = state.chats.filter(c => c.id !== chatId);
      if (state.activeChatId === chatId) {
        state.activeChatId = state.chats[0]?.id || null;
      }
      renderMessages();
      renderChatList();
      saveState();
    }
  );
}

function renameChat(chatId) {
  const item = dom.chatList.querySelector(`.chat-list-item[data-chat-id="${chatId}"]`);
  if (!item) return;

  const titleSpan = item.querySelector(".chat-title");
  const chat = state.chats.find(c => c.id === chatId);
  if (!titleSpan || !chat) return;

  // Replace title span with an input
  const input = document.createElement("input");
  input.type = "text";
  input.className = "chat-title-input";
  input.value = chat.title;
  input.setAttribute("maxlength", "100");
  titleSpan.replaceWith(input);
  input.focus();
  input.select();

  const commitRename = () => {
    const newTitle = input.value.trim() || chat.title;
    chat.title = newTitle;
    saveState();
    renderChatList();
  };

  input.addEventListener("blur", commitRename);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      input.blur();
    }
    if (e.key === "Escape") {
      input.value = chat.title; // revert
      input.blur();
    }
  });
}

function showConfirmDialog(title, message, confirmLabel, onConfirm) {
  // Remove any existing dialog
  const existing = document.querySelector(".confirm-overlay");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.className = "confirm-overlay";
  overlay.innerHTML = `
    <div class="confirm-dialog">
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(message)}</p>
      <div class="confirm-actions">
        <button class="btn confirm-cancel">Cancel</button>
        <button class="btn btn-danger confirm-ok">${escapeHtml(confirmLabel)}</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  const cancel = () => overlay.remove();
  overlay.querySelector(".confirm-cancel").addEventListener("click", cancel);
  overlay.querySelector(".confirm-ok").addEventListener("click", () => {
    overlay.remove();
    onConfirm();
  });
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) cancel();
  });
  // Focus the cancel button so Escape works naturally
  overlay.querySelector(".confirm-cancel").focus();
  overlay.addEventListener("keydown", (e) => {
    if (e.key === "Escape") cancel();
  });
}

function clearCurrentChat() {
  const chat = getActiveChat();
  if (!chat) return;
  chat.messages = [];
  dom.statsPopover.style.display = "none";
  renderMessages();
  saveState();
}

function exportChat() {
  const chat = getActiveChat();
  if (!chat || chat.messages.length === 0) return;

  const lines = [`# ${chat.title}`, `Provider: ${chat.provider} | Model: ${chat.model}`, ""];
  for (const msg of chat.messages) {
    lines.push(`## ${msg.role.charAt(0).toUpperCase() + msg.role.slice(1)}`);
    lines.push(msg.content);
    lines.push("");
  }

  const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${chat.title.replace(/[^a-z0-9]/gi, "_")}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Message Rendering ──────────────────────────────────────────────────────

function renderMessages() {
  const chat = getActiveChat();

  if (!chat || chat.messages.length === 0) {
    dom.messages.innerHTML = `
      <div class="welcome">
        <div class="welcome-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
        </div>
        <h2>AgentLoop Chat</h2>
        <p>Bring Your Own Key — chat with 12 LLM providers from one interface.</p>
        <p class="muted">Select a provider, enter your API key, and start chatting.</p>
      </div>`;
    updateConversationStats();
    return;
  }

  dom.messages.innerHTML = chat.messages
    .map((msg, i) => renderMessage(msg, i))
    .join("");

  // Highlight code blocks
  dom.messages.querySelectorAll("pre code").forEach(block => {
    if (typeof hljs !== "undefined") {
      hljs.highlightElement(block);
    }
  });

  // Add copy buttons
  addCopyButtons();

  // Update conversation stats in topbar
  updateConversationStats();

  // Scroll to bottom
  scrollToBottom();
}

function renderMessage(msg, index) {
  const isUser = msg.role === "user";
  const isError = msg.role === "error";
  const roleClass = isError ? "error" : msg.role;
  const avatar = isUser ? "U" : isError ? "!" : "A";
  const content = renderMarkdown(msg.content);

  let meta = "";
  if (msg.usage) {
    meta = buildTokenMeta(msg.usage);
  }

  return `
    <div class="message ${roleClass}" data-index="${index}">
      <div class="message-avatar">${avatar}</div>
      <div class="message-body">${content}${meta}</div>
    </div>`;
}

/**
 * Build the token stats badge HTML for a single message.
 * Shows compact summary with expandable details.
 */
function buildTokenMeta(usage) {
  if (!usage) return "";
  const inp = usage.input_tokens || 0;
  const out = usage.output_tokens || 0;
  if (!inp && !out) return "";

  const total = inp + out;
  const cached = usage.cached_tokens || 0;
  const cacheWrite = usage.cache_write_tokens || 0;
  const reasoning = usage.reasoning_tokens || 0;
  const hasDetails = cached > 0 || cacheWrite > 0 || reasoning > 0;

  // Compact summary
  let html = `<div class="message-meta">`;
  html += `<span class="token-summary">`;
  html += `<span class="token-pill">${fmtNum(inp)} in</span>`;
  html += `<span class="token-pill">${fmtNum(out)} out</span>`;
  if (cached > 0) {
    const pct = inp > 0 ? Math.round((cached / inp) * 100) : 0;
    html += `<span class="token-pill token-cache">${fmtNum(cached)} cached (${pct}%)</span>`;
  }
  if (reasoning > 0) {
    html += `<span class="token-pill token-reasoning">${fmtNum(reasoning)} reasoning</span>`;
  }
  html += `</span>`;

  // Expandable details
  if (hasDetails) {
    html += `<button class="token-details-toggle" onclick="this.parentElement.classList.toggle('expanded')" title="Toggle details">`;
    html += `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>`;
    html += `</button>`;
    html += `<div class="token-details">`;
    html += `<div class="token-details-grid">`;
    html += `<span class="td-label">Prompt</span><span class="td-value">${fmtNum(inp)}</span>`;
    html += `<span class="td-label">Completion</span><span class="td-value">${fmtNum(out)}</span>`;
    html += `<span class="td-label">Total</span><span class="td-value">${fmtNum(total)}</span>`;
    if (cached > 0) {
      const pct = inp > 0 ? Math.round((cached / inp) * 100) : 0;
      html += `<span class="td-label">Cache read</span><span class="td-value td-cache">${fmtNum(cached)} <span class="td-pct">(${pct}%)</span></span>`;
    }
    if (cacheWrite > 0) {
      html += `<span class="td-label">Cache write</span><span class="td-value td-cache-write">${fmtNum(cacheWrite)}</span>`;
    }
    if (reasoning > 0) {
      html += `<span class="td-label">Reasoning</span><span class="td-value td-reasoning">${fmtNum(reasoning)}</span>`;
    }
    if (cached > 0 && inp > 0) {
      const pct = Math.round((cached / inp) * 100);
      html += `<span class="td-label">Cache hit rate</span>`;
      html += `<span class="td-value"><span class="cache-bar"><span class="cache-bar-fill" style="width:${pct}%"></span></span> ${pct}%</span>`;
    }
    html += `</div></div>`;
  }

  html += `</div>`;
  return html;
}

/** Format large numbers with commas: 12345 → "12,345" */
function fmtNum(n) {
  if (n == null) return "0";
  return n.toLocaleString();
}

function renderMarkdown(text) {
  if (!text) return "";
  if (typeof marked !== "undefined") {
    try {
      return marked.parse(text);
    } catch {
      return escapeHtml(text);
    }
  }
  return escapeHtml(text).replace(/\n/g, "<br>");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function addCopyButtons() {
  dom.messages.querySelectorAll("pre").forEach(pre => {
    // Skip if already has header
    if (pre.querySelector(".code-header")) return;

    const code = pre.querySelector("code");
    if (!code) return;

    // Detect language from class
    const langClass = [...code.classList].find(c => c.startsWith("language-"));
    const lang = langClass ? langClass.replace("language-", "") : "";

    const header = document.createElement("div");
    header.className = "code-header";
    header.innerHTML = `
      <span>${lang}</span>
      <button class="copy-btn" onclick="copyCode(this)">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        Copy
      </button>`;
    pre.insertBefore(header, code);
  });
}

// Global copy function (called from inline onclick)
window.copyCode = function(btn) {
  const pre = btn.closest("pre");
  const code = pre.querySelector("code");
  if (!code) return;

  navigator.clipboard.writeText(code.textContent).then(() => {
    btn.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
      Copied!`;
    setTimeout(() => {
      btn.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        Copy`;
    }, 2000);
  });
};

function scrollToBottom() {
  requestAnimationFrame(() => {
    dom.messages.scrollTop = dom.messages.scrollHeight;
  });
}

// ─── Streaming Message Update ───────────────────────────────────────────────

function appendStreamingMessage() {
  const chat = getActiveChat();
  if (!chat) return;

  // Add assistant message placeholder
  chat.messages.push({ role: "assistant", content: "" });
  const index = chat.messages.length - 1;

  const msgEl = document.createElement("div");
  msgEl.className = "message assistant";
  msgEl.setAttribute("data-index", index);
  msgEl.innerHTML = `
    <div class="message-avatar">A</div>
    <div class="message-body">
      <div class="streaming-content streaming-cursor">
        <span class="typing-indicator"><span></span><span></span><span></span></span>
      </div>
    </div>`;
  dom.messages.appendChild(msgEl);
  scrollToBottom();

  return { msgEl, index };
}

function updateStreamingMessage(msgEl, text) {
  const contentEl = msgEl.querySelector(".streaming-content");
  if (!contentEl) return;

  contentEl.innerHTML = renderMarkdown(text);
  contentEl.classList.add("streaming-cursor");

  // Highlight code blocks
  contentEl.querySelectorAll("pre code").forEach(block => {
    if (typeof hljs !== "undefined") {
      hljs.highlightElement(block);
    }
  });

  scrollToBottom();
}

function finalizeStreamingMessage(msgEl, text, usage) {
  const contentEl = msgEl.querySelector(".streaming-content");
  if (!contentEl) return;

  contentEl.innerHTML = renderMarkdown(text);
  contentEl.classList.remove("streaming-cursor");

  // Highlight code blocks
  contentEl.querySelectorAll("pre code").forEach(block => {
    if (typeof hljs !== "undefined") {
      hljs.highlightElement(block);
    }
  });

  addCopyButtons();

  // Add usage info with enhanced display
  if (usage) {
    const metaHtml = buildTokenMeta(usage);
    if (metaHtml) {
      const wrapper = document.createElement("div");
      wrapper.innerHTML = metaHtml;
      const metaEl = wrapper.firstElementChild;
      if (metaEl) msgEl.querySelector(".message-body").appendChild(metaEl);
    }
  }

  // Update conversation stats
  updateConversationStats();

  scrollToBottom();
}

// ─── Send Message ───────────────────────────────────────────────────────────

async function sendMessage() {
  const text = dom.userInput.value.trim();
  if (!text || state.isGenerating) return;

  // Ensure we have an active chat
  if (!state.activeChatId) {
    newChat();
  }

  const chat = getActiveChat();
  if (!chat) return;

  // Update chat metadata
  chat.provider = state.provider;
  chat.model = state.model;

  // Add user message
  chat.messages.push({ role: "user", content: text });

  // Set title from first message
  if (chat.messages.length === 1) {
    chat.title = text.slice(0, 50) + (text.length > 50 ? "..." : "");
    renderChatList();
  }

  // Clear input
  dom.userInput.value = "";
  autoResize();

  // Render user message
  renderMessages();

  // Send to API
  state.isGenerating = true;
  state.abortController = new AbortController();
  updateUI();

  try {
    const messages = chat.messages
      .filter(m => m.role === "user" || m.role === "assistant")
      .map(m => ({ role: m.role, content: m.content }));

    const { url, headers, body } = buildRequest({
      provider: state.provider,
      model: state.model || PROVIDERS[state.provider].defaultModel,
      messages,
      systemMessage: state.systemMessage,
      temperature: state.temperature,
      maxTokens: state.maxTokens,
      topP: state.topP,
      stream: state.streaming,
      corsProxy: state.corsProxy,
    });

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: state.abortController.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      let errorMsg;
      try {
        const parsed = JSON.parse(errorBody);
        errorMsg = parsed.error?.message || parsed.message || parsed.error || errorBody;
        if (typeof errorMsg === "object") errorMsg = JSON.stringify(errorMsg);
      } catch {
        errorMsg = errorBody;
      }
      throw new Error(`${response.status} ${response.statusText}: ${errorMsg}`);
    }

    if (state.streaming) {
      await handleStreamingResponse(response, chat);
    } else {
      await handleNonStreamingResponse(response, chat);
    }
  } catch (err) {
    if (err.name === "AbortError") {
      // User cancelled — finalize partial message
      const lastMsg = chat.messages[chat.messages.length - 1];
      if (lastMsg.role === "assistant" && !lastMsg.content) {
        chat.messages.pop(); // Remove empty assistant message
      }
    } else {
      chat.messages.push({ role: "error", content: err.message });
    }
    renderMessages();
  } finally {
    state.isGenerating = false;
    state.abortController = null;
    updateUI();
    saveState();
  }
}

async function handleStreamingResponse(response, chat) {
  const reader = response.body.getReader();
  const parser = getStreamParser(state.provider);
  const { msgEl, index } = appendStreamingMessage();

  let fullText = "";
  let rawUsage = null;

  try {
    for await (const event of parser(reader)) {
      switch (event.type) {
        case "delta":
          fullText += event.text;
          chat.messages[index].content = fullText;
          updateStreamingMessage(msgEl, fullText);
          break;
        case "usage":
          // Merge partial usage events (Anthropic sends input on start, output on delta)
          rawUsage = { ...rawUsage, ...event.usage };
          break;
        case "error":
          throw new Error(event.error);
        case "finish":
          break;
      }
    }
  } catch (err) {
    if (err.name !== "AbortError") throw err;
  }

  // Normalize the accumulated raw usage
  const usage = normalizeUsage(state.provider, rawUsage);

  chat.messages[index].content = fullText;
  chat.messages[index].usage = usage;
  finalizeStreamingMessage(msgEl, fullText, usage);
}

async function handleNonStreamingResponse(response, chat) {
  const data = await response.json();
  const { text, usage } = parseResponse(state.provider, data);

  chat.messages.push({
    role: "assistant",
    content: text,
    usage,
  });

  renderMessages();
}

function stopGeneration() {
  if (state.abortController) {
    state.abortController.abort();
  }
}

// ─── UI Updates ─────────────────────────────────────────────────────────────

function updateUI() {
  dom.sendBtn.style.display = state.isGenerating ? "none" : "flex";
  dom.stopBtn.style.display = state.isGenerating ? "flex" : "none";
  dom.userInput.disabled = state.isGenerating;
  dom.sendBtn.disabled = state.isGenerating;
}

function autoResize() {
  const el = dom.userInput;
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 200) + "px";
}

// ─── Chat List Rendering ────────────────────────────────────────────────────

function renderChatList() {
  const query = (dom.chatSearch.value || "").trim().toLowerCase();
  const filtered = query
    ? state.chats.filter(c => c.title.toLowerCase().includes(query))
    : state.chats;

  // Update count
  dom.chatCount.textContent = state.chats.length > 0 ? state.chats.length : "";

  if (filtered.length === 0) {
    dom.chatList.innerHTML = query
      ? `<div class="chat-list-empty">No chats matching "${escapeHtml(query)}"</div>`
      : `<div class="chat-list-empty">No chats yet</div>`;
    return;
  }

  dom.chatList.innerHTML = filtered.map(chat => `
    <div class="chat-list-item ${chat.id === state.activeChatId ? "active" : ""}"
         data-chat-id="${chat.id}">
      <svg class="chat-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      <span class="chat-title">${escapeHtml(chat.title)}</span>
      <div class="chat-actions">
        <button class="icon-btn chat-rename" data-chat-id="${chat.id}" title="Rename">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
        </button>
        <button class="icon-btn chat-delete" data-chat-id="${chat.id}" title="Delete">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>
    </div>`).join("");

  // Attach event listeners (avoids inline onclick)
  dom.chatList.querySelectorAll(".chat-list-item").forEach(item => {
    const chatId = item.dataset.chatId;

    // Click to switch, double-click to rename
    item.addEventListener("click", (e) => {
      if (e.target.closest(".chat-actions")) return;
      switchChat(chatId);
    });
    item.addEventListener("dblclick", (e) => {
      if (e.target.closest(".chat-actions")) return;
      renameChat(chatId);
    });
  });

  dom.chatList.querySelectorAll(".chat-rename").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      renameChat(btn.dataset.chatId);
    });
  });

  dom.chatList.querySelectorAll(".chat-delete").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteChat(btn.dataset.chatId);
    });
  });
}

// ─── State Persistence ──────────────────────────────────────────────────────

function loadState() {
  try {
    // Load theme
    const theme = localStorage.getItem("agentloop_theme") || "dark";
    document.documentElement.setAttribute("data-theme", theme);

    // Load settings
    const settings = JSON.parse(localStorage.getItem("agentloop_settings") || "{}");
    state.provider = settings.provider || "openai";
    state.model = settings.model || "";
    state.systemMessage = settings.systemMessage || "";
    state.temperature = settings.temperature ?? 0.7;
    state.maxTokens = settings.maxTokens || null;
    state.topP = settings.topP ?? 1;
    state.streaming = settings.streaming ?? true;
    state.corsProxy = settings.corsProxy || "";

    // Load chats
    const chats = JSON.parse(localStorage.getItem("agentloop_chats") || "[]");
    state.chats = chats;
    state.activeChatId = localStorage.getItem("agentloop_active_chat") || (chats[0]?.id || null);
  } catch {
    // Fresh start on error
  }
}

function saveState() {
  try {
    localStorage.setItem("agentloop_settings", JSON.stringify({
      provider: state.provider,
      model: state.model,
      systemMessage: state.systemMessage,
      temperature: state.temperature,
      maxTokens: state.maxTokens,
      topP: state.topP,
      streaming: state.streaming,
      corsProxy: state.corsProxy,
    }));

    localStorage.setItem("agentloop_chats", JSON.stringify(state.chats));
    localStorage.setItem("agentloop_active_chat", state.activeChatId || "");
  } catch {
    // localStorage might be full — silently fail
  }
}

// ─── Conversation Stats ──────────────────────────────────────────────────

/**
 * Aggregate token usage across all messages in the active chat.
 */
function getConversationStats() {
  const chat = getActiveChat();
  if (!chat) return null;

  const stats = {
    messages: chat.messages.length,
    turns: chat.messages.filter(m => m.role === "assistant").length,
    input_tokens: 0,
    output_tokens: 0,
    total_tokens: 0,
    cached_tokens: 0,
    cache_write_tokens: 0,
    reasoning_tokens: 0,
  };

  for (const msg of chat.messages) {
    if (!msg.usage) continue;
    stats.input_tokens += msg.usage.input_tokens || 0;
    stats.output_tokens += msg.usage.output_tokens || 0;
    stats.cached_tokens += msg.usage.cached_tokens || 0;
    stats.cache_write_tokens += msg.usage.cache_write_tokens || 0;
    stats.reasoning_tokens += msg.usage.reasoning_tokens || 0;
  }
  stats.total_tokens = stats.input_tokens + stats.output_tokens;
  return stats;
}

/**
 * Update the topbar token counter badge.
 */
function updateConversationStats() {
  const stats = getConversationStats();

  if (!stats || stats.total_tokens === 0) {
    dom.topbarTokenCount.textContent = "";
    dom.statsToggle.classList.remove("has-stats");
    return;
  }

  dom.topbarTokenCount.textContent = fmtCompact(stats.total_tokens);
  dom.statsToggle.classList.add("has-stats");

  // If popover is open, refresh it
  if (dom.statsPopover.style.display !== "none") {
    renderStatsPopover(stats);
  }
}

/** Format numbers compactly: 1234 -> "1.2k", 1234567 -> "1.2M" */
function fmtCompact(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "k";
  return n.toString();
}

/**
 * Toggle the stats popover panel.
 */
function toggleStatsPopover() {
  const visible = dom.statsPopover.style.display !== "none";
  if (visible) {
    dom.statsPopover.style.display = "none";
    return;
  }

  const stats = getConversationStats();
  if (!stats || stats.total_tokens === 0) return;

  renderStatsPopover(stats);
  dom.statsPopover.style.display = "flex";
}

/**
 * Render the stats popover content with visual breakdowns.
 */
function renderStatsPopover(stats) {
  const hasCacheData = stats.cached_tokens > 0 || stats.cache_write_tokens > 0;
  const hasReasoningData = stats.reasoning_tokens > 0;
  const cacheHitRate = stats.input_tokens > 0
    ? Math.round((stats.cached_tokens / stats.input_tokens) * 100) : 0;

  // Token distribution for the bar chart
  const total = stats.total_tokens || 1;
  const inPct = Math.round((stats.input_tokens / total) * 100);
  const outPct = 100 - inPct;

  let html = "";

  // Total tokens hero
  html += `<div class="stats-hero">`;
  html += `<div class="stats-hero-value">${fmtNum(stats.total_tokens)}</div>`;
  html += `<div class="stats-hero-label">total tokens</div>`;
  html += `</div>`;

  // Distribution bar
  html += `<div class="stats-distribution">`;
  html += `<div class="stats-dist-bar">`;
  html += `<div class="stats-dist-segment dist-input" style="width:${inPct}%" title="Input: ${fmtNum(stats.input_tokens)}"></div>`;
  html += `<div class="stats-dist-segment dist-output" style="width:${outPct}%" title="Output: ${fmtNum(stats.output_tokens)}"></div>`;
  html += `</div>`;
  html += `<div class="stats-dist-legend">`;
  html += `<span class="stats-legend-item"><span class="legend-dot dist-input-dot"></span>Input ${fmtNum(stats.input_tokens)}</span>`;
  html += `<span class="stats-legend-item"><span class="legend-dot dist-output-dot"></span>Output ${fmtNum(stats.output_tokens)}</span>`;
  html += `</div>`;
  html += `</div>`;

  // Stats grid
  html += `<div class="stats-grid">`;
  html += `<div class="stats-cell"><div class="stats-cell-value">${stats.turns}</div><div class="stats-cell-label">Turns</div></div>`;
  html += `<div class="stats-cell"><div class="stats-cell-value">${fmtNum(stats.input_tokens)}</div><div class="stats-cell-label">Prompt</div></div>`;
  html += `<div class="stats-cell"><div class="stats-cell-value">${fmtNum(stats.output_tokens)}</div><div class="stats-cell-label">Completion</div></div>`;

  if (hasReasoningData) {
    html += `<div class="stats-cell"><div class="stats-cell-value stats-reasoning">${fmtNum(stats.reasoning_tokens)}</div><div class="stats-cell-label">Reasoning</div></div>`;
  }
  html += `</div>`;

  // Cache section
  if (hasCacheData) {
    html += `<div class="stats-cache-section">`;
    html += `<div class="stats-section-title">Cache Performance</div>`;

    // Cache hit rate ring
    html += `<div class="stats-cache-ring-row">`;
    html += `<div class="stats-cache-ring">`;
    html += buildCacheRing(cacheHitRate);
    html += `</div>`;
    html += `<div class="stats-cache-details">`;
    html += `<div class="stats-cache-row"><span class="stats-cache-label">Cache read</span><span class="stats-cache-val">${fmtNum(stats.cached_tokens)}</span></div>`;
    if (stats.cache_write_tokens > 0) {
      html += `<div class="stats-cache-row"><span class="stats-cache-label">Cache write</span><span class="stats-cache-val">${fmtNum(stats.cache_write_tokens)}</span></div>`;
    }
    const saved = stats.cached_tokens;
    if (saved > 0) {
      html += `<div class="stats-cache-row stats-cache-saved"><span class="stats-cache-label">Tokens saved</span><span class="stats-cache-val">${fmtNum(saved)}</span></div>`;
    }
    html += `</div>`;
    html += `</div>`;

    html += `</div>`;
  }

  dom.statsBody.innerHTML = html;
}

/**
 * Build an SVG ring chart for cache hit rate.
 */
function buildCacheRing(pct) {
  const r = 28;
  const c = 2 * Math.PI * r;
  const offset = c - (c * pct / 100);

  return `<svg width="72" height="72" viewBox="0 0 72 72">
    <circle cx="36" cy="36" r="${r}" fill="none" stroke="var(--border)" stroke-width="5"/>
    <circle cx="36" cy="36" r="${r}" fill="none" stroke="var(--success)" stroke-width="5"
      stroke-dasharray="${c}" stroke-dashoffset="${offset}"
      stroke-linecap="round" transform="rotate(-90 36 36)"
      style="transition: stroke-dashoffset 0.6s ease"/>
    <text x="36" y="36" text-anchor="middle" dominant-baseline="central"
      font-size="14" font-weight="700" fill="var(--text-primary)">${pct}%</text>
  </svg>`;
}

// ─── Boot ───────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", init);
