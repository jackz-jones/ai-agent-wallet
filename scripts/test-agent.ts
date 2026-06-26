import { ethers } from "hardhat";

/**
 * 测试 Agent 自主交易
 * 在部署和配置 Agent 后运行
 */
async function main() {
  const fs = require("fs");
  const deployment = JSON.parse(fs.readFileSync("deployment.json", "utf8"));

  const walletAddress = deployment.contracts.AgentWallet;
  const wallet = await ethers.getContractAt("AgentWallet", walletAddressate);

  const [owner] = await ethers.getSigners();
  const agentAddress = owner.address;

  console.log("=== Testing Agent Transactions ===\n");
  console.log(`Wallet: ${walletAddress}`);
  console.log(`Agent: ${agentAddress}\n`);

  // 1. 给钱包转入测试 ETH
  console.log("1. Funding wallet with test ETH...");
  const fundTx = await owner.sendTransaction({
    to: walletAddress,
    value: ethers.parseEther("0.5"),
  });
  await fundTx.wait();
  console.log(`   Funded! Tx: ${fundTx.hash}`);
  console.log(`   Wallet balance: ${ethers.formatEther(await wallet.getBalance())} ETH\n`);

  // 2. Agent 执行 ETH 转账
  console.log("2. Agent executing ETH transfer...");
  const recipient = ethers.Wallet.createRandom().address;
  try {
    const transferTx = await wallet.executeTransfer(
      recipient,
      ethers.parseEther("0.05")
    );
    await transferTx.wait();
    console.log(`   Transfer successful! Tx: ${transferTx.hash}`);
    console.log(`   Sent 0.05 ETH to: ${recipient}`);
  } catch (error: any) {
    console.log(`   Transfer failed: ${error.message}`);
  }
  console.log(`   Wallet balance: ${ethers.formatEther(await wallet.getBalance())} ETH\n`);

  // 3. 测试超限交易（应被拒绝）
  console.log("3. Testing over-limit transaction (should fail)...");
  try {
    const overLimitTx = await wallet.executeTransfer(
      ethers.Wallet.createRandom().address,
      ethers.parseEther("1.0") // 超过单笔限额 0.1 ETH
    );
    await overLimitTx.wait();
    console.log("   WARNING: Over-limit transaction succeeded (unexpected)!");
  } catch (error: any) {
    console.log(`   Correctly rejected: ${error.message}\n`);
  }

  // 4. 查看交易历史
  console.log("4. Transaction history:");
  const history = await wallet.getTransactionHistory(agentAddress, 0, 10);
  console.log(`   Total transactions: ${history.length}`);
  for (const tx of history) {
    console.log(`   - Target: ${tx.target}, Value: ${ethers.formatEther(tx.value)} ETH, Success: ${tx.success}`);
  }
  console.log();

  // 5. 测试紧急暂停
  console.log("5. Testing emergency pause...");
  const pauseTx = await wallet.pause();
  await pauseTx.wait();
  console.log(`   Wallet paused! Tx: ${pauseTx.hash}`);

  // 尝试在暂停状态下交易（应失败）
  try {
    await wallet.executeTransfer(
      ethers.Wallet.createRandom().address,
      ethers.parseEther("0.01")
    );
    console.log("   WARNING: Transaction succeeded while paused (unexpected)!");
  } catch (error: any) {
    console.log(`   Correctly blocked while paused: ${error.message}`);
  }

  // 恢复
  const unpauseTx = await wallet.unpause();
  await unpauseTx.wait();
  console.log(`   Wallet unpaused! Tx: ${unpauseTx.hash}\n`);

  // 6. 测试策略引擎
  console.log("6. Testing PolicyEngine...");
  const policyEngine = await ethers.getContractAt(
    "PolicyEngine",
    deployment.contracts.PolicyEngine
  );
  const policyCount = await policyEngine.getPolicyCount(agentAddress);
  console.log(`   Active policies: ${policyCount}`);

  console.log("\n=== All tests completed ===");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
