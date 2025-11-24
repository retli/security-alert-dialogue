export class MCPClient {
  constructor({ mcpServer, mcpTool }) {
    this.serverUrl = mcpServer;
    this.defaultTool = mcpTool;
  }

  updateConfig({ mcpServer, mcpTool }) {
    if (mcpServer !== undefined) this.serverUrl = mcpServer;
    if (mcpTool !== undefined) this.defaultTool = mcpTool;
  }

  async invokeTool(toolName, input) {
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
      ? await response.json()
      : await response.text();
  }
}

