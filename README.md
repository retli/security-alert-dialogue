## SecGuard ReAct Dialog

轻量级 Chrome 插件，以对话框形式协助处理安全告警。核心能力：

- LangChain TypeScript Agent：使用 `createAgent + ChatOpenAI` 构建的 ReAct 对话，自动解析 `Thought / Tool / Observation / Final Answer`。
- 自定义大模型：通过 API 地址、API Key、Authorization 三项配置对接任意兼容接口。
- MCP Server 集成：将 Action 自动映射为远程工具调用，可连接自建安全情报 / SOAR 能力。
- Cursor 风格 UI：深色对话面板、单输入框快速粘贴，支持快捷键 `⌘/Ctrl + Enter` 发送。

### 目录结构

```
security-alert-dialogue/
├── dist/               # `npm run build` 产物，加载到 Chrome
├── docs/
│   └── langchain-react-notes.md
├── manifest.json
├── scripts/
│   └── build.mjs       # esbuild + 静态资源拷贝
├── src/
│   ├── agents/
│   │   └── langchainAgent.ts
│   ├── popup/
│   │   ├── popup.css
│   │   ├── popup.html
│   │   └── popup.ts
│   ├── services/
│   │   ├── mcpClient.ts
│   │   └── storage.ts
│   └── shims/
│       └── async_hooks.ts
└── tsconfig.json
```

### 快速使用

1. 安装依赖  
   ```bash
   PATH=$(pwd)/.node-runtime/bin:$PATH npm install
   ```
   > 仓库自带便携版 Node，可直接复用；也可以使用本地 Node 20+。
2. 构建产物  
   ```bash
   PATH=$(pwd)/.node-runtime/bin:$PATH npm run build
   ```
   输出会写入 `dist/`，包含 manifest / popup / bundle。
3. Chrome 打开 `chrome://extensions`，右上角开启「开发者模式」，选择「加载已解压的扩展程序」，指向 `dist/`。
4. 点击工具栏图标即可看到对话弹窗：
   - 输入框粘贴告警原文后点击「开始分析」或 `⌘/Ctrl + Enter`。
   - 右上角齿轮打开设置抽屉，填写 LLM/MCP 参数。

### 配置说明

| 字段 | 说明 |
| --- | --- |
| API 地址 | 兼容 `POST /v1/chat/completions` 的 HTTP Endpoint |
| API Key | LLM 服务提供的密钥，默认会被附加到 `Authorization: Bearer ...` 与 `X-API-Key` |
| Authorization（可选） | 自定义 Authorization 头，例如 `Basic xxx`，填写后会覆盖默认 Bearer |
| MCP Server URL | 你部署的 MCP Server HTTP 入口 |
| 默认工具 | ReAct `Action` 未显式指定时使用的 tool 名称 |
| 自动触发 MCP | 关闭时需要人工执行工具，开启则自动调用 |

> 插件使用 `chrome.storage.local` 存储配置，未填 API Key 时会走本地 Mock 流程，方便离线演示。

### LangChain ReAct 运行方式

1. `LangchainAgent` 使用 `createAgent` + `ChatOpenAI` + `DynamicStructuredTool` 生成标准 ReAct agent。
2. 代理会在 `Thought` 中输出决策过程，当模型决定调用工具时，LangChain 自动发起函数调用。
3. `MCPClient` 接收工具请求 `POST { tool, input }`，将结果作为 `Observation` 回注。
4. 最后一个 AI 消息会被渲染为 `Final Answer`，包含根因、影响与建议。

### MCP Server 约定

- HTTP `POST` 接口，Body 包含 `tool` 与 `input`。
- 返回 `application/json` 时会渲染为 JSON 文本；非 JSON 则原样显示。
- 可在 `src/services/mcpClient.ts` 中调整鉴权 Header 或路由。

### 开发提示

- 样式集中在 `src/popup/popup.css`，可继续扩展主题或响应式。
- 状态管理在 `src/popup/popup.ts`，仅依赖原生 DOM，易于嵌入 UI 组件库。
- LangChain 逻辑位于 `src/agents/langchainAgent.ts`，如果需要多工具或更多回调可在此扩展。

欢迎根据自身安全流程追加 SOAR API、剧本模板等。安装后即可开始体验。

