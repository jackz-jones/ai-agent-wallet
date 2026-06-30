/**
 * agent/agent-with-x402.ts
 * 
 * 【使用场景】
 * 将 x402 支付能力集成到 AI Agent 中。
 * Agent 现在可以：
 * 1. 通过钱包执行链上交易
 * 2. 通过 x402 支付调用外部 API
 * 3. 自主决定何时需要付费
 * 
 * 【前置条件】
 * 1. 已完成 scripts/deploy.ts 部署
 * 2. 已安装依赖：npm install ethers dotenv
 * 
 * 【运行方式】
 * npx ts-node agent/agent-with-x402.ts
 * 
 * 【交互示例】
 * 你: 帮我搜索以太坊价格（会触发 x402 微支付）
 * 你: 调用 AI 写一首诗（会触发 x402 微支付）
 * 你: 看看我钱包里有多少钱
 */

import { X402Consumer } from "./x402-consumer";
import { AIAgent } from "./simple-agent";

/**
 * 带 x402 支付能力的 AI Agent
 *
 * Agent 现在可以：
 * 1. 通过钱包执行链上交易
 * 2. 通过 x402 支付调用外部 API
 * 3. 自主决定何时需要付费
 */
class AgentWithX402 extends AIAgent {
  private x402: X402Consumer;

  constructor() {
    super();
    this.x402 = new X402Consumer();
  }

  /**
   * 扩展工具集，加入 x402 能力
   */
  protected getTools(): any[] {
    const baseTools = super.getTools();

    return [
      ...baseTools,
      {
        name: "x402Search",
        description: "通过 x402 微支付搜索互联网（每次 $0.001）",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "搜索关键词" },
          },
          required: ["query"],
        },
      },
      {
        name: "x402CallAI",
        description: "通过 x402 微支付调用外部 AI 模型（每次 $0.01）",
        parameters: {
          type: "object",
          properties: {
            prompt: { type: "string", description: "提示词" },
          },
          required: ["prompt"],
        },
      },
      {
        name: "x402GetData",
        description: "通过 x402 微支付获取链上数据（每次 $0.05）",
        parameters: {
          type: "object",
          properties: {
            dataType: {
              type: "string",
              enum: ["price", "volume", "gas"],
              description: "数据类型",
            },
          },
          required: ["dataType"],
        },
      },
    ];
  }

  /**
   * 处理 x402 工具调用
   */
  protected async handleX402Call(
    functionName: string,
    args: any
  ): Promise<string> {
    switch (functionName) {
      case "x402Search": {
        const result = await this.x402.search(args.query);
        return `搜索完成（花费 $0.001 USDC）:\n${JSON.stringify(result, null, 2)}`;
      }

      case "x402CallAI": {
        const result = await this.x402.callAI(args.prompt);
        return `AI 调用完成（花费 $0.01 USDC）:\n${result}`;
      }

      case "x402GetData": {
        const result = await this.x402.callAPI(`/data/${args.dataType}`);
        return `数据获取完成（花费 $0.05 USDC）:\n${JSON.stringify(result, null, 2)}`;
      }

      default:
        return `未知的 x402 工具: ${functionName}`;
    }
  }
}

// ============ 运行 ============

async function main() {
  const agent = new AgentWithX402();

  console.log(`
╔══════════════════════════════════════╗
║   🤖 Agent (x402 增强版) 已启动！    ║
║                                      ║
║   新增能力（通过 x402 微支付）：       ║
║   • 搜索互联网（$0.001/次）           ║
║   • 调用外部 AI（$0.01/次）           ║
║   • 获取链上数据（$0.05/次）          ║
╚══════════════════════════════════════╝
`);
  console.log("输入你的指令（输入 'exit' 退出）：\n");

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
      const response = await agent.processMessage(input);
      console.log(`Agent: ${response}\n`);
      ask();
    });
  };

  ask();
}

main().catch(console.error);
