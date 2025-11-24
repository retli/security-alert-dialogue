import { LLMClient } from "../services/llmClient.js";
import { MCPClient } from "../services/mcpClient.js";

const SYSTEM_PROMPT = `你是一名资深的安全运营分析师，使用 ReAct 推理流程处理输入的安全告警。
在每一轮中严格按以下格式输出：
Thought: <你的分析思路>
Action: <工具名称或"None">
Action Input: <JSON 或文本参数>
Observation: <上一轮工具返回内容，如首次则省略>
Final Answer: <只有在完成全部推理后才输出>

工具说明：
- MCP.*：表示调用用户提供的 MCP Server 工具，工具名为 Action 的后半部分。
- report：用于生成告警总结。
遵循中文输出，确保不要泄露 API Key。`;

const MAX_STEPS = 6;

function buildUserPrompt({ alert }) {
  return [
    `收到一条安全告警，请基于 ReAct 流程完成分析。`,
    `原始内容:`,
    alert
  ].join("\n");
}

function parseReActResponse(text) {
  const extract = (label) => {
    const regex = new RegExp(`${label}\\s*:\\s*([\\s\\S]*?)(?=\\n[A-Z][^:]+:|$)`, "i");
    const match = text.match(regex);
    return match ? match[1].trim() : "";
  };

  const actionLine = text.match(/Action\s*:\s*(.+)/i);

  return {
    raw: text,
    thought: extract("Thought"),
    action: actionLine ? actionLine[1].trim() : "",
    actionInput: extract("Action Input"),
    finalAnswer: extract("Final Answer")
  };
}

function normalizeObservation(observation) {
  if (typeof observation === "string") return observation;
  try {
    return JSON.stringify(observation, null, 2);
  } catch {
    return String(observation);
  }
}

function safeParseJSON(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export class ReActAgent {
  constructor({ llmClient, mcpClient, autoRunTools = true, maxSteps = MAX_STEPS } = {}) {
    this.llmClient = llmClient ?? new LLMClient({});
    this.mcpClient = mcpClient ?? new MCPClient({});
    this.autoRunTools = autoRunTools;
    this.maxSteps = maxSteps;
  }

  updateConfig({ autoRunTools, llmConfig, mcpConfig }) {
    if (autoRunTools !== undefined) this.autoRunTools = autoRunTools;
    llmConfig && this.llmClient?.updateConfig(llmConfig);
    mcpConfig && this.mcpClient?.updateConfig(mcpConfig);
  }

  async runSession(payload) {
    const events = [];
    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserPrompt(payload) }
    ];

    for (let step = 0; step < this.maxSteps; step += 1) {
      const llmText = await this.llmClient.chat(messages);
      const parsed = parseReActResponse(llmText);

      events.push({
        type: "thought",
        step: step + 1,
        content: parsed.thought || llmText
      });

      if (parsed.action) {
        events.push({
          type: "action",
          step: step + 1,
          action: parsed.action,
          input: parsed.actionInput
        });
      }

      if (parsed.finalAnswer) {
        events.push({
          type: "final",
          step: step + 1,
          content: parsed.finalAnswer
        });
        break;
      }

      if (!parsed.action || parsed.action.toLowerCase() === "none") {
        events.push({
          type: "warning",
          step: step + 1,
          content: "模型未提供可执行的 Action，终止流程。"
        });
        break;
      }

      if (!this.autoRunTools) {
        events.push({
          type: "pending",
          step: step + 1,
          content: "已检测到 Action，但当前为手动执行模式。"
        });
        break;
      }

      try {
        const actionInput = safeParseJSON(parsed.actionInput || "{}");
        const observation = await this.executeTool(parsed.action, actionInput);
        const obsString = normalizeObservation(observation);

        events.push({
          type: "observation",
          step: step + 1,
          content: obsString
        });

        messages.push({ role: "assistant", content: llmText });
        messages.push({ role: "user", content: `Observation: ${obsString}` });
      } catch (error) {
        events.push({
          type: "error",
          step: step + 1,
          content: error.message
        });
        break;
      }
    }

    return events;
  }

  async executeTool(action, input) {
    if (action.startsWith("MCP.")) {
      const tool = action.replace("MCP.", "").trim();
      return this.mcpClient.invokeTool(tool, input);
    }
    if (action === "report") {
      return {
        title: "报告草稿",
        summary: "该报告来自 ReAct 内置 report Action 模板。"
      };
    }
    return { status: "ignored", action, input };
  }
}

