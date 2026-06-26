# 第4章：Agent 应用开发

> 现在开始开发真正的 AI Agent！Agent 将使用 OpenAI 的 AI 能力，结合我们开发的智能合约钱包，实现自主链上操作。

---

## 4.1 Agent 架构总览

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

## 4.6 运行 Agent

```bash
# 设置环境变量
export AGENT_PRIVATE_KEY=0x你的Agent私钥
export WALLET_CONTRACT_ADDRESS=0x你部署的钱包地址
export OPENAI_API_KEY=sk-你的OpenAIKey

# 运行基础 Agent
npx ts-node agent/simple-agent.ts

# 或运行 AgentKit 版本
npx ts-node agent/agent-kit.ts
```

---

## 📖 本章小结

你已完成：
- ✅ 开发了基于 LLM 的 AI Agent
- ✅ Agent 能理解自然语言并执行链上操作
- ✅ 集成了 Coinbase AgentKit
- ✅ 理解了 Agent 的完整思考流程
- ✅ 实现了 Agent 与钱包合约的交互

**下一步**：进入第5章，集成 x402 支付协议。
