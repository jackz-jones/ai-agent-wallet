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
    event Transfer(address indexed from, address indexed to, uint256 amountapse);

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

创建 `scripts/deploy-hello.ts`：

```typescript
import { ethers } from "hardhat";

async function main() {
  // 获取合约工厂
  const HelloWorld = await ethers.getContractFactory("HelloWorld");

  // 部署合约（传入构造函数参数）
  const hello = await HelloWorld.deploy("Hello, AI Agent!");

  await hello.waitForDeployment();

  const address = await hello.getAddress();
  console.log("合约部署到:", address);

  // 调用合约
  const greeting = await hello.getGreeting();
  console.log("当前问候语:", greeting);

  // 修改状态
  const tx = await hello.setGreeting("Hello, Blockchain!");
  await tx.wait();

  const newGreeting = await hello.getGreeting();
  console.log("修改后:", newGreeting);
}

main().catch(console.error);
```

运行：

```bash
npx hardhat run scripts/deploy-hello.ts --network sepolia
```

---

## 📖 本章小结

你已学会：
- ✅ Solidity 基本语法
- ✅ 状态变量、函数、修饰符、事件
- ✅ 与外部合约交互
- ✅ 部署合约到测试网

**下一步**：进入第2章，开发真正的 ERC-4337 智能合约钱包。
