export class LLMClient {
  constructor({ apiKey, llmEndpoint, modelName, authHeader } = {}) {
    this.apiKey = apiKey;
    this.llmEndpoint = llmEndpoint;
    this.modelName = modelName ?? "gpt-4o-mini";
    this.authHeader = authHeader;
  }

  updateConfig({ apiKey, llmEndpoint, modelName, authHeader } = {}) {
    if (apiKey !== undefined) this.apiKey = apiKey;
    if (llmEndpoint !== undefined) this.llmEndpoint = llmEndpoint;
    if (modelName !== undefined) this.modelName = modelName ?? "gpt-4o-mini";
    if (authHeader !== undefined) this.authHeader = authHeader;
  }

  async chat(messages) {
    if (!this.apiKey || !this.llmEndpoint || !this.modelName) {
      return this.mockFallback(messages);
    }

    const payload = {
      model: this.modelName ?? "gpt-4o-mini",
      temperature: 0.2,
      messages
    };

    const headers = {
      "Content-Type": "application/json"
    };

    if (this.apiKey) {
      headers["X-API-Key"] = this.apiKey;
    }

    if (this.authHeader) {
      headers.Authorization = this.authHeader;
    } else if (this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }

    const response = await fetch(this.llmEndpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`LLM 请求失败: ${response.status} ${errBody}`);
    }

    const data = await response.json();
    const content =
      data?.choices?.[0]?.message?.content ??
      data?.choices?.[0]?.text ??
      JSON.stringify(data);
    return content;
  }

  mockFallback(messages) {
    const latest = messages[messages.length - 1]?.content ?? "";
    return [
      "Thought: 这是离线演示流程，未检测到可用的 API Key。",
      "Action: MCP.stub_enrich",
      `Action Input: ${JSON.stringify({ latest })}`,
      "Observation: 返回示例情报。",
      "Final Answer: 请在设置中填写真实的 API Key 与 Endpoint。"
    ].join("\n");
  }
}

