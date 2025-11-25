import type { McpServerConfig } from "./storage";

export interface MCPConfig {
  servers?: McpServerConfig[];
  activeServerId?: string | null;
  defaultTool?: string;
}

export type MCPResult =
  | string
  | Record<string, unknown>
  | {
      status: string;
      message: string;
    };

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

    const response = await fetch(server.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        tool: resolvedTool,
        input
      })
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(
        `MCP 工具调用失败 (${response.status}): ${errBody || "Unknown"}`
      );
    }

    return response.headers.get("content-type")?.includes("application/json")
      ? ((await response.json()) as Record<string, unknown>)
      : (await response.text());
  }
}

