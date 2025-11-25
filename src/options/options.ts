import {
  StorageService,
  type SecGuardSettings
} from "../services/storage";

const llmEndpointInput = document.getElementById(
  "llm-endpoint"
) as HTMLInputElement;
const apiKeyInput = document.getElementById("api-key") as HTMLInputElement;
const modelNameInput = document.getElementById("model-name") as HTMLInputElement;
const accessCodeInput = document.getElementById(
  "access-code"
) as HTMLInputElement;
const mcpServerInput = document.getElementById(
  "mcp-server"
) as HTMLInputElement;
const mcpToolInput = document.getElementById("mcp-tool") as HTMLInputElement;
const autoRunCheckbox = document.getElementById("auto-run") as HTMLInputElement;
const maxStepsInput = document.getElementById("max-steps") as HTMLInputElement;

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

function setStatus(el: HTMLElement, text: string, type?: "success" | "error") {
  el.textContent = text;
  el.classList.remove("success", "error");
  if (type) {
    el.classList.add(type);
  }
}

function hydrateForm(settings: SecGuardSettings) {
  llmEndpointInput.value = settings.llmEndpoint ?? "";
  apiKeyInput.value = settings.apiKey ?? "";
  modelNameInput.value = settings.modelName ?? "";
  accessCodeInput.value = settings.accessCode ?? "";
  mcpServerInput.value = settings.mcpServer ?? "";
  mcpToolInput.value = settings.mcpTool ?? "";
  autoRunCheckbox.checked = Boolean(settings.autoRun);
  maxStepsInput.value = String(settings.maxSteps ?? 6);
}

function collectFormSettings(): Partial<SecGuardSettings> {
  return {
    llmEndpoint: llmEndpointInput.value.trim(),
    apiKey: apiKeyInput.value.trim(),
    modelName: modelNameInput.value.trim(),
    accessCode: accessCodeInput.value.trim(),
    mcpServer: mcpServerInput.value.trim(),
    mcpTool: mcpToolInput.value.trim(),
    autoRun: autoRunCheckbox.checked,
    maxSteps: Number(maxStepsInput.value) || 6
  };
}

function buildPendingSettings(): SecGuardSettings | null {
  if (!currentSettings) return null;
  const merged = {
    ...currentSettings,
    ...collectFormSettings()
  } as SecGuardSettings;
  merged.accessCode = merged.accessCode ?? "";
  merged.authHeader = merged.accessCode
    ? `ACCESSCODE ${merged.accessCode}`
    : "";
  return merged;
}

function buildLLMHeaders(settings: SecGuardSettings) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };
  if (settings.apiKey) {
    headers.apikey = settings.apiKey;
  }
  if (settings.accessCode) {
    headers.Authorization = `ACCESSCODE ${settings.accessCode}`;
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

async function testMcpConnection(settings: SecGuardSettings) {
  if (!settings.mcpServer) {
    throw new Error("请填写 MCP Server URL");
  }
  const response = await fetch(settings.mcpServer, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      tool: settings.mcpTool || "health_check",
      input: { heartbeat: Date.now() }
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(errText || `HTTP ${response.status}`);
  }
  await response.text().catch(() => null);
}

async function handleSave() {
  setStatus(saveStatus, "保存中…");
  try {
    const payload = collectFormSettings();
    const saved = await StorageService.saveSettings(payload);
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

saveBtn.addEventListener("click", handleSave);

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

