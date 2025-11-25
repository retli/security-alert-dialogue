// MCP (Model Context Protocol) client service
import { MCP_METHODS, MCP_EVENTS } from '../config/constants.js';
import { DEFAULT_CONFIG } from '../config/defaults.js';
import { logger } from '../utils/logger.js';

export class MCPClient {
constructor(baseUrl) {
this.baseUrl = baseUrl;
this.timeout = DEFAULT_CONFIG.mcp.timeout;
}

/**
* Get list of available tools from MCP service
*/
async getTools() {
logger.info('[MCP] Connecting to:', this.baseUrl);

return new Promise((resolve, reject) => {
let settled = false;
let es = null;
let sessionUrl = null;
let requestId = 0;
let initializeRequestId = null;
let toolsListRequestId = null;
let connectionStartTime = Date.now();

const cleanup = () => {
if (es) try { es.close(); } catch {}
};

const timer = setTimeout(() => {
if (settled) return;
settled = true;
cleanup();
const elapsed = Date.now() - connectionStartTime;
logger.error(`[MCP] Timeout after ${elapsed}ms. SessionUrl: ${sessionUrl ? 'set' : 'not set'}, InitializeId: ${initializeRequestId}, ToolsListId: ${toolsListRequestId}`);
reject(new Error(`Timeout: No tools received after ${elapsed}ms`));
}, this.timeout);

// Send JSON-RPC request (returns ID immediately for async tracking)
const sendRequest = (url, method, params = {}) => {
requestId++;
const id = requestId;

logger.debug(`[MCP] Sending request ${method}:`, { id, params });

// Send request asynchronously but return ID immediately
fetch(url, {
method: 'POST',
headers: {
'Content-Type': 'application/json',
'Accept': 'application/json'
},
body: JSON.stringify({
jsonrpc: '2.0',
id,
method,
params
})
}).then(response => {
logger.debug(`[MCP] ${method} response:`, response.status);
}).catch(err => {
logger.error(`[MCP] ${method} request failed:`, err);
});

return id; // Return ID immediately for tracking
};

// Send notification
const sendNotification = async (url, method, params = {}) => {
logger.debug(`[MCP] Sending notification ${method}:`, params);

try {
const response = await fetch(url, {
method: 'POST',
headers: {
'Content-Type': 'application/json',
'Accept': 'application/json'
},
body: JSON.stringify({
jsonrpc: '2.0',
method,
params
})
});

logger.debug(`[MCP] ${method} notification response:`, response.status);
return response.ok;
} catch (err) {
logger.error(`[MCP] ${method} notification failed:`, err);
return false;
}
};

try {
// Connect to main SSE endpoint (add timestamp to prevent caching)
const url = this.baseUrl + (this.baseUrl.includes('?') ? '&' : '?') + '_t=' + Date.now();
logger.info('[MCP] Creating EventSource:', url);
es = new EventSource(url);

es.onopen = () => {
logger.info('[MCP] SSE connection opened successfully');
};

// Listen to all messages
es.onmessage = async (event) => {
if (settled) return;

logger.debug('[MCP] Received message:', event.data);

try {
const data = JSON.parse(event.data);

// Handle JSON-RPC response
if (data.jsonrpc === '2.0' && data.id !== undefined) {
// initialize response
if (data.id === initializeRequestId && data.result) {
logger.info('[MCP] ✓ Initialize successful, result:', data.result);

// Send initialized notification
logger.info('[MCP] → Sending initialized notification...');
await sendNotification(sessionUrl, MCP_METHODS.NOTIFICATIONS_INITIALIZED, {});

// Then request tools list (ID is returned immediately)
logger.info('[MCP] → Requesting tools list...');
toolsListRequestId = sendRequest(sessionUrl, MCP_METHODS.TOOLS_LIST, {});
logger.info('[MCP] Tools list request sent with ID:', toolsListRequestId);
return;
}

// tools/list response
if (data.id === toolsListRequestId && data.result?.tools) {
logger.info('[MCP] ✓ ✓ ✓ Found tools:', data.result.tools.length, 'tools');
settled = true;
clearTimeout(timer);
cleanup();
resolve(data.result.tools);
return;
}

// Error response
if (data.error) {
logger.error('[MCP] ✗ RPC Error:', data.error);
// 如果是致命错误，立即失败
if (data.id === initializeRequestId || data.id === toolsListRequestId) {
settled = true;
clearTimeout(timer);
cleanup();
reject(new Error(`MCP Error: ${data.error.message || JSON.stringify(data.error)}`));
return;
}
}
}

// Check other tool list formats
if (data.tools && Array.isArray(data.tools)) {
logger.info('[MCP] Found tools (direct format)');
settled = true;
clearTimeout(timer);
cleanup();
resolve(data.tools);
return;
}

} catch (parseErr) {
logger.debug('[MCP] Non-JSON message');
}
};

// Listen to endpoint event
es.addEventListener(MCP_EVENTS.ENDPOINT, async (event) => {
if (settled) return;

logger.info('[MCP] ✓ Received endpoint event:', event.data);
sessionUrl = this.baseUrl.replace(/\/sse$/, '') + event.data;
logger.info('[MCP] Session URL set to:', sessionUrl);

// Wait for connection to stabilize
logger.debug('[MCP] Waiting for connection to stabilize...');
await new Promise(r => setTimeout(r, 300));

// Send initialize request (ID is returned immediately)
logger.info('[MCP] → Sending initialize request...');
initializeRequestId = sendRequest(sessionUrl, MCP_METHODS.INITIALIZE, {
protocolVersion: DEFAULT_CONFIG.mcp.protocolVersion,
capabilities: { tools: {} },
clientInfo: DEFAULT_CONFIG.mcp.clientInfo
});
logger.info('[MCP] Initialize request sent with ID:', initializeRequestId);
});

es.onerror = (error) => {
if (settled) return;
logger.error('[MCP] ✗ SSE connection error. ReadyState:', es?.readyState);
settled = true;
clearTimeout(timer);
cleanup();
reject(new Error(`SSE connection failed. Check if the service is running at ${this.baseUrl}`));
};

} catch (err) {
if (settled) return;
settled = true;
clearTimeout(timer);
cleanup();
reject(err);
}
});
}

/**
* Call a specific tool
*/
async callTool(toolName, toolArgs = {}) {
logger.info('[MCP] 🔧 Calling tool:', toolName);
logger.info('[MCP] 📤 Tool arguments:', JSON.stringify(toolArgs, null, 2));

return new Promise((resolve, reject) => {
let settled = false;
let es = null;
let sessionUrl = null;
let requestId = 0;
let initializeRequestId = null;
let toolCallRequestId = null;

const cleanup = () => {
if (es) try { es.close(); } catch {}
};

const timer = setTimeout(() => {
if (settled) return;
settled = true;
cleanup();
reject(new Error('Tool call timeout'));
}, this.timeout);

const sendNotification = async (url, method, params = {}) => {
try {
await fetch(url, {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({
jsonrpc: '2.0',
method,
params
})
});
} catch (e) {
logger.error('[MCP] Notification failed:', e);
}
};

try {
// Add timestamp to prevent caching
const url = this.baseUrl + (this.baseUrl.includes('?') ? '&' : '?') + '_t=' + Date.now();
es = new EventSource(url);

es.onopen = () => logger.debug('[MCP] SSE connected');

es.onmessage = async (event) => {
if (settled) return;

try {
const data = JSON.parse(event.data);
logger.debug('[MCP] Received message:', data);

if (data.jsonrpc === '2.0' && data.id !== undefined) {
// initialize response
if (data.id === initializeRequestId && data.result) {
logger.debug('[MCP] Initialize successful');
await sendNotification(sessionUrl, MCP_METHODS.NOTIFICATIONS_INITIALIZED, {});

// Set tool call ID BEFORE sending request
requestId++;
toolCallRequestId = requestId;

// Call tool (send asynchronously)
logger.debug('[MCP] Calling tool:', toolName, 'ID:', toolCallRequestId);

fetch(sessionUrl, {
method: 'POST',
headers: {
'Content-Type': 'application/json',
'Accept': 'application/json'
},
body: JSON.stringify({
jsonrpc: '2.0',
id: toolCallRequestId,
method: MCP_METHODS.TOOLS_CALL,
params: {
name: toolName,
arguments: toolArgs
}
})
}).then(response => {
logger.debug('[MCP] tools/call response:', response.status);
}).catch(e => {
logger.error('[MCP] Tool call send failed:', e);
});

return;
}

// Tool call response
if (data.id === toolCallRequestId) {
logger.info('[MCP] 📥 Received tool call response for:', toolName);

if (data.result) {
logger.info('[MCP] ✅ Tool execution successful');
logger.info('[MCP] 📦 Tool result:', JSON.stringify(data.result, null, 2));
settled = true;
clearTimeout(timer);
cleanup();
resolve(data.result);
} else if (data.error) {
logger.error('[MCP] ❌ Tool execution failed:', data.error);
logger.error('[MCP] Error details:', JSON.stringify(data.error, null, 2));
settled = true;
clearTimeout(timer);
cleanup();
reject(new Error(data.error.message || JSON.stringify(data.error)));
}
}
}
} catch (e) {
logger.error('[MCP] Message parse failed:', e);
}
};

es.addEventListener(MCP_EVENTS.ENDPOINT, async (event) => {
if (settled) return;

logger.debug('[MCP] Received endpoint:', event.data);
sessionUrl = this.baseUrl.replace(/\/sse$/, '') + event.data;

// Wait for connection to stabilize
await new Promise(r => setTimeout(r, 500));

// Set initialize ID BEFORE sending request
requestId++;
initializeRequestId = requestId;

// Send initialize (asynchronously, ID already set)
logger.debug('[MCP] Sending initialize, ID:', initializeRequestId);

fetch(sessionUrl, {
method: 'POST',
headers: {
'Content-Type': 'application/json',
'Accept': 'application/json'
},
body: JSON.stringify({
jsonrpc: '2.0',
id: initializeRequestId,
method: MCP_METHODS.INITIALIZE,
params: {
protocolVersion: DEFAULT_CONFIG.mcp.protocolVersion,
capabilities: { tools: {} },
clientInfo: DEFAULT_CONFIG.mcp.clientInfo
}
})
}).then(response => {
logger.debug('[MCP] initialize response:', response.status);
}).catch(e => {
logger.error('[MCP] initialize send failed:', e);
});
});

es.onerror = () => {
logger.error('[MCP] SSE error');
if (!settled) {
settled = true;
clearTimeout(timer);
cleanup();
reject(new Error('SSE connection failed'));
}
};

} catch (error) {
logger.error('[MCP] Exception:', error);
if (!settled) {
settled = true;
clearTimeout(timer);
cleanup();
reject(error);
}
}
});
}
}