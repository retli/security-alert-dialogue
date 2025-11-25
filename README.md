## SecGuard ReAct Dialog

轻量级 Chrome 插件，以对话框形式协助处理安全告警。核心能力：

- 自研 ReAct Agent：通过定制 LLM 请求与工具循环自动解析 `Thought / Action / Observation / Final Answer`。
- 自定义大模型：通过 API 地址、API Key、Access Code 三项配置对接任意兼容接口，并可在 Options 页面一键测试。
- MCP Server 管理：支持为每个 Server 命名、自动发现工具列表并以下拉方式选择默认工具，可保存多个 Server 并在侧栏中切换。
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
│   │   └── reactAgent.ts
│   ├── options/
│   │   ├── options.css
│   │   ├── options.html
│   │   └── options.ts
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
4. 点击工具栏图标即可打开 Chrome 右侧栏，输入框粘贴告警原文后点击「开始分析」或 `⌘/Ctrl + Enter`，配置入口则在侧栏右上角齿轮/Options 页面。

### 配置说明

| 字段 | 说明 |
| --- | --- |
| API 地址 | 兼容 `POST /v1/chat/completions` 的 HTTP Endpoint |
| API Key | 仅写入请求头 `apikey: *****`，不再附带 Bearer |
| Access Code | 自动拼接为 `Authorization: ACCESSCODE ********`，与 Cursor 同款鉴权保持一致 |
| 模型名称 | 下拉选择常用模型或输入自定义名称 |
| MCP Server (SSE) | 可保存多个 Server（需填写 SSE Endpoint，如 `https://xxx/sse`） |
| 自动发现工具 | 点击「发现工具」后会通过 MCP SSE 握手（initialize → tools/list）列出全部工具 |
| 默认工具 | 在下拉框中选择的工具将作为 `Action` 的默认值 |
| 自动触发 MCP | 关闭时需要人工执行工具，开启则自动调用 |

> 插件使用 `chrome.storage.local` 存储配置，可在 Options 页面为多个 MCP Server 命名管理，并通过 SSE 自动发现工具列表；「测试 MCP 连接」同样会完整执行 initialize → tools/list 以确认服务可用。未填 API Key 时会走本地 Mock 流程，方便离线演示。

### ReAct 运行方式

1. `reactAgent.ts` 会先向 LLM 发送系统提示，生成包含 `Thought/Action/...` 的响应。
2. 如果响应包含 `Action: MCP.xxx`，插件会自动调用对应 MCP 工具，并把 `Observation` 注入下一轮对话。
3. 当检测到 `Final Answer` 时停止循环，并在 UI 中展示最终结论。

### MCP Server 约定

- HTTP `POST` 接口，Body 包含 `tool` 与 `input`。
- 返回 `application/json` 时会渲染为 JSON 文本；非 JSON 则原样显示。
- 可在 `src/services/mcpClient.ts` 中调整鉴权 Header 或路由。

### 开发提示

- 样式集中在 `src/popup/popup.css` 与 `src/options/options.css`，可继续扩展主题或响应式。
- Options 页面逻辑位于 `src/options/*`，已内置测试按钮、Access Code 处理与自动保存钩子。
- 状态管理在 `src/popup/popup.ts`，仅依赖原生 DOM，易于嵌入 UI 组件库。
- ReAct 循环与 LLM 调用逻辑位于 `src/agents/reactAgent.ts`，如果需要多工具或更多回调可在此扩展。

欢迎根据自身安全流程追加 SOAR API、剧本模板等。安装后即可开始体验。

