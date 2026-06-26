/**
 * server/x402-provider.ts
 * 
 * 【使用场景】
 * 实现 x402 协议的"提供者"端——让你的 API 支持 x402 支付。
 * 当 Agent 调用你的 API 时，如果未支付则返回 HTTP 402，
 * 要求 Agent 先支付 USDC 或 ETH 才能使用服务。
 * 
 * 【前置条件】
 * 1. 安装依赖：npm install express ethers dotenv
 * 2. 在 .env 中配置 BASE_RPC_URL 和 PROVIDER_PRIVATE_KEY
 * 
 * 【运行方式】
 * npx ts-node server/x402-provider.ts
 * 
 * 【测试方式】
 * curl http://localhost:3000/api/search?q=test
 * → 返回 402 Payment Required
 * 
 * 带支付证明重试：
 * curl http://localhost:3000/api/search?q=test \
 *   -H "X-Payment-Tx: 0x..." \
 *   -H "X-Payment-Chain: base"
 */

import express from "express";
import { ethers } from "ethers";

/**
 * x402 提供者
 * 让你的 API 支持 x402 支付
 */
class X402Provider {
  private app: express.Application;
  private provider: ethers.Provider;
  private wallet: ethers.Wallet;
  private prices: Map<string, { amount: number; currency: string }>;

  constructor() {
    this.app = express();
    this.provider = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL!);
    this.wallet = new ethers.Wallet(process.env.PROVIDER_PRIVATE_KEY!, this.provider);

    // 定义各 API 的价格
    this.prices = new Map([
      ["/api/search", { amount: 0.001, currency: "USDC" }],  // 搜索 $0.001
      ["/api/ai", { amount: 0.01, currency: "USDC" }],       // AI $0.01
      ["/api/data", { amount: 0.05, currency: "USDC" }],     // 数据 $0.05
    ]);

    this.setupRoutes();
  }

  /**
   * 设置路由
   */
  private setupRoutes() {
    // 中间件：检查支付
    this.app.use("/api", this.paymentMiddleware.bind(this));

    // API 路由
    this.app.get("/api/search", (req, res) => {
      res.json({ results: ["结果1", "结果2"], query: req.query.q });
    });

    this.app.post("/api/ai", (req, res) => {
      res.json({ response: "这是 AI 的回复", prompt: req.body.prompt });
    });
  }

  /**
   * 支付中间件
   * 检查请求是否已支付，未支付则返回 402
   */
  private async paymentMiddleware(
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) {
    const price = this.getPrice(req.path);

    // 如果该路径不需要付费
    if (!price) {
      next();
      return;
    }

    // 检查是否已支付
    const paymentTx = req.headers["x-payment-tx"] as string;
    if (paymentTx) {
      const isValid = await this.verifyPayment(paymentTx, price);
      if (isValid) {
        next();
        return;
      }
    }

    // 未支付，返回 402
    res.status(402).json({
      error: "Payment Required",
      message: `This API costs ${price.amount} ${price.currency}`,
      amount: price.amount,
      currency: price.currency,
      recipient: await this.wallet.getAddress(),
      chainId: 8453, // Base 主网
    });
  }

  /**
   * 获取 API 价格
   */
  private getPrice(path: string): { amount: number; currency: string } | null {
    for (const [route, price] of this.prices) {
      if (path.startsWith(route)) {
        return price;
      }
    }
    return null;
  }

  /**
   * 验证支付是否有效
   */
  private async verifyPayment(
    txHash: string,
    expectedPrice: { amount: number; currency: string }
  ): Promise<boolean> {
    try {
      const receipt = await this.provider.getTransactionReceipt(txHash);
      if (!receipt) return false;

      const tx = await this.provider.getTransaction(txHash);
      if (!tx) return false;

      // 验证接收地址是否正确
      if (tx.to?.toLowerCase() !== (await this.wallet.getAddress()).toLowerCase()) {
        return false;
      }

      // 验证金额是否正确
      const expectedWei = ethers.parseUnits(
        expectedPrice.amount.toString(),
        expectedPrice.currency === "USDC" ? 6 : 18
      );

      // 对于 USDC，需要检查 Transfer 事件
      if (expectedPrice.currency === "USDC") {
        const usdcInterface = new ethers.Interface([
          "event Transfer(address indexed from, address indexed to, uint256 value)",
        ]);

        for (const log of receipt.logs) {
          try {
            const parsed = usdcInterface.parseLog(log);
            if (
              parsed &&
              parsed.args.to.toLowerCase() === (await this.wallet.getAddress()).toLowerCase() &&
              parsed.args.value >= expectedWei
            ) {
              return true;
            }
          } catch {}
        }
        return false;
      }

      // 对于 ETH，直接检查 value
      return tx.value >= expectedWei;
    } catch {
      return false;
    }
  }

  /**
   * 启动服务器
   */
  start(port: number = 3000) {
    this.app.listen(port, () => {
      console.log(`
╔══════════════════════════════════════╗
║   🟢 x402 Provider 运行中            ║
║                                      ║
║   支持的 API：                        ║
║   /api/search  $0.001 USDC/次        ║
║   /api/ai      $0.01  USDC/次        ║
║   /api/data    $0.05  USDC/次        ║
╚══════════════════════════════════════╝
`);
      console.log(`服务器地址: http://localhost:${port}`);
    });
  }
}

// 启动
const provider = new X402Provider();
provider.start(3000);
