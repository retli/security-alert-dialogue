## LangChain ReAct Agent 研读笔记

> 参考资料  
> - [LangChain Agent核心解析：Zero-Shot-ReAct策略实现与实战指南](https://jishuzhan.net/article/1918096368879652866)  
> - [LangChain教程 - Agent - 支持 9 种 ReAct 交互](https://blog.csdn.net/fenglingguitar/article/details/146056008)  
> - [LangChain---Agents ReAct模式：让你的AI学会行动与思考](https://devpress.csdn.net/aibjcy/68d3938da6dc56200e8896a7.html)

### 1. ReAct Prompt 模板要点

与 LangChain 内置 `create_react_agent` 使用的提示一致，核心结构包含：

```
Answer the following questions as best you can. You have access to the following tools:

{工具列表 name + description}

Use the following format:

Question: 输入的任务
Thought: 你的思考...
Action: 可用工具名
Action Input: 工具入参
Observation: 工具输出
... (Thought/Action/Action Input/Observation 重复 N 次)
Thought: 我已经获得足够信息
Final Answer: 最终输出
```

我们的 `SYSTEM_PROMPT` 可沿用该结构，仅将系统角色改写为“安全运营分析师”，并在工具列表注入 MCP / report。

### 2. LangChain 构建流程（Python 示例）

```python
from langchain.agents import AgentExecutor, create_react_agent
from langchain.llms import OpenAI
from langchain.tools import Tool
from langchain.prompts import PromptTemplate

llm = OpenAI(model_name="gpt-4")

def search_tool(query: str) -> str:
    ...

tools = [
    Tool(
        name="Search",
        func=search_tool,
        description="提供威胁情报检索结果"
    )
]

prompt = PromptTemplate.from_template(REACT_PROMPT)
agent = create_react_agent(llm=llm, tools=tools, prompt=prompt)
executor = AgentExecutor(agent=agent, tools=tools, verbose=True)

result = executor.invoke({"input": "处理一条安全告警..."})
```

要点：
- 工具通过 `Tool` 对象声明 `name` 与 `description`，LangChain 自动把描述串进提示模板。
- `AgentExecutor` 负责循环执行 Thought/Action，直到返回 `Final Answer`。
- LangChain 的 ReAct 策略默认支持 `max_iterations` 与 `early_stopping_method`。

### 3. 对 Chrome 插件的启发

1. **Prompt 同步**：把 `reactAgent.js` 的 `SYSTEM_PROMPT` 替换为 LangChain 官方 ReAct 模板，动态注入 MCP 工具描述。
2. **Tool Registry**：借鉴 LangChain 的工具注册机制，封装 MCP / report / 未来扩展工具为统一接口（`name`, `description`, `handler`），以便 UI 中展示。
3. **执行循环**：LangChain `AgentExecutor` 的逻辑与我们现有的 `runSession` 极为相似，可按照 `Thought -> Action -> Observation -> Final Answer` 的 while-loop 重构，加入 `maxSteps` 与 `stoppingMethod`。
4. **可选的 LangChain JS**：若后续需要直接使用 LangChain 官方 JS 版本（`npm install langchain`），需要：
   - 引入 bundler（如 Vite）以支持 ESM tree-shaking。
   - 通过 `@langchain/openai`、`@langchain/community/tools` 注册自定义工具。
   - 在 popup 中调用打包后的代理函数（Service Worker / background script），再把事件推送回 UI。

### 4. 下一步建议

| 项目 | 动作 |
| --- | --- |
| Prompt | 采用 LangChain ReAct 官方模板，增强工具描述。 |
| 工具层 | 引入 `ToolRegistry`，统一管理 MCP / report / mock 工具。 |
| 代理层 | 在 `ReActAgent` 中实现与 `AgentExecutor` 一致的循环控制与异常策略。 |
| 长期规划 | 评估迁移到 LangChain JS（需要 npm + bundler）或在背景页运行 Python LangChain 服务，再由插件与之通信。 |

> 以上结论基于官方文档与教程整理，可在实际集成 LangChain 前作为设计蓝本。

