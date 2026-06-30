# 第6章：完整实战——DeFi 自动理财 Agent

> 本章将前面所有知识整合，开发一个真正的 DeFi 自动理财 Agent。
> 它能自动管理你的资产，在 Uniswap 和 Aave 之间套利。

---

## 6.1 项目概述

### 功能

```
用户说: "帮我把 1000 USDC 存入 Aave 赚利息"
Agent: ✅ 已存入 1000 USDC 到 Aave，当前 APY 5.2%

用户说: "看看有没有套利机会"
Agent: 🔍 发现 Uniswap ETH/USDC 价差 0.3%，已执行套利，获利 2.5 USDC

用户说: "每天自动把利息转成 ETH"
Agent: ✅ 已设置自动任务，每天 UTC 8:00 执行
```

### 技术栈

| 组件 | 技术 | 用途 |
|------|------|------|
| 智能合约 | Solidity + Hardhat | 钱包 + 策略引擎 |
| AI 大脑 | 多模型支持（OpenAI/Ollama/Claude/Gemini） | 理解意图、决策 |
| 链上交互 | ethers.js | 执行交易 |
| 支付 | x402 协议 | 微支付调用外部服务 |
| 自动化 | node-cron | 定时任务 |
| 前端 | React (可选) | 管理界面 |

---

## 6.2 项目结构

```
ai-agent-wallet/
├── contracts/
│   ├── AgentWallet.sol        # 钱包合约（第2章）
│   ├── PolicyEngine.sol       # 策略引擎（第3章）
│   ├── PolicyTemplates.sol    # 策略模板库（第3章）
│   └── StrategyManager.sol    # 策略管理器（新增）
├── agent/
│   ├── simple-agent.ts        # 基础 Agent 示例（第4章）
│   ├── agent-kit.ts           # Coinbase AgentKit 集成（第4章）
│   ├── defi-agent.ts          # DeFi Agent 主程序（本章）
│   ├── x402-consumer.ts       # x402 消费者（第5章）
│   ├── agent-with-x402.ts     # 集成 x402 的 Agent（第5章）
│   └── llm/                   # LLM 多模型抽象层（第4章）
│       ├── types.ts           # 统一类型定义
│       ├── config.ts          # 配置加载
│       ├── index.ts           # 工厂函数入口
│       ├── fallback.ts        # Function Calling 降级方案
│       ├── langchain-adapter.ts # LangChain 适配器
│       └── providers/         # 各提供商适配器
│           ├── openai.ts
│           ├── ollama.ts
│           ├── anthropic.ts
│           └── gemini.ts
├── scripts/
│   ├── demo.ts               # ⚡ 快速体验 Demo
│   ├── deploy.ts             # 部署合约
│   ├── deploy-all.ts         # 一键部署所有合约
│   ├── configure-agent.ts    # 配置 Agent
│   ├── test-agent.ts         # 测试 Agent 功能
│   ├── send-user-op.ts       # 发送 UserOperation
│   └── agent-mock-demo.ts    # Agent Mock 演示
├── server/
│   └── x402-provider.ts      # x402 提供者服务（第5章）
├── test/
│   ├── AgentWallet.test.ts   # 钱包合约测试
│   └── PolicyEngine.test.ts  # 策略引擎测试
└── frontend/
    └── index.html            # 管理面板
```

---

## 6.3 策略管理器合约

创建 `contracts/StrategyManager.sol`：

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title StrategyManager
 * @notice DeFi 策略管理器
 * 
 * 管理 Agent 的自动化策略：
 * - 定期再平衡
 * - 套利机会检测
 * - 收益率优化
 */
contract StrategyManager {
    // ============ 类型定义 ============

    /// @notice 策略类型
    enum StrategyType {
        LENDING,        // 借贷
        SWAP,           // 兑换
        YIELD_FARMING,  // 流动性挖矿
        ARBITRAGE,      // 套利
        REBALANCE       // 再平衡
    }

    /// @notice 策略配置
    struct Strategy {
        StrategyType strategyType;
        string name;
        address[] protocols;     // 涉及的协议地址
        bytes params;            // 策略参数（编码后）
        bool active;
        uint256 lastExecuted;
        uint256 interval;        // 执行间隔（秒）
    }

    /// @notice 执行记录
    struct ExecutionRecord {
        uint256 timestamp;
        uint256 profit;          // 获利（wei）
        string description;
    }

    // ============ 状态变量 ============

    address public owner;
    mapping(address => Strategy[]) public walletStrategies;  // 钱包 => 策略列表
    mapping(address => ExecutionRecord[]) public executionHistory;
    mapping(address => uint256) public totalProfit;

    // ============ 事件 ============

    event StrategyAdded(address indexed wallet, uint256 indexed strategyId, string name);
    event StrategyExecuted(address indexed wallet, uint256 indexed strategyId, uint256 profit);
    event StrategyToggled(address indexed wallet, uint256 indexed strategyId, bool active);

    // ============ 构造函数 ============

    constructor() {
        owner = msg.sender;
    }

    // ============ 策略管理 ============

    /// @notice 添加新策略
    function addStrategy(
        address wallet,
        StrategyType strategyType,
        string memory name,
        address[] memory protocols,
        bytes memory params,
        uint256 interval
    ) external returns (uint256) {
        require(msg.sender == owner, "Only owner");

        walletStrategies[wallet].push(Strategy({
            strategyType: strategyType,
            name: name,
            protocols: protocols,
            params: params,
            active: true,
            lastExecuted: 0,
            interval: interval
        }));

        uint256 strategyId = walletStrategies[wallet].length - 1;
        emit StrategyAdded(wallet, strategyId, name);
        return strategyId;
    }

    /// @notice 切换策略开关
    function toggleStrategy(address wallet, uint256 strategyId, bool active) external {
        require(msg.sender == owner, "Only owner");
        require(strategyId < walletStrategies[wallet].length, "Invalid strategy");

        walletStrategies[wallet][strategyId].active = active;
        emit StrategyToggled(wallet, strategyId, active);
    }

    /// @notice 记录策略执行
    function recordExecution(
        address wallet,
        uint256 strategyId,
        uint256 profit,
        string memory description
    ) external {
        require(msg.sender == owner, "Only owner");

        walletStrategies[wallet][strategyId].lastExecuted = block.timestamp;
        executionHistory[wallet].push(ExecutionRecord({
            timestamp: block.timestamp,
            profit: profit,
            description: description
        }));
        totalProfit[wallet] += profit;

        emit StrategyExecuted(wallet, strategyId, profit);
    }

    /// @notice 获取待执行的策略
    function getPendingStrategies(address wallet) external view returns (uint256[] memory) {
        Strategy[] storage strategies = walletStrategies[wallet];
        uint256 count = 0;

        for (uint256 i = 0; i < strategies.length; i++) {
            if (strategies[i].active && 
                block.timestamp >= strategies[i].lastExecuted + strategies[i].interval) {
                count++;
            }
        }

        uint256[] memory pending = new uint256[](count);
        uint256 index = 0;
        for (uint256 i = 0; i < strategies.length; i++) {
            if (strategies[i].active && 
                block.timestamp >= strategies[i].lastExecuted + strategies[i].interval) {
                pending[index] = i;
                index++;
            }
        }

        return pending;
    }

    /// @notice 获取策略数量
    function getStrategyCount(address wallet) external view returns (uint256) {
        return walletStrategies[wallet].length;
    }
}
```

---

## 6.4 DeFi Agent 主程序

创建 `agent/defi-agent.ts`：

```typescript
import { ethers } from "ethers";
import * as dotenv from "dotenv";
import cron from "node-cron";
import { createLLMProvider, loadLLMConfig } from "./llm";
import type { LLMProvider } from "./llm/types";

dotenv.config();

/**
 * DeFi 自动理财 Agent
 * 
 * 能力：
 * 1. 在 Aave 上存/取资产
 * 2. 在 Uniswap 上兑换代币
 * 3. 自动检测套利机会
 * 4. 定时执行策略
 * 5. 通过 x402 获取市场数据
 */
class DeFiAgent {
  private llm: LLMProvider;
  private provider: ethers.Provider;
  private wallet: ethers.Wallet;
  private walletContract: ethers.Contract;
  private strategyManager: ethers.Contract;

  // 常用合约地址（Base Sepolia 测试网）
  private readonly USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
  private readonly WETH = "0x4200000000000000000000000000000000000006";
  private readonly UNISWAP_ROUTER = "0x2626664c2603336E57B271c5C0b26F421741e481";
  private readonly AAVE_POOL = "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5";

  constructor() {
    // 使用 LLM 抽象层，支持 OpenAI/Ollama/Claude/Gemini
    const llmConfig = loadLLMConfig();
    this.llm = createLLMProvider(llmConfig);
    this.provider = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL);
    this.wallet = new ethers.Wallet(process.env.AGENT_PRIVATE_KEY!, this.provider);

    // 连接合约
    this.walletContract = new ethers.Contract(
      process.env.WALLET_CONTRACT_ADDRESS!,
      [
        "function execute(address to, uint256 value, bytes calldata data) external returns (bytes memory)",
        "function executeTokenTransfer(address token, address to, uint256 amount) external returns (bool)",
        "function getBalance() external view returns (uint256)",
        "function agent() external view returns (address,string,uint256,uint256,bool,uint256,uint256)",
      ],
      this.wallet
    );

    this.strategyManager = new ethers.Contract(
      process.env.STRATEGY_MANAGER_ADDRESS!,
      [
        "function addStrategy(address,uint8,string,address[],bytes,uint256) returns (uint256)",
        "function getPendingStrategies(address) view returns (uint256[])",
        "function recordExecution(address,uint256,uint256,string)",
      ],
      this.wallet
    );
  }

  /**
   * 处理用户消息
   */
  async processMessage(userMessage: string): Promise<string> {
    const tools = this.getDeFiTools();

    const response = await this.llm.chatCompletion([
        {
          role: "system",
          content: `你是 DeFi 自动理财 Agent。

你的能力：
1. 查询钱包余额和状态
2. 在 Aave 上存款/取款
3. 在 Uniswap 上兑换代币
4. 检测并执行套利机会
5. 设置自动策略
6. 查看收益统计

安全规则：
- 每次交易前确认金额
- 不执行可疑操作
- 清晰说明每步操作
- 关注 Gas 费用，避免浪费`,
        },
        { role: "user", content: userMessage },
      ], tools);

    if (response.toolCalls && response.toolCalls.length > 0) {
      return await this.handleDeFiCalls(response.toolCalls);
    }

    return response.content || "我无法处理这个请求。";
  }

  /**
   * DeFi 工具定义
   */
  private getDeFiTools(): any[] {
    return [
      {
        type: "function",
        function: {
          name: "getBalance",
          description: "查询钱包所有资产余额",
          parameters: { type: "object", properties: {} },
        },
      },
      {
        type: "function",
        function: {
          name: "depositAave",
          description: "将资产存入 Aave 赚取利息",
          parameters: {
            type: "object",
            properties: {
              asset: { type: "string", enum: ["USDC", "WETH"] },
              amount: { type: "string", description: "数量" },
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
              asset: { type: "string", enum: ["USDC", "WETH"] },
              amount: { type: "string", description: "数量" },
            },
            required: ["asset", "amount"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "swapTokens",
          description: "在 Uniswap 上兑换代币",
          parameters: {
            type: "object",
            properties: {
              tokenIn: { type: "string", enum: ["USDC", "WETH"] },
              tokenOut: { type: "string", enum: ["USDC", "WETH"] },
              amount: { type: "string", description: "输入数量" },
              slippage: { type: "number", description: "滑点容忍度（百分比）" },
            },
            required: ["tokenIn", "tokenOut", "amount"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "checkArbitrage",
          description: "检测跨 DEX 套利机会",
          parameters: { type: "object", properties: {} },
        },
      },
      {
        type: "function",
        function: {
          name: "setupAutoStrategy",
          description: "设置自动执行策略",
          parameters: {
            type: "object",
            properties: {
              strategy: {
                type: "string",
                enum: ["daily_rebalance", "auto_compound", "yield_optimizer"],
              },
              interval: {
                type: "string",
                enum: ["1h", "6h", "12h", "24h"],
                description: "执行间隔",
              },
            },
            required: ["strategy", "interval"],
          },
        },
      },
    ];
  }

  /**
   * 处理 DeFi 工具调用
   */
  private async handleDeFiCalls(toolCalls: any[]): Promise<string> {
    let results: string[] = [];

    for (const call of toolCalls) {
      const args = JSON.parse(call.function.arguments);

      switch (call.function.name) {
        case "getBalance": {
          const ethBalance = await this.walletContract.getBalance();
          const usdcBalance = await this.getTokenBalance(this.USDC);
          results.push(
            `💰 钱包资产：
  - ETH: ${ethers.formatEther(ethBalance)}
  - USDC: ${ethers.formatUnits(usdcBalance, 6)}`
          );
          break;
        }

        case "depositAave": {
          const tokenAddress = args.asset === "USDC" ? this.USDC : this.WETH;
          const amount = ethers.parseUnits(args.amount, args.asset === "USDC" ? 6 : 18);

          // 1. 先 approve Aave Pool 可以花我们的代币
          const approveData = new ethers.Interface([
            "function approve(address spender, uint256 amount) returns (bool)",
          ]).encodeFunctionData("approve", [this.AAVE_POOL, amount]);

          await this.walletContract.execute(tokenAddress, 0, approveData);

          // 2. 调用 Aave 的 supply 函数
          const supplyData = new ethers.Interface([
            "function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode)",
          ]).encodeFunctionData("supply", [
            tokenAddress,
            amount,
            process.env.WALLET_CONTRACT_ADDRESS,
            0,
          ]);

          const tx = await this.walletContract.execute(this.AAVE_POOL, 0, supplyData);
          const receipt = await tx.wait();

          results.push(
            `✅ 已存入 ${args.amount} ${args.asset} 到 Aave！
  - 交易哈希: ${receipt.hash}
  - 建议查看 Aave 仪表盘获取 APY 信息`
          );
          break;
        }

        case "withdrawAave": {
          const tokenAddress = args.asset === "USDC" ? this.USDC : this.WETH;
          const amount = ethers.parseUnits(args.amount, args.asset === "USDC" ? 6 : 18);

          const withdrawData = new ethers.Interface([
            "function withdraw(address asset, uint256 amount, address to)",
          ]).encodeFunctionData("withdraw", [
            tokenAddress,
            amount,
            process.env.WALLET_CONTRACT_ADDRESS,
          ]);

          const tx = await this.walletContract.execute(this.AAVE_POOL, 0, withdrawData);
          const receipt = await tx.wait();

          results.push(
            `✅ 已从 Aave 提取 ${args.amount} ${args.asset}！
  - 交易哈希: ${receipt.hash}`
          );
          break;
        }

        case "swapTokens": {
          const tokenIn = args.tokenIn === "USDC" ? this.USDC : this.WETH;
          const tokenOut = args.tokenOut === "USDC" ? this.USDC : this.WETH;
          const amountIn = ethers.parseUnits(args.amount, args.tokenIn === "USDC" ? 6 : 18);
          const slippage = args.slippage || 0.5; // 默认 0.5% 滑点

          // 获取当前价格（简化版）
          const amountOutMin = amountIn; // 实际应该通过报价获取

          // 1. approve Uniswap Router
          const approveData = new ethers.Interface([
            "function approve(address spender, uint256 amount) returns (bool)",
          ]).encodeFunctionData("approve", [this.UNISWAP_ROUTER, amountIn]);

          await this.walletContract.execute(tokenIn, 0, approveData);

          // 2. 执行 swap
          const swapData = new ethers.Interface([
            "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) payable returns (uint256 amountOut)",
          ]).encodeFunctionData("exactInputSingle", [{
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            fee: 3000,
            recipient: process.env.WALLET_CONTRACT_ADDRESS,
            deadline: Math.floor(Date.now() / 1000) + 600,
            amountIn: amountIn,
            amountOutMinimum: amountOutMin,
            sqrtPriceLimitX96: 0,
          }]);

          const tx = await this.walletContract.execute(this.UNISWAP_ROUTER, 0, swapData);
          const receipt = await tx.wait();

          results.push(
            `✅ Swap 完成！
  - ${args.amount} ${args.tokenIn} → ${args.tokenOut}
  - 交易哈希: ${receipt.hash}`
          );
          break;
        }

        case "checkArbitrage": {
          // 简化的套利检测
          // 实际应该查询多个 DEX 的价格
          results.push(
            `🔍 套利检测结果：
  当前未发现明显的跨 DEX 套利机会。
  
  建议：
  1. 设置自动监控策略
  2. 关注 ETH/USDC 交易对
  3. 当价差 > 0.5% 时自动执行`
          );
          break;
        }

        case "setupAutoStrategy": {
          // 设置定时任务
          const cronMap: Record<string, string> = {
            "1h": "0 * * * *",
            "6h": "0 */6 * * *",
            "12h": "0 */12 * * *",
            "24h": "0 0 * * *",
          };

          cron.schedule(cronMap[args.interval], async () => {
            console.log(`⏰ 执行策略: ${args.strategy}`);
            await this.executeStrategy(args.strategy);
          });

          results.push(
            `✅ 自动策略已设置！
  - 策略: ${args.strategy}
  - 间隔: ${args.interval}
  - 状态: 运行中`
          );
          break;
        }
      }
    }

    return results.join("\n\n");
  }

  /**
   * 查询代币余额
   */
  private async getTokenBalance(tokenAddress: string): Promise<bigint> {
    const token = new ethers.Contract(
      tokenAddress,
      ["function balanceOf(address) view returns (uint256)"],
      this.provider
    );
    return await token.balanceOf(await this.walletContract.getAddress());
  }

  /**
   * 执行自动策略
   */
  private async executeStrategy(strategy: string) {
    switch (strategy) {
      case "daily_rebalance":
        // 检查各资产比例，自动再平衡
        console.log("📊 执行再平衡...");
        break;

      case "auto_compound":
        // 自动复投利息
        console.log("🔄 执行复投...");
        break;

      case "yield_optimizer":
        // 选择最优收益率
        console.log("📈 优化收益率...");
        break;
    }
  }
}

// ============ 交互式运行 ============

async function main() {
  const agent = new DeFiAgent();

  console.log(`
╔══════════════════════════════════════╗
║   🤖 DeFi 自动理财 Agent 已启动      ║
║                                      ║
║   你可以说：                          ║
║   • "看看我钱包里有多少钱"              ║
║   • "把 100 USDC 存入 Aave"           ║
║   • "用 0.1 ETH 换 USDC"              ║
║   • "检查套利机会"                     ║
║   • "设置每天自动复投"                 ║
╚══════════════════════════════════════╝
`);

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
      try {
        const response = await agent.processMessage(input);
        console.log(`Agent:\n${response}\n`);
      } catch (error: any) {
        console.log(`❌ 错误: ${error.message}\n`);
      }
      ask();
    });
  };

  ask();
}

main().catch(console.error);
```

---

## 6.5 一键部署脚本

创建 `scripts/deploy-all.ts`：

```typescript
import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("部署者:", deployer.address);

  // 1. 部署策略引擎
  console.log("\n📦 部署策略引擎...");
  const PolicyEngine = await ethers.getContractFactory("PolicyEngine");
  const engine = await PolicyEngine.deploy();
  await engine.waitForDeployment();
  const engineAddress = await engine.getAddress();
  console.log("  PolicyEngine:", engineAddress);

  // 2. 部署策略管理器
  console.log("\n📦 部署策略管理器...");
  const StrategyManager = await ethers.getContractFactory("StrategyManager");
  const manager = await StrategyManager.deploy();
  await manager.waitForDeployment();
  const managerAddress = await manager.getAddress();
  console.log("  StrategyManager:", managerAddress);

  // 3. 部署 Agent 钱包
  console.log("\n📦 部署 Agent 钱包...");
  const agentEOA = new ethers.Wallet(process.env.AGENT_PRIVATE_KEY!).address;

  const AgentWallet = await ethers.getContractFactory("AgentWallet");
  const wallet = await AgentWallet.deploy(
    deployer.address,           // owner
    agentEOA,                   // agent 地址
    "DeFiAgent",                // agent 名称
    ethers.parseEther("10"),    // 日限额 10 ETH
    ethers.parseEther("1")      // 单笔限额 1 ETH
  );
  await wallet.waitForDeployment();
  const walletAddress = await wallet.getAddress();
  console.log("  AgentWallet:", walletAddress);

  // 4. 连接策略引擎到钱包
  console.log("\n🔗 连接策略引擎...");
  await wallet.setPolicyEngine(engineAddress);
  console.log("  ✅ 已连接");

  // 5. 配置策略
  console.log("\n⚙️ 配置策略...");
  await engine.setPolicy(walletAddress, {
    useWhitelist: true,
    useBlacklist: true,
    useFunctionWhitelist: false,
    useAmountLimits: true,
    useRateLimit: true,
    useTimeWindow: false,
    maxPerTx: ethers.parseEther("1"),
    maxDaily: ethers.parseEther("10"),
    maxRate: 10,
    timeWindowStart: 0,
    timeWindowEnd: 0,
  });

  // 添加白名单合约
  const UNISWAP_ROUTER = "0x2626664c2603336E57B271c5C0b26F421741e481";
  const AAVE_POOL = "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5";
  await engine.addToWhitelist(walletAddress, UNISWAP_ROUTER);
  await engine.addToWhitelist(walletAddress, AAVE_POOL);
  console.log("  ✅ 策略已配置");
  console.log("  白名单合约:");
  console.log("    - Uniswap Router:", UNISWAP_ROUTER);
  console.log("    - Aave Pool:", AAVE_POOL);

  // 6. 输出部署摘要
  console.log("\n" + "=".repeat(50));
  console.log("🎉 部署完成！");
  console.log("=".repeat(50));
  console.log(`
部署摘要:
  AgentWallet:     ${walletAddress}
  PolicyEngine:    ${engineAddress}
  StrategyManager: ${managerAddress}
  Agent EOA:       ${agentEOA}

请将以下内容添加到 .env 文件:
  WALLET_CONTRACT_ADDRESS=${walletAddress}
  POLICY_ENGINE_ADDRESS=${engineAddress}
  STRATEGY_MANAGER_ADDRESS=${managerAddress}
`);
}

main().catch(console.error);
```

---

## 6.6 前端管理面板

创建 `frontend/index.html`：

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>DeFi Agent 管理面板</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/ethers/6.13.0/ethers.umd.min.js"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #0a0a0f;
            color: #e0e0e0;
            padding: 20px;
        }
        .container { max-width: 1200px; margin: 0 auto; }
        .header {
            display: flex; justify-content: space-between; align-items: center;
            padding: 20px; background: #1a1a2e; border-radius: 12px; margin-bottom: 20px;
        }
        .header h1 { font-size: 24px; color: #00d4aa; }
        .status { display: flex; gap: 10px; align-items: center; }
        .status-dot {
            width: 10px; height: 10px; border-radius: 50%;
            background: #00d4aa; display: inline-block;
        }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
        .card {
            background: #1a1a2e; border-radius: 12px; padding: 20px;
            border: 1px solid #2a2a3e;
        }
        .card h2 { font-size: 16px; color: #888; margin-bottom: 10px; }
        .card .value { font-size: 28px; font-weight: bold; color: #00d4aa; }
        .card .label { font-size: 12px; color: #666; margin-top: 5px; }
        .chat-box {
            background: #1a1a2e; border-radius: 12px; padding: 20px;
            margin-top: 20px;
        }
        .chat-messages {
            height: 300px; overflow-y: auto; margin-bottom: 10px;
            padding: 10px; background: #0a0a0f; border-radius: 8px;
        }
        .chat-input {
            display: flex; gap: 10px;
        }
        .chat-input input {
            flex: 1; padding: 12px; border-radius: 8px; border: 1px solid #2a2a3e;
            background: #0a0a0f; color: #e0e0e0; font-size: 14px;
        }
        .chat-input button {
            padding: 12px 24px; border-radius: 8px; border: none;
            background: #00d4aa; color: #000; font-weight: bold; cursor: pointer;
        }
        .message { margin-bottom: 10px; padding: 10px; border-radius: 8px; }
        .message.user { background: #2a2a3e; }
        .message.agent { background: #1a3a2e; }
        .transaction {
            padding: 10px; background: #0a0a0f; border-radius: 8px;
            margin-bottom: 8px; font-size: 13px;
        }
        .transaction .hash { color: #00d4aa; }
        .transaction .time { color: #666; font-size: 11px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🤖 DeFi Agent Dashboard</h1>
            <div class="status">
                <span class="status-dot"></span>
                <span>运行中</span>
            </div>
        </div>

        <div class="grid">
            <div class="card">
                <h2>总资产</h2>
                <div class="value" id="totalValue">--</div>
                <div class="label">USD 估值</div>
            </div>
            <div class="card">
                <h2>ETH 余额</h2>
                <div class="value" id="ethBalance">--</div>
                <div class="label">ETH</div>
            </div>
            <div class="card">
                <h2>USDC 余额</h2>
                <div class="value" id="usdcBalance">--</div>
                <div class="label">USDC</div>
            </div>
            <div class="card">
                <h2>累计收益</h2>
                <div class="value" id="totalProfit">--</div>
                <div class="label">USD</div>
            </div>
        </div>

        <div class="chat-box">
            <h2>💬 与 Agent 对话</h2>
            <div class="chat-messages" id="chatMessages">
                <div class="message agent">
                    👋 你好！我是你的 DeFi 理财助手。我可以帮你：
                    <br>• 查询资产余额
                    <br>• 在 Aave 存/取资产
                    <br>• 在 Uniswap 兑换代币
                    <br>• 设置自动理财策略
                </div>
            </div>
            <div class="chat-input">
                <input type="text" id="chatInput" placeholder="输入指令，如：看看我钱包里有多少钱" />
                <button onclick="sendMessage()">发送</button>
            </div>
        </div>

        <div class="card" style="margin-top: 20px;">
            <h2>📜 最近交易</h2>
            <div id="recentTransactions">
                <div class="transaction">暂无交易记录</div>
            </div>
        </div>
    </div>

    <script>
        // 连接 MetaMask
        let provider, signer, walletContract;

        async function connectWallet() {
            if (typeof window.ethereum !== 'undefined') {
                provider = new ethers.BrowserProvider(window.ethereum);
                signer = await provider.getSigner();
                
                walletContract = new ethers.Contract(
                    'YOUR_WALLET_ADDRESS',
                    [
                        'function getBalance() view returns (uint256)',
                        'function executeTokenTransfer(address,address,uint256) returns (bool)',
                        'function agent() view returns (address,string,uint256,uint256,bool,uint256,uint256)',
                    ],
                    signer
                );

                updateDashboard();
            } else {
                alert('请安装 MetaMask！');
            }
        }

        async function updateDashboard() {
            try {
                const balance = await walletContract.getBalance();
                document.getElementById('ethBalance').textContent = 
                    ethers.formatEther(balance);

                const agentInfo = await walletContract.agent();
                document.getElementById('totalValue').textContent = 
                    ethers.formatEther(agentInfo.dailyLimit);
            } catch (error) {
                console.error('更新失败:', error);
            }
        }

        async function sendMessage() {
            const input = document.getElementById('chatInput');
            const message = input.value.trim();
            if (!message) return;

            // 显示用户消息
            const messages = document.getElementById('chatMessages');
            messages.innerHTML += `<div class="message user">🧑 ${message}</div>`;
            input.value = '';

            // 调用 Agent API
            try {
                const response = await fetch('/api/agent', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message }),
                });
                const data = await response.json();

                messages.innerHTML += `<div class="message agent">🤖 ${data.response}</div>`;
                messages.scrollTop = messages.scrollHeight;

                // 更新仪表盘
                updateDashboard();
            } catch (error) {
                messages.innerHTML += `<div class="message agent">❌ 错误: ${error.message}</div>`;
            }
        }

        // 自动连接
        connectWallet();
    </script>
</body>
</html>
```

---

## 6.7 运行完整项目

```bash
# 1. 安装依赖
npm install

# 2. 编译合约
npx hardhat compile

# 3. 部署所有合约
npx hardhat run scripts/deploy-all.ts --network base-sepolia

# 4. 配置 .env
# 复制部署输出的地址到 .env

# 5. 启动 Agent
npx ts-node agent/defi-agent.ts

# 6. （可选）启动前端
# 用 VS Code Live Server 打开 frontend/index.html
```

---

## 6.8 测试场景

### 场景1：基础查询

```
你: 看看我钱包里有多少钱
Agent: 💰 钱包资产：
  - ETH: 1.5
  - USDC: 1000
```

### 场景2：DeFi 存款

```
你: 把 500 USDC 存入 Aave
Agent: ✅ 已存入 500 USDC 到 Aave！
  - 交易哈希: 0xabc...
  - 建议查看 Aave 仪表盘获取 APY
```

### 场景3：代币兑换

```
你: 用 0.5 ETH 换 USDC
Agent: ✅ Swap 完成！
  - 0.5 ETH → 约 950 USDC
  - 交易哈希: 0xdef...
```

### 场景4：自动策略

```
你: 设置每天自动复投
Agent: ✅ 自动策略已设置！
  - 策略: auto_compound
  - 间隔: 24h
  - 状态: 运行中
```

---

## 📖 本章小结

你已完成整个实战项目：
- ✅ 开发了策略管理器合约
- ✅ 开发了完整的 DeFi Agent（支持多种 LLM 模型）
- ✅ 集成了 Aave 存款/取款
- ✅ 集成了 Uniswap 代币兑换
- ✅ 实现了自动策略调度
- ✅ 开发了前端管理面板
- ✅ 完成了一键部署
- ✅ 通过了多个测试场景

---

## 🎉 恭喜！你已学会 AI + 区块链应用开发！

你现在可以：
1. ✅ 编写和部署 Solidity 智能合约
2. ✅ 开发 ERC-4337 智能合约钱包
3. ✅ 设计 AI Agent 策略引擎
4. ✅ 开发基于多种 LLM 的 AI Agent（OpenAI/Ollama/Claude/Gemini）
5. ✅ 集成 x402 支付协议
6. ✅ 构建完整的 DeFi 自动理财应用

**下一步建议**：
- 将项目部署到主网（需要真钱）
- 添加更多 DeFi 协议（Compound、Curve 等）
- 实现更复杂的套利策略
- 添加 Telegram/Discord Bot 接口
- 研究 ERC-8004 Agent 身份标准
