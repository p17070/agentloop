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
  modality: "chat",
  comboboxOpen: false,
  hlIndex: -1,
  attachments: [],  // { id, file, type, name, size, dataUrl, mimeType }
  toolApproval: false, // Require user approval before executing tool calls
  _pendingToolApproval: null, // {resolve, reject} for approval Promise
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
  modelCombobox: $("#model-combobox"),
  modelInput: $("#model-input"),
  modalityTabs: $("#modality-tabs"),
  modelResults: $("#model-results"),
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
  statsToggle: $("#stats-toggle"),
  statsClose: $("#stats-close"),
  statsPopover: $("#stats-popover"),
  statsBody: $("#stats-body"),
  topbarTokenCount: $("#topbar-token-count"),
  // Settings modal
  settingsOverlay: $("#settings-overlay"),
  settingsOpen: $("#settings-open"),
  settingsModalClose: $("#settings-modal-close"),
  settingsProviderLabel: $("#settings-provider-label"),
  apiKeyStatus: $("#api-key-status"),
  keyStatusDot: $("#key-status-dot"),
  // File upload
  uploadBtn: $("#upload-btn"),
  fileInput: $("#file-input"),
  attachmentPreview: $("#attachment-preview"),
  // MCP
  mcpIndicator: $("#mcp-indicator"),
  mcpToolBadge: $("#mcp-tool-badge"),
  mcpServerUrl: $("#mcp-server-url"),
  mcpServerName: $("#mcp-server-name"),
  mcpAddBtn: $("#mcp-add-btn"),
  mcpServerList: $("#mcp-server-list"),
  mcpToolsSection: $("#mcp-tools-section"),
  mcpToolCount: $("#mcp-tool-count"),
  mcpToolList: $("#mcp-tool-list"),
  mcpDropdown: $("#mcp-dropdown"),
  toolApprovalToggle: $("#tool-approval-toggle"),
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

  // Load MCP servers
  if (typeof mcpManager !== "undefined") {
    mcpManager.loadAndConnect().then(() => {
      renderMcpServerList();
      renderMcpToolList();
      updateMcpIndicator();
    });
  }

  // Apply tool approval setting
  if (dom.toolApprovalToggle) {
    dom.toolApprovalToggle.checked = state.toolApproval;
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
    // If current modality doesn't exist for new provider, fall back to chat
    if (!providerHasModality(state.provider, state.modality)) {
      state.modality = "chat";
    }
    applyProvider(state.provider);
    saveState();
  });

  // Add custom provider button
  dom.addProviderBtn.addEventListener("click", showCustomProviderDialog);

  // Model combobox
  dom.modelInput.addEventListener("focus", openCombobox);
  dom.modelInput.addEventListener("input", onModelInputChange);
  dom.modelInput.addEventListener("keydown", onModelInputKeydown);

  // Modality tabs
  dom.modalityTabs.addEventListener("click", (e) => {
    const tab = e.target.closest(".mod-tab");
    if (!tab) return;
    state.modality = tab.dataset.mod;
    state.model = ""; // reset model when switching modality
    dom.modalityTabs.querySelectorAll(".mod-tab").forEach(t => t.classList.toggle("active", t === tab));
    updateModalityTabVisibility();
    renderModelResults();
    // Set default for new modality
    const def = getCatalogDefault(state.provider, state.modality);
    if (def) selectModel(def.id, false);
  });

  // Close combobox on click outside
  document.addEventListener("click", (e) => {
    if (state.comboboxOpen && !dom.modelCombobox.contains(e.target)) {
      closeCombobox();
    }
  });

  // API key input
  dom.apiKeyInput.addEventListener("input", (e) => {
    setApiKey(state.provider, e.target.value);
    updateKeyStatus();
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

  // Settings modal
  dom.settingsOpen.addEventListener("click", () => openSettingsModal());
  dom.apiKeyStatus.addEventListener("click", () => openSettingsModal("api-key"));
  dom.settingsModalClose.addEventListener("click", closeSettingsModal);
  dom.settingsOverlay.addEventListener("click", (e) => {
    if (e.target === dom.settingsOverlay) closeSettingsModal();
  });

  // Settings modal tabs
  dom.settingsOverlay.querySelectorAll(".settings-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      switchSettingsTab(tab.dataset.tab);
    });
  });

  // File upload
  dom.uploadBtn.addEventListener("click", () => dom.fileInput.click());
  dom.fileInput.addEventListener("change", handleFileSelect);

  // Drag-and-drop on the input area
  const inputArea = dom.userInput.closest(".input-area");
  inputArea.addEventListener("dragover", (e) => { e.preventDefault(); inputArea.classList.add("drag-over"); });
  inputArea.addEventListener("dragleave", () => inputArea.classList.remove("drag-over"));
  inputArea.addEventListener("drop", (e) => {
    e.preventDefault();
    inputArea.classList.remove("drag-over");
    if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
  });

  // Paste images from clipboard
  dom.userInput.addEventListener("paste", (e) => {
    const files = [];
    for (const item of e.clipboardData.items) {
      if (item.kind === "file") files.push(item.getAsFile());
    }
    if (files.length > 0) addFiles(files);
  });

  // MCP
  dom.mcpAddBtn.addEventListener("click", handleMcpAddServer);
  dom.mcpIndicator.addEventListener("click", toggleMcpDropdown);
  dom.mcpServerUrl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleMcpAddServer();
  });

  // Tool approval toggle
  if (dom.toolApprovalToggle) {
    dom.toolApprovalToggle.addEventListener("change", (e) => {
      state.toolApproval = e.target.checked;
      saveState();
    });
  }

  // Close MCP dropdown on click outside
  document.addEventListener("click", (e) => {
    if (dom.mcpDropdown && !dom.mcpDropdown.contains(e.target) && !dom.mcpIndicator.contains(e.target)) {
      dom.mcpDropdown.style.display = "none";
    }
  });

  // Keyboard shortcuts
  document.addEventListener("keydown", handleKeyboardShortcuts);
}

// ─── Keyboard Shortcuts ──────────────────────────────────────────────────────

function handleKeyboardShortcuts(e) {
  // Don't fire shortcuts when typing in inputs (except Escape)
  const isInput = e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT";

  // Escape: close settings modal, close model dropdown, close sidebar, or blur active input
  if (e.key === "Escape") {
    if (dom.settingsOverlay.style.display !== "none") {
      closeSettingsModal();
      return;
    }
    if (state.comboboxOpen) {
      closeCombobox();
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

// ─── Settings Modal ─────────────────────────────────────────────────────────

function openSettingsModal(tab) {
  dom.settingsOverlay.style.display = "flex";
  if (tab) switchSettingsTab(tab);
  // Refresh provider label
  const entry = PROVIDERS[state.provider];
  if (dom.settingsProviderLabel) {
    dom.settingsProviderLabel.textContent = entry?.name || state.provider;
  }
}

function closeSettingsModal() {
  dom.settingsOverlay.style.display = "none";
}

function switchSettingsTab(tabId) {
  dom.settingsOverlay.querySelectorAll(".settings-tab").forEach(t => {
    t.classList.toggle("active", t.dataset.tab === tabId);
  });
  dom.settingsOverlay.querySelectorAll(".settings-tab-pane").forEach(p => {
    p.classList.toggle("active", p.dataset.tab === tabId);
  });
}

// ─── Provider Handling ──────────────────────────────────────────────────────

/** Rebuild the provider <select> from the single-source-of-truth catalog + custom providers */
function rebuildProviderSelect() {
  const builtInProviders = Object.keys(CATALOG_PROVIDERS);
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

  // Set model — try catalog default for current modality, then provider default
  if (!state.model) {
    const catDefault = getCatalogDefault(provider, state.modality);
    state.model = catDefault ? catDefault.id : entry.defaultModel;
  }

  // Update model display in combobox input
  displayModelInInput(state.model);

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
  // Update key status indicator
  updateKeyStatus();
  // Update provider label in settings modal
  const entry = PROVIDERS[state.provider];
  if (dom.settingsProviderLabel) {
    dom.settingsProviderLabel.textContent = entry?.name || state.provider;
  }
}

function updateKeyStatus() {
  const key = getApiKey(state.provider);
  if (dom.keyStatusDot) {
    dom.keyStatusDot.classList.toggle("has-key", !!key);
  }
}

// ─── Model Combobox ─────────────────────────────────────────────────────────

function openCombobox() {
  if (state.comboboxOpen) return;
  state.comboboxOpen = true;
  state.hlIndex = -1;
  dom.modelCombobox.classList.add("open");
  updateModalityTabVisibility();
  renderModelResults();
}

function closeCombobox() {
  state.comboboxOpen = false;
  state.hlIndex = -1;
  dom.modelCombobox.classList.remove("open");
  // If input is empty or doesn't match, restore current model display
  const val = dom.modelInput.value.trim();
  if (!val && state.model) {
    displayModelInInput(state.model);
  }
}

function displayModelInInput(modelId) {
  const cat = MODEL_CATALOG.find(m => m.provider === state.provider && m.id === modelId);
  dom.modelInput.value = cat ? cat.name : modelId;
}

function selectModel(modelId, close) {
  state.model = modelId;
  displayModelInInput(modelId);
  updateTopbar();
  if (close !== false) closeCombobox();
  saveState();
}

function onModelInputChange() {
  state.hlIndex = -1;
  renderModelResults();
}

function onModelInputKeydown(e) {
  if (!state.comboboxOpen) {
    if (e.key === "ArrowDown" || e.key === "Enter") {
      openCombobox();
      e.preventDefault();
    }
    return;
  }

  const rows = dom.modelResults.querySelectorAll(".model-row");
  const count = rows.length;

  if (e.key === "ArrowDown") {
    e.preventDefault();
    state.hlIndex = Math.min(state.hlIndex + 1, count - 1);
    highlightRow(rows);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    state.hlIndex = Math.max(state.hlIndex - 1, 0);
    highlightRow(rows);
  } else if (e.key === "Enter") {
    e.preventDefault();
    if (state.hlIndex >= 0 && state.hlIndex < count) {
      selectModel(rows[state.hlIndex].dataset.mid);
    } else {
      // Use typed value as custom model
      const val = dom.modelInput.value.trim();
      if (val) selectModel(val);
    }
  } else if (e.key === "Escape") {
    closeCombobox();
    dom.modelInput.blur();
  } else if (e.key === "Tab") {
    closeCombobox();
  }
}

function highlightRow(rows) {
  rows.forEach((el, i) => el.classList.toggle("hl", i === state.hlIndex));
  if (state.hlIndex >= 0 && rows[state.hlIndex]) {
    rows[state.hlIndex].scrollIntoView({ block: "nearest" });
  }
}

/** Show/hide modality tabs based on what the current provider supports */
function updateModalityTabVisibility() {
  const tabs = dom.modalityTabs.querySelectorAll(".mod-tab");
  tabs.forEach(tab => {
    const mod = tab.dataset.mod;
    const has = providerHasModality(state.provider, mod);
    tab.style.display = has ? "" : "none";
    tab.classList.toggle("active", mod === state.modality);
  });
}

function renderModelResults() {
  const query = dom.modelInput.value.trim();
  const models = getModelsForProvider(state.provider, state.modality, query);
  const customTyped = query && !MODEL_CATALOG.some(m => m.provider === state.provider && m.id === query);

  if (models.length === 0 && !customTyped) {
    dom.modelResults.innerHTML = `<div class="model-results-empty">No models found${query ? ` for "${escapeHtml(query)}"` : ""}</div>`;
    return;
  }

  let html = "";
  for (const m of models) {
    const sel = m.id === state.model;
    html += `<div class="model-row${sel ? " sel" : ""}" data-mid="${escapeAttr(m.id)}">`;
    html += `<span class="model-row-name">${escapeHtml(m.name)}</span>`;
    html += `<span class="model-row-right">`;
    if (m.isDefault) html += `<span class="mtag mtag-default">default</span>`;
    // Show one capability tag (skip flagship for brevity)
    const showCat = m.categories.find(c => c !== "flagship" && c !== "image" && c !== "audio" && c !== "tts" && c !== "embedding");
    if (showCat) html += `<span class="mtag mtag-cap c-${showCat}">${showCat}</span>`;
    if (m.ctx) html += `<span class="mtag mtag-ctx">${fmtCtx(m.ctx)}</span>`;
    html += `</span>`;
    html += `</div>`;
  }

  // Custom model option at the bottom
  if (customTyped) {
    html += `<div class="model-use-custom" data-mid="${escapeAttr(query)}">Use: <code>${escapeHtml(query)}</code></div>`;
  }

  dom.modelResults.innerHTML = html;

  // Click handlers
  dom.modelResults.querySelectorAll("[data-mid]").forEach(el => {
    el.addEventListener("click", () => selectModel(el.dataset.mid));
  });
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
    const text = typeof msg.content === "string"
      ? msg.content
      : (Array.isArray(msg.content) ? msg.content.filter(p => p.type === "text").map(p => p.text).join("\n") : String(msg.content || ""));
    if (msg._attachments) {
      lines.push(`Attachments: ${msg._attachments.map(a => a.name).join(", ")}`);
    }
    lines.push(text);
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

  // Render messages, pairing tool_call + tool_result into unified blocks
  let messagesHtml = "";
  let i = 0;
  while (i < chat.messages.length) {
    const msg = chat.messages[i];
    if (msg.role === "tool_call") {
      const next = chat.messages[i + 1];
      if (next && next.role === "tool_result") {
        messagesHtml += renderToolExecutionBlock(msg, next, i);
        i += 2;
        continue;
      }
      // tool_call without result = still executing
      messagesHtml += renderToolExecutionBlock(msg, null, i);
      i++;
      continue;
    }
    if (msg.role === "tool_result") {
      // Orphaned tool_result (shouldn't happen, but skip it)
      i++;
      continue;
    }
    messagesHtml += renderMessage(msg, i);
    i++;
  }
  dom.messages.innerHTML = messagesHtml;

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

  // Determine role class and avatar
  let roleClass, avatar;
  if (isError) {
    roleClass = "error";
    avatar = "!";
  } else {
    roleClass = msg.role;
    avatar = isUser ? "U" : "A";
  }

  // Build attachment gallery for user messages
  let attachmentHtml = "";
  if (isUser && msg._attachments && msg._attachments.length > 0) {
    attachmentHtml = `<div class="message-attachments">`;
    for (const a of msg._attachments) {
      if (a.type === "image" && a.dataUrl) {
        attachmentHtml += `<img class="message-attachment-img" src="${a.dataUrl}" alt="${escapeAttr(a.name)}" title="${escapeAttr(a.name)}" onclick="window.open(this.src,'_blank')">`;
      } else {
        const ext = a.name.split(".").pop()?.toUpperCase() || "FILE";
        attachmentHtml += `<div class="message-attachment-file">
          <span class="message-attachment-file-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></span>
          ${escapeHtml(a.name)} <span class="muted">(${formatFileSize(a.size)})</span>
        </div>`;
      }
    }
    attachmentHtml += `</div>`;
  }

  // Build content
  let content;
  // Extract text for display — content may be a string or an array of content parts
  const displayText = typeof msg.content === "string"
    ? msg.content
    : (Array.isArray(msg.content) ? msg.content.filter(p => p.type === "text").map(p => p.text).join("\n") : "");
  content = renderMarkdown(displayText);

  let meta = "";
  if (msg.usage) {
    meta = buildTokenMeta(msg.usage);
  }

  return `
    <div class="message ${roleClass}" data-index="${index}">
      <div class="message-avatar">${avatar}</div>
      <div class="message-body">${attachmentHtml}${content}${meta}</div>
    </div>`;
}

// ─── SVG Icons for Tool Execution ────────────────────────────────────────────

const TOOL_ICONS = {
  wrench: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`,
  check: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`,
  error: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  spinner: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>`,
  chevronDown: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>`,
  pending: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
};

/**
 * Render a unified tool execution block that pairs tool_call and tool_result.
 * Shows each tool as a collapsible row with status, args, and result.
 *
 * @param {object} toolCallMsg   The tool_call message (always present)
 * @param {object|null} toolResultMsg  The tool_result message (null if still executing)
 * @param {number} startIndex    Message index for DOM targeting
 */
function renderToolExecutionBlock(toolCallMsg, toolResultMsg, startIndex) {
  const toolCalls = toolCallMsg._toolCallData || [];
  const results = toolResultMsg?._results || [];
  const isExecuting = !toolResultMsg;
  const hasErrors = results.some(r => r.isError);
  const isPendingApproval = toolCallMsg._pendingApproval;

  // Header status
  let statusBadge = "";
  if (isPendingApproval) {
    statusBadge = `<span class="tool-exec-badge pending">awaiting approval</span>`;
  } else if (isExecuting) {
    statusBadge = `<span class="tool-exec-badge executing"><span class="tool-exec-spinner">${TOOL_ICONS.spinner}</span> running</span>`;
  } else if (hasErrors) {
    statusBadge = `<span class="tool-exec-badge error">error</span>`;
  } else {
    statusBadge = `<span class="tool-exec-badge success">done</span>`;
  }

  let html = `<div class="tool-exec-block" data-index="${startIndex}" data-executing="${isExecuting}">`;

  // Header
  html += `<div class="tool-exec-header" onclick="toggleToolBlock(this)">`;
  html += `<span class="tool-exec-icon">${TOOL_ICONS.wrench}</span>`;
  html += `<span class="tool-exec-title">${toolCalls.length} tool call${toolCalls.length !== 1 ? "s" : ""}</span>`;
  html += statusBadge;
  html += `<span class="tool-exec-chevron">${TOOL_ICONS.chevronDown}</span>`;
  html += `</div>`;

  // Approval buttons (if pending)
  if (isPendingApproval) {
    html += `<div class="tool-exec-approval" id="tool-approval-${startIndex}">`;
    html += `<button class="btn btn-primary tool-approve-btn" onclick="approveToolCalls(${startIndex})">`;
    html += `${TOOL_ICONS.check} Approve & Run</button>`;
    html += `<button class="btn btn-ghost tool-reject-btn" onclick="rejectToolCalls(${startIndex})">`;
    html += `${TOOL_ICONS.error} Reject</button>`;
    html += `</div>`;
  }

  // Tool items
  html += `<div class="tool-exec-items">`;

  for (let j = 0; j < toolCalls.length; j++) {
    const tc = toolCalls[j];
    const result = results.find(r => r.callId === tc.id || r.name === tc.name);
    let status;
    if (isPendingApproval) {
      status = "pending";
    } else if (isExecuting && !result) {
      status = "queued";
    } else if (result?.isError) {
      status = "error";
    } else if (result) {
      status = "done";
    } else {
      status = "queued";
    }

    // Parse args for display
    let argsDisplay;
    try {
      const parsed = JSON.parse(tc.arguments);
      argsDisplay = JSON.stringify(parsed, null, 2);
    } catch {
      argsDisplay = tc.arguments || "{}";
    }

    // Compact args summary
    let argsSummary = "";
    try {
      const parsed = JSON.parse(tc.arguments);
      const keys = Object.keys(parsed);
      if (keys.length === 0) {
        argsSummary = "";
      } else if (keys.length <= 2) {
        argsSummary = Object.entries(parsed).map(([k, v]) => {
          const vStr = typeof v === "string" ? (v.length > 30 ? `"${v.slice(0, 30)}..."` : `"${v}"`) : JSON.stringify(v);
          return `${k}: ${vStr}`;
        }).join(", ");
      } else {
        argsSummary = `${keys.length} params`;
      }
    } catch {
      argsSummary = tc.arguments?.length > 40 ? tc.arguments.slice(0, 40) + "..." : tc.arguments || "";
    }

    // Status icon
    let statusIcon;
    if (status === "done") statusIcon = `<span class="tool-exec-status done">${TOOL_ICONS.check}</span>`;
    else if (status === "error") statusIcon = `<span class="tool-exec-status error">${TOOL_ICONS.error}</span>`;
    else if (status === "executing") statusIcon = `<span class="tool-exec-status executing">${TOOL_ICONS.spinner}</span>`;
    else if (status === "pending") statusIcon = `<span class="tool-exec-status pending">${TOOL_ICONS.pending}</span>`;
    else statusIcon = `<span class="tool-exec-status queued"><span class="tool-exec-dot"></span></span>`;

    html += `<div class="tool-exec-item" data-status="${status}" data-tool-index="${j}">`;
    html += `<div class="tool-exec-item-header" onclick="toggleToolItem(this)">`;
    html += statusIcon;
    html += `<span class="tool-exec-name">${escapeHtml(tc.name)}</span>`;
    if (argsSummary) {
      html += `<span class="tool-exec-summary">${escapeHtml(argsSummary)}</span>`;
    }
    html += `<span class="tool-exec-item-chevron">${TOOL_ICONS.chevronDown}</span>`;
    html += `</div>`;

    // Expandable detail body
    html += `<div class="tool-exec-item-body">`;
    html += `<div class="tool-exec-section">`;
    html += `<div class="tool-exec-section-label">Arguments</div>`;
    html += `<pre class="tool-exec-args"><code>${escapeHtml(argsDisplay)}</code></pre>`;
    html += `</div>`;

    if (result) {
      const resultClass = result.isError ? "is-error" : "";
      html += `<div class="tool-exec-section tool-exec-result-section">`;
      html += `<div class="tool-exec-section-label">${result.isError ? "Error" : "Result"}</div>`;
      const resultText = result.content || "";
      const isLong = resultText.length > 500;
      html += `<div class="tool-exec-result-content ${resultClass} ${isLong ? "truncatable" : ""}" ${isLong ? 'onclick="this.classList.toggle(\'expanded\')"' : ""}>`;
      html += renderMarkdown(resultText);
      if (isLong) {
        html += `<div class="tool-exec-result-fade"></div>`;
      }
      html += `</div>`;
      html += `</div>`;
    }

    html += `</div>`; // item-body
    html += `</div>`; // item
  }

  html += `</div>`; // items
  html += `</div>`; // block

  return html;
}

// Global toggle functions for tool execution blocks
window.toggleToolBlock = function(headerEl) {
  headerEl.closest(".tool-exec-block").classList.toggle("collapsed");
};
window.toggleToolItem = function(headerEl) {
  headerEl.closest(".tool-exec-item").classList.toggle("expanded");
};
window.approveToolCalls = function(index) {
  if (state._pendingToolApproval) {
    state._pendingToolApproval.resolve(true);
    state._pendingToolApproval = null;
  }
};
window.rejectToolCalls = function(index) {
  if (state._pendingToolApproval) {
    state._pendingToolApproval.resolve(false);
    state._pendingToolApproval = null;
  }
};

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

/** Format file sizes: 1024 -> "1.0 KB", 1048576 -> "1.0 MB" */
function formatFileSize(bytes) {
  if (bytes == null) return "";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
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

function escapeAttr(str) {
  return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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

// ─── File Upload ────────────────────────────────────────────────────────

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
const PDF_TYPE = "application/pdf";
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

function handleFileSelect(e) {
  addFiles(e.target.files);
  // Reset so the same file can be re-selected
  dom.fileInput.value = "";
}

function addFiles(fileList) {
  for (const file of fileList) {
    if (file.size > MAX_FILE_SIZE) {
      alert(`File "${file.name}" exceeds the 20 MB limit.`);
      continue;
    }
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const isImage = IMAGE_TYPES.includes(file.type);
    const isPdf = file.type === PDF_TYPE;
    const entry = { id, file, name: file.name, size: file.size, mimeType: file.type, type: isImage ? "image" : isPdf ? "pdf" : "text", dataUrl: null };
    state.attachments.push(entry);

    // Read file
    const reader = new FileReader();
    if (isImage || isPdf) {
      reader.onload = () => { entry.dataUrl = reader.result; renderAttachmentPreview(); };
      reader.readAsDataURL(file);
    } else {
      reader.onload = () => { entry.dataUrl = reader.result; renderAttachmentPreview(); };
      reader.readAsText(file);
    }
  }
  renderAttachmentPreview();
}

function removeAttachment(id) {
  state.attachments = state.attachments.filter(a => a.id !== id);
  renderAttachmentPreview();
}

function clearAttachments() {
  state.attachments = [];
  renderAttachmentPreview();
}

function renderAttachmentPreview() {
  if (state.attachments.length === 0) {
    dom.attachmentPreview.style.display = "none";
    dom.uploadBtn.classList.remove("has-attachments");
    return;
  }

  dom.attachmentPreview.style.display = "flex";
  dom.uploadBtn.classList.add("has-attachments");

  dom.attachmentPreview.innerHTML = state.attachments.map(a => {
    const thumb = a.type === "image" && a.dataUrl
      ? `<img class="attachment-pill-thumb" src="${a.dataUrl}" alt="${escapeAttr(a.name)}">`
      : `<div class="attachment-pill-icon">${getFileExt(a.name)}</div>`;
    return `<div class="attachment-pill" data-attachment-id="${a.id}">
      ${thumb}
      <span class="attachment-pill-name" title="${escapeAttr(a.name)}">${escapeHtml(a.name)}</span>
      <button class="attachment-pill-remove" title="Remove" data-attachment-id="${a.id}">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>`;
  }).join("");

  dom.attachmentPreview.querySelectorAll(".attachment-pill-remove").forEach(btn => {
    btn.addEventListener("click", () => removeAttachment(btn.dataset.attachmentId));
  });
}

function getFileExt(name) {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).slice(0, 4) : "file";
}

/**
 * Build content parts from text + attachments for the API message.
 * Returns either a string (text only) or an array of content parts (multimodal).
 */
function buildUserContent(text, attachments) {
  if (!attachments || attachments.length === 0) return text;

  const parts = [];

  for (const a of attachments) {
    if (a.type === "image" && a.dataUrl) {
      parts.push({ type: "image_url", image_url: { url: a.dataUrl, detail: "auto" } });
    } else if (a.type === "pdf" && a.dataUrl) {
      // PDFs: send as a document source for providers that support it (OpenAI, Anthropic, Gemini).
      // We include both a file content part and a text note for providers that don't understand it.
      parts.push({
        type: "file",
        file: { filename: a.name, data: a.dataUrl },
      });
    } else if (a.dataUrl) {
      // Text file: inject content as a text block
      parts.push({ type: "text", text: `[File: ${a.name}]\n\`\`\`\n${a.dataUrl}\n\`\`\`` });
    }
  }

  if (text) parts.push({ type: "text", text });

  return parts;
}

/**
 * Format attachment metadata stored on a user message for later re-rendering.
 */
function buildAttachmentMeta(attachments) {
  return attachments.map(a => ({
    id: a.id,
    name: a.name,
    type: a.type,
    mimeType: a.mimeType,
    size: a.size,
    dataUrl: a.type === "image" ? a.dataUrl : null, // only store data URLs for images
  }));
}

// ─── Send Message ───────────────────────────────────────────────────────────

async function sendMessage() {
  const text = dom.userInput.value.trim();
  if ((!text && state.attachments.length === 0) || state.isGenerating) return;

  // Ensure we have an active chat
  if (!state.activeChatId) {
    newChat();
  }

  const chat = getActiveChat();
  if (!chat) return;

  // Update chat metadata
  chat.provider = state.provider;
  chat.model = state.model;

  // Build content (multimodal if attachments present)
  const currentAttachments = [...state.attachments];
  const content = buildUserContent(text, currentAttachments);

  // Add user message with optional attachment metadata for rendering
  const userMsg = { role: "user", content };
  if (currentAttachments.length > 0) {
    userMsg._attachments = buildAttachmentMeta(currentAttachments);
  }
  chat.messages.push(userMsg);

  // Set title from first message
  if (chat.messages.length === 1) {
    const titleText = text || currentAttachments.map(a => a.name).join(", ");
    chat.title = titleText.slice(0, 50) + (titleText.length > 50 ? "..." : "");
    renderChatList();
  }

  // Clear input and attachments
  dom.userInput.value = "";
  clearAttachments();
  autoResize();

  // Render user message
  renderMessages();

  // Send to API (with tool-use loop)
  state.isGenerating = true;
  state.abortController = new AbortController();
  updateUI();

  try {
    await runAgentLoop(chat);
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

/**
 * The agentic loop: send messages to the LLM, handle tool calls, repeat.
 * Caps at MAX_TOOL_ROUNDS iterations to prevent infinite loops.
 */
const MAX_TOOL_ROUNDS = 10;

async function runAgentLoop(chat) {
  const mcpTools = typeof mcpManager !== "undefined" ? mcpManager.getAllTools() : [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    // Build API messages from chat history
    const apiMessages = buildApiMessages(chat);

    const { url, headers, body } = buildRequest({
      provider: state.provider,
      model: state.model || PROVIDERS[state.provider].defaultModel,
      messages: apiMessages,
      systemMessage: state.systemMessage,
      temperature: state.temperature,
      maxTokens: state.maxTokens,
      topP: state.topP,
      stream: state.streaming,
      corsProxy: state.corsProxy,
      mcpTools: mcpTools.length > 0 ? mcpTools : undefined,
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

    let toolCalls = null;

    if (state.streaming) {
      toolCalls = await handleStreamingResponse(response, chat);
    } else {
      toolCalls = await handleNonStreamingResponse(response, chat);
    }

    // If no tool calls, we're done
    if (!toolCalls || toolCalls.length === 0) {
      return;
    }

    // Execute tool calls and feed results back
    await executeToolCalls(chat, toolCalls);
  }

  // If we exhausted the loop, add an error
  chat.messages.push({ role: "error", content: "Tool call limit reached (max " + MAX_TOOL_ROUNDS + " rounds)." });
  renderMessages();
}

/**
 * Build API messages from chat history, handling different message types.
 */
function buildApiMessages(chat) {
  const messages = [];
  for (const msg of chat.messages) {
    if (msg.role === "user") {
      // content may be a string or an array of content parts (multimodal)
      messages.push({ role: msg.role, content: msg.content });
    } else if (msg.role === "assistant") {
      // Skip assistant messages annotated with _toolCalls — the following
      // tool_result's _apiMessages already contains the correctly formatted
      // assistant message (with tool_use blocks for Anthropic, functionCall
      // parts for Gemini, or tool_calls for OpenAI-compatible providers).
      if (!msg._toolCalls) {
        messages.push({ role: msg.role, content: msg.content });
      }
    } else if (msg.role === "tool_result") {
      // Push the provider-formatted messages that were saved
      if (msg._apiMessages) {
        messages.push(...msg._apiMessages);
      }
    }
    // Skip "error", "tool_call" display-only messages
  }
  return messages;
}

/**
 * Execute MCP tool calls and add results to the chat.
 * Shows real-time per-tool progress with spinners.
 * Supports tool approval mode (human-in-the-loop).
 */
async function executeToolCalls(chat, toolCalls) {
  const toolCallMsgIndex = chat.messages.length;

  // Add tool-call display message
  chat.messages.push({
    role: "tool_call",
    content: toolCalls.map(tc => `${tc.name}(${tc.arguments})`).join("\n"),
    _toolCallData: toolCalls,
    _pendingApproval: state.toolApproval,
  });
  renderMessages();
  scrollToBottom();

  // If approval mode, wait for user decision
  if (state.toolApproval) {
    const approved = await new Promise(resolve => {
      state._pendingToolApproval = { resolve };
    });

    chat.messages[toolCallMsgIndex]._pendingApproval = false;

    if (!approved) {
      // User rejected — add rejection result and return
      const rejResults = toolCalls.map(tc => ({
        callId: tc.id,
        name: tc.name,
        content: "Tool execution was rejected by the user.",
        isError: true,
      }));

      const apiMessages = buildToolResultMessages(state.provider, toolCalls, rejResults);
      chat.messages.push({
        role: "tool_result",
        content: rejResults.map(r => `${r.name}: ${r.content}`).join("\n\n"),
        _results: rejResults,
        _apiMessages: apiMessages,
      });
      annotateAssistantWithToolCalls(chat, toolCalls);
      renderMessages();
      saveState();
      return;
    }

    // Approved — update the display and continue
    renderMessages();
  }

  // Get the tool execution block DOM element for live updates
  const execBlock = dom.messages.querySelector(`.tool-exec-block[data-index="${toolCallMsgIndex}"]`);

  const results = [];
  for (let i = 0; i < toolCalls.length; i++) {
    const tc = toolCalls[i];

    // Update item to "executing" in the DOM
    if (execBlock) {
      const item = execBlock.querySelector(`.tool-exec-item[data-tool-index="${i}"]`);
      if (item) {
        item.dataset.status = "executing";
        const statusEl = item.querySelector(".tool-exec-status");
        if (statusEl) {
          statusEl.className = "tool-exec-status executing";
          statusEl.innerHTML = TOOL_ICONS.spinner;
        }
      }
    }

    try {
      const args = typeof tc.arguments === "string" ? safeParseJSON(tc.arguments) : tc.arguments;
      const result = await mcpManager.executeTool(tc.name, args);
      const text = mcpResultToText(result);
      results.push({
        callId: tc.id,
        name: tc.name,
        content: text,
        isError: result.isError || false,
      });
    } catch (err) {
      results.push({
        callId: tc.id,
        name: tc.name,
        content: `Error: ${err.message}`,
        isError: true,
      });
    }

    // Update item to "done" or "error" in the DOM
    const r = results[results.length - 1];
    if (execBlock) {
      const item = execBlock.querySelector(`.tool-exec-item[data-tool-index="${i}"]`);
      if (item) {
        item.dataset.status = r.isError ? "error" : "done";
        const statusEl = item.querySelector(".tool-exec-status");
        if (statusEl) {
          statusEl.className = `tool-exec-status ${r.isError ? "error" : "done"}`;
          statusEl.innerHTML = r.isError ? TOOL_ICONS.error : TOOL_ICONS.check;
        }
        // Append result into item body
        const body = item.querySelector(".tool-exec-item-body");
        if (body && !body.querySelector(".tool-exec-result-section")) {
          const section = document.createElement("div");
          section.className = "tool-exec-section tool-exec-result-section";
          const resultText = r.content || "";
          const isLong = resultText.length > 500;
          section.innerHTML = `<div class="tool-exec-section-label">${r.isError ? "Error" : "Result"}</div>`
            + `<div class="tool-exec-result-content ${r.isError ? "is-error" : ""} ${isLong ? "truncatable" : ""}">`
            + renderMarkdown(resultText)
            + (isLong ? `<div class="tool-exec-result-fade"></div>` : "")
            + `</div>`;
          body.appendChild(section);
        }
      }
    }
  }

  // Update header badge
  if (execBlock) {
    const header = execBlock.querySelector(".tool-exec-header");
    const oldBadge = header?.querySelector(".tool-exec-badge");
    if (oldBadge) {
      const hasErrors = results.some(r_ => r_.isError);
      oldBadge.className = `tool-exec-badge ${hasErrors ? "error" : "success"}`;
      oldBadge.innerHTML = hasErrors ? "error" : "done";
    }
    execBlock.dataset.executing = "false";
  }

  // Build provider-formatted messages for the API
  const apiMessages = buildToolResultMessages(state.provider, toolCalls, results);

  // Add tool-result display message (with API messages embedded for the next round)
  chat.messages.push({
    role: "tool_result",
    content: results.map(r => `${r.name}: ${r.isError ? "ERROR: " : ""}${r.content}`).join("\n\n"),
    _results: results,
    _apiMessages: apiMessages,
  });

  // Annotate the last assistant message with tool_calls metadata
  annotateAssistantWithToolCalls(chat, toolCalls);

  saveState();
}

/**
 * Annotate the last assistant message in the chat with tool_calls metadata
 * so it can be correctly rebuilt for the API in future rounds.
 */
function annotateAssistantWithToolCalls(chat, toolCalls) {
  for (let i = chat.messages.length - 1; i >= 0; i--) {
    if (chat.messages[i].role === "assistant") {
      chat.messages[i]._toolCalls = toolCalls.map(tc => ({
        id: tc.id,
        type: "function",
        function: { name: tc.name, arguments: tc.arguments },
      }));
      break;
    }
  }
}

async function handleStreamingResponse(response, chat) {
  const reader = response.body.getReader();
  const parser = getStreamParser(state.provider);
  const { msgEl, index } = appendStreamingMessage();

  let fullText = "";
  let rawUsage = null;
  let finishReason = null;

  // Accumulate tool calls from stream deltas
  const accToolCalls = []; // [{id, name, arguments}]

  try {
    for await (const event of parser(reader)) {
      switch (event.type) {
        case "delta":
          fullText += event.text;
          chat.messages[index].content = fullText;
          updateStreamingMessage(msgEl, fullText);
          break;
        case "tool_call_delta":
          // OpenAI-style incremental tool call deltas
          if (event.index != null) {
            while (accToolCalls.length <= event.index) {
              accToolCalls.push({ id: "", name: "", arguments: "" });
            }
            const tc = accToolCalls[event.index];
            if (event.id) tc.id = event.id;
            if (event.name) tc.name += event.name;
            if (event.arguments) tc.arguments += event.arguments;
          }
          break;
        case "tool_call_start":
          // Anthropic tool_use block start
          accToolCalls.push({ id: event.id || "", name: event.name || "", arguments: "" });
          break;
        case "tool_call_complete":
          // Gemini sends complete function calls
          accToolCalls.push({
            id: `gemini_call_${accToolCalls.length}`,
            name: event.name,
            arguments: event.arguments,
          });
          break;
        case "usage":
          rawUsage = { ...rawUsage, ...event.usage };
          break;
        case "error":
          throw new Error(event.error);
        case "finish":
          finishReason = event.reason;
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

  // Return tool calls if present
  if (accToolCalls.length > 0 && accToolCalls.some(tc => tc.name)) {
    return accToolCalls.filter(tc => tc.name);
  }

  return null;
}

async function handleNonStreamingResponse(response, chat) {
  const data = await response.json();
  const { text, usage } = parseResponse(state.provider, data);

  // Check for tool calls
  const toolCalls = parseToolCalls(state.provider, data);

  chat.messages.push({
    role: "assistant",
    content: text,
    usage,
  });

  renderMessages();

  return toolCalls;
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
    state.modality = settings.modality || "chat";
    state.toolApproval = settings.toolApproval || false;

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
      modality: state.modality,
      toolApproval: state.toolApproval,
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

// ─── MCP Dropdown (Quick Access) ─────────────────────────────────────────────

function toggleMcpDropdown(e) {
  e.stopPropagation();
  if (!dom.mcpDropdown) return;

  const isVisible = dom.mcpDropdown.style.display === "block";
  if (isVisible) {
    dom.mcpDropdown.style.display = "none";
    return;
  }

  // Build dropdown content
  const servers = typeof mcpManager !== "undefined" ? mcpManager.servers : [];
  const tools = typeof mcpManager !== "undefined" ? mcpManager.getAllTools() : [];

  let html = `<div class="mcp-dropdown-header">`;
  html += `<span class="mcp-dropdown-title">MCP Tools</span>`;
  html += `<button class="btn btn-ghost btn-sm" onclick="openSettingsModal('mcp'); document.getElementById('mcp-dropdown').style.display='none'">Manage</button>`;
  html += `</div>`;

  if (servers.length === 0) {
    html += `<div class="mcp-dropdown-empty">`;
    html += `<p>No MCP servers connected</p>`;
    html += `<button class="btn btn-primary btn-sm" onclick="openSettingsModal('mcp'); document.getElementById('mcp-dropdown').style.display='none'">Add Server</button>`;
    html += `</div>`;
  } else {
    // Server status pills
    html += `<div class="mcp-dropdown-servers">`;
    for (const s of servers) {
      const dot = s.status === "connected" ? "connected" : s.status === "error" ? "error" : "connecting";
      html += `<span class="mcp-dropdown-server-pill mcp-dot-${dot}" title="${escapeAttr(s.url)}">`;
      html += `<span class="mcp-server-dot mcp-dot-${dot}"></span>`;
      html += `${escapeHtml(s.name)}`;
      if (s.status === "connected") html += ` <span class="muted">(${s.tools.length})</span>`;
      html += `</span>`;
    }
    html += `</div>`;

    // Tool list
    if (tools.length > 0) {
      html += `<div class="mcp-dropdown-tools">`;
      for (const t of tools) {
        html += `<div class="mcp-dropdown-tool">`;
        html += `<span class="mcp-dropdown-tool-name">${escapeHtml(t.name)}</span>`;
        if (t.description) {
          html += `<span class="mcp-dropdown-tool-desc">${escapeHtml(t.description.length > 80 ? t.description.slice(0, 80) + "..." : t.description)}</span>`;
        }
        html += `</div>`;
      }
      html += `</div>`;
    } else {
      html += `<div class="mcp-dropdown-empty"><p>Connected servers have no tools</p></div>`;
    }
  }

  dom.mcpDropdown.innerHTML = html;
  dom.mcpDropdown.style.display = "block";
}

// ─── MCP Server Management ──────────────────────────────────────────────────

async function handleMcpAddServer() {
  const url = dom.mcpServerUrl.value.trim();
  if (!url) return;

  const name = dom.mcpServerName.value.trim();

  dom.mcpAddBtn.disabled = true;
  dom.mcpAddBtn.textContent = "Connecting...";

  try {
    await mcpManager.addServer(url, name, state.corsProxy);
    dom.mcpServerUrl.value = "";
    dom.mcpServerName.value = "";
  } catch (err) {
    // Error is stored on the server entry — renderMcpServerList will show it
    // But if it's a duplicate, alert
    if (err.message.includes("already connected")) {
      alert(err.message);
    }
  }

  dom.mcpAddBtn.disabled = false;
  dom.mcpAddBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg> Connect Server`;

  renderMcpServerList();
  renderMcpToolList();
  updateMcpIndicator();
}

function renderMcpServerList() {
  if (!dom.mcpServerList) return;

  const servers = mcpManager.servers;
  if (servers.length === 0) {
    dom.mcpServerList.innerHTML = `<div class="mcp-servers-empty">No MCP servers connected</div>`;
    return;
  }

  dom.mcpServerList.innerHTML = servers.map(s => {
    const statusClass = s.status === "connected" ? "mcp-status-ok" : s.status === "error" ? "mcp-status-err" : "mcp-status-pending";
    const statusDot = s.status === "connected" ? "connected" : s.status === "error" ? "error" : "connecting";
    const toolCount = s.tools.length;

    let html = `<div class="mcp-server-item ${statusClass}" data-server-id="${s.id}">`;
    html += `<div class="mcp-server-info">`;
    html += `<span class="mcp-server-dot mcp-dot-${statusDot}"></span>`;
    html += `<span class="mcp-server-name">${escapeHtml(s.name)}</span>`;
    if (s.status === "connected") {
      html += `<span class="mcp-server-tools">${toolCount} tool${toolCount !== 1 ? "s" : ""}</span>`;
    }
    html += `</div>`;
    html += `<div class="mcp-server-actions">`;
    if (s.status === "error") {
      html += `<button class="icon-btn mcp-reconnect" data-server-id="${s.id}" title="Reconnect"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg></button>`;
    }
    html += `<button class="icon-btn mcp-remove" data-server-id="${s.id}" title="Disconnect"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>`;
    html += `</div>`;

    if (s.status === "error" && s.error) {
      html += `<div class="mcp-server-error">${escapeHtml(s.error)}</div>`;
    }

    html += `</div>`;
    return html;
  }).join("");

  // Attach event listeners
  dom.mcpServerList.querySelectorAll(".mcp-remove").forEach(btn => {
    btn.addEventListener("click", async () => {
      await mcpManager.removeServer(btn.dataset.serverId);
      renderMcpServerList();
      renderMcpToolList();
      updateMcpIndicator();
    });
  });

  dom.mcpServerList.querySelectorAll(".mcp-reconnect").forEach(btn => {
    btn.addEventListener("click", async () => {
      await mcpManager.reconnectServer(btn.dataset.serverId);
      renderMcpServerList();
      renderMcpToolList();
      updateMcpIndicator();
    });
  });
}

function renderMcpToolList() {
  if (!dom.mcpToolList || !dom.mcpToolsSection) return;

  const tools = mcpManager.getAllTools();
  dom.mcpToolCount.textContent = tools.length;

  if (tools.length === 0) {
    dom.mcpToolsSection.style.display = "none";
    return;
  }

  dom.mcpToolsSection.style.display = "";

  dom.mcpToolList.innerHTML = tools.map(t => {
    let html = `<div class="mcp-tool-item">`;
    html += `<div class="mcp-tool-name">${escapeHtml(t.name)}</div>`;
    if (t.description) {
      html += `<div class="mcp-tool-desc">${escapeHtml(t.description)}</div>`;
    }
    html += `<div class="mcp-tool-server">${escapeHtml(t._serverName)}</div>`;
    html += `</div>`;
    return html;
  }).join("");
}

function updateMcpIndicator() {
  if (!dom.mcpToolBadge || !dom.mcpIndicator) return;

  const count = mcpManager.totalToolCount();
  const connected = mcpManager.connectedCount();

  if (count > 0) {
    dom.mcpToolBadge.textContent = count;
    dom.mcpIndicator.classList.add("has-tools");
  } else {
    dom.mcpToolBadge.textContent = "";
    dom.mcpIndicator.classList.remove("has-tools");
  }

  dom.mcpIndicator.classList.toggle("has-connected", connected > 0);
}

// ─── Boot ───────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", init);
