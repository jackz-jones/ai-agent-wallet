/**
 * agent/simple-agent.ts
 * 
 * 【使用场景】
 * 开发一个基础的 AI Agent，通过 OpenAI Function Calling 让 LLM
 * 能够调用智能合约钱包执行链上操作。
 * 
 * 【前置条件】
 * 1. 已完成 scripts/deploy.ts 部署，获取合约地址
 * 2. 已安装依赖：npm install openai ethers dotenv
 * 3. 在 .env 中配置以下变量：
 *    - OPENAI_API_KEY
 *    - SEPOLIA_RPC_URL
 *    - AGENT_PRIVATE_KEY
 *    - WALLET_CONTRACT_ADDRESS
 * 
 * 【运行方式】
 * npx ts-node agent/simple-agent.ts
 * 
 * 【交互示例】
 * 你: 看看我钱包里有多少钱
 * 你: 给 0x1234... 转 0.01 ETH
 * 你: 查询我的 Agent 配置信息
 */

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

    try {
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
    } catch (error: any) {
      return `❌ 处理消息时出错: ${error.message}`;
    }
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
          results.push(`💰 钱包余额: ${ethers.formatEther(balance)} ETH`);
          break;
        }

        case "getAgentInfo": {
          const info = await this.walletContract.agent();
          results.push(
            `📋 Agent 信息:
  - 名称: ${info.name}
  - 地址: ${info.agentAddress}
  - 活跃: ${info.active ? "✅ 是" : "❌ 否"}
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
          const uniswapRouter = "0x2626664c2603336E57B271c5C0b26F421741e481"; // Sepolia Uniswap V3 Router
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

  console.log(`
╔══════════════════════════════════════╗
║   🤖 AI Agent 已启动！               ║
║                                      ║
║   你可以说：                          ║
║   • "看看我钱包里有多少钱"             ║
║   • "给 0x1234... 转 0.01 ETH"       ║
║   • "查询我的 Agent 配置"             ║
║   • "用 100 USDC 买 ETH"             ║
╚══════════════════════════════════════╝
`);
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
