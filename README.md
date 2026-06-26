# 🤖 AI Agent 钱包开发全流程教程

> 从零开始，学会开发 AI Agent 钱包 + 链上自主交易应用
> 适用人群：有基础编程能力但对区块链/AI Agent 开发是小白
> 前置知识：了解 JavaScript/Python 基础语法即可

---

## 📚 教程目录

| 章节 | 内容 | 难度 |
|------|------|------|
| **第0章** | 环境搭建与基础知识 | ⭐ |
| **第1章** | Solidity 智能合约基础 | ⭐⭐ |
| **第2章** | ERC-4337 智能合约钱包开发 | ⭐⭐⭐ |
| **第3章** | 策略引擎合约开发 | ⭐⭐⭐ |
| **第4章** | Agent 应用开发（Node.js） | ⭐⭐⭐ |
| **第5章** | x402 支付协议集成 | ⭐⭐⭐⭐ |
| **第6章** | 完整实战：DeFi 自动理财 Agent | ⭐⭐⭐⭐⭐ |
| **附录** | 常用工具与参考资源 | ⭐ |

---

## 🚀 快速开始

```bash
# 克隆教程项目
git clone <本教程仓库>
cd ai-agent-wallet-tutorial

# 安装依赖
npm install

# 编译合约
npx hardhat compile

# 部署到测试网
npx hardhat run scripts/deploy.ts --network sepolia
```

---

## 📖 各章节详细内容

请按顺序阅读以下文件：

| 文件 | 内容 |
|------|------|
| `docs/00-environment.md` | 环境搭建与基础知识 |
| `docs/01-solidity-basics.md` | Solidity 智能合约基础 |
| `docs/02-erc4337-wallet.md` | ERC-4337 智能合约钱包开发 |
| `docs/03-policy-engine.md` | 策略引擎合约开发 |
| `docs/04-agent-app.md` | Agent 应用开发 |
| `docs/05-x402-payment.md` | x402 支付协议集成 |
| `docs/06-full-project.md` | 完整实战：DeFi 自动理财 Agent |
| `docs/appendix.md` | 附录：常用工具与参考资源 |

---

## 📦 项目结构

```
ai-agent-wallet-tutorial/
├── README.md                     # 本文件
├── package.json                  # 项目依赖
├── hardhat.config.ts             # Hardhat 配置
├── .env.example                  # 环境变量模板
├── contracts/                    # 智能合约
│   ├── AgentWallet.sol           # AI Agent 钱包合约（ERC-4337）
│   ├── PolicyEngine.sol          # 策略引擎合约
│   ├── PolicyTemplates.sol       # 策略模板库（library）
│   └── StrategyManager.sol       # 策略管理器合约
├── scripts/                      # 部署与交互脚本
│   ├── deploy.ts                 # 部署所有合约
│   ├── configure-agent.ts        # 配置 Agent 信息
│   ├── test-agent.ts             # 测试 Agent 功能
│   ├── send-user-op.ts           # 发送 UserOperation（第2章）
│   └── deploy-all.ts             # 一键部署全部（第6章）
├── agent/                        # Agent 应用代码
│   ├── simple-agent.ts           # 基础 Agent 示例（第4章）
│   ├── defi-agent.ts             # DeFi Agent 示例（第6章）
│   ├── agent-kit.ts              # Coinbase AgentKit 集成（第4章）
│   ├── x402-consumer.ts          # x402 消费者端（第5章）
│   └── agent-with-x402.ts        # 集成 x402 的 Agent（第5章）
├── server/                       # 服务端代码
│   └── x402-provider.ts          # x402 提供者服务（第5章）
├── frontend/                     # 前端交互界面
│   └── index.html                # Agent 钱包管理页面
├── test/                         # 测试
│   ├── AgentWallet.test.ts       # 钱包合约测试
│   └── PolicyEngine.test.ts      # 策略引擎测试
└── docs/                         # 教程文档
    ├── 00-environment.md
    ├── 01-solidity-basics.md
    ├── 02-erc4337-wallet.md
    ├── 03-policy-engine.md
    ├── 04-agent-app.md
    ├── 05-x402-payment.md
    ├── 06-full-project.md
    └── appendix.md
```

---

## 🎯 学完本教程你将能

1. ✅ 编写和部署 ERC-4337 智能合约钱包
2. ✅ 设计 AI Agent 的安全策略引擎
3. ✅ 开发能用钱包自主交易的 AI Agent
4. ✅ 集成 x402 协议实现 Agent 自主支付
5. ✅ 构建一个完整的 DeFi 自动理财 Agent
6. ✅ 理解 AI Agent 钱包的完整技术栈

---

## 🛠️ 常用命令速查

| 命令 | 说明 |
|------|------|
| `npm run compile` | 编译合约 |
| `npm run test` | 运行测试 |
| `npm run deploy` | 部署到 Sepolia |
| `npm run deploy:all` | 一键部署所有合约 |
| `npm run send-user-op` | 发送 UserOperation |
| `npm run agent:simple` | 启动基础 Agent |
| `npm run agent:defi` | 启动 DeFi Agent |
| `npm run agent:kit` | 启动 AgentKit Agent |
| `npm run server:x402` | 启动 x402 服务端 |
