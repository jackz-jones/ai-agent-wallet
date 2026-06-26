# 第0章：环境搭建与基础知识

> 本教程使用以太坊 Sepolia 测试网（免费），所有操作不花真钱。

---

## 0.1 你需要安装什么

| 工具 | 用途 | 安装命令 |
|------|------|---------|
| **Node.js v18+** | 运行 JavaScript/TypeScript | [官网下载](https://nodejs.org/) |
| **npm/yarn** | 包管理 | 随 Node.js 自带 |
| **VS Code** | 代码编辑器 | [官网下载](https://code.visualstudio.com/) |
| **MetaMask** | 浏览器钱包 | Chrome 扩展商店 |
| **Hardhat** | 合约开发框架 | `npm install -g hardhat` |

### 一键安装项目依赖

```bash
# 创建项目目录
mkdir ai-agent-wallet-tutorial && cd ai-agent-wallet-tutorial

# 初始化项目
npm init -y

# 安装核心依赖
npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox @openzeppelin/contracts
npm install dotenv ethers @account-abstraction/contracts

# 安装 Agent 开发依赖
npm install openai @coinbase/agentkit coinbase-api
```

---

## 0.2 区块链基础知识（小白必读）

### 什么是智能合约？

```
传统程序: 你写代码 → 部署到服务器 → 服务器管理员可以改
智能合约: 你写代码 → 部署到区块链 → 无人能改（不可篡改）
```

### 什么是 Gas？

每次在区块链上执行操作（转账、调用合约）都需要付 **Gas 费**，相当于"手续费"。

### 什么是测试网？

```
主网 (Mainnet)  → 用真钱，操作需谨慎
测试网 (Testnet) → 用假钱（免费领），用来开发和测试
```

本教程使用 **Sepolia 测试网**。

### 什么是 ERC-4337？

```
传统钱包: 你有一个私钥 → 用私钥签名交易 → 发送到区块链
ERC-4337:  你有一个智能合约作为"钱包" → 合约里有逻辑判断 → 决定是否执行交易
```

**核心区别**：传统钱包只能"签名或拒绝"，智能合约钱包可以"根据规则自动判断"。

---

## 0.3 配置 Hardhat

创建 `hardhat.config.ts`：

```typescript
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    // Sepolia 测试网
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || "",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
    // 本地 Hardhat 网络（开发用）
    hardhat: {
      chainId: 31337,
    },
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
};

export default config;
```

创建 `.env` 文件：

```bash
# 从 https://infura.io 或 https://alchemy.com 获取 RPC URL
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/你的PROJECT_ID

# 你的钱包私钥（从 MetaMask 导出）
PRIVATE_KEY=0x你的私钥

# 从 https://etherscan.io 获取 API Key
ETHERSCAN_API_KEY=你的API_KEY

# OpenAI API Key（用于 Agent 的 AI 能力）
OPENAI_API_KEY=sk-你的KEY
```

---

## 0.4 获取测试网 ETH

1. 安装 MetaMask 并创建钱包
2. 切换到 Sepolia 测试网
3. 访问水龙头领取免费 ETH：
   - https://sepoliafaucet.com/
   - https://www.alchemy.com/faucets/ethereum-sepolia
   - https://faucet.quicknode.com/ethereum/sepolia

---

## 0.5 验证环境

```bash
# 编译合约（验证 Solidity 编译器是否正常）
npx hardhat compile

# 启动本地测试网络
npx hardhat node

# 运行测试
npx hardhat test
```

如果以上命令都正常执行，说明环境搭建成功！🎉

---

## 📖 本章小结

你已完成：
- ✅ 安装开发工具
- ✅ 理解区块链/智能合约/ERC-4337 基础概念
- ✅ 配置 Hardhat 开发环境
- ✅ 获取测试网 ETH

**下一步**：进入第1章，学习 Solidity 智能合约基础。
