/**
 * scripts/deploy-all.ts
 * 
 * 【使用场景】
 * 一键部署所有合约：AgentWallet + PolicyEngine + PolicyTemplates + StrategyManager
 * 并自动配置策略引擎和 Agent 信息。
 * 
 * 相比分别运行 deploy.ts 和 configure-agent.ts，
 * 这个脚本一次性完成所有部署和配置工作。
 * 
 * 【前置条件】
 * 1. 在 .env 中配置 SEPOLIA_RPC_URL 和 PRIVATE_KEY
 * 2. 部署账户有足够的 Sepolia ETH
 * 
 * 【运行方式】
 * npx hardhat run scripts/deploy-all.ts --network sepolia
 * 
 * 【部署流程】
 * 1. 部署 AgentWallet
 * 2. 部署 PolicyEngine
 * 3. 部署 PolicyTemplates（关联 PolicyEngine）
 * 4. 部署 StrategyManager
 * 5. 配置钱包策略
 * 6. 配置 Agent 信息
 * 7. 输出所有合约地址
 */

import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("=".repeat(60));
  console.log("🚀 一键部署所有合约");
  console.log("=".repeat(60));
  console.log("部署者:", deployer.address);
  console.log("余额:", ethers.formatEther(await deployer.provider.getBalance(deployer.address)), "ETH\n");

  // ============ 1. 部署 AgentWallet ============
  console.log("📦 [1/5] 部署 AgentWallet...");
  const AgentWallet = await ethers.getContractFactory("AgentWallet");
  const wallet = await AgentWallet.deploy(
    deployer.address,           // owner
    deployer.address,           // 临时 agent（后续可修改）
    "DeFiAgent",                // agent 名称
    ethers.parseEther("1"),     // 日限额 1 ETH
    ethers.parseEther("0.1")    // 单笔限额 0.1 ETH
  );
  await wallet.waitForDeployment();
  const walletAddress = await wallet.getAddress();
  console.log("  ✅ AgentWallet 部署到:", walletAddress);

  // ============ 2. 部署 PolicyEngine ============
  console.log("\n📦 [2/5] 部署 PolicyEngine...");
  const PolicyEngine = await ethers.getContractFactory("PolicyEngine");
  const engine = await PolicyEngine.deploy();
  await engine.waitForDeployment();
  const engineAddress = await engine.getAddress();
  console.log("  ✅ PolicyEngine 部署到:", engineAddress);

  // ============ 3. 部署 PolicyTemplates ============
  console.log("\n📦 [3/5] 部署 PolicyTemplates...");
  const PolicyTemplates = await ethers.getContractFactory("PolicyTemplates");
  const templates = await PolicyTemplates.deploy(engineAddress);
  await templates.waitForDeployment();
  const templatesAddress = await templates.getAddress();
  console.log("  ✅ PolicyTemplates 部署到:", templatesAddress);

  // ============ 4. 部署 StrategyManager ============
  console.log("\n📦 [4/5] 部署 StrategyManager...");
  const StrategyManager = await ethers.getContractFactory("StrategyManager");
  const strategy = await StrategyManager.deploy(walletAddress, engineAddress);
  await strategy.waitForDeployment();
  const strategyAddress = await strategy.getAddress();
  console.log("  ✅ StrategyManager 部署到:", strategyAddress);

  // ============ 5. 配置策略 ============
  console.log("\n⚙️  [5/5] 配置策略和 Agent...");

  // 5.1 设置钱包策略
  const config = {
    useWhitelist: true,
    useBlacklist: false,
    useFunctionWhitelist: false,
    useAmountLimits: true,
    useRateLimit: true,
    useTimeWindow: false,
    maxPerTx: ethers.parseEther("0.01"),    // 单笔最多 0.01 ETH
    maxDaily: ethers.parseEther("0.1"),      // 每日最多 0.1 ETH
    maxRate: 10,                              // 每分钟最多 10 笔
    timeWindowStart: 0,
    timeWindowEnd: 0,
  };

  const tx1 = await engine.setPolicy(walletAddress, config);
  await tx1.wait();
  console.log("  ✅ 钱包策略已配置");

  // 5.2 设置策略引擎到钱包合约
  // 注意：如果 AgentWallet 有 setPolicyEngine 函数则调用
  try {
    const tx2 = await wallet.setPolicyEngine(engineAddress);
    await tx2.wait();
    console.log("  ✅ 策略引擎已关联到钱包");
  } catch {
    console.log("  ⚠️  wallet.setPolicyEngine() 不可用（合约可能没有此函数）");
  }

  // ============ 输出摘要 ============
  console.log("\n" + "=".repeat(60));
  console.log("📋 部署完成！");
  console.log("=".repeat(60));
  console.log(`
合约地址：
  AgentWallet:     ${walletAddress}
  PolicyEngine:    ${engineAddress}
  PolicyTemplates: ${templatesAddress}
  StrategyManager: ${strategyAddress}

请在 .env 中添加：
  WALLET_CONTRACT_ADDRESS=${walletAddress}
  POLICY_ENGINE_ADDRESS=${engineAddress}
  STRATEGY_MANAGER_ADDRESS=${strategyAddress}

查看交易：
  https://sepolia.etherscan.io/address/${walletAddress}
`);
}

main().catch((error) => {
  console.error("❌ 部署失败:", error);
  process.exitCode = 1;
});
