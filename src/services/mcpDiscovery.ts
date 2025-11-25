import { appendTimestamp, resolveSessionUrl } from "./mcpSseHelpers";

function parseTools(payload: unknown): string[] {
  if (!payload) return [];

  if (Array.isArray(payload)) {
    return payload
      .map((item) => {
        if (typeof item === "string") return item;
        if (
          item &&
          typeof item === "object" &&
          "name" in item &&
          typeof (item as { name: unknown }).name === "string"
        ) {
          return (item as { name: string }).name;
        }
        return "";
      })
      .filter(Boolean);
  }

  if (typeof payload === "object") {
    const maybeTools = (payload as Record<string, unknown>).tools;
    if (Array.isArray(maybeTools)) {
      return parseTools(maybeTools);
    }
  }

  return [];
}

export async function discoverMcpTools(
  sseUrl: string,
  timeoutMs = 15000
): Promise<string[]> {
  if (!sseUrl) {
    throw new Error("请提供 MCP SSE 地址");
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let sessionUrl: string | null = null;
    let requestId = 0;
    let initializeId: number | null = null;
    let toolsListId: number | null = null;
    let es: EventSource | null = null;

    const finish = (tools: string[]) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (es) {
        es.close();
      }
      resolve(tools);
    };

    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (es) {
        es.close();
      }
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
      }).catch(() => {
        /* ignore */
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
      }).catch(() => {
        /* ignore */
      });
    };

    const timer = setTimeout(() => {
      fail(new Error("MCP 工具发现超时"));
    }, timeoutMs);

    try {
      es = new EventSource(appendTimestamp(sseUrl));
    } catch (error) {
      fail(new Error("无法连接 MCP SSE 服务，请检查地址是否正确"));
      return;
    }

    es.onerror = () => {
      fail(new Error("MCP SSE 连接失败，请确认服务已启动"));
    };

    es.addEventListener("endpoint", (event) => {
      sessionUrl = resolveSessionUrl(sseUrl, event?.data ?? null);
      if (!sessionUrl) {
        fail(new Error("MCP endpoint 返回为空"));
        return;
      }
      setTimeout(() => {
        initializeId = sendRequest(sessionUrl!, "initialize", {
          protocolVersion: "1.0",
          capabilities: { tools: {} },
          clientInfo: {
            name: "secguard",
            version: "0.1.0"
          }
        });
      }, 200);
    });

    es.onmessage = async (event) => {
      if (settled) return;
      let data: any;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }

      if (data?.jsonrpc === "2.0" && typeof data.id !== "undefined") {
        if (data.id === initializeId && data.result && sessionUrl) {
          sendNotification(sessionUrl, "notifications/initialized");
          toolsListId = sendRequest(sessionUrl, "tools/list");
          return;
        }

        if (data.id === toolsListId) {
          const tools = parseTools(data?.result?.tools ?? data?.result);
          if (tools.length) {
            finish(tools);
          } else {
            fail(
              new Error("MCP 返回的工具列表为空，请确认服务是否注册了工具")
            );
          }
          return;
        }

        if (
          data.error &&
          (data.id === initializeId || data.id === toolsListId)
        ) {
          fail(
            new Error(
              data.error?.message ||
                "MCP 返回错误，请检查服务日志或请求参数"
            )
          );
        }
      }

      if (Array.isArray(data?.tools)) {
        const tools = parseTools(data.tools);
        if (tools.length) {
          finish(tools);
        }
      }
    };
  });
}

