export interface MCPConfig {
  mcpServer?: string;
  mcpTool?: string;
}

export type MCPResult =
  | string
  | Record<string, unknown>
  | {
      status: string;
      message: string;
    };

export class MCPClient {
  private serverUrl?: string;
  private defaultTool?: string;

  constructor(config: MCPConfig = {}) {
    this.serverUrl = config.mcpServer;
    this.defaultTool = config.mcpTool;
  }

  updateConfig({ mcpServer, mcpTool }: MCPConfig) {
    if (mcpServer !== undefined) this.serverUrl = mcpServer;
    if (mcpTool !== undefined) this.defaultTool = mcpTool;
  }

  async invokeTool(toolName?: string, input?: unknown): Promise<MCPResult> {
    const resolvedTool = toolName || this.defaultTool;
    if (!this.serverUrl || !resolvedTool) {
      return {
        status: "skipped",
        message: "未配置 MCP Server/Tool，返回示例观察。"
      };
    }

    const response = await fetch(this.serverUrl, {
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

