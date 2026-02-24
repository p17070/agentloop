/**
 * AgentLoop WebUI — MCP (Model Context Protocol) Client
 *
 * Implements the Streamable HTTP transport (spec 2025-03-26) for connecting
 * to remote MCP servers from the browser. Uses native fetch() — zero deps.
 *
 * Flow: initialize → listTools → callTool (repeatable) → disconnect
 */

// ─── MCP Client ────────────────────────────────────────────────────────────

class McpClient {
  /**
   * @param {string} url  The MCP server endpoint URL (e.g. "https://example.com/mcp")
   * @param {object} opts
   * @param {string} [opts.corsProxy]  Optional CORS proxy prefix
   * @param {object} [opts.headers]    Additional headers to include on every request
   */
  constructor(url, opts = {}) {
    this.url = url;
    this.corsProxy = opts.corsProxy || "";
    this.extraHeaders = opts.headers || {};
    this.sessionId = null;
    this.serverInfo = null;
    this.serverCapabilities = null;
    this.tools = [];
    this.connected = false;
    this._nextId = 1;
  }

  // ─── Internal Helpers ──────────────────────────────────────────────────

  /** Get the effective URL, with CORS proxy applied if set. */
  _effectiveUrl() {
    if (this.corsProxy && this.corsProxy.trim()) {
      return this.corsProxy.trim() + encodeURIComponent(this.url);
    }
    return this.url;
  }

  /** Build headers for a request. */
  _buildHeaders() {
    const headers = {
      "content-type": "application/json",
      "accept": "application/json, text/event-stream",
      ...this.extraHeaders,
    };
    if (this.sessionId) {
      headers["mcp-session-id"] = this.sessionId;
    }
    return headers;
  }

  /** Get next JSON-RPC request ID. */
  _nextRequestId() {
    return this._nextId++;
  }

  /**
   * Send a JSON-RPC request and parse the response.
   * Handles both JSON and SSE response modes per the spec.
   *
   * @param {string} method   JSON-RPC method name
   * @param {object} params   JSON-RPC params
   * @param {object} opts
   * @param {number} [opts.timeout=30000]  Request timeout in ms
   * @returns {Promise<object>}  The JSON-RPC result
   */
  async _request(method, params = {}, opts = {}) {
    const timeout = opts.timeout || 30000;
    const id = this._nextRequestId();

    const body = {
      jsonrpc: "2.0",
      id,
      method,
      params,
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(this._effectiveUrl(), {
        method: "POST",
        headers: this._buildHeaders(),
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      // Check for session ID in response
      const newSessionId = response.headers.get("mcp-session-id");
      if (newSessionId) {
        this.sessionId = newSessionId;
      }

      if (!response.ok) {
        const errText = await response.text();
        let errMsg;
        try {
          const parsed = JSON.parse(errText);
          errMsg = parsed.error?.message || parsed.message || errText;
        } catch {
          errMsg = errText;
        }
        throw new McpError(`MCP ${method}: ${response.status} ${response.statusText}: ${errMsg}`);
      }

      const contentType = (response.headers.get("content-type") || "").toLowerCase();

      // SSE response mode
      if (contentType.includes("text/event-stream")) {
        return await this._parseSSEResponse(response, id);
      }

      // JSON response mode
      const data = await response.json();

      // Handle JSON-RPC error
      if (data.error) {
        throw new McpError(`MCP ${method}: ${data.error.message || JSON.stringify(data.error)}`, data.error.code);
      }

      return data.result;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Parse an SSE stream to extract the JSON-RPC response matching our request ID.
   */
  async _parseSSEResponse(response, requestId) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let result = null;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;

          try {
            const data = JSON.parse(trimmed.slice(6));

            // Look for the response matching our request ID
            if (data.id === requestId) {
              if (data.error) {
                throw new McpError(
                  `MCP: ${data.error.message || JSON.stringify(data.error)}`,
                  data.error.code
                );
              }
              result = data.result;
            }
            // Also handle batched responses
            if (Array.isArray(data)) {
              const match = data.find(item => item.id === requestId);
              if (match) {
                if (match.error) {
                  throw new McpError(
                    `MCP: ${match.error.message || JSON.stringify(match.error)}`,
                    match.error.code
                  );
                }
                result = match.result;
              }
            }
          } catch (e) {
            if (e instanceof McpError) throw e;
            // Skip unparseable SSE chunks
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    if (result === null) {
      throw new McpError("MCP: No response received from SSE stream");
    }

    return result;
  }

  /**
   * Send a JSON-RPC notification (no response expected).
   */
  async _notify(method, params = {}) {
    const body = {
      jsonrpc: "2.0",
      method,
      params,
    };

    try {
      await fetch(this._effectiveUrl(), {
        method: "POST",
        headers: this._buildHeaders(),
        body: JSON.stringify(body),
      });
    } catch {
      // Notifications don't require a response — swallow errors
    }
  }

  // ─── Public API ────────────────────────────────────────────────────────

  /**
   * Initialize the MCP session.
   * Sends the initialize request, receives server capabilities,
   * then sends the initialized notification.
   */
  async initialize() {
    const result = await this._request("initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: {
        name: "AgentLoop WebUI",
        version: "1.0.0",
      },
    });

    this.serverInfo = result.serverInfo || {};
    this.serverCapabilities = result.capabilities || {};

    // Send initialized notification
    await this._notify("notifications/initialized");

    this.connected = true;
    return {
      serverInfo: this.serverInfo,
      capabilities: this.serverCapabilities,
    };
  }

  /**
   * List all tools available on the server.
   * Handles pagination automatically.
   * @returns {Promise<Array>}  Array of tool definitions
   */
  async listTools() {
    if (!this.connected) {
      throw new McpError("MCP: Not connected. Call initialize() first.");
    }

    // Only list tools if the server declared the tools capability
    if (!this.serverCapabilities?.tools) {
      this.tools = [];
      return [];
    }

    const allTools = [];
    let cursor = undefined;

    do {
      const params = {};
      if (cursor) params.cursor = cursor;

      const result = await this._request("tools/list", params);
      const tools = result.tools || [];
      allTools.push(...tools);
      cursor = result.nextCursor || null;
    } while (cursor);

    this.tools = allTools;
    return allTools;
  }

  /**
   * Call a tool on the MCP server.
   *
   * @param {string} name        Tool name
   * @param {object} arguments_  Tool arguments (as parsed object)
   * @returns {Promise<object>}  Tool result: { content: [...], isError?: boolean }
   */
  async callTool(name, arguments_ = {}) {
    if (!this.connected) {
      throw new McpError("MCP: Not connected. Call initialize() first.");
    }

    return await this._request("tools/call", {
      name,
      arguments: arguments_,
    }, { timeout: 60000 }); // Longer timeout for tool execution
  }

  /**
   * Disconnect from the MCP server.
   * Sends HTTP DELETE to terminate the session (if session ID exists).
   */
  async disconnect() {
    if (this.sessionId) {
      try {
        await fetch(this._effectiveUrl(), {
          method: "DELETE",
          headers: this._buildHeaders(),
        });
      } catch {
        // Best effort — swallow errors on disconnect
      }
    }

    this.connected = false;
    this.sessionId = null;
    this.tools = [];
    this.serverInfo = null;
    this.serverCapabilities = null;
  }
}

// ─── Error Class ─────────────────────────────────────────────────────────

class McpError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "McpError";
    this.code = code;
  }
}

// ─── MCP Server Manager ─────────────────────────────────────────────────

/**
 * Manages multiple MCP server connections.
 * Handles persistence, reconnection, and tool aggregation.
 */
const mcpManager = {
  /** @type {Array<{id: string, url: string, name: string, client: McpClient, tools: Array, status: string, error?: string}>} */
  servers: [],

  /** Load saved server configs from localStorage and reconnect. */
  async loadAndConnect() {
    const saved = mcpManager._loadSaved();
    for (const config of saved) {
      await mcpManager.addServer(config.url, config.name, config.corsProxy, config.headers);
    }
  },

  /** Add and connect to an MCP server. */
  async addServer(url, name, corsProxy, headers) {
    // Prevent duplicates
    if (mcpManager.servers.find(s => s.url === url)) {
      throw new McpError(`MCP server already connected: ${url}`);
    }

    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    const client = new McpClient(url, { corsProxy, headers });

    const entry = {
      id,
      url,
      name: name || url,
      client,
      tools: [],
      status: "connecting",
      error: null,
    };

    mcpManager.servers.push(entry);

    try {
      const { serverInfo } = await client.initialize();
      entry.name = name || serverInfo.name || url;
      entry.status = "connected";

      const tools = await client.listTools();
      entry.tools = tools;
    } catch (err) {
      entry.status = "error";
      entry.error = err.message;
    }

    mcpManager._save();
    return entry;
  },

  /** Remove and disconnect an MCP server. */
  async removeServer(id) {
    const idx = mcpManager.servers.findIndex(s => s.id === id);
    if (idx === -1) return;

    const entry = mcpManager.servers[idx];
    await entry.client.disconnect();
    mcpManager.servers.splice(idx, 1);
    mcpManager._save();
  },

  /** Reconnect a failed server. */
  async reconnectServer(id) {
    const entry = mcpManager.servers.find(s => s.id === id);
    if (!entry) return;

    entry.status = "connecting";
    entry.error = null;

    try {
      await entry.client.disconnect();
      const { serverInfo } = await entry.client.initialize();
      if (!entry.name || entry.name === entry.url) {
        entry.name = serverInfo.name || entry.url;
      }
      entry.status = "connected";

      const tools = await entry.client.listTools();
      entry.tools = tools;
    } catch (err) {
      entry.status = "error";
      entry.error = err.message;
    }

    mcpManager._save();
    return entry;
  },

  /** Get all tools across all connected servers. Returns [{serverName, serverUrl, ...toolDef}]. */
  getAllTools() {
    const tools = [];
    for (const server of mcpManager.servers) {
      if (server.status !== "connected") continue;
      for (const tool of server.tools) {
        tools.push({
          ...tool,
          _serverUrl: server.url,
          _serverName: server.name,
          _serverId: server.id,
        });
      }
    }
    return tools;
  },

  /** Get total connected server count. */
  connectedCount() {
    return mcpManager.servers.filter(s => s.status === "connected").length;
  },

  /** Get total tool count. */
  totalToolCount() {
    return mcpManager.getAllTools().length;
  },

  /** Execute a tool call — finds the right server and calls it. */
  async executeTool(toolName, arguments_) {
    for (const server of mcpManager.servers) {
      if (server.status !== "connected") continue;
      const tool = server.tools.find(t => t.name === toolName);
      if (tool) {
        return await server.client.callTool(toolName, arguments_);
      }
    }
    throw new McpError(`Tool not found: ${toolName}`);
  },

  /** Save server configs to localStorage (URLs + names only, no runtime state). */
  _save() {
    const configs = mcpManager.servers.map(s => ({
      url: s.url,
      name: s.name,
      corsProxy: s.client.corsProxy || undefined,
      headers: Object.keys(s.client.extraHeaders).length > 0 ? s.client.extraHeaders : undefined,
    }));
    try {
      localStorage.setItem("agentloop_mcp_servers", JSON.stringify(configs));
    } catch {
      // localStorage might be full
    }
  },

  /** Load saved server configs from localStorage. */
  _loadSaved() {
    try {
      return JSON.parse(localStorage.getItem("agentloop_mcp_servers") || "[]");
    } catch {
      return [];
    }
  },
};
