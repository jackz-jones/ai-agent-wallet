/**
 * agent/agent-kit.ts
 * 
 * 【使用场景】
 * 使用 Coinbase 官方 AgentKit 创建 AI Agent。
 * AgentKit 提供了开箱即用的链上操作能力（钱包、交易、部署合约等），
 * 适合快速搭建生产级 AI Agent。
 * 
 * 【支持的 LLM 提供商】
 * - OpenAI (gpt-4o 等)
 * - Ollama (本地模型，如 llama3, qwen2)
 * - Anthropic Claude (claude-sonnet-4-20250514 等)
 * - Google Gemini (gemini-2.0-flash 等)
 * 
 * 【前置条件】
 * 1. 安装依赖：npm install @coinbase/agentkit @coinbase/agentkit-langchain @langchain/core @langchain/openai @langchain/langgraph
 * 2. 注册 Coinbase Developer Platform (CDP) 账号获取 API Key
 * 3. 在 .env 中配置：
 *    - CDP_API_KEY_NAME 和 CDP_API_KEY_PRIVATE_KEY
 *    - LLM_PROVIDER (openai / ollama / anthropic / gemini，默认 openai)
 *    - LLM_MODEL (模型名称，可选)
 *    - LLM_API_KEY (API Key)
 * 
 * 【运行方式】
 * npx ts-node agent/agent-kit.ts
 * 
 * 【交互示例】
 * 你: 我的钱包里有多少 ETH？
 * 你: 给我创建一个新的 ERC-20 代币
 * 你: 用 0.01 ETH 换 USDC
 */

import { AgentKit, CdpWalletProvider } from "@coinbase/agentkit";
import { getLangChainTools } from "@coinbase/agentkit-langchain";
import { HumanMessage } from "@langchain/core/messages";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import * as dotenv from "dotenv";
import { createLangChainLLM } from "./llm/langchain-adapter";

dotenv.config();

/**
 * 使用 Coinbase AgentKit 创建 AI Agent
 *
 * AgentKit 自动处理：
 * - 钱包管理
 * - 交易签名
 * - 与智能合约交互
 * - 代币转账
 * - DeFi 操作
 */
async function createAgentKitAgent() {
  // 1. 配置钱包提供者
  const walletProvider = await CdpWalletProvider.configureWithWallet({
    apiKeyName: process.env.CDP_API_KEY_NAME,
    apiKeyPrivateKey: process.env.CDP_API_KEY_PRIVATE_KEY,
    networkId: "base-sepolia", // 使用 Base Sepolia 测试网
  });

  // 2. 初始化 AgentKit
  const agentKit = await AgentKit.init({
    walletProvider,
  });

  // 3. 获取 AgentKit 提供的工具
  const tools = await getLangChainTools(agentKit);

  // 4. 创建 LLM（根据配置动态选择提供商）
  const llm = await createLangChainLLM();

  // 5. 创建 Agent
  const agent = createReactAgent({
    llm,
    tools,
    messageModifier: `
      你是运行在区块链上的 AI Agent。
      你拥有一个钱包，可以执行链上操作。
      
      你的能力包括：
      - 查询钱包余额
      - 转账 ETH 和代币
      - 部署智能合约
      - 与 DeFi 协议交互
      - 查询链上数据
      
      安全第一：
      - 每次交易前确认金额
      - 不执行可疑操作
      - 向用户清晰说明每步操作
    `,
  });

  return agent;
}

/**
 * 交互式运行 Agent
 */
async function runAgent() {
  const agent = await createAgentKitAgent();

  console.log(`
╔══════════════════════════════════════╗
║   🤖 Coinbase AgentKit Agent 已启动！║
║                                      ║
║   示例指令：                          ║
║   1. "我的钱包里有多少 ETH？"          ║
║   2. "给我创建一个新的 ERC-20 代币"    ║
║   3. "用 0.01 ETH 换 USDC"           ║
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

      const stream = await agent.stream(
        { messages: [new HumanMessage(input)] },
        { configurable: { thread_id: "agent-session-1" } }
      );

      for await (const chunk of stream) {
        if ("agent" in chunk) {
          console.log(chunk.agent.messages[0].content);
        } else if ("tools" in chunk) {
          console.log(chunk.tools.messages[0].content);
        }
      }

      console.log("\n");
      ask();
    });
  };

  ask();
}

// 运行
runAgent().catch(console.error);