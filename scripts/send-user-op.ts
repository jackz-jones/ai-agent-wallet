/**
 * send-user-op.ts
 * 
 * 【使用场景】
 * 部署完 AgentWallet 后，通过 ERC-4337 的 UserOperation 机制，
 * 让 Agent 无需直接持有私钥即可发起链上交易。
 * 
 * 【前置条件】
 * 1. 已完成 scripts/deploy.ts 部署，获取 WALLET_CONTRACT_ADDRESS
 * 2. 钱包合约中已存入足够的 ETH（用于 Gas 和转账）
 * 3. 已安装依赖：npm install @account-abstraction/sdk
 * 
 * 【运行方式】
 * npx hardhat run scripts/send-user-op.ts --network sepolia
 * 
 * 【工作原理】
 * ERC-4337 的核心流程：
 * 1. Agent 构建 UserOperation（包含要执行的交易数据）
 * 2. Agent 用 EOA 私钥签名 UserOperation
 * 3. 将 UserOperation 发送到 Bundler
 * 4. Bundler 将 UserOperation 提交到 EntryPoint 合约
 * 5. EntryPoint 验证签名并执行交易
 * 
 * 这样 Agent 的 EOA 只需要少量 ETH 支付 Gas，
 * 大额资金都存放在智能合约钱包中，由策略引擎保护。
 */

import { ethers } from "ethers";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  // ============ 1. 初始化连接 ============
  const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  const agentWallet = new ethers.Wallet(process.env.AGENT_PRIVATE_KEY!, provider);

  console.log("=== ERC-4337 UserOperation 发送器 ===");
  console.log("Agent 地址:", agentWallet.address);
  console.log("网络: Sepolia\n");

  // ============ 2. 配置参数 ============
  // ERC-4337 EntryPoint 合约地址（所有 EVM 链通用）
  const ENTRY_POINT = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";
  // 你的智能合约钱包地址（从 deploy.ts 部署输出获取）
  const WALLET_ADDRESS = process.env.WALLET_CONTRACT_ADDRESS!;
  // 接收转账的地址
  const RECIPIENT = process.env.RECIPIENT_ADDRESS || "0x0000000000000000000000000000000000000001";

  if (!WALLET_ADDRESS || WALLET_ADDRESS === "") {
    console.error("❌ 请先设置 WALLET_CONTRACT_ADDRESS 环境变量");
    console.error("   从 deploy.ts 部署输出中获取钱包地址");
    process.exit(1);
  }

  // ============ 3. 构建 UserOperation ============
  console.log("📝 构建 UserOperation...");

  // 获取当前 nonce（从 EntryPoint 查询）
  const entryPoint = new ethers.Contract(
    ENTRY_POINT,
    ["function getNonce(address sender, uint192 key) view returns (uint256 nonce)"],
    provider
  );
  const nonce = await entryPoint.getNonce(WALLET_ADDRESS, 0apse);
  console.log("  Nonce:", nonce.toString());

  // 构造要执行的交易数据：调用钱包合约的 execute() 函数
  const walletInterface = new ethers.Interface([
    "function execute(address to, uint256 value, bytes calldata data) external returns (bytes memory)",
  ]);
  const callData = walletInterface.encodeFunctionData("execute", [
    RECIPIENT,                          // 转账给谁
    ethers.parseEther("0.001"),         // 转 0.001 ETH
    "0x",                               // 无额外数据
  ]);

  // 获取 Gas 价格
  const feeData = await provider.getFeeData();
  const maxFeePerGas = feeData.maxFeePerGas || ethers.parseUnits("50", "gwei");
  const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas || ethers.parseUnits("5", "gwei");

  // 构建 UserOperation
  const userOp = {
    sender: WALLET_ADDRESS,
    nonce: nonce,
    initCode: "0x",                     // 钱包已部署，无需 initCode
    callData: callData,
    callGasLimit: 100000,
    verificationGasLimit: 50000,
    preVerificationGas: 20000,
    maxFeePerGas: maxFeePerGas,
    maxPriorityFeePerGas: maxPriorityFeePerGas,
    paymasterAndData: "0x",             // 无 Paymaster（自付 Gas）
    signature: "0x",                    // 待签名
  };

  console.log("\n📋 UserOperation 详情:");
  console.log("  Sender:", userOp.sender);
  console.log("  Recipient:", RECIPIENT);
  console.log("  Amount: 0.001 ETH");
  console.log("  MaxFeePerGas:", ethers.formatUnits(maxFeePerGas, "gwei"), "gwei");

  // ============ 4. Agent 签名 UserOperation ============
  console.log("\n✍️ Agent 签名 UserOperation...");

  // 计算 UserOperation 哈希（简化版，实际应使用 @account-abstraction/sdk）
  // 注意：这里使用简化签名方式，生产环境应使用完整的 EIP-4337 签名流程
  const userOpHash = ethers.solidityPackedKeccak256(
    ["address", "uint256", "bytes", "uint256", "uint256", "uint256", "uint256", "uint256", "bytes", "bytes"],
    [
      userOp.sender,
      userOp.nonce,
      userOp.initCode,
      userOp.callData,
      userOp.callGasLimit,
      userOp.verificationGasLimit,
      userOp.preVerificationGas,
      userOp.maxFeePerGas,
      userOp.maxPriorityFeePerGas,
      userOp.paymasterAndData,
    ]
  );

  const signature = await agentWallet.signMessage(ethers.getBytes(userOpHash));
  userOp.signature = signature;

  console.log("  ✅ 签名完成");
  console.log("  Signature:", signature);

  // ============ 5. 发送到 Bundler ============
  console.log("\n📤 发送 UserOperation 到 Bundler...");

  // 方式一：使用公共 Bundler API（推荐用于测试）
  // 这里以 Pimlico 为例，你也可以使用其他 Bundler 服务
  const BUNDLER_URL = process.env.BUNDLER_URL || "https://api.pimlico.io/v2/sepolia/rpc";

  try {
    const bundlerResponse = await fetch(BUNDLER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_sendUserOperation",
        params: [
          userOp,
          ENTRY_POINT,
        ],
      }),
    });

    const bundlerResult = await bundlerResponse.json();
    console.log("  Bundler 响应:", JSON.stringify(bundlerResult, null, 2));

    if (bundlerResult.result) {
      console.log("\n✅ UserOperation 已提交！");
      console.log("  UserOpHash:", bundlerResult.result);
      console.log("\n  查看交易状态：");
      console.log(`  https://jiffyscan.xyz/userOpHash/${bundlerResult.result}`);
    } else {
      console.log("\n⚠️  Bundler 返回错误（测试网公共 Bundler 可能有限制）");
      console.log("  建议：运行本地 Bundler 或使用付费 Bundler 服务");
    }
  } catch (error: any) {
    console.log("\n⚠️  无法连接到 Bundler（这是预期的，测试网公共 Bundler 不稳定）");
    console.log("  错误:", error.message);
    console.log("\n  ✅ UserOperation 已成功构建和签名，可用于本地 Bundler 测试");
  }

  // ============ 6. 输出摘要 ============
  console.log("\n" + "=".repeat(50));
  console.log("📋 UserOperation 构建完成");
  console.log("=".repeat(50));
  console.log(`
UserOperation 完整数据（可用于本地 Bundler 测试）：

${JSON.stringify(userOp, null, 2)}

在本地 Bundler 中运行：
  curl ${BUNDLER_URL} \\
    -X POST \\
    -H "Content-Type: application/json" \\
    -d '${JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_sendUserOperation",
      params: [userOp, ENTRY_POINT],
    })}'
`);
}

main().catch((error) => {
  console.error("❌ 脚本执行失败:", error);
  process.exitCode = 1;
});
