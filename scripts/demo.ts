import { ethers } from "hardhat";

/**
 * 🚀 AI Agent 钱包快速体验 Demo
 *
 * 本脚本在本地 Hardhat 网络上演示完整的 AI Agent 钱包工作流程：
 * 1. 部署合约（AgentWallet + PolicyEngine）
 * 2. 注册 Agent 并配置策略
 * 3. Agent 自主执行转账
 * 4. 策略引擎拦截超限交易
 * 5. 查看交易历史
 *
 * 运行方式：npx hardhat run scripts/demo.ts --network hardhat
 * 无需 API Key，无需测试网 ETH，纯本地运行
 */

// 辅助函数：打印分隔线
function printStep(step: number, title: string) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  步骤 ${step}: ${title}`);
  console.log(`${"=".repeat(60)}\n`);
}

function printResult(label: string, value: string) {
  console.log(`  ✅ ${label}: ${value}`);
}

function printInfo(info: string) {
  console.log(`  ℹ️  ${info}`);
}

function printWarning(info: string) {
  console.log(`  ⚠️  ${info}`);
}

function printMockAI(thought: string, action: string) {
  console.log(`\n  🤖 [AI Agent 思考中...]`);
  console.log(`     思考: "${thought}"`);
  console.log(`     决策: "${action}"`);
}

async function main() {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║         🤖 AI Agent 钱包 - 快速体验 Demo                    ║
║                                                              ║
║  本 Demo 模拟一个 AI Agent 使用智能合约钱包自主执行交易      ║
║  的完整流程，帮助你理解 AI + 区块链 的核心工作原理          ║
╚══════════════════════════════════════════════════════════════╝
  `);

  const [owner, agentSigner, recipient] = await ethers.getSigners();

  // ============ 步骤 1：部署合约 ============
  printStep(1, "部署智能合约");
  printInfo("正在部署 AgentWallet（AI Agent 的链上钱包）...");

  const AgentWallet = await ethers.getContractFactory("AgentWallet");
  const wallet = await AgentWallet.deploy();
  await wallet.waitForDeployment();
  const walletAddress = await wallet.getAddress();
  printResult("AgentWallet 部署成功", walletAddress);

  printInfo("正在部署 PolicyEngine（策略引擎，约束 Agent 行为）...");
  const PolicyEngine = await ethers.getContractFactory("PolicyEngine");
  const policyEngine = await PolicyEngine.deploy(walletAddress);
  await policyEngine.waitForDeployment();
  const policyEngineAddress = await policyEngine.getAddress();
  printResult("PolicyEngine 部署成功", policyEngineAddress);

  printInfo("\n  💡 解释：AgentWallet 是 Agent 的\"银行账户\"，PolicyEngine 是\"风控系统\"");
  printInfo("     Agent 每次操作都要经过 PolicyEngine 的策略检查");

  // ============ 步骤 2：注册 Agent 并配置策略 ============
  printStep(2, "注册 AI Agent 并配置安全策略");

  printInfo("Owner（人类用户）正在注册一个 AI Agent...");
  const dailyLimit = ethers.parseEther("1.0");  // 日限额 1 ETH
  const perTxLimit = ethers.parseEther("0.3");  // 单笔限额 0.3 ETH

  const registerTx = await wallet.registerAgent(
    agentSigner.address,
    "DeFi Trading Agent",
    "自动执行 DeFi 交易的 AI Agent",
    dailyLimit,
    perTxLimit
  );
  await registerTx.wait();

  printResult("Agent 注册成功", `"DeFi Trading Agent" (${agentSigner.address.slice(0, 10)}...)`);
  printResult("日限额", `${ethers.formatEther(dailyLimit)} ETH`);
  printResult("单笔限额", `${ethers.formatEther(perTxLimit)} ETH`);

  printInfo("\n  💡 解释：Owner 设置了严格的限额，即使 Agent 被攻击，");
  printInfo("     损失也不会超过日限额。这就是\"最小权限原则\"");

  // ============ 步骤 3：为钱包充值 ============
  printStep(3, "为 Agent 钱包充值");

  const fundAmount = ethers.parseEther("2.0");
  printInfo(`Owner 向 AgentWallet 转入 ${ethers.formatEther(fundAmount)} ETH...`);

  await owner.sendTransaction({
    to: walletAddress,
    value: fundAmount,
  });

  const balance = await wallet.getBalance();
  printResult("钱包余额", `${ethers.formatEther(balance)} ETH`);

  // ============ 步骤 4：Agent 自主执行转账 ============
  printStep(4, "AI Agent 自主执行转账（模拟 LLM 决策）");

  // 模拟 AI Agent 的决策过程
  printMockAI(
    "用户设置了自动定投策略，今天需要向 DeFi 协议转入 0.2 ETH",
    "执行转账 0.2 ETH 到目标地址"
  );

  const transferAmount = ethers.parseEther("0.2");
  printInfo(`\n  Agent 正在执行转账: ${ethers.formatEther(transferAmount)} ETH → ${recipient.address.slice(0, 10)}...`);

  const recipientBalanceBefore = await ethers.provider.getBalance(recipient.address);
  const tx = await wallet.connect(agentSigner).executeTransfer(recipient.address, transferAmount);
  await tx.wait();
  const recipientBalanceAfter = await ethers.provider.getBalance(recipient.address);

  printResult("转账成功！", `交易哈希: ${tx.hash.slice(0, 20)}...`);
  printResult("接收方余额变化", `+${ethers.formatEther(recipientBalanceAfter - recipientBalanceBefore)} ETH`);

  const walletBalanceAfter = await wallet.getBalance();
  printResult("钱包剩余余额", `${ethers.formatEther(walletBalanceAfter)} ETH`);

  // ============ 步骤 5：策略引擎拦截超限交易 ============
  printStep(5, "策略引擎拦截超限交易");

  printMockAI(
    "检测到套利机会！需要立即转入 0.5 ETH 到新发现的 DeFi 池",
    "执行转账 0.5 ETH（超出单笔限额 0.3 ETH）"
  );

  const overLimitAmount = ethers.parseEther("0.5");
  printInfo(`\n  Agent 尝试转账: ${ethers.formatEther(overLimitAmount)} ETH（超出单笔限额 ${ethers.formatEther(perTxLimit)} ETH）`);

  try {
    await wallet.connect(agentSigner).executeTransfer(recipient.address, overLimitAmount);
    console.log("  ❌ 这不应该发生！");
  } catch (error: any) {
    printResult("交易被策略引擎拦截！", "");
    printWarning(`拒绝原因: "AgentWallet: exceeds per-tx limit"`);
    printInfo("\n  💡 解释：即使 AI Agent \"认为\"这是个好机会，策略引擎也会");
    printInfo("     严格执行限额规则。这防止了 Agent 被 prompt injection 攻击");
    printInfo("     或 LLM 幻觉导致的大额损失");
  }

  // ============ 步骤 6：查看交易历史 ============
  printStep(6, "查看 Agent 交易历史");

  const history = await wallet.getTransactionHistory(agentSigner.address, 0, 10);
  printInfo(`Agent 共执行了 ${history.length} 笔交易：\n`);

  for (let i = 0; i < history.length; i++) {
    const record = history[i];
    console.log(`  📝 交易 #${i + 1}:`);
    console.log(`     目标: ${record.target}`);
    console.log(`     金额: ${ethers.formatEther(record.value)} ETH`);
    console.log(`     状态: ${record.success ? "✅ 成功" : "❌ 失败"}`);
    console.log(`     时间: ${new Date(Number(record.timestamp) * 1000).toLocaleString()}`);
  }

  // ============ 步骤 7：紧急暂停演示 ============
  printStep(7, "紧急暂停（Owner 最高权限）");

  printInfo("假设 Owner 发现 Agent 行为异常，立即触发紧急暂停...");
  await wallet.pause();
  printResult("紧急暂停已激活", "所有 Agent 交易被冻结");

  printMockAI(
    "继续执行定投策略...",
    "执行转账 0.1 ETH"
  );

  try {
    await wallet.connect(agentSigner).executeTransfer(recipient.address, ethers.parseEther("0.1"));
  } catch (error: any) {
    printWarning("交易被拒绝: 钱包已暂停");
    printInfo("\n  💡 解释：紧急暂停是 Owner 的\"核按钮\"，一旦发现异常");
    printInfo("     可以立即冻结所有 Agent 操作，保护资金安全");
  }

  // 恢复
  await wallet.unpause();
  printResult("\nOwner 确认安全后恢复运行", "Agent 可以继续操作");

  // ============ 总结 ============
  console.log(`\n${"═".repeat(60)}`);
  console.log(`
  🎉 Demo 完成！你刚才体验了 AI Agent 钱包的核心流程：

  1. 部署合约    → Agent 有了链上"银行账户"
  2. 注册 Agent  → 设置身份和权限边界
  3. 配置策略    → 限额、白名单等安全约束
  4. 自主交易    → Agent 在授权范围内自由操作
  5. 策略拦截    → 超限操作被自动阻止
  6. 紧急暂停    → Owner 保留最高控制权

  📖 接下来，跟着教程一步步学习如何从零构建这个系统：
     → 从 docs/00-environment.md 开始
  `);
  console.log(`${"═".repeat(60)}\n`);
}

main().catch((error) => {
  console.error("Demo 运行失败:", error);
  process.exitCode = 1;
});
