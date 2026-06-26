import { ethers } from "hardhat";

/**
 * 🤖 AI Agent Mock Demo
 *
 * 本脚本演示 AI Agent 的决策流程，不需要真实的 LLM API Key。
 * 使用预设的决策逻辑模拟 Agent 的"思考"过程，帮助你理解：
 * 1. Agent 如何接收任务
 * 2. Agent 如何分析和决策
 * 3. Agent 如何调用链上合约
 * 4. 策略引擎如何约束 Agent
 *
 * 运行方式：npx hardhat run scripts/agent-mock-demo.ts --network hardhat
 */

// ============ Mock AI 决策引擎 ============

interface AgentDecision {
  action: "transfer" | "query_balance" | "reject";
  reason: string;
  params?: {
    to?: string;
    amount?: string;
  };
}

/**
 * Mock AI 决策函数
 * 模拟 LLM 的 Function Calling 行为
 * 在真实场景中，这里会调用 OpenAI/Claude 等 LLM API
 */
function mockAIDecision(userMessage: string): AgentDecision {
  const msg = userMessage.toLowerCase();

  // 模拟 LLM 理解用户意图
  if (msg.includes("余额") || msg.includes("balance") || msg.includes("多少钱")) {
    return {
      action: "query_balance",
      reason: "用户想查询钱包余额",
    };
  }

  if (msg.includes("转账") || msg.includes("transfer") || msg.includes("发送")) {
    // 模拟从消息中提取参数
    const amountMatch = msg.match(/(\d+\.?\d*)\s*(eth|ether)/i);
    const amount = amountMatch ? amountMatch[1] : "0.1";

    return {
      action: "transfer",
      reason: `用户要求转账 ${amount} ETH`,
      params: {
        amount,
      },
    };
  }

  if (msg.includes("全部") || msg.includes("所有") || msg.includes("all")) {
    return {
      action: "reject",
      reason: "检测到高风险操作（转移全部资金），Agent 主动拒绝",
    };
  }

  return {
    action: "reject",
    reason: "无法理解用户意图，拒绝执行",
  };
}

// ============ Mock Agent 类 ============

class MockAgent {
  private wallet: any;
  private agentSigner: any;
  private recipient: any;

  constructor(wallet: any, agentSigner: any, recipient: any) {
    this.wallet = wallet;
    this.agentSigner = agentSigner;
    this.recipient = recipient;
  }

  /**
   * 处理用户消息（模拟完整的 Agent 流程）
   */
  async processMessage(userMessage: string): Promise<string> {
    console.log(`\n  📨 收到用户消息: "${userMessage}"`);
    console.log(`  🧠 [Mock LLM] 分析用户意图...`);

    // 步骤1：AI 决策
    const decision = mockAIDecision(userMessage);
    console.log(`  💭 决策结果: ${decision.action} — ${decision.reason}`);

    // 步骤2：执行决策
    switch (decision.action) {
      case "query_balance": {
        const balance = await this.wallet.getBalance();
        const result = `钱包余额: ${ethers.formatEther(balance)} ETH`;
        console.log(`  📊 ${result}`);
        return result;
      }

      case "transfer": {
        const amount = ethers.parseEther(decision.params!.amount!);
        console.log(`  🔄 准备转账 ${decision.params!.amount} ETH...`);
        console.log(`  🛡️ 检查策略约束...`);

        try {
          const tx = await this.wallet
            .connect(this.agentSigner)
            .executeTransfer(this.recipient.address, amount);
          await tx.wait();

          const result = `✅ 转账成功！${decision.params!.amount} ETH → ${this.recipient.address.slice(0, 10)}...`;
          console.log(`  ${result}`);
          return result;
        } catch (error: any) {
          const errorMsg = error.message.includes("exceeds per-tx limit")
            ? "❌ 策略引擎拦截：超出单笔限额"
            : error.message.includes("exceeds daily limit")
            ? "❌ 策略引擎拦截：超出日限额"
            : `❌ 交易失败: ${error.message.slice(0, 50)}`;
          console.log(`  ${errorMsg}`);
          return errorMsg;
        }
      }

      case "reject": {
        console.log(`  🚫 Agent 拒绝执行: ${decision.reason}`);
        return `拒绝执行: ${decision.reason}`;
      }

      default:
        return "未知操作";
    }
  }
}

// ============ 主流程 ============

async function main() {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║         🤖 AI Agent Mock Demo — 无需 API Key               ║
║                                                              ║
║  本 Demo 使用预设逻辑模拟 LLM 决策过程                      ║
║  帮助你理解 Agent 的完整工作流程                            ║
╚══════════════════════════════════════════════════════════════╝
  `);

  // 部署合约
  const [owner, agentSigner, recipient] = await ethers.getSigners();

  console.log("  📦 部署合约...");
  const AgentWallet = await ethers.getContractFactory("AgentWallet");
  const wallet = await AgentWallet.deploy();
  await wallet.waitForDeployment();

  // 注册 Agent
  await wallet.registerAgent(
    agentSigner.address,
    "Mock DeFi Agent",
    "模拟 AI Agent（不需要真实 LLM）",
    ethers.parseEther("1.0"),  // 日限额 1 ETH
    ethers.parseEther("0.3")   // 单笔限额 0.3 ETH
  );

  // 充值
  await owner.sendTransaction({
    to: await wallet.getAddress(),
    value: ethers.parseEther("5.0"),
  });

  console.log("  ✅ 合约部署完成，Agent 已注册\n");

  // 创建 Mock Agent
  const agent = new MockAgent(wallet, agentSigner, recipient);

  // 模拟用户对话
  const conversations = [
    "查看钱包余额",
    "帮我转账 0.2 ETH",
    "再转 0.1 ETH",
    "转账 0.5 ETH",          // 会被策略引擎拦截（超出 0.3 ETH 单笔限额）
    "把所有钱都转走",         // Agent 主动拒绝高风险操作
    "查看余额",
  ];

  console.log("═".repeat(60));
  console.log("  开始模拟用户与 Agent 的对话：");
  console.log("═".repeat(60));

  for (const msg of conversations) {
    console.log(`\n${"─".repeat(50)}`);
    await agent.processMessage(msg);
  }

  // 总结
  console.log(`\n${"═".repeat(60)}`);
  console.log(`
  📝 Demo 总结：

  你刚才看到了 AI Agent 的完整决策流程：
  
  1. 接收消息 → Mock LLM 分析意图（真实场景用 OpenAI/Claude）
  2. 做出决策 → 选择调用哪个工具（Function Calling）
  3. 执行操作 → 调用链上合约
  4. 策略约束 → 超限操作被自动拦截
  5. 自我保护 → Agent 主动拒绝高风险操作

  💡 替代方案（不需要 OpenAI API Key）：
  
  - 本地模型：Ollama + Llama 3（免费，需要 GPU）
  - 免费 API：Groq（免费额度）、Together AI（免费试用）
  - 规则引擎：用 if/else 替代 LLM（适合简单场景）
  - Mock 模式：就像本 Demo 一样，用预设逻辑开发测试
  `);
  console.log("═".repeat(60));
}

main().catch((error) => {
  console.error("Demo 运行失败:", error);
  process.exitCode = 1;
});
