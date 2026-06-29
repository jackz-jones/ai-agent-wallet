# 第1章：Solidity 智能合约基础

> 本章只讲本教程需要用到的基础知识，不讲废话。

---

## 1.1 Solidity 是什么？

Solidity 是以太坊上写智能合约的语言，语法类似 JavaScript。

### 第一个合约：Hello World

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract HelloWorld {
    // 状态变量（存储在区块链上）
    string public greeting;

    // 构造函数（部署时执行一次）
    constructor(string memory _greeting) {
        greeting = _greeting;
    }

    // 函数：修改状态
    function setGreeting(string memory _greeting) public {
        greeting = _greeting;
    }

    // 函数：读取状态（view 表示不修改状态，不花 Gas）
    function getGreeting() public view returns (string memory) {
        return greeting;
    }
}
```

---

## 1.2 核心概念

### 状态变量 vs 局部变量

```solidity
contract Example {
    // 状态变量：存储在区块链上，永久保存
    uint256 public count;       // 自动生成 getter 函数
    address public owner;

    function increment() public {
        // 局部变量：只在函数执行期间存在
        uint256 temp = count + 1;
        count = temp;
    }
}
```

### 数据类型

```solidity
contract DataTypes {
    // 基本类型
    bool public active = true;
    uint256 public number = 100;    // 无符号整数 (0 到 2^256-1)
    int256 public negative = -50;   // 有符号整数
    address public addr = 0x...;    // 以太坊地址 (20字节)
    bytes32 public hash;            // 32字节数据

    // 复杂类型
    string public name = "Agent";
    uint256[] public numbers;       // 动态数组
    mapping(address => uint256) public balances;  // 映射（类似字典）

    // 结构体
    struct Agent {
        string name;
        address wallet;
        uint256 limit;
    }
    Agent public myAgent;

    // 枚举
    enum Status { Pending, Active, Suspended }
    Status public status = Status.Pending;
}
```

### 修饰符（Modifier）

```solidity
contract WithModifier {
    address public owner;

    constructor() {
        owner = msg.sender;  // 部署者成为 owner
    }

    // 自定义修饰符：检查调用者是否为 owner
    modifier onlyOwner() {
        require(msg.sender == owner, "Not the owner");
        _;  // 继续执行原函数
    }

    // 只有 owner 能调用
    function sensitiveAction() public onlyOwner {
        // 只有 owner 能执行这里
    }
}
```

### 事件（Event）

```solidity
contract WithEvents {
    // 定义事件
    event Transfer(address indexed from, address indexed to, uint256 amount);

    function transfer(address to, uint256 amount) public {
        // ... 转账逻辑 ...
        emit Transfer(msg.sender, to, amount);  // 触发事件
    }
}
```

事件是合约"说话"的方式——前端可以监听事件来更新 UI。

---

## 1.3 重要概念：msg.sender 与 tx.origin

```solidity
contract WhoCalled {
    function who() public view returns (address, address) {
        return (msg.sender, tx.origin);
    }
}
```

- **msg.sender**：直接调用者（可能是合约地址）
- **tx.origin**：原始交易发起者（一定是 EOA 地址）

> ⚠️ **安全提示**：永远用 `msg.sender` 做权限检查，不要用 `tx.origin`！

---

## 1.4 与外部合约交互

```solidity
// 接口：定义外部合约的函数签名
interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
}

contract InteractWithToken {
    // 调用 USDC 合约
    function sendUSDC(address usdcAddress, address to, uint256 amount) public {
        IERC20(usdcAddress).transfer(to, amount);
    }

    // 查询余额
    function getBalance(address token, address account) public view returns (uint256) {
        return IERC20(token).balanceOf(account);
    }
}
```

---

## 1.5 接收 ETH

```solidity
contract ReceiveETH {
    // 接收 ETH 的两种方式
    receive() external payable { }  // 当 msg.data 为空时触发
    fallback() external payable { } // 当 msg.data 不为空时触发

    // 查询合约余额
    function getBalance() public view returns (uint256) {
        return address(this).balance;
    }

    // 发送 ETH
    function withdraw(address payable to, uint256 amount) public {
        require(address(this).balance >= amount, "Insufficient balance");
        to.transfer(amount);  // 方法1：transfer（推荐，自带 Gas 限制）
        // to.send(amount);   // 方法2：send
        // (bool sent, ) = to.call{value: amount}("");  // 方法3：call
        // require(sent, "Failed to send ETH");
    }
}
```

---

## 1.6 部署你的第一个合约

创建 `scripts/deploy.ts`：

```typescript
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
  console.log(`AgentWallet:      ${walletAddress}`);
  console.log(`PolicyEngine:     ${policyEngineAddress}`);
  console.log(`StrategyManager:  ${strategyManagerAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

运行：

```bash
npx hardhat run scripts/deploy.ts --network sepolia
```

---

---

## ✅ 本章检查点

完成本章后，确认以下事项：

### 你应该理解的概念
- [x] Solidity 基本语法：状态变量、函数、修饰符、事件
- [x] `msg.sender` 的含义和安全使用
- [x] 接口（interface）和与外部合约交互
- [x] `receive()` 函数和 ETH 接收
- [x] 合约部署的基本流程

### 验证命令
```bash
# 确认合约能编译通过
npx hardhat compile

# 运行测试确认环境正常
npx hardhat test
```

### 常见问题

| 问题 | 解决方案 |
|------|----------|
| 编译报错 "ParserError" | 检查 Solidity 版本是否为 ^0.8.24 |
| 部署时 "insufficient funds" | 确认测试网账户有足够的 ETH |
| 导入 OpenZeppelin 报错 | 运行 `npm install @openzeppelin/contracts` |

---

## 🔗 下一章预告

你已经掌握了 Solidity 基础，接下来我们要用这些知识构建一个**真正有用的合约**：

- 为什么普通钱包（EOA）不适合 AI Agent？
- 什么是 ERC-4337 账户抽象？
- 如何开发一个 Agent 可以自主操作的智能合约钱包？

→ 进入 [第2章：ERC-4337 智能合约钱包开发](02-erc4337-wallet.md)
