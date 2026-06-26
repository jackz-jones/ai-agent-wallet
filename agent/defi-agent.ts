/**
 * agent/defi-agent.ts
 * 
 * 【使用场景】
 * 在 simple-agent 基础上，增加 DeFi 协议交互能力。
 * Agent 可以执行更复杂的链上操作，如：
 * - 在 Uniswap 上做市/兑换
 * - 在 Aave 上存款/借贷
 * - 自动复投策略
 * 
 * 【前置条件】
 * 1. 已完成 scripts/deploy.ts 部署
 * 2. 已将策略引擎地址设置到钱包合约
 * 3. 已安装依赖：npm install openai ethers dotenv
 * 
 * 【运行方式】
 * npx ts-node agent/defi-agent.ts
 * 
 * 【交互示例】
 * 你: 帮我用 0.1 ETH 在 Uniswap 上买 USDC
 * 你: 把钱包里的 USDC 存入 Aave 赚利息
 * 你: 查看我的 DeFi 仓位
 */

import OpenAI from "openai";
import { ethers } from "ethers";
import * as dotenv from "dotenv";

dotenv.config();

// ============ 合约地址（Sepolia 测试网） ============
const CONTRACTS = {
  UNISWAP_V3_ROUTER: "0x2626664c2603336E57B271c5C0b26F421741e481",
  UNISWAP_V3_FACTORY: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
  AAVE_V3_POOL: "0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951",
  AAVE_V3_ADDRESS_PROVIDER: "0x0496275d34753A48320b581E8D4B262fB7bB0b93",
  WETH: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
  USDC: "0x94a9D9AC8a22534E3FaCa9F4e7F2E2cf85d5E4C8",
};

// ============ ABI 片段 ============
const AAVI_ABI = [
  "function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external",
  "function withdraw(address asset, uint256 amount, address to) external returns (uint256)",
  "function getUserAccountData(address user) external view returns (uint256 totalCollateralETH, uint256 totalDebtETH, uint256 availableBorrowsETH, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)",
];

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
];

/**
 * DeFi AI Agent
 * 可以执行更复杂的 DeFi 操作
 */
class DeFiAgent {
  private openai: OpenAI;
  private provider: ethers.Provider;
  private agentWallet: ethers.Wallet;
  private walletContract: ethers.Contract;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    this.provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
    this.agentWallet = new ethers.Wallet(
      process.env.AGENT_PRIVATE_KEY!,
      this.provider
    );

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

  async processMessage(userMessage: string): Promise<string> {
    const tools = this.getTools();

    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `你是运行在区块链上的 DeFi AI Agent。
你的名字是 "DeFiMaster"。
你拥有一个智能合约钱包，可以执行各种 DeFi 操作。

你的能力：
1. 查询钱包余额和状态
2. 执行 ETH/ERC-20 转账
3. 在 Uniswap 上兑换代币
4. 在 Aave 上存款/取款
5. 查询 DeFi 仓位信息

安全规则：
- 每次交易前向用户确认金额
- 不执行任何可疑交易
- 先查询再操作`,
          },
          { role: "user", content: userMessage },
        ],
        tools: tools,
        tool_choice: "auto",
      });

      const message = response.choices[0].message1;

      if (message.tool_calls) {
        return await this.handleToolCalls(message.tool_calls);
      }

      return message.content || "我无法处理这个请求。";
    } catch (error: any) {
      return `❌ 处理消息时出错: ${error.message}`;
    }
  }

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
          name: "getTokenBalance",
          description: "查询钱包中指定代币的余额",
          parameters: {
            type: "object",
            properties: {
              token: { type: "string", description: "代币合约地址" },
            },
            required: ["token"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "swapETHForTokens",
          description: "在 Uniswap 上用 ETH 兑换代币",
          parameters: {
            type: "object",
            properties: {
              tokenOut: { type: "string", description: "目标代币地址" },
              amountIn: { type: "string", description: "ETH 数量" },
              minAmountOut: { type: "string", description: "最小输出数量" },
            },
            required: ["tokenOut", "amountIn", "minAmountOut"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "swapTokensForETH",
          description: "在 Uniswap 上用代币兑换 ETH",
          parameters: {
            type: "object",
            properties: {
              tokenIn: { type: "string", description: "输入代币地址" },
              amountIn: { type: "string", description: "代币数量" },
              minAmountOut: { type: "string", description: "最小 ETH 输出" },
            },
            required: ["tokenIn", "amountIn", "minAmountOut"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "supplyAave",
          description: "在 Aave 上存入资产赚取利息",
          parameters: {
            type: "object",
            properties: {
              asset: { type: "string", description: "资产地址" },
              amount: { type: "string", description: "存入数量" },
            },
            required: ["asset", "amount"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "withdrawAave",
          description: "从 Aave 提取资产",
          parameters: {
            type: "object",
            properties: {
              asset: { type: "string", description: "资产地址" },
              amount: { type: "string", description: "提取数量" },
            },
            required: ["asset", "amount"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "getAavePosition",
          description: "查询在 Aave 上的仓位信息",
          parameters: {
            type: "object",
            properties: {
              user: { type: "string", description: "用户地址" },
            },
            required: ["user"],
          },
        },
      },
    ];
  }

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

        case "getTokenBalance": {
          const token = new ethers.Contract(args.token, ERC20_ABI, this.provider);
          const balance = await token.balanceOf(process.env.WALLET_CONTRACT_ADDRESS);
          const decimals = await token.decimals();
          results.push(`💰 代币余额: ${ethers.formatUnits(balance, decimals)}`);
          break;
        }

        case "swapETHForTokens": {
          const swapData = this.encodeExactInputSingle(
            ethers.ZeroAddress, // ETH 用零地址表示
            args.tokenOut,
            args.amountIn,
            args.minAmountOut
          );
          const tx = await this.walletContract.execute(
            CONTRACTS.UNISWAP_V3_ROUTER,
            ethers.parseEther(args.amountIn),
            swapData
          );
          const receipt = await tx.wait();
          results.push(
            `✅ Swap 成功！\n  - 输入: ${args.amountIn} ETH\n  - 输出: >= ${args.minAmountOut}\n  - 交易哈希: ${receipt.hash}`
          );
          break;
        }

        case "swapTokensForETH": {
          const swapData = this.encodeExactInputSingle(
            args.tokenIn,
            ethers.ZeroAddress,
            args.amountIn,
            args.minAmountOut
          );
          const tx = await this.walletContract.execute(
            CONTRACTS.UNISWAP_V3_ROUTER,
            0,
            swapData
          );
          const receipt = await tx.wait();
          results.push(
            `✅ Swap 成功！\n  - 输入: ${args.amountIn}\n  - 输出: >= ${args.minAmountOut} ETH\n  - 交易哈希: ${receipt.hash}`
          );
          break;
        }

        case "supplyAave": {
          // 先 approve Aave Pool 可以操作代币
          const approveData = new ethers.Interface([
            "function approve(address spender, uint256 amount) returns (bool)",
          ]).encodeFunctionData("approve", [
            CONTRACTS.AAVE_V3_POOL,
            ethers.parseUnits(args.amount, 18),
          ]);

          await this.walletContract.execute(args.asset, 0, approveData);

          // 调用 Aave supply
          const supplyData = new ethers.Interface(AAVI_ABI).encodeFunctionData("supply", [
            args.asset,
            ethers.parseUnits(args.amount, 18),
            process.env.WALLET_CONTRACT_ADDRESS,
            0,
          ]);

          const tx = await this.walletContract.execute(
            CONTRACTS.AAVE_V3_POOL,
            0,
            supplyData
          );
          const receipt = await tx.wait();
          results.push(
            `✅ Aave 存款成功！\n  - 资产: ${args.asset}\n  - 金额: ${args.amount}\n  - 交易哈希: ${receipt.hash}`
          );
          break;
        }

        case "withdrawAave": {
          const withdrawData = new ethers.Interface(AAVI_ABI).encodeFunctionData("withdraw", [
            args.asset,
            ethers.parseUnits(args.amount, 18),
            process.env.WALLET_CONTRACT_ADDRESS,
          ]);

          const tx = await this.walletContract.execute(
            CONTRACTS.AAVE_V3_POOL,
            0,
            withdrawData
          );
          const receipt = await tx.wait();
          results.push(
            `✅ Aave 取款成功！\n  - 资产: ${args.asset}\n  - 金额: ${args.amount}\n  - 交易哈希: ${receipt.hash}`
          );
          break;
        }

        case "getAavePosition": {
          const aavePool = new ethers.Contract(
            CONTRACTS.AAVE_V3_POOL,
            AAVI_ABI,
            this.provider
          );
          const data = await aavePool.getUserAccountData(args.user);
          results.push(
            `📋 Aave 仓位信息:
  - 总抵押 (ETH): ${ethers.formatEther(data.totalCollateralETH)}
  - 总负债 (ETH): ${ethers.formatEther(data.totalDebtETH)}
  - 可借 (ETH): ${ethers.formatEther(data.availableBorrowsETH)}
  - 清算阈值: ${data.currentLiquidationThreshold.toString()}
  - LTV: ${data.ltv.toString()}
  - 健康因子: ${ethers.formatEther(data.healthFactor)}`
          );
          break;
        }
      }
    }

    return results.join("\n\n");
  }

  private encodeExactInputSingle(
    tokenIn: string,
    tokenOut: string,
    amountIn: string,
    amountOutMinimum: string
  ): string {
    const iface = new ethers.Interface([
      "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut)",
    ]);

    return iface.encodeFunctionData("exactInputSingle", [
      {
        tokenIn: tokenIn === ethers.ZeroAddress
          ? "0x0000000000000000000000000000000000000000"
          : tokenIn,
        tokenOut: tokenOut === ethers.ZeroAddress
          ? "0x0000000000000000000000000000000000000000"
          : tokenOut,
        fee: 3000,
        recipient: process.env.WALLET_CONTRACT_ADDRESS,
        deadline: Math.floor(Date.now() / 1000) + 60 * 20,
        amountIn: ethers.parseUnits(amountIn, 18),
        amountOutMinimum: ethers.parseUnits(amountOutMinimum, 18),
        sqrtPriceLimitX96: 0,
      },
    ]);
  }
}

// ============ 运行 ============

async function main() {
  const agent = new DeFiAgent();

  console.log(`
╔══════════════════════════════════════╗
║   🏦 DeFi Agent 已启动！             ║
║                                      ║
║   你可以说：                          ║
║   • "用 0.1 ETH 买 USDC"             ║
║   • "把 USDC 存入 Aave"              ║
║   • "查看我的 DeFi 仓位"             ║
║   • "从 Aave 取出 USDC"              ║
╚══════════════════════════════════════╝
`);
  console.log("输入你的指令（输入 'exit' 退出）：\n");

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

main().catch(console.error);
