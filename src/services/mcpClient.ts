import type { McpServerConfig } from "./storage";
import { appendTimestamp, resolveSessionUrl } from "./mcpSseHelpers";

const MCP_TIMEOUT = 20000;
const MCP_PROTOCOL_VERSION = "1.0";
const MCP_CLIENT_INFO = {
  name: "secguard-extension",
  version: "0.1.0"
};

const METHOD_INITIALIZE = "initialize";
const METHOD_NOTIFY_INITIALIZED = "notifications/initialized";
const METHOD_TOOLS_CALL = "tools/call";

type JsonRpcError = {
  code?: number;
  message?: string;
  data?: unknown;
};

type JsonRpcResponse<T = unknown> = {
  jsonrpc?: string;
  id?: number;
  result?: T;
  error?: JsonRpcError;
};

export interface MCPConfig {
  servers?: McpServerConfig[];
  activeServerId?: string | null;
  defaultTool?: string;
}

export type MCPResult =
  | string
  | Record<string, unknown>
  | unknown[]
  | {
      status: string;
      message: string;
    };

function normalizeToolArguments(input: unknown) {
  if (
    input &&
    typeof input === "object" &&
    !Array.isArray(input)
  ) {
    return input as Record<string, unknown>;
  }
  if (typeof input === "string" && input.trim()) {
    return { input: input.trim() };
  }
  if (typeof input === "number" || typeof input === "boolean") {
    return { value: input };
  }
  if (input === null) {
    return { value: null };
  }
  return {};
}

function extractResultPayload(payload: unknown): MCPResult {
  if (!payload) {
    return {
      status: "empty",
      message: "工具未返回任何内容"
    };
  }

  if (
    payload &&
    typeof payload === "object" &&
    Array.isArray((payload as { content?: unknown }).content)
  ) {
    const content = (payload as { content?: unknown[] }).content ?? [];
    const parts = content
      .map((item) => {
        if (!item) return "";
        if (typeof item === "string") return item;
        if (typeof item === "object") {
          if (
            "text" in item &&
            typeof (item as { text?: unknown }).text === "string"
          ) {
            return (item as { text: string }).text;
          }
          if ("json" in item) {
            try {
              return JSON.stringify((item as { json: unknown }).json, null, 2);
            } catch {
              return String((item as { json: unknown }).json);
            }
          }
          if ("data" in item) {
            try {
              return JSON.stringify((item as { data: unknown }).data, null, 2);
            } catch {
              return String((item as { data: unknown }).data);
            }
          }
        }
        return "";
      })
      .filter(Boolean);

    if (parts.length) {
      return parts.join("\n");
    }
  }

  return payload as MCPResult;
}

export class MCPClient {
  private servers: McpServerConfig[] = [];
  private activeServerId: string | null = null;
  private defaultTool?: string;

  constructor(config: MCPConfig = {}) {
    this.updateConfig(config);
  }

  updateConfig({ servers, activeServerId, defaultTool }: MCPConfig) {
    if (servers) this.servers = servers;
    if (activeServerId !== undefined) this.activeServerId = activeServerId;
    if (defaultTool !== undefined) this.defaultTool = defaultTool;
  }

  private getActiveServer(): McpServerConfig | undefined {
    if (!this.servers.length) return undefined;
    if (this.activeServerId) {
      const match = this.servers.find((srv) => srv.id === this.activeServerId);
      if (match) return match;
    }
    return this.servers[0];
  }

  async invokeTool(toolName?: string, input?: unknown): Promise<MCPResult> {
    const server = this.getActiveServer();
    const resolvedTool = toolName || this.defaultTool;
    if (!server || !resolvedTool) {
      return {
        status: "skipped",
        message: "未配置 MCP Server/Tool，返回示例观察。"
      };
    }

    return new Promise<MCPResult>((resolve, reject) => {
      let settled = false;
      let sessionUrl: string | null = null;
      let requestId = 0;
      let initializeId: number | null = null;
      let toolCallId: number | null = null;
      let es: EventSource | null = null;

      const cleanup = () => {
        if (es) {
          es.close();
        }
      };

      const finish = (result: MCPResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        cleanup();
        resolve(result);
      };

      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        cleanup();
        reject(error);
      };

      const sendRequest = (
        url: string,
        method: string,
        params: Record<string, unknown> = {}
      ) => {
        requestId += 1;
        const id = requestId;
        fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json"
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id,
            method,
            params
          })
        }).catch((error) => {
          console.warn("MCP 请求发送失败", error);
        });
        return id;
      };

      const sendNotification = (
        url: string,
        method: string,
        params: Record<string, unknown> = {}
      ) => {
        fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json"
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            method,
            params
          })
        }).catch((error) => {
          console.warn("MCP 通知发送失败", error);
        });
      };

      const timer = setTimeout(() => {
        fail(new Error(`MCP 工具调用超时：${resolvedTool}`));
      }, MCP_TIMEOUT);

      try {
        es = new EventSource(appendTimestamp(server.url));
      } catch (error) {
        fail(new Error("无法连接 MCP SSE 服务，请检查地址是否正确"));
        return;
      }

      es.onerror = () => {
        fail(new Error("MCP SSE 连接失败，请确认服务已启动"));
      };

      es.addEventListener("endpoint", (event) => {
        if (settled) return;
        sessionUrl = resolveSessionUrl(server.url, event?.data ?? null);
        if (!sessionUrl) {
          fail(new Error("MCP endpoint 返回为空"));
          return;
        }
        setTimeout(() => {
          if (!sessionUrl) {
            fail(new Error("MCP session 未准备就绪"));
            return;
          }
          initializeId = sendRequest(sessionUrl, METHOD_INITIALIZE, {
            protocolVersion: MCP_PROTOCOL_VERSION,
            capabilities: { tools: {} },
            clientInfo: MCP_CLIENT_INFO
          });
        }, 200);
      });

      es.onmessage = (event) => {
        if (settled) return;
        let data: JsonRpcResponse;
        try {
          data = JSON.parse(event.data);
        } catch {
          return;
        }

        if (typeof data.id === "undefined") {
          return;
        }

        if (data.id === initializeId) {
          if (data.error) {
            fail(
              new Error(
                data.error.message || "MCP initialize 请求失败"
              )
            );
            return;
          }
          if (!sessionUrl) {
            fail(new Error("MCP session 未准备就绪"));
            return;
          }
          sendNotification(sessionUrl, METHOD_NOTIFY_INITIALIZED);
          const args = normalizeToolArguments(input);
          toolCallId = sendRequest(sessionUrl, METHOD_TOOLS_CALL, {
            name: resolvedTool,
            arguments: args
          });
          return;
        }

        if (data.id === toolCallId) {
          if (data.error) {
            fail(
              new Error(data.error.message || "MCP 工具执行失败")
            );
            return;
          }
          finish(extractResultPayload(data.result));
        }
      };
    });
  }
}

