import {
  StorageService,
  type SecGuardSettings,
  STORAGE_KEY
} from "../services/storage";
import { ReactAgent, type AgentEvent } from "../agents/reactAgent";

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

const openOptionsBtn = document.getElementById(
  "open-options"
) as HTMLButtonElement;
const resizeHandle = document.getElementById(
  "resize-handle"
) as HTMLDivElement | null;

const agent = new ReactAgent();

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

async function bootstrap() {
  setStatus("载入配置…");
  try {
    const settings = await StorageService.getSettings();
    state.settings = settings;
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

openOptionsBtn.addEventListener("click", () => {
  if (chrome?.runtime?.openOptionsPage) {
    chrome.runtime.openOptionsPage();
  } else if (chrome?.runtime?.id) {
    window.open(`chrome://extensions/?options=${chrome.runtime.id}`, "_blank");
  }
});
sendBtn.addEventListener("click", handleSend);

alertInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
    handleSend();
  }
});

if (chrome?.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && STORAGE_KEY in changes) {
      StorageService.getSettings()
        .then((settings) => {
          state.settings = settings;
          agent.updateSettings(settings);
          setStatus("配置已更新");
        })
        .catch(() => setStatus("更新配置失败"));
    }
  });
}

if (resizeHandle) {
  let isResizing = false;

  const handleMouseMove = (event: MouseEvent) => {
    if (!isResizing) return;
    const minWidth = 360;
    const maxWidth = 900;
    const viewportWidth = window.innerWidth;
    const distanceFromRight = viewportWidth - event.clientX;
    const nextWidth = Math.min(
      maxWidth,
      Math.max(minWidth, distanceFromRight)
    );
    const shell = document.querySelector(".popup-shell") as HTMLElement | null;
    if (shell) {
      shell.style.width = `${nextWidth}px`;
    }
  };

  const stopResizing = () => {
    if (!isResizing) return;
    isResizing = false;
    window.removeEventListener("mousemove", handleMouseMove);
    window.removeEventListener("mouseup", stopResizing);
    window.removeEventListener("mouseleave", stopResizing);
  };

  resizeHandle.addEventListener("mousedown", (event) => {
    event.preventDefault();
    isResizing = true;
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", stopResizing);
    window.addEventListener("mouseleave", stopResizing);
  });
}

bootstrap();

