import { ChatOpenAI } from "@langchain/openai";
import { createAgent } from "langchain";
import { DynamicStructuredTool } from "@langchain/core/tools";
import {
  BaseMessage,
  isAIMessage,
  isToolMessage
} from "@langchain/core/messages";
import { z } from "zod";

import type { MCPResult } from "../services/mcpClient";
import { MCPClient } from "../services/mcpClient";
import type { SecGuardSettings } from "../services/storage";

export type AgentEvent =
  | { type: "thought"; step: number; content: string }
  | { type: "action"; step: number; action: string; input?: string }
  | { type: "observation"; step: number; content: string }
  | { type: "final"; step: number; content: string }
  | { type: "error"; step: number; content: string };

const SYSTEM_PROMPT = `你是一名资深安全运营工程师，遵循 ReAct（Reasoning + Acting）流程来分析安全告警。
流程要求：
1. 每一步先输出 Thought，说明当前分析思路。
2. 若需要外部情报，请调用可用工具。
3. 工具执行结束后结合 Observation 继续思考。
4. 当所有信息充分时，输出 Final Answer，总结告警影响、根因与建议。

输出语言必须为中文，禁止泄露密钥。`;

function buildUserPrompt(alert: string) {
  return [
    "以下是最新的安全告警内容，请基于 ReAct 流程进行研判：",
    "",
    alert.trim()
  ].join("\n");
}

function serializeContent(content: BaseMessage["content"]): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((block) => {
        if (typeof block === "string") return block;
        if ("text" in block && typeof block.text === "string") {
          return block.text;
        }
        if ("data" in block) {
          try {
            return JSON.stringify(block.data);
          } catch {
            return "";
          }
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function stringifyResult(result: MCPResult): string {
  if (typeof result === "string") return result;
  try {
    return JSON.stringify(result, null, 2);
  } catch {
    return String(result);
  }
}

export class LangchainAgent {
  private settings: SecGuardSettings | null = null;
  private mcpClient = new MCPClient();

  updateSettings(settings: SecGuardSettings) {
    this.settings = settings;
    this.mcpClient.updateConfig({
      mcpServer: settings.mcpServer,
      mcpTool: settings.mcpTool
    });
  }

  async run(alert: string, emit: (event: AgentEvent) => void) {
    if (!alert.trim()) {
      throw new Error("告警内容不能为空");
    }
    if (!this.settings) {
      throw new Error("请先加载配置");
    }
    if (!this.settings.apiKey) {
      this.emitMock(alert, emit);
      return;
    }

    const llm = new ChatOpenAI({
      apiKey: this.settings.apiKey,
      model: this.settings.modelName || "gpt-4o-mini",
      temperature: 0,
      configuration: {
        baseURL: this.settings.llmEndpoint,
        defaultHeaders: this.settings.authHeader
          ? { Authorization: this.settings.authHeader }
          : undefined
      }
    });

    const tools = this.settings.autoRun
      ? [
          new DynamicStructuredTool({
            name: this.settings.mcpTool || "mcp_security_tool",
            description:
              "调用外部 MCP Server 所暴露的安全情报/处置工具，输入 JSON payload。",
            schema: z.object({
              payload: z
                .record(z.any())
                .describe("要传给 MCP 工具的 JSON 入参")
                .optional(),
              note: z
                .string()
                .describe("想要补充的数据或执行原因")
                .optional()
            }),
            func: async ({ payload, note }) => {
              const body = payload ?? { note, alert };
              const response = await this.mcpClient.invokeTool(
                this.settings?.mcpTool,
                body
              );
              return stringifyResult(response);
            }
          })
        ]
      : [];

    const agent = createAgent({
      llm,
      tools,
      prompt: SYSTEM_PROMPT
    });

    const state = await agent.invoke({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(alert) }
      ]
    });

    this.emitFromMessages(state.messages ?? [], emit);
  }

  private emitFromMessages(messages: BaseMessage[], emit: (event: AgentEvent) => void) {
    let step = 1;
    let finalMessage: BaseMessage | null = null;

    for (const message of messages) {
      if (isAIMessage(message)) {
        const text = serializeContent(message.content).trim();

        if (message.tool_calls?.length) {
          if (text) {
            emit({ type: "thought", step, content: text });
          }
          for (const call of message.tool_calls) {
            emit({
              type: "action",
              step,
              action: call.function.name,
              input: call.function.arguments
            });
          }
          step += 1;
        } else {
          finalMessage = message;
          if (text) {
            emit({ type: "final", step, content: text });
          }
        }
      } else if (isToolMessage(message)) {
        emit({
          type: "observation",
          step,
          content: serializeContent(message.content).trim()
        });
      }
    }

    if (!finalMessage) {
      emit({
        type: "final",
        step,
        content: "流程已完成。"
      });
    }
  }

  private emitMock(alert: string, emit: (event: AgentEvent) => void) {
    emit({
      type: "thought",
      step: 1,
      content: "未检测到可用的 API Key，使用离线 ReAct 演示流程。"
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
      content:
        "建议在正式环境中配置真实 API Key 及 MCP Server，以执行完整的 ReAct 推理。"
    });
  }
}

