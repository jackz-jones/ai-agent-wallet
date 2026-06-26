/**
 * agent/x402-consumer.ts
 * 
 * 【使用场景】
 * x402 协议让 AI Agent 能像人一样"付钱买服务"——不需要 API Key，
 * 不需要注册，直接付 USDC 就行。
 * 
 * 这个文件实现 x402 的"消费者"端：
 * Agent 通过 x402 协议支付并调用 API。
 * 
 * 【前置条件】
 * 1. 安装依赖：npm install ethers dotenv
 * 2. 在 .env 中配置 BASE_RPC_URL 和 AGENT_PRIVATE_KEY
 * 3. 钱包中有足够的 USDC 或 ETH 用于支付
 * 
 * 【运行方式】
 * npx ts-node agent/x402-consumer.ts
 * 
 * 【工作原理】
 * 1. 先直接调用 API（不带支付）
 * 2. 如果收到 HTTP 402，查看价格并支付
 * 3. 支付后带上交易哈希重试请求
 */

import { ethers } from "ethers";
import * as dotenv from "dotenv";

dotenv.config();

/**
 * x402 消费者
 * Agent 通过 x402 协议支付并调用 API
 */
class X402Consumer {
  private provider: ethers.Provider;
  private wallet: ethers.Wallet;
  private baseUrl: string;

  constructor() {
    this.provider = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL);
    this.wallet = new ethers.Wallet(process.env.AGENT_PRIVATE_KEY!, this.provider);
    this.baseUrl = "https://api.x402.org"; // x402 兼容 API
  }

  /**
   * 通过 x402 协议调用 API
   *
   * 流程：
   * 1. 先直接请求（可能被拒绝）
   * 2. 如果收到 402，查看价格并支付
   * 3. 支付后重试请求
   */
  async callAPI(endpoint: string): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`;

    // 第一步：尝试请求（不带支付）
    console.log("📤 发送请求...");
    let response = await fetch(url);

    // 如果返回 402，需要支付
    if (response.status === 402) {
      const paymentInfo = await response.json();
      console.log("💳 需要支付:", paymentInfo);

      // 支付
      const txHash = await this.pay(paymentInfo);
      console.log("✅ 支付成功:", txHash);

      // 第二步：带支付证明重试
      response = await fetch(url, {
        headers: {
          "X-Payment-Tx": txHash,
          "X-Payment-Chain": "base",
        },
      });
    }

    if (!response.ok) {
      throw new Error(`API 请求失败: ${response.status}`);
    }

    return response.json();
  }

  /**
   * 支付 x402 费用
   */
  private async pay(paymentInfo: any): Promise<string> {
    const { amount, currency, recipient, chainId } = paymentInfo;

    // USDC 合约地址（Base 链）
    const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

    if (currency === "USDC") {
      // 转账 USDC
      const usdc = new ethers.Contract(
        USDC_ADDRESS,
        [
          "function transfer(address to, uint256 amount) returns (bool)",
          "function decimals() view returns (uint8)",
        ],
        this.wallet
      );

      const decimals = await usdc.decimals();
      const amountWei = ethers.parseUnits(amount.toString(), decimals);

      const tx = await usdc.transfer(recipient, amountWei);
      const receipt = await tx.wait();
      return receipt.hash;
    } else {
      // 直接转账 ETH/Base ETH
      const tx = await this.wallet.sendTransaction({
        to: recipient,
        value: ethers.parseEther(amount.toString()),
      });
      const receipt = await tx.wait();
      return receipt!.hash;
    }
  }

  /**
   * 搜索（x402 微支付示例）
   * 每次搜索 $0.001
   */
  async search(query: string): Promise<any> {
    return this.callAPI(`/search?q=${encodeURIComponent(query)}`);
  }

  /**
   * 调用 AI 模型（x402 微支付示例）
   * 每次调用 $0.01
   */
  async callAI(prompt: string): Promise<any> {
    return this.callAPI(`/ai/completion?prompt=${encodeURIComponent(prompt)}`);
  }
}

// ============ 使用示例 ============

async function main() {
  const consumer = new X402Consumer();

  console.log(`
╔══════════════════════════════════════╗
║   💳 x402 消费者已启动！              ║
║                                      ║
║   x402 协议让 Agent 可以：            ║
║   • 无需 API Key，直接付钱调用服务     ║
║   • 按次付费，每次 $0.001 ~ $0.01     ║
╚══════════════════════════════════════╝
`);

  // 示例：通过 x402 搜索
  try {
    console.log("🔍 示例：x402 搜索...");
    const result = await consumer.search("以太坊价格");
    console.log("搜索结果:", result);
  } catch (error) {
    console.error("搜索失败（这是预期的，因为没有真正的 x402 API 服务）:", error instanceof Error ? error.message : error);
  }

  // 示例：通过 x402 调用 AI
  try {
    console.log("\n🤖 示例：x402 AI 调用...");
    const result = await consumer.callAI("用一句话解释什么是 DeFi");
    console.log("AI 回复:", result);
  } catch (error) {
    console.error("AI 调用失败（这是预期的，因为没有真正的 x402 API 服务）:", error instanceof Error ? error.message : error);
  }

  console.log("\n✅ x402 消费者演示完成");
  console.log("提示：这个示例需要真实的 x402 兼容 API 服务才能运行。");
  console.log("你可以先运行 server/x402-provider.ts 启动本地 x402 服务进行测试。");
}

main().catch(console.error);
