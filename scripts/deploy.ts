import { ethers } from "hardhat";

async function main() {
  console.log("Deploying AgentWallet...");

  // 部署 AgentWallet
  const AgentWallet = await ethers.getContractFactory("AgentWallet");
  const wallet = await AgentWallet.deploy();
  await wallet.waitForDeployment();

  const walletAddress = await wallet.getAddress();
  console.log(`AgentWallet deployed to: ${walletAddress}`);

  // 部署 PolicyEngine
  const PolicyEngine = await ethers.getContractFactory("PolicyEngine");
  const policyEngine = await PolicyEngine.deploy(walletAddress);
  await policyEngine.waitForDeployment();

  const policyEngineAddress = await policyEngine.getAddress();
  console.log(`PolicyEngine deployed to: ${policyEngineAddress}`);

  // 部署 StrategyManager
  const StrategyManager = await ethers.getContractFactory("StrategyManager");
  const strategyManager = await StrategyManager.deploy(walletAddress, policyEngineAddress);
  await strategyManager.waitForDeployment();

  const strategyManagerAddress = await strategyManager.getAddress();
  console.log(`StrategyManager deployed to: ${strategyManagerAddress}`);

  // 输出部署摘要
  console.log("\n=== Deployment Summary ===");
  console.log(`Network: ${(await ethers.provider.getNetwork()).name}`);
  console.log(`Chain ID: ${(await ethers.provider.getNetwork()).chainId}`);
  console.log(`Deployer: ${(await ethers.getSigners())[0].address}`);
  console.log(`AgentWallet:      ${walletAddress}`);
  console.log(`PolicyEngine:     ${policyEngineAddress}`);
  console.log(`StrategyManager:  ${strategyManagerAddress}`);

  // 保存部署信息到文件
  const fs = require("fs");
  const deploymentInfo = {
    network: (await ethers.provider.getNetwork()).name,
    chainId: (await ethers.provider.getNetwork()).chainId,
    deployer: (await ethers.getSigners())[0].address,
    contracts: {
      AgentWallet: walletAddress,
      PolicyEngine: policyEngineAddress,
      StrategyManager: strategyManagerAddress,
    },
    timestamp: new Date().toISOString(),
  };

  fs.writeFileSync(
    "deployment.json",
    JSON.stringify(deploymentInfo, (key, value) =>
      typeof value === "bigint" ? value.toString() : value, 2)
  );
  console.log("\nDeployment info saved to deployment.json");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
