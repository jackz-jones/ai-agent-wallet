import { ethers } from "hardhat";

/**
 * 注册 Agent 并配置策略
 * 在部署 AgentWallet 和 PolicyEngine 后运行
 */
async function main() {
  // 读取部署信息
  const fs = require("fs");
  const deployment = JSON.parse(fs.readFileSync("deployment.json", "utf8"));

  const walletAddress = deployment.contracts.AgentWallet;
  const policyEngineAddress = deployment.contracts.PolicyEngine;

  // 获取合约实例
  const wallet = await ethers.getContractAt("AgentWallet", walletAddress);
  const policyEngine = await ethers.getContractAt("PolicyEngine", policyEngineAddress);

  const [owner] = await ethers.getSigners();
  console.log(`Configuring with owner: ${owner.address}`);

  // 注册 Agent
  const agentAddress = owner.address; // 先用 owner 地址模拟 Agent
  const agentName = "DeFi Agent v1";
  const agentDescription = "自动 DeFi 理财 Agent - 负责 Aave 存款和 Uniswap 流动性提供";

  console.log(`\nRegistering Agent: ${agentName}...`);
  const registerTx = await wallet.registerAgent(
    agentAddress,
    agentName,
    agentDescription,
    ethers.parseEther("1"),    // 日限额 1 ETH
    ethers.parseEther("0.1")   // 单笔限额 0.1 ETH
  );
  await registerTx.wait();
  console.log(`Agent registered! Tx: ${registerTx.hash}`);

  // 配置策略引擎
  // 1. 添加白名单策略 — 只允许与 DeFi 协议交互
  console.log("\nAdding whitelist policy...");
  const whitelistAddrs = [
    "0x0000000000000000000000000000000000000001", // Uniswap V3 Router (示例)
    "0x0000000000000000000000000000000000000002", // Aave V3 Pool (示例)
  ];
  const addWhitelistTx = await policyEngine.addWhitelistPolicy(
    agentAddress,
    whitelistAddrs,
    "Only allow DeFi protocol interactions"
  );
  await addWhitelistTx.wait();
  console.log(`Whitelist policy added! Tx: ${addWhitelistTx.hash}`);

  // 2. 添加限额策略
  console.log("\nAdding spending limit policy...");
  const addLimitTx = await policyEngine.addSpendingLimitPolicy(
    agentAddress,
    ethers.parseEther("1"),    // 日限额 1 ETH
    ethers.parseEther("0.1"),   // 单笔限额 0.1 ETH
    "Daily and per-transaction spending limits"
  );
  await addLimitTx.wait();
  console.log(`Spending limit policy added! Tx: ${addLimitTx.hash}`);

  // 3. 添加速率限制策略
  console.log("\nAdding rate limit policy...");
  const addRateTx = await policyEngine.addRateLimitPolicy(
    agentAddress,
    20,       // 每小时最多 20 笔
    3600,     // 时间窗口 1 小时
    "Rate limit: 20 tx per hour"
  );
  await addRateTx.wait();
  console.log(`Rate limit policy added! Tx: ${addRateTx.hash}`);

  // 4. 添加时间窗口策略 — 仅在工作时间交易
  console.log("\nAdding time window policy...");
  const addTimeTx = await policyEngine.addTimeWindowPolicy(
    agentAddress,
    8,        // 上午 8 点开始
    22,       // 晚上 10 点结束
    [1, 2, 3, 4, 5], // 周一至周五
    "Only allow transactions during business hours (Mon-Fri, 8:00-22:00)"
  );
  await addTimeTx.wait();
  console.log(`Time window policy added! Tx: ${addTimeTx.hash}`);

  // 验证配置
  console.log("\n=== Configuration Summary ===");
  console.log(`Agent: ${agentName} (${agentAddress})`);
  console.log(`Policy count: ${await policyEngine.getPolicyCount(agentAddress)}`);
  console.log(`Agent active: ${(await wallet.getAgentInfo(agentAddress)).active}`);

  const policy = await wallet.getAgentPolicy(agentAddress);
  console.log(`Daily limit: ${ethers.formatEther(policy.dailyLimit)} ETH`);
  console.log(`Per-tx limit: ${ethers.formatEther(policy.perTxLimit)} ETH`);

  // 保存配置信息
  const configInfo = {
    agent: {
      address: agentAddress,
      name: agentName,
      description: agentDescription,
    },
    policies: {
      whitelist: whitelistAddrs,
      dailyLimit: ethers.formatEther(policy.dailyLimit),
      perTxLimit: ethers.formatEther(policy.perTxLimit),
    },
    timestamp: new Date().toISOString(),
  };

  fs.writeFileSync("agent-config.json", JSON.stringify(configInfo, null, 2));
  console.log("\nAgent configuration saved to agent-config.json");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
