import { StorageService, type SecGuardSettings } from "../services/storage";
import { LangchainAgent, type AgentEvent } from "../agents/langchainAgent";

type ConversationMessage = {
  role: "user" | "assistant" | "system";
  label?: string;
  badges?: string[];
  content: string;
};

const conversationEl = document.getElementById("conversation") as HTMLElement;
const alertInput = document.getElementById("alert-input") as HTMLTextAreaElement;
const statusLabel = document.getElementById("status-label") as HTMLElement;
const sendBtn = document.getElementById("send-btn") as HTMLButtonElement;

const drawer = document.getElementById("settings-drawer") as HTMLElement;
const toggleSettingsBtn = document.getElementById("toggle-settings") as HTMLButtonElement;
const closeSettingsBtn = document.getElementById("close-settings") as HTMLButtonElement;
const saveSettingsBtn = document.getElementById("save-settings") as HTMLButtonElement;
const apiKeyInput = document.getElementById("api-key") as HTMLInputElement;
const authHeaderInput = document.getElementById("auth-header") as HTMLInputElement;
const llmEndpointInput = document.getElementById("llm-endpoint") as HTMLInputElement;
const mcpServerInput = document.getElementById("mcp-server") as HTMLInputElement;
const mcpToolInput = document.getElementById("mcp-tool") as HTMLInputElement;
const autoRunCheckbox = document.getElementById("auto-run") as HTMLInputElement;

const agent = new LangchainAgent();

const state: {
  settings: SecGuardSettings | null;
  conversation: ConversationMessage[];
} = {
  settings: null,
  conversation: []
};

function pushMessage(message: ConversationMessage) {
  state.conversation.push(message);
  renderConversation();
}

function renderConversation() {
  conversationEl.innerHTML = "";
  state.conversation.forEach((msg) => {
    const node = document.createElement("article");
    node.className = `message ${msg.role}`;

    if (msg.label) {
      const label = document.createElement("strong");
      label.textContent = msg.label;
      node.appendChild(label);
    }

    if (msg.badges?.length) {
      const badgesWrapper = document.createElement("div");
      msg.badges.forEach((badgeText) => {
        const badge = document.createElement("span");
        badge.className = "badge";
        badge.textContent = badgeText;
        badgesWrapper.appendChild(badge);
      });
      node.appendChild(badgesWrapper);
    }

    const content = document.createElement("div");
    content.textContent = msg.content;
    node.appendChild(content);

    conversationEl.appendChild(node);
  });
  conversationEl.scrollTop = conversationEl.scrollHeight;
}

function setStatus(text: string) {
  statusLabel.textContent = text;
}

function toggleLoading(isLoading: boolean) {
  sendBtn.disabled = isLoading;
}

function mapEventToMessage(event: AgentEvent): ConversationMessage {
  const baseLabel = `Step ${event.step}`;
  switch (event.type) {
    case "thought":
      return {
        role: "assistant",
        label: `${baseLabel} · Thought`,
        content: event.content
      };
    case "action":
      return {
        role: "assistant",
        label: `${baseLabel} · Action`,
        badges: [event.action],
        content: event.input ?? ""
      };
    case "observation":
      return {
        role: "assistant",
        label: `${baseLabel} · Observation`,
        content: event.content
      };
    case "final":
      return {
        role: "assistant",
        label: "Final Answer",
        content: event.content
      };
    case "error":
    default:
      return {
        role: "system",
        label: "错误",
        content: event.content
      };
  }
}

async function handleSend() {
  const alertText = alertInput.value.trim();
  if (!alertText) {
    setStatus("请输入告警内容");
    return;
  }

  pushMessage({
    role: "user",
    label: "告警输入",
    content: alertText
  });

  alertInput.value = "";
  setStatus("LangChain 推理中…");
  toggleLoading(true);

  try {
    await agent.run(alertText, (event) => pushMessage(mapEventToMessage(event)));
    setStatus("分析完成");
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "执行过程中发生未知错误";
    pushMessage({
      role: "system",
      label: "执行失败",
      content: message
    });
    setStatus("执行异常");
  } finally {
    toggleLoading(false);
  }
}

function hydrateSettingsUI(settings: SecGuardSettings) {
  apiKeyInput.value = settings.apiKey ?? "";
  authHeaderInput.value = settings.authHeader ?? "";
  llmEndpointInput.value = settings.llmEndpoint ?? "";
  mcpServerInput.value = settings.mcpServer ?? "";
  mcpToolInput.value = settings.mcpTool ?? "";
  autoRunCheckbox.checked = Boolean(settings.autoRun);
}

async function saveSettings() {
  const payload: Partial<SecGuardSettings> = {
    ...(state.settings ?? {}),
    apiKey: apiKeyInput.value.trim(),
    authHeader: authHeaderInput.value.trim(),
    llmEndpoint: llmEndpointInput.value.trim(),
    mcpServer: mcpServerInput.value.trim(),
    mcpTool: mcpToolInput.value.trim(),
    autoRun: autoRunCheckbox.checked
  };

  try {
    const saved = await StorageService.saveSettings(payload);
    state.settings = saved;
    agent.updateSettings(saved);
    setStatus("配置已保存");
    drawer.classList.remove("open");
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "配置保存失败，请重试。";
    pushMessage({
      role: "system",
      label: "保存失败",
      content: message
    });
  }
}

async function bootstrap() {
  setStatus("载入配置…");
  try {
    const settings = await StorageService.getSettings();
    state.settings = settings;
    hydrateSettingsUI(settings);
    agent.updateSettings(settings);
    setStatus("准备就绪");
    pushMessage({
      role: "system",
      label: "SecGuard",
      content: "LangChain ReAct 模式已准备，可以开始分析告警。"
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "配置加载失败，请重试。";
    pushMessage({
      role: "system",
      label: "加载失败",
      content: message
    });
    setStatus("配置加载失败");
  }
}

toggleSettingsBtn.addEventListener("click", () =>
  drawer.classList.toggle("open")
);
closeSettingsBtn.addEventListener("click", () =>
  drawer.classList.remove("open")
);
saveSettingsBtn.addEventListener("click", saveSettings);
sendBtn.addEventListener("click", handleSend);

alertInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
    handleSend();
  }
});

bootstrap();

