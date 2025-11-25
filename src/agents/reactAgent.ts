import type { SecGuardSettings } from "../services/storage";
import { MCPClient } from "../services/mcpClient";
import type { MCPResult } from "../services/mcpClient";

const SYSTEM_PROMPT = `你是一名资深安全运营工程师，按照 ReAct（Reasoning + Acting）流程分析安全告警。
输出格式严格遵循：
Thought: <你的思考>
Action: <工具名称或 None>
Action Input: <JSON 或文本参数>
Observation: <上一轮工具返回内容，如首次可省略>
Final Answer: <仅在完成全部推理后输出>

可用动作：
- MCP.<tool>：调用用户提供的 MCP 工具，tool 为具体名称。
- report：整理处置建议。

必须使用中文回答，且不得泄露任何密钥。`;

function buildUserPrompt(alert: string) {
  return [
    "以下是最新的安全告警，请基于 ReAct 链路完成研判：",
    "",
    alert.trim()
  ].join("\n");
}

export type AgentEvent =
  | { type: "thought"; step: number; content: string }
  | { type: "action"; step: number; action: string; input?: string }
  | { type: "observation"; step: number; content: string }
  | { type: "final"; step: number; content: string }
  | { type: "warning"; step: number; content: string }
  | { type: "pending"; step: number; content: string }
  | { type: "error"; step: number; content: string };

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

function parseReActResponse(text: string) {
  const extract = (label: string) => {
    const regex = new RegExp(
      `${label}\\s*:\\s*([\\s\\S]*?)(?=\\n[A-Z][^:]+:|$)`,
      "i"
    );
    const match = text.match(regex);
    return match ? match[1].trim() : "";
  };

  const actionLine = text.match(/Action\s*:\s*(.+)/i);

  return {
    thought: extract("Thought"),
    action: actionLine ? actionLine[1].trim() : "",
    actionInput: extract("Action Input"),
    finalAnswer: extract("Final Answer")
  };
}

function safeParseJSON(input: string) {
  try {
    return JSON.parse(input);
  } catch {
    return input;
  }
}

function normalizeObservation(result: MCPResult) {
  if (typeof result === "string") return result;
  try {
    return JSON.stringify(result, null, 2);
  } catch {
    return String(result);
  }
}

function normalizeLLMContent(raw: unknown): string {
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) {
    return raw
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object") {
          if ("text" in part && typeof (part as { text?: unknown }).text === "string") {
            return (part as { text: string }).text;
          }
          if (
            "content" in part &&
            typeof (part as { content?: unknown }).content === "string"
          ) {
            return (part as { content: string }).content;
          }
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  if (raw && typeof raw === "object") {
    try {
      return JSON.stringify(raw);
    } catch {
      return "[object]";
    }
  }
  return "";
}

export class ReactAgent {
  private settings: SecGuardSettings | null = null;
  private mcpClient = new MCPClient();

  updateSettings(settings: SecGuardSettings) {
    this.settings = settings;
    this.mcpClient.updateConfig({
      servers: settings.mcpServers ?? [],
      activeServerId: settings.activeMcpServerId ?? null,
      defaultTool: settings.mcpTool
    });
  }

  async run(alert: string, emit: (event: AgentEvent) => void) {
    if (!alert.trim()) {
      throw new Error("告警内容不能为空");
    }
    if (!this.settings) {
      throw new Error("尚未加载配置，请先打开 Options 页面完成设置");
    }
    if (!this.settings.apiKey) {
      this.emitMock(alert, emit);
      return;
    }

    const messages: ChatMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserPrompt(alert) }
    ];

    const maxSteps = this.settings.maxSteps ?? 6;

    for (let step = 1; step <= maxSteps; step += 1) {
      const llmText = await this.callLLM(messages);
      const parsed = parseReActResponse(llmText);

      emit({
        type: "thought",
        step,
        content: parsed.thought || llmText
      });

      if (parsed.action) {
        emit({
          type: "action",
          step,
          action: parsed.action,
          input: parsed.actionInput
        });
      }

      if (parsed.finalAnswer) {
        emit({
          type: "final",
          step,
          content: parsed.finalAnswer
        });
        break;
      }

      if (!parsed.action || parsed.action.toLowerCase() === "none") {
        emit({
          type: "final",
          step,
          content: parsed.thought || llmText
        });
        break;
      }

      if (!this.settings.autoRun) {
        emit({
          type: "pending",
          step,
          content: "检测到 Action，但当前为手动执行模式。"
        });
        break;
      }

      try {
        const actionInput = safeParseJSON(parsed.actionInput || "{}");
        const observation = await this.executeTool(parsed.action, actionInput);
        const observationText = normalizeObservation(observation);

        emit({
          type: "observation",
          step,
          content: observationText
        });

        messages.push({ role: "assistant", content: llmText });
        messages.push({
          role: "user",
          content: `Observation: ${observationText}`
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "执行工具时发生异常";
        emit({
          type: "error",
          step,
          content: message
        });
        break;
      }
    }
  }

  private async callLLM(messages: ChatMessage[]) {
    if (!this.settings) {
      throw new Error("配置未加载");
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json"
    };
    if (this.settings.apiKey) {
      headers.apikey = this.settings.apiKey;
    }
    if (this.settings.accessCode) {
      headers.Authorization = `ACCESSCODE ${this.settings.accessCode}`;
    }

    const response = await fetch(this.settings.llmEndpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: this.settings.modelName || "gpt-4o-mini",
        temperature: 0.2,
        messages
      })
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(
        `LLM 请求失败 (${response.status}): ${errText || "Unknown"}`
      );
    }

    const data = await response.json().catch(() => ({}));
    const message = data?.choices?.[0]?.message;
    const normalized = normalizeLLMContent(message?.content);
    const content =
      (normalized && normalized.trim().length ? normalized : "") ||
      data?.choices?.[0]?.text ||
      JSON.stringify(data);
    const trimmed = typeof content === "string" ? content.trim() : "";
    if (!trimmed) {
      return "LLM 响应为空，请检查模型是否按照 ReAct 模板返回文本。";
    }
    return trimmed;
  }

  private async executeTool(action: string, input: unknown) {
    if (action.startsWith("MCP.")) {
      const tool = action.replace("MCP.", "").trim();
      return this.mcpClient.invokeTool(tool, input);
    }
    if (action === "report") {
      return {
        title: "报告草稿",
        summary: "该报告来自内置 report Action。"
      };
    }
    return {
      status: "ignored",
      action,
      input
    };
  }

  private emitMock(alert: string, emit: (event: AgentEvent) => void) {
    emit({
      type: "thought",
      step: 1,
      content: "未检测到 API Key，使用离线演示模式。"
    });
    emit({
      type: "action",
      step: 1,
      action: "MCP.stub_enrich",
      input: JSON.stringify({ alert }).slice(0, 400)
    });
    emit({
      type: "observation",
      step: 1,
      content: "示例：IOC 查询结果显示该 IP 关联已知挖矿活动。"
    });
    emit({
      type: "final",
      step: 2,
      content: "请在 Options 页面填写真实 API Key 与 Access Code 以执行完整流程。"
    });
  }
}

