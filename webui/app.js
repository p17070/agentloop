/**
 * AgentLoop WebUI — Main Application
 *
 * Chat interface with streaming support for 11 LLM providers.
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
  customEndpoint: "",
  chats: [],        // { id, title, provider, model, messages[] }
  activeChatId: null,
  isGenerating: false,
  abortController: null,
};

// ─── DOM Elements ───────────────────────────────────────────────────────────

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const dom = {
  sidebar: $("#sidebar"),
  sidebarClose: $("#sidebar-close"),
  sidebarOpen: $("#sidebar-open"),
  providerSelect: $("#provider-select"),
  modelInput: $("#model-input"),
  modelHint: $("#model-hint"),
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
  themeToggle: $("#theme-toggle"),
  themeLabel: $("#theme-label"),
  themeIconDark: $("#theme-icon-dark"),
  themeIconLight: $("#theme-icon-light"),
  newChatBtn: $("#new-chat-btn"),
  clearChatBtn: $("#clear-chat-btn"),
  exportBtn: $("#export-btn"),
  chatList: $("#chat-list"),
  messages: $("#messages"),
  userInput: $("#user-input"),
  sendBtn: $("#send-btn"),
  stopBtn: $("#stop-btn"),
  tokenCount: $("#token-count"),
  topbarProvider: $("#topbar-provider"),
  topbarModel: $("#topbar-model"),
};

// ─── Initialization ─────────────────────────────────────────────────────────

function init() {
  loadState();
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
    applyProvider(state.provider);
    saveState();
  });

  // Model input
  dom.modelInput.addEventListener("input", (e) => {
    state.model = e.target.value;
    updateTopbar();
    saveState();
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

  // Custom endpoint
  dom.customEndpoint.addEventListener("input", (e) => {
    state.customEndpoint = e.target.value;
    saveState();
  });

  // Theme toggle
  dom.themeToggle.addEventListener("click", toggleTheme);

  // New chat
  dom.newChatBtn.addEventListener("click", newChat);

  // Clear chat
  dom.clearChatBtn.addEventListener("click", clearCurrentChat);

  // Export
  dom.exportBtn.addEventListener("click", exportChat);

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

function applyProvider(provider) {
  const entry = PROVIDERS[provider];
  if (!entry) return;

  dom.providerSelect.value = provider;

  // Set model
  if (!state.model || !entry.models.includes(state.model)) {
    state.model = entry.defaultModel;
  }
  dom.modelInput.value = state.model;
  dom.modelInput.placeholder = entry.defaultModel;

  // Model suggestions
  dom.modelHint.textContent = entry.models.slice(0, 4).join(", ");

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
  dom.customEndpoint.value = state.customEndpoint;

  updateTopbar();
}

function updateTopbar() {
  const entry = PROVIDERS[state.provider];
  dom.topbarProvider.textContent = entry?.name || state.provider;
  dom.topbarModel.textContent = state.model || entry?.defaultModel || "";
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
  state.chats = state.chats.filter(c => c.id !== chatId);
  if (state.activeChatId === chatId) {
    state.activeChatId = state.chats[0]?.id || null;
  }
  renderMessages();
  renderChatList();
  saveState();
}

function clearCurrentChat() {
  const chat = getActiveChat();
  if (!chat) return;
  chat.messages = [];
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
        <p>Bring Your Own Key — chat with 11 LLM providers from one interface.</p>
        <p class="muted">Select a provider, enter your API key, and start chatting.</p>
      </div>`;
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
    const parts = [];
    if (msg.usage.input_tokens) parts.push(`${msg.usage.input_tokens} in`);
    if (msg.usage.output_tokens) parts.push(`${msg.usage.output_tokens} out`);
    if (parts.length) meta = `<div class="message-meta"><span>${parts.join(" · ")}</span></div>`;
  }

  return `
    <div class="message ${roleClass}" data-index="${index}">
      <div class="message-avatar">${avatar}</div>
      <div class="message-body">${content}${meta}</div>
    </div>`;
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

  // Add usage info
  if (usage) {
    const parts = [];
    if (usage.input_tokens) parts.push(`${usage.input_tokens} in`);
    if (usage.output_tokens) parts.push(`${usage.output_tokens} out`);
    if (parts.length) {
      const meta = document.createElement("div");
      meta.className = "message-meta";
      meta.innerHTML = `<span>${parts.join(" · ")}</span>`;
      msgEl.querySelector(".message-body").appendChild(meta);
    }
  }

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
      customEndpoint: state.customEndpoint,
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
  let usage = null;

  try {
    for await (const event of parser(reader)) {
      switch (event.type) {
        case "delta":
          fullText += event.text;
          chat.messages[index].content = fullText;
          updateStreamingMessage(msgEl, fullText);
          break;
        case "usage":
          usage = { ...usage, ...event.usage };
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
  dom.chatList.innerHTML = state.chats.map(chat => `
    <div class="chat-list-item ${chat.id === state.activeChatId ? "active" : ""}"
         data-chat-id="${chat.id}"
         onclick="window._switchChat('${chat.id}')">
      <span class="chat-title">${escapeHtml(chat.title)}</span>
      <button class="icon-btn chat-delete" onclick="event.stopPropagation(); window._deleteChat('${chat.id}')" title="Delete">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>`).join("");
}

// Expose functions for inline handlers
window._switchChat = switchChat;
window._deleteChat = deleteChat;

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
    state.customEndpoint = settings.customEndpoint || "";

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
      customEndpoint: state.customEndpoint,
    }));

    localStorage.setItem("agentloop_chats", JSON.stringify(state.chats));
    localStorage.setItem("agentloop_active_chat", state.activeChatId || "");
  } catch {
    // localStorage might be full — silently fail
  }
}

// ─── Boot ───────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", init);
