import {
  StorageService,
  type SecGuardSettings,
  type McpServerConfig,
  type McpTool
} from "../services/storage";
import { discoverMcpTools } from "../services/mcpDiscovery";

const llmEndpointInput = document.getElementById(
  "llm-endpoint"
) as HTMLInputElement;
const apiKeyInput = document.getElementById("api-key") as HTMLInputElement;
const modelNameInput = document.getElementById("model-name") as HTMLInputElement;
const accessCodeInput = document.getElementById(
  "access-code"
) as HTMLInputElement;
const autoRunCheckbox = document.getElementById("auto-run") as HTMLInputElement;
const maxStepsInput = document.getElementById("max-steps") as HTMLInputElement;

const serverSelect = document.getElementById(
  "mcp-server-select"
) as HTMLSelectElement;
const serverNameInput = document.getElementById(
  "mcp-server-name"
) as HTMLInputElement;
const serverUrlInput = document.getElementById(
  "mcp-server-url"
) as HTMLInputElement;
const toolSelect = document.getElementById(
  "mcp-tool-select"
) as HTMLSelectElement;
const toolListEl = document.getElementById(
  "mcp-tool-list"
) as HTMLElement;

const discoverBtn = document.getElementById(
  "discover-tools"
) as HTMLButtonElement;
const discoverStatus = document.getElementById(
  "discover-status"
) as HTMLElement;
const saveServerBtn = document.getElementById(
  "save-server"
) as HTMLButtonElement;
const removeServerBtn = document.getElementById(
  "remove-server"
) as HTMLButtonElement;

const modelTestBtn = document.getElementById("test-llm") as HTMLButtonElement;
const modelTestStatus = document.getElementById(
  "model-test-status"
) as HTMLElement;
const mcpTestBtn = document.getElementById("test-mcp") as HTMLButtonElement;
const mcpTestStatus = document.getElementById(
  "mcp-test-status"
) as HTMLElement;
const saveBtn = document.getElementById("save-config") as HTMLButtonElement;
const saveStatus = document.getElementById("save-status") as HTMLElement;
const backToPopupBtn = document.getElementById(
  "back-to-popup"
) as HTMLButtonElement;

let currentSettings: SecGuardSettings | null = null;
let serversState: {
  list: McpServerConfig[];
  activeId: string | null;
} = { list: [], activeId: null };
let currentFormTools: McpTool[] = [];

function setStatus(el: HTMLElement, text: string, type?: "success" | "error") {
  el.textContent = text;
  el.classList.remove("success", "error");
  if (type) {
    el.classList.add(type);
  }
}

function randomId() {
  return crypto.randomUUID?.() ?? `mcp-${Date.now()}-${Math.random()}`;
}

function getActiveServer(): McpServerConfig | null {
  if (!serversState.list.length) return null;
  if (serversState.activeId) {
    const found = serversState.list.find(
      (server) => server.id === serversState.activeId
    );
    if (found) return found;
  }
  return serversState.list[0];
}

function renderServerOptions(selectedId?: string | null) {
  serverSelect.innerHTML = "";
  serversState.list.forEach((server) => {
    const option = document.createElement("option");
    option.value = server.id;
    option.textContent = server.name || server.url;
    serverSelect.appendChild(option);
  });
  if (serversState.list.length === 0) {
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "暂无 Server，请先添加";
    serverSelect.appendChild(placeholder);
  }
  const targetId = selectedId ?? serversState.activeId ?? "";
  serverSelect.value = targetId || "";
}

function renderToolSelect(tools: McpTool[], selected?: string) {
  toolSelect.innerHTML = "";
  const enabledTools = tools.filter((tool) => tool.enabled !== false);
  if (!enabledTools.length) {
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "暂无可用工具";
    toolSelect.appendChild(placeholder);
    toolSelect.value = "";
    return;
  }
  enabledTools.forEach((tool) => {
    const option = document.createElement("option");
    option.value = tool.name;
    option.textContent = tool.description
      ? `${tool.name}｜${tool.description}`
      : tool.name;
    toolSelect.appendChild(option);
  });
  const targetName =
    selected && enabledTools.some((tool) => tool.name === selected)
      ? selected
      : enabledTools[0]?.name;
  toolSelect.value = targetName ?? "";
}

function renderToolList(tools: McpTool[]) {
  toolListEl.innerHTML = "";
  if (!tools.length) {
    const empty = document.createElement("p");
    empty.className = "tool-list-empty";
    empty.textContent = "暂无工具，请先点击「发现工具」";
    toolListEl.appendChild(empty);
    return;
  }

  tools.forEach((tool) => {
    const row = document.createElement("label");
    row.className = "tool-item";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = tool.enabled !== false;
    checkbox.addEventListener("change", () => {
      const target = currentFormTools.find((item) => item.name === tool.name);
      if (target) {
        target.enabled = checkbox.checked;
        renderToolSelect(currentFormTools, toolSelect.value);
      }
    });

    const meta = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = tool.name;
    meta.appendChild(title);

    const desc = document.createElement("p");
    if (tool.description) {
      desc.textContent = tool.description;
    } else if (tool.args || tool.parameters) {
      desc.textContent = `参数：${formatToolSnippet(
        tool.args ?? tool.parameters
      )}`;
    } else if (tool.returns || tool.outputSchema) {
      desc.textContent = `返回：${formatToolSnippet(
        tool.returns ?? tool.outputSchema
      )}`;
    } else {
      desc.textContent = "暂无描述";
    }
    meta.appendChild(desc);

    row.appendChild(checkbox);
    row.appendChild(meta);
    toolListEl.appendChild(row);
  });
}

function formatToolSnippet(payload: unknown) {
  if (payload === undefined || payload === null) return "";
  try {
    const serialized = JSON.stringify(payload);
    return serialized.length > 60
      ? `${serialized.slice(0, 57)}...`
      : serialized;
  } catch {
    return String(payload);
  }
}

function renderToolUI(tools: McpTool[], selected?: string) {
  currentFormTools = tools ?? [];
  renderToolList(currentFormTools);
  renderToolSelect(currentFormTools, selected);
}

function hydrateServerForm(server: McpServerConfig | null, selectedTool?: string) {
  if (!server) {
    serverNameInput.value = "";
    serverUrlInput.value = "";
    renderToolUI([], "");
    return;
  }
  serverNameInput.value = server.name ?? "";
  serverUrlInput.value = server.url ?? "";
  renderToolUI(server.tools ?? [], selectedTool);
}

function hydrateForm(settings: SecGuardSettings) {
  llmEndpointInput.value = settings.llmEndpoint ?? "";
  apiKeyInput.value = settings.apiKey ?? "";
  modelNameInput.value = settings.modelName ?? "";
  accessCodeInput.value = settings.accessCode ?? "";
  autoRunCheckbox.checked = Boolean(settings.autoRun);
  maxStepsInput.value = String(settings.maxSteps ?? 6);

  serversState = {
    list: settings.mcpServers ?? [],
    activeId: settings.activeMcpServerId ?? settings.mcpServers?.[0]?.id ?? null
  };

  renderServerOptions();
  hydrateServerForm(getActiveServer(), settings.mcpTool ?? "");
}

function collectFormSettings(): Partial<SecGuardSettings> {
  return {
    llmEndpoint: llmEndpointInput.value.trim(),
    apiKey: apiKeyInput.value.trim(),
    modelName: modelNameInput.value.trim(),
    accessCode: accessCodeInput.value.trim(),
    autoRun: autoRunCheckbox.checked,
    maxSteps: Number(maxStepsInput.value) || 6,
    mcpServers: serversState.list,
    activeMcpServerId: serversState.activeId,
    mcpTool: toolSelect.value.trim()
  };
}

function buildPendingSettings(): SecGuardSettings | null {
  if (!currentSettings) return null;
  return {
    ...currentSettings,
    ...collectFormSettings()
  };
}

function buildLLMHeaders(settings: SecGuardSettings) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };
  if (settings.apiKey) {
    headers.apikey = settings.apiKey;
  }
  if (settings.accessCode) {
    headers.Authorization = settings.accessCode.startsWith("Bearer")
      ? settings.accessCode
      : `ACCESSCODE ${settings.accessCode}`;
  }
  return headers;
}

async function testModelConnection(settings: SecGuardSettings) {
  if (!settings.llmEndpoint) {
    throw new Error("请填写 API 地址");
  }
  if (!settings.modelName) {
    throw new Error("请填写模型名称");
  }

  const response = await fetch(settings.llmEndpoint, {
    method: "POST",
    headers: buildLLMHeaders(settings),
    body: JSON.stringify({
      model: settings.modelName,
      messages: [{ role: "user", content: "ping" }],
      max_tokens: 5
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(errText || `HTTP ${response.status}`);
  }

  await response.json().catch(() => null);
}

function resolveMcpServer(settings: SecGuardSettings) {
  if (!settings.mcpServers?.length) return null;
  if (settings.activeMcpServerId) {
    const server = settings.mcpServers.find(
      (item) => item.id === settings.activeMcpServerId
    );
    if (server) return server;
  }
  return settings.mcpServers[0];
}

async function testMcpConnection(settings: SecGuardSettings) {
  const server = resolveMcpServer(settings);
  if (!server) {
    throw new Error("请先保存一个 MCP Server");
  }
  await discoverMcpTools(server.url);
}

async function handleSave(payload?: Partial<SecGuardSettings>) {
  setStatus(saveStatus, "保存中…");
  try {
    const mergePayload = payload ?? collectFormSettings();
    const saved = await StorageService.saveSettings(mergePayload);
    currentSettings = saved;
    setStatus(saveStatus, "配置已保存", "success");
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "保存失败，请重试";
    setStatus(saveStatus, message, "error");
  }
}

async function bootstrap() {
  setStatus(saveStatus, "载入中…");
  try {
    const settings = await StorageService.getSettings();
    currentSettings = settings;
    hydrateForm(settings);
    setStatus(saveStatus, "配置已加载", "success");
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "加载配置失败";
    setStatus(saveStatus, message, "error");
  }
}

discoverBtn.addEventListener("click", async () => {
  const url = serverUrlInput.value.trim();
  if (!url) {
    setStatus(discoverStatus, "请填写 Server SSE 地址", "error");
    return;
  }
  setStatus(discoverStatus, "发现中…");
  try {
    const tools = await discoverMcpTools(url);
    if (!tools.length) {
      throw new Error("未发现任何工具，请检查 MCP Server 是否注册工具");
    }
    renderToolUI(tools, tools[0]?.name);
    setStatus(discoverStatus, `发现 ${tools.length} 个工具`, "success");
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "发现工具失败";
    setStatus(discoverStatus, message, "error");
  }
});

saveServerBtn.addEventListener("click", async () => {
  const name = serverNameInput.value.trim();
  const url = serverUrlInput.value.trim();
  const tools = currentFormTools.map((tool) => ({ ...tool }));

  if (!name) {
    setStatus(discoverStatus, "请填写 Server 名称", "error");
    return;
  }
  if (!url) {
    setStatus(discoverStatus, "请填写 Server URL", "error");
    return;
  }
  if (!tools.length || !toolSelect.value) {
    setStatus(discoverStatus, "请先发现并选择工具", "error");
    return;
  }

  const selectedTool = toolSelect.value || tools[0]?.name;
  const selectedId = serverSelect.value || serversState.activeId;
  let target = serversState.list.find((server) => server.id === selectedId);

  if (target) {
    target.name = name;
    target.url = url;
    target.tools = tools;
  } else {
    target = {
      id: randomId(),
      name,
      url,
      tools
    };
    serversState.list.push(target);
  }

  serversState.activeId = target.id;
  renderServerOptions(target.id);
  toolSelect.value = selectedTool;
  renderToolUI(target.tools, selectedTool);

  await handleSave({
    ...collectFormSettings(),
    mcpServers: serversState.list,
    activeMcpServerId: serversState.activeId,
    mcpTool: selectedTool
  });
  setStatus(discoverStatus, "Server 已保存", "success");
});

removeServerBtn.addEventListener("click", async () => {
  if (!serversState.activeId) return;
  serversState.list = serversState.list.filter(
    (server) => server.id !== serversState.activeId
  );
  serversState.activeId = serversState.list[0]?.id ?? null;
  renderServerOptions();
  hydrateServerForm(getActiveServer(), toolSelect.value);
  await handleSave({
    ...collectFormSettings(),
    mcpServers: serversState.list,
    activeMcpServerId: serversState.activeId
  });
});

serverSelect.addEventListener("change", () => {
  const selectedId = serverSelect.value;
  serversState.activeId = selectedId || null;
  const server = getActiveServer();
  hydrateServerForm(server, toolSelect.value);
});

modelTestBtn.addEventListener("click", async () => {
  const pending = buildPendingSettings();
  if (!pending) return;
  setStatus(modelTestStatus, "测试中…");
  try {
    await testModelConnection(pending);
    setStatus(modelTestStatus, "模型连接成功", "success");
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "模型连接失败";
    setStatus(modelTestStatus, message, "error");
  }
});

mcpTestBtn.addEventListener("click", async () => {
  const pending = buildPendingSettings();
  if (!pending) return;
  setStatus(mcpTestStatus, "测试中…");
  try {
    await testMcpConnection(pending);
    setStatus(mcpTestStatus, "MCP 连接成功", "success");
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "MCP 连接失败";
    setStatus(mcpTestStatus, message, "error");
  }
});

saveBtn.addEventListener("click", () => handleSave());

backToPopupBtn.addEventListener("click", () => {
  if (chrome?.runtime?.sendMessage) {
    chrome.runtime.sendMessage({ type: "openSidePanel" }, () => {
      window.close();
    });
    setTimeout(() => window.close(), 500);
  } else {
    window.close();
  }
});

bootstrap();

