# 第0章：环境搭建与基础知识

> **本章在整体架构中的位置**：搭建开发环境，为后续所有章节做准备。
> 预计时间：20 分钟

---

## 0.1 你需要安装什么

| 工具 | 用途 | 版本要求 |
|------|------|---------|
| **Node.js** | 运行 JavaScript/TypeScript | v18.x 或 v20.x（推荐 v20 LTS） |
| **npm** | 包管理器 | 随 Node.js 自带 |
| **VS Code** | 代码编辑器 | 最新版 |
| **MetaMask** | 浏览器钱包（后续章节需要） | Chrome/Firefox 扩展 |
| **Git** | 版本控制 | 任意版本 |

### 步骤 1：安装 Node.js

前往 [Node.js 官网](https://nodejs.org/) 下载 **LTS 版本**（推荐 v20.x）。

> ⚠️ **注意**：不要使用 Node.js v22+ 的奇数版本，Hardhat 可能不完全兼容。

安装完成后验证：

```bash
node -v
# 预期输出: v20.x.x（如 v20.11.0）

npm -v
# 预期输出: 10.x.x（如 10.2.4）
```

> 💡 **平台差异**：
> - **macOS**：推荐使用 [nvm](https://github.com/nvm-sh/nvm) 管理 Node 版本：`nvm install 20`
> - **Windows**：推荐使用 [nvm-windows](https://github.com/coreybutler/nvm-windows) 或直接安装 .msi
> - **Linux**：使用 nvm 或系统包管理器

### 步骤 2：安装 VS Code 推荐插件

安装 [VS Code](https://code.visualstudio.com/) 后，安装以下插件：
- **Solidity** (Juan Blanco) — Solidity 语法高亮和编译
- **Hardhat Solidity** — Hardhat 集成支持

---

## 0.2 克隆项目并安装依赖

```bash
# 克隆教程项目
git clone <本教程仓库地址>
cd ai-agent-wallet

# 安装所有依赖
npm install
```

**预期输出**（最后几行）：
```
added 700+ packages in XXs
```

> ⚠️ **常见问题**：
> - 如果出现 `ERESOLVE` 依赖冲突错误，尝试：`npm install --legacy-peer-deps`
> - 如果网络超时，设置 npm 镜像：`npm config set registry https://registry.npmmirror.com`
> - Windows 用户如果遇到 `node-gyp` 编译错误，需要安装 [Windows Build Tools](https://github.com/nicedoc/windows-build-tools)

安装完成后验证编译：

```bash
npx hardhat compile
```

**预期输出**：
```
Compiled 17 Solidity files successfully (evm target: cancun).
```

运行测试确认一切正常：

```bash
npx hardhat test
```

**预期输出**：
```
  AgentWallet
    Deployment
      ✔ should set the owner correctly
      ...
  PolicyEngine
    Deployment
      ✔ 应该正确设置 owner
      ...

  29 passing
```

如果看到所有测试通过，说明项目代码是正确的！🎉

---

## 0.3 区块链基础知识速览

> 如果你已经了解这些概念，可以跳过本节。

### 智能合约 = 链上的自动执行程序

```
传统程序:  代码 → 部署到服务器 → 管理员可以修改/关停
智能合约:  代码 → 部署到区块链 → 不可篡改，自动执行
```

类比：智能合约就像一台"自动售货机"——投入硬币（发送交易），按规则出货（执行逻辑），没有人能中途拦截或修改规则。

### Gas = 链上操作的"手续费"

每次在区块链上执行操作（转账、调用合约）都需要付 **Gas 费**。

```
Gas 费 = Gas 用量 × Gas 单价
       ≈ 操作复杂度 × 当前网络拥堵程度
```

在测试网上 Gas 是免费的（用水龙头领取的测试 ETH 支付）。

### 测试网 vs 主网

```
主网 (Mainnet)   → 真实资产，操作不可逆，需要真金白银
测试网 (Testnet) → 模拟环境，资产无价值，免费领取，用于开发测试
```

本教程使用 **Base Sepolia 测试网**（Coinbase 的 L2 测试网），因为后续章节的 x402 和 AgentKit 都基于 Base 链。

### ERC-4337 = 让钱包变"聪明"

```
传统钱包 (EOA):     私钥 → 签名 → 发送交易（只能签或不签）
智能合约钱包 (4337): 合约 → 验证逻辑 → 执行交易（可以加任何规则）
```

**核心价值**：传统钱包只能"全有或全无"地授权，ERC-4337 钱包可以设置精细规则——比如"每天最多花 1 ETH"、"只能和白名单地址交互"。这正是 AI Agent 需要的！

---

## 0.4 配置环境变量

复制环境变量模板：

```bash
cp .env.example .env
```

打开 `.env` 文件，按以下说明填写：

| 变量 | 用途 | 如何获取 | 是否必须 |
|------|------|---------|---------|
| `SEPOLIA_RPC_URL` | 连接测试网 | 注册 [Alchemy](https://www.alchemy.com/) 免费账号，创建 App 选择 Base Sepolia | 部署到测试网时需要 |
| `PRIVATE_KEY` | 部署合约的账号 | MetaMask → 账户详情 → 导出私钥 | 部署到测试网时需要 |
| `ETHERSCAN_API_KEY` | 验证合约源码 | 注册 [Etherscan](https://etherscan.io/apis) | 可选 |
| `LLM_PROVIDER` | LLM 提供商 | 可选值：openai / ollama / anthropic / gemini | 第4章需要（默认 openai） |
| `LLM_API_KEY` | Agent 的 AI 能力 | 根据提供商获取对应 API Key（Ollama 无需配置） | 第4章需要 |

> ⚠️ **安全警告**：
> - **永远不要**将 `.env` 文件提交到 Git！（已在 `.gitignore` 中排除）
> - **永远不要**在主网使用教程中的私钥
> - 测试网私钥也建议使用专门的测试账号，不要用你的主力钱包

> 💡 **前几章不需要填写任何环境变量**！我们先在本地 Hardhat 网络上开发和测试，不需要连接真实测试网。

---

## 0.5 获取测试网 ETH（后续章节需要时再做）

> 本步骤在第2章部署到测试网时才需要，现在可以跳过。

1. 安装 MetaMask 浏览器扩展并创建钱包
2. 在 MetaMask 中添加 Base Sepolia 网络：
   - 网络名称：Base Sepolia
   - RPC URL：`https://sepolia.base.org`
   - Chain ID：84532
   - 符号：ETH
   - 区块浏览器：`https://sepolia.basescan.org`
3. 从水龙头领取免费测试 ETH：

| 水龙头 | 链接 | 说明 |
|--------|------|------|
| **Chainstack** | https://faucet.chainstack.com/base-sepolia | 注册免费账号即可领取 |
| **QuickNode** | https://faucet.quicknode.com/base/sepolia | 注册免费账号即可领取 |
| Coinbase Faucet | https://www.coinbase.com/faucets/base-ethereum-sepolia | 需主网余额 ≥0.001 ETH |
| Alchemy Faucet | https://www.alchemy.com/faucets/base-sepolia | 需主网余额 ≥0.001 ETH |

> ⚠️ **水龙头可用性提示**：部分水龙头可能因访问限制暂时不可用。如果某个水龙头无法使用，请尝试列表中的其他水龙头。
>
> 💡 **如果所有外部水龙头都无法使用**，你可以先用本地 Hardhat 节点开发：
> ```bash
> npx hardhat node
> ```
> 本地节点会自动分配 1000 ETH 到测试账户，无需水龙头。

---

## 0.6 运行快速体验 Demo

在正式开始学习之前，先体验一下最终效果：

```bash
npx hardhat run scripts/demo.ts --network hardhat
```

这个 Demo 会在本地网络上演示完整的 AI Agent 钱包工作流程（无需任何配置）。看完 Demo 后，你就知道我们最终要构建什么了！

---

## ✅ 本章检查点

完成本章后，确认以下事项：

- [ ] `node -v` 输出 v18.x 或 v20.x
- [ ] `npx hardhat compile` 输出 "Compiled 17 Solidity files successfully"
- [ ] `npx hardhat test` 输出 "29 passing"
- [ ] `npx hardhat run scripts/demo.ts --network hardhat` 正常运行完成
- [ ] 已了解智能合约、Gas、测试网、ERC-4337 的基本概念

**你现在手上有什么**：
- 一个可以编译和运行测试的完整项目
- 对 AI Agent 钱包系统的初步体验（通过 Demo）

---

## ➡️ 下一步

进入 [第1章：Solidity 智能合约基础](01-solidity-basics.md)，学习编写 Agent 钱包的核心合约代码。

> 💡 **为什么先学 Solidity？** 因为 AI Agent 的所有链上操作最终都要通过智能合约执行。理解合约代码，才能理解 Agent 的能力边界和安全约束。
