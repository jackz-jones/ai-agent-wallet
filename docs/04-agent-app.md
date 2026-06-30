# 第4章：Agent 应用开发

> **本章在整体架构中的位置**：这是“连接层”——用 AI 能力驱动链上合约，让 Agent 能理解自然语言并自主执行链上操作。

---

## 📍 前情回顾

在前三章中，你已经：
- ✅ 开发了 AgentWallet 合约（Agent 的链上钱包）
- ✅ 开发了 PolicyEngine 合约（安全策略引擎）
- ✅ 合约已部署到本地/测试网，所有测试通过

现在合约层已就绪，但还缺一个“大脑”来驱动它们。本章我们开发 AI Agent 应用，让 LLM 来做决策，合约来执行。

---

## 4.1 传统方式 vs Agent 方式

在深入代码之前，先理解为什么要用 AI Agent 来操作链上资产：

| | 传统方式（人工操作） | AI Agent 方式 |
|---|---|---|
| **操作方式** | 人工打开 DApp，手动签名每笔交易 | Agent 自动监控市场、自主决策和执行 |
| **响应速度** | 分钟级（人需要看到通知、打开钱包） | 毫秒级（Agent 24/7 在线） |
| **执行一致性** | 受情绪影响（恐慌抛售、贪婪追涨） | 严格按策略执行，不受情绪干扰 |
| **覆盖范围** | 一个人最多盯几个协议 | Agent 可以同时监控数十个协议 |
| **安全性** | 私钥在人手中（可能被钓鱼） | 私钥在合约中，受策略引擎保护 |
| **成本** | 人力成本高 | 只需 Gas 费 + LLM 调用费 |

> ⚠️ **安全警告：关于私钥**
>
> Agent 需要一个私钥来签名交易。**绝对不要**：
> - ❌ 把主钱包私钥给 Agent
> - ❌ 在代码中硬编码私钥
> - ❌ 把私钥提交到 Git
>
> **正确做法**：
> - ✅ 为 Agent 创建专用的 EOA（权限最小化）
> - ✅ 私钥存在 `.env` 文件中，`.env` 加入 `.gitignore`
> - ✅ 生产环境使用 KMS（密钥管理服务）

---

## 4.2 Agent 架构总览

```
┌─────────────────────────────────────────────────────┐
│                    AI Agent                           │
│                                                       │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │  LLM 大脑     │  │  工具层       │  │  钱包层     │ │
│  │ (OpenAI)     │─▶│  (Function    │─▶│  (Web3)    │ │
│  │              │  │   Calling)    │  │            │ │
│  └──────────────┘  └──────────────┘  └────────────┘ │
│         │                  │                │         │
│         ▼                  ▼                ▼         │
│  理解用户意图        调用链上工具        签名并发送交易  │
└─────────────────────────────────────────────────────┘
```

**工作流程**：

```
用户说: "帮我用 100 USDC 买 ETH"

1. Agent 理解意图 → 决定调用 Uniswap swap 函数
2. Agent 构造参数 → 准备交易数据
3. Agent 调用钱包合约 → 通过策略引擎检查
4. 交易上链 → 完成
```

---

## 4.2 开发基础 Agent（Node.js/TypeScript）

创建 `agent/simple-agent.ts`：

```typescript
import OpenAI from "openai";
import { ethers } from "ethers";
import * as dotenv from "dotenv";

dotenv.config();

/**
 * AI Agent 核心类
 * 
 * 功能：
 * 1. 使用 LLM 理解用户意图
 * 2. 调用链上工具执行操作
 * 3. 通过智能合约钱包签名交易
 */
class AIAgent {
  private openai: OpenAI;
  private provider: ethers.Provider;
  private agentWallet: ethers.Wallet;
  private walletContract: ethers.Contract;

  constructor() {
    // 初始化 OpenAI
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // 连接区块链
    this.provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);

    // Agent 的 EOA 钱包（用于签名）
    this.agentWallet = new ethers.Wallet(
      process.env.AGENT_PRIVATE_KEY!,
      this.provider
    );

    // 连接智能合约钱包
    this.walletContract = new ethers.Contract(
      process.env.WALLET_CONTRACT_ADDRESS!,
      [
        "function execute(address to, uint256 value, bytes calldata data) external returns (bytes memory)",
        "function executeTokenTransfer(address token, address to, uint256 amount) external returns (bool)",
        "function getBalance() external view returns (uint256)",
        "function agent() external view returns (address agentAddress, string memory name, uint256 dailyLimit, uint256 perTxLimit, bool active, uint256 lastReset, uint256 spentToday)",
      ],
      this.agentWallet
    );
  }

  /**
   * 处理用户消息
   */
  async processMessage(userMessage: string): Promise<string> {
    // 定义 Agent 可用的工具
    const tools = this.getTools();

    // 调用 LLM
    const response = await this.openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `你是运行在区块链上的 AI Agent。
你的名字是 "DeFiAgent"。
你拥有一个智能合约钱包，可以执行链上交易。

你的能力：
1. 查询钱包余额和状态
2. 执行 ETH 转账
3. 执行 ERC-20 代币转账
4. 与 DeFi 协议交互

安全规则：
- 每次交易前必须检查限额
- 不执行任何可疑交易
- 向用户清晰说明每笔交易的内容`,
        },
        { role: "user", content: userMessage },
      ],
      tools: tools,
      tool_choice: "auto",
    });

    const message = response.choices[0].message;

    // 如果 LLM 决定调用工具
    if (message.tool_calls) {
      return await this.handleToolCalls(message.tool_calls);
    }

    // 否则直接返回文本回复
    return message.content || "我无法处理这个请求。";
  }

  /**
   * 定义 Agent 可用的工具
   */
  private getTools(): any[] {
    return [
      {
        type: "function",
        function: {
          name: "getWalletBalance",
          description: "查询钱包的 ETH 余额",
          parameters: { type: "object", properties: {} },
        },
      },
      {
        type: "function",
        function: {
          name: "getAgentInfo",
          description: "查询 Agent 的配置信息（限额、活跃状态等）",
          parameters: { type: "object", properties: {} },
        },
      },
      {
        type: "function",
        function: {
          name: "transferETH",
          description: "从钱包向指定地址转账 ETH",
          parameters: {
            type: "object",
            properties: {
              to: {
                type: "string",
                description: "接收地址",
              },
              amount: {
                type: "string",
                description: "ETH 数量（如 0.01）",
              },
            },
            required: ["to", "amount"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "transferToken",
          description: "从钱包向指定地址转账 ERC-20 代币",
          parameters: {
            type: "object",
            properties: {
              token: {
                type: "string",
                description: "代币合约地址",
              },
              to: {
                type: "string",
                description: "接收地址",
              },
              amount: {
                type: "string",
                description: "代币数量",
              },
            },
            required: ["token", "to", "amount"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "swapTokens",
          description: "在 Uniswap 上交换代币",
          parameters: {
            type: "object",
            properties: {
              tokenIn: { type: "string", description: "输入代币地址" },
              tokenOut: { type: "string", description: "输出代币地址" },
              amountIn: { type: "string", description: "输入数量" },
              minAmountOut: { type: "string", description: "最小输出数量" },
            },
            required: ["tokenIn", "tokenOut", "amountIn", "minAmountOut"],
          },
        },
      },
    ];
  }

  /**
   * 处理工具调用
   */
  private async handleToolCalls(toolCalls: any[]): Promise<string> {
    let results: string[] = [];

    for (const call of toolCalls) {
      const args = JSON.parse(call.function.arguments);

      switch (call.function.name) {
        case "getWalletBalance": {
          const balance = await this.walletContract.getBalance();
          results.push(`钱包余额: ${ethers.formatEther(balance)} ETH`);
          break;
        }

        case "getAgentInfo": {
          const info = await this.walletContract.agent();
          results.push(
            `Agent 信息:
  - 名称: ${info.name}
  - 地址: ${info.agentAddress}
  - 活跃: ${info.active ? "是" : "否"}
  - 日限额: ${ethers.formatEther(info.dailyLimit)} ETH
  - 单笔限额: ${ethers.formatEther(info.perTxLimit)} ETH
  - 今日已花费: ${ethers.formatEther(info.spentToday)} ETH`
          );
          break;
        }

        case "transferETH": {
          const tx = await this.walletContract.execute(
            args.to,
            ethers.parseEther(args.amount),
            "0x"
          );
          const receipt = await tx.wait();
          results.push(
            `✅ ETH 转账成功！
  - 接收方: ${args.to}
  - 金额: ${args.amount} ETH
  - 交易哈希: ${receipt.hash}`
          );
          break;
        }

        case "transferToken": {
          const tx = await this.walletContract.executeTokenTransfer(
            args.token,
            args.to,
            ethers.parseUnits(args.amount, 6) // USDC 是 6 位小数
          );
          const receipt = await tx.wait();
          results.push(
            `✅ 代币转账成功！
  - 代币: ${args.token}
  - 接收方: ${args.to}
  - 金额: ${args.amount}
  - 交易哈希: ${receipt.hash}`
          );
          break;
        }

        case "swapTokens": {
          // 构造 Uniswap swap 调用数据
          const uniswapRouter = "0x..."; // Uniswap V3 Router 地址
          const swapData = this.encodeSwapData(
            args.tokenIn,
            args.tokenOut,
            args.amountIn,
            args.minAmountOut
          );

          const tx = await this.walletContract.execute(
            uniswapRouter,
            0, // 不发送 ETH
            swapData
          );
          const receipt = await tx.wait();
          results.push(
            `✅ Swap 成功！
  - 输入: ${args.amountIn} ${args.tokenIn}
  - 输出: >= ${args.minAmountOut} ${args.tokenOut}
  - 交易哈希: ${receipt.hash}`
          );
          break;
        }
      }
    }

    return results.join("\n\n");
  }

  /**
   * 编码 Uniswap swap 数据
   */
  private encodeSwapData(
    tokenIn: string,
    tokenOut: string,
    amountIn: string,
    minAmountOut: string
  ): string {
    const iface = new ethers.Interface([
      "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut)",
    ]);

    return iface.encodeFunctionData("exactInputSingle", [
      {
        tokenIn: tokenIn,
        tokenOut: tokenOut,
        fee: 3000, // 0.3% 费率
        recipient: process.env.WALLET_CONTRACT_ADDRESS,
        deadline: Math.floor(Date.now() / 1000) + 60 * 20, // 20 分钟后过期
        amountIn: ethers.parseUnits(amountIn, 18),
        amountOutMinimum: ethers.parseUnits(minAmountOut, 18),
        sqrtPriceLimitX96: 0,
      },
    ]);
  }
}

// ============ 运行 Agent ============

async function main() {
  const agent = new AIAgent();

  console.log("🤖 AI Agent 已启动！");
  console.log("输入你的指令（输入 'exit' 退出）：\n");

  // 交互式命令行
  const readline = require("readline").createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const ask = () => {
    readline.question("你: ", async (input: string) => {
      if (input.toLowerCase() === "exit") {
        readline.close();
        return;
      }

      console.log("\n🤖 Agent 思考中...\n");
      const response = await agent.processMessage(input);
      console.log(`Agent: ${response}\n`);
      ask();
    });
  };

  ask();
}

// 运行
main().catch(console.error);
```

---

## 4.3 使用 Coinbase AgentKit（推荐）

Coinbase 提供了官方的 AgentKit，大大简化了开发。

安装：

```bash
npm install @coinbase/agentkit @coinbase/agentkit-langchain
```

创建 `agent/agent-kit.ts`：

```typescript
import { AgentKit, CdpWalletProvider } from "@coinbase/agentkit";
import { getLangChainTools } from "@coinbase/agentkit-langchain";
import { HumanMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import * as dotenv from "dotenv";

dotenv.config();

/**
 * 使用 Coinbase AgentKit 创建 AI Agent
 * 
 * AgentKit 自动处理：
 * - 钱包管理
 * - 交易签名
 * - 与智能合约交互
 * - 代币转账
 * - DeFi 操作
 */
async function createAgentKitAgent() {
  // 1. 配置钱包提供者
  const walletProvider = await CdpWalletProvider.configureWithWallet({
    apiKeyName: process.env.CDP_API_KEY_NAME,
    apiKeyPrivateKey: process.env.CDP_API_KEY_PRIVATE_KEY,
    networkId: "base-sepolia", // 使用 Base Sepolia 测试网
  });

  // 2. 初始化 AgentKit
  const agentKit = await AgentKit.init({
    walletProvider,
    // 可以添加更多能力
    // mpcApiKeyName: process.env.MPC_API_KEY_NAME,
    // mpcApiKeyPrivate: process.env.MPC_API_KEY_PRIVATE,
  });

  // 3. 获取 AgentKit 提供的工具
  const tools = await getLangChainTools(agentKit);

  // 4. 创建 LLM
  const llm = new ChatOpenAI({
    model: "gpt-4o",
    temperature: 0,
  });

  // 5. 创建 Agent
  const agent = createReactAgent({
    llm,
    tools,
    messageModifier: `
      你是运行在区块链上的 AI Agent。
      你拥有一个钱包，可以执行链上操作。
      
      你的能力包括：
      - 查询钱包余额
      - 转账 ETH 和代币
      - 部署智能合约
      - 与 DeFi 协议交互
      - 查询链上数据
      
      安全第一：
      - 每次交易前确认金额
      - 不执行可疑操作
      - 向用户清晰说明每步操作
    `,
  });

  return agent;
}

/**
 * 交互式运行 Agent
 */
async function runAgent() {
  const agent = await createAgentKitAgent();

  console.log("🤖 Coinbase AgentKit Agent 已启动！\n");

  // 示例对话
  const examples = [
    "我的钱包里有多少 ETH？",
    "给我创建一个新的 ERC-20 代币",
    "用 0.01 ETH 换 USDC",
  ];

  console.log("示例指令：");
  examples.forEach((ex, i) => console.log(`  ${i + 1}. "${ex}"`));
  console.log("\n输入你的指令（输入 'exit' 退出）：\n");

  const readline = require("readline").createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const ask = () => {
    readline.question("你: ", async (input: string) => {
      if (input.toLowerCase() === "exit") {
        readline.close();
        return;
      }

      console.log("\n🤖 Agent 思考中...\n");

      const stream = await agent.stream(
        { messages: [new HumanMessage(input)] },
        { configurable: { thread_id: "agent-session-1" } }
      );

      for await (const chunk of stream) {
        if ("agent" in chunk) {
          console.log(chunk.agent.messages[0].content);
        }
      }

      console.log(); // 空行
      ask();
    });
  };

  ask();
}

runAgent().catch(console.error);
```

---

## 4.4 Agent 的"思考"流程详解

为了让 Agent 做出正确的链上决策，需要理解它的思考过程：

```
用户: "帮我看看钱包里有多少钱"

Agent 的思考过程:
1. 理解意图 → "用户想查询余额"
2. 选择工具 → "getWalletBalance"
3. 调用工具 → 读取链上数据
4. 组织回复 → "钱包里有 1.5 ETH"

---

用户: "帮我转 0.01 ETH 给 0x123..."

Agent 的思考过程:
1. 理解意图 → "用户要转账"
2. 安全检查 → "0.01 ETH 在单笔限额内吗？"
3. 构造交易 → "调用 execute(0x123..., 0.01 ETH, 0x)"
4. 签名 → 用 Agent 私钥签名
5. 发送 → 调用钱包合约
6. 确认 → 等待交易确认
7. 回复 → "转账成功！交易哈希: 0x..."
```

---

## 4.5 Agent 与钱包合约的完整交互流程

```
┌─────────┐    ┌──────────┐    ┌──────────────┐    ┌──────────────┐
│  用户    │    │  Agent    │    │  智能合约钱包  │    │  策略引擎     │
└────┬────┘    └────┬─────┘    └──────┬───────┘    └──────┬───────┘
     │              │                 │                   │
     │ "帮我转账"    │                 │                   │
     │─────────────►│                 │                   │
     │              │                 │                   │
     │              │ 1. 解析意图     │                   │
     │              │ 2. 构造交易数据  │                   │
     │              │ 3. 检查限额     │                   │
     │              │                 │                   │
     │              │ execute(to,     │                   │
     │              │   value, data)  │                   │
     │              │────────────────►│                   │
     │              │                 │                   │
     │              │                 │ checkPolicy()     │
     │              │                 │──────────────────►│
     │              │                 │                   │
     │              │                 │   返回 true/false │
     │              │                 │◄──────────────────│
     │              │                 │                   │
     │              │                 │ 4. 执行交易       │
     │              │                 │    (如果策略通过)  │
     │              │                 │                   │
     │              │   交易哈希       │                   │
     │              │◄────────────────│                   │
     │              │                 │                   │
     │  "转账成功"   │                 │                   │
     │◄─────────────│                 │                   │
```

---

## 4.6 LLM 模型配置（多模型支持）

Agent 支持多种 LLM 提供商，通过环境变量即可切换，无需修改代码。

### 支持的提供商

| 提供商 | `LLM_PROVIDER` | 默认模型 | 说明 |
|--------|---------------|----------|------|
| OpenAI | `openai` | `gpt-4o` | 默认提供商，支持原生 Function Calling |
| Ollama | `ollama` | `llama3` | 本地模型，无需 API Key，注重隐私 |
| Anthropic | `anthropic` | `claude-sonnet-4-20250514` | Claude 模型，长上下文推理能力强 |
| Google | `gemini` | `gemini-2.0-flash` | Gemini 模型，支持原生 Function Calling |

### 环境变量配置

在 `.env` 文件中配置以下变量：

```bash
# LLM 提供商（openai / ollama / anthropic / gemini）
LLM_PROVIDER=openai

# 模型名称（可选，不填则使用默认模型）
LLM_MODEL=gpt-4o

# API Key（统一使用 LLM_API_KEY，Ollama 无需配置）
LLM_API_KEY=sk-你的Key

# 自定义 API 端点（可选，用于代理或自定义部署）
LLM_BASE_URL=
```

### 使用示例

**使用 OpenAI GPT-4o（默认）：**
```bash
LLM_PROVIDER=openai
LLM_API_KEY=sk-xxx
```

**使用本地 Ollama（无需 API Key）：**
```bash
# 先启动 Ollama: ollama serve
# 拉取模型: ollama pull llama3
LLM_PROVIDER=ollama
LLM_MODEL=llama3
```

**使用 Anthropic Claude：**
```bash
LLM_PROVIDER=anthropic
LLM_MODEL=claude-sonnet-4-20250514
LLM_API_KEY=sk-ant-xxx
```

**使用 Google Gemini：**
```bash
LLM_PROVIDER=gemini
LLM_MODEL=gemini-2.0-flash
LLM_API_KEY=AIza-xxx
```

### 架构说明

```
┌─────────────────────────────────────────────────────┐
│                    AI Agent                           │
│                                                       │
│  ┌──────────────────────────────────────────────────┐ │
│  │           LLM 抽象层 (agent/llm/)                 │ │
│  │                                                    │ │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────┐ │ │
│  │  │ OpenAI   │ │ Ollama   │ │Anthropic │ │Gemini│ │ │
│  │  │ Provider │ │ Provider │ │ Provider │ │Provid│ │ │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────┘ │ │
│  │                                                    │ │
│  │  统一接口: chatCompletion(messages, tools)         │ │
│  └──────────────────────────────────────────────────┘ │
│         │                                             │
│         ▼                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────┐  │
│  │  工具层       │  │  降级方案     │  │  钱包层     │  │
│  │ (Function    │  │ (Fallback)   │  │  (Web3)    │  │
│  │  Calling)    │  │              │  │            │  │
│  └──────────────┘  └──────────────┘  └────────────┘  │
└─────────────────────────────────────────────────────┘
```

> 💡 **降级方案**：对于不支持原生 Function Calling 的模型（如部分 Ollama 本地模型），
> 系统会自动切换到基于 prompt 的工具调用模拟，将工具定义注入 system prompt 并解析 LLM 输出。

---

## 4.7 运行 Agent

```bash
# 设置环境变量
export AGENT_PRIVATE_KEY=0x你的Agent私钥
export WALLET_CONTRACT_ADDRESS=0x你部署的钱包地址

# 方式1: 使用 OpenAI（默认）
export LLM_PROVIDER=openai
export LLM_API_KEY=sk-你的OpenAIKey
npx ts-node agent/simple-agent.ts

# 方式2: 使用本地 Ollama（无需 API Key）
export LLM_PROVIDER=ollama
export LLM_MODEL=llama3
npx ts-node agent/simple-agent.ts

# 方式3: 使用 Claude
export LLM_PROVIDER=anthropic
export LLM_API_KEY=sk-ant-你的Key
npx ts-node agent/simple-agent.ts

# 运行 AgentKit 版本
npx ts-node agent/agent-kit.ts
```

---

## ✅ 本章检查点

完成本章后，确认以下事项：

### 文件清单
- [x] `agent/simple-agent.ts` — 基础 Agent（支持多种 LLM 提供商）
- [x] `agent/agent-kit.ts` — Coinbase AgentKit 版本（支持多种 LLM）
- [x] `agent/llm/types.ts` — LLM 统一类型定义
- [x] `agent/llm/config.ts` — 配置加载模块
- [x] `agent/llm/index.ts` — 工厂函数入口
- [x] `agent/llm/fallback.ts` — Function Calling 降级方案
- [x] `agent/llm/providers/openai.ts` — OpenAI 适配器
- [x] `agent/llm/providers/ollama.ts` — Ollama 适配器
- [x] `agent/llm/providers/anthropic.ts` — Anthropic Claude 适配器
- [x] `agent/llm/providers/gemini.ts` — Google Gemini 适配器
- [x] `agent/llm/langchain-adapter.ts` — LangChain LLM 适配器

### 验证命令
```bash
# 确认 TypeScript 编译无错误
npx tsc --noEmit agent/simple-agent.ts 2>/dev/null || echo "请确保已安装依赖"

# 运行基础 Agent（需要配置 LLM_API_KEY，或使用 Ollama 本地模型）
npx ts-node agent/simple-agent.ts

# 或者运行 mock 模式（不需要 API Key）
npx hardhat run scripts/demo.ts --network hardhat
```

### 你应该理解的概念
- [x] Agent 的三层架构：LLM 大脑 → 工具层 → 钱包层
- [x] Function Calling：LLM 如何决定调用哪个工具
- [x] Agent 与钱包合约的交互流程
- [x] Coinbase AgentKit 的使用方式
- [x] LLM 抽象层：如何通过统一接口支持多种模型
- [x] 环境变量配置：如何切换不同的 LLM 提供商

### 常见问题

| 问题 | 解决方案 |
|------|----------|
| 没有 OpenAI API Key | 切换到 Ollama 本地模型：`LLM_PROVIDER=ollama`，或用 `scripts/demo.ts` 体验 mock 模式 |
| Agent 运行报错 "insufficient funds" | 确保钱包合约有足够 ETH |
| Function Calling 不触发 | 检查 system prompt 是否清晰描述了工具用途；部分 Ollama 模型会自动降级到 prompt 模拟 |
| AgentKit 初始化失败 | 确认 CDP_API_KEY_NAME 和 CDP_API_KEY_PRIVATE_KEY 已配置 |
| Ollama 连接失败 | 确保 Ollama 已启动：`ollama serve`，并已拉取模型：`ollama pull llama3` |
| LLM 配置验证失败 | 检查 `.env` 中的 `LLM_PROVIDER`、`LLM_API_KEY` 是否正确配置 |

---

## 🔗 下一章预告

Agent 现在能自主执行链上交易了，但它还不能“付费调用外部服务”。

传统方式是给 Agent 一个 API Key，但这有安全风险。x402 协议让 Agent 能像人一样“付钱买服务”：
- 不需要注册账号
- 不需要 API Key
- 直接用加密货币微支付

→ 进入 [第5章：x402 支付协议集成](05-x402-payment.md)
