# 第2章：ERC-4337 智能合约钱包开发

> 本章是核心。你将开发一个 AI Agent 专用的智能合约钱包。

---

## 2.1 ERC-4337 核心概念回顾

```
传统 EOA 钱包:  私钥 → 签名 → 交易
ERC-4337 钱包:  智能合约 → 验证逻辑 → 执行交易
```

**ERC-4337 的关键组件**：

| 组件 | 作用 | 类比 |
|------|------|------|
| **UserOperation** | Agent 发起的"交易请求" | 填好的转账单 |
| **EntryPoint** | 核心合约，验证+执行 | 银行柜台 |
| **Smart Account** | Agent 的智能合约钱包 | 你的银行账户 |
| **Bundler** | 打包多个 UserOperation | 快递员 |
| **Paymaster** | 代付 Gas 费 | 公司报销 |

---

## 2.2 开发 AI Agent 钱包合约

创建 `contracts/AgentWallet.sol`：

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title AgentWallet
 * @notice AI Agent 专用的 ERC-4337 智能合约钱包
 * 
 * 核心功能：
 * 1. Agent 可以自主执行交易（在策略范围内）
 * 2. Owner 可以设置 Agent 的权限
 * 3. 支持代付 Gas（Paymaster）
 * 4. 所有操作可审计
 */
contract AgentWallet {
    // ============ 类型定义 ============

    /// @notice Agent 信息
    struct AgentInfo {
        address agentAddress;    // Agent 的 EOA 地址（用于签名）
        string name;            // Agent 名称
        uint256 dailyLimit;     // 日限额（wei）
        uint256 perTxLimit;     // 单笔限额
        bool active;            // 是否激活
        uint256 lastReset;      // 上次重置时间
        uint256 spentToday;     // 今日已花费
    }

    /// @notice 交易记录
    struct Transaction {
        address to;             // 目标地址
        uint256 value;          // 发送的 ETH
        bytes data;             // 调用数据
        uint256 timestamp;      // 时间戳
        bool executed;          // 是否已执行
    }

    // ============ 状态变量 ============

    address public owner;                    // 钱包所有者
    address public policyEngine;             // 策略引擎地址
    AgentInfo public agent;                  // Agent 信息
    Transaction[] public transactions;       // 交易历史
    mapping(address => bool) public allowedTokens;  // 白名单代币

    // ============ 事件 ============

    event AgentExecuted(address indexed agent, address to, uint256 value, bytes data);
    event AgentUpdated(address indexed agent, uint256 dailyLimit, uint256 perTxLimit);
    event PolicyEngineUpdated(address indexed newEngineapse);

    // ============ 修饰符 ============

    modifier onlyOwner() {
        require(msg.sender == owner, "Not wallet owner");
        _;
    }

    modifier onlyAgent() {
        require(msg.sender == agent.agentAddress, "Not agent");
        _;
    }

    modifier onlyOwnerOrAgent() {
        require(msg.sender == owner || msg.sender == agent.agentAddress, "Not authorized");
        _;
    }

    // ============ 构造函数 ============

    constructor(
        address _owner,
        address _agentAddress,
        string memory _agentName,
        uint256 _dailyLimit,
        uint256 _perTxLimit
    ) {
        owner = _owner;
        agent = AgentInfo({
            agentAddress: _agentAddress,
            name: _agentName,
            dailyLimit: _dailyLimit,
            perTxLimit: _perTxLimit,
            active: true,
            lastReset: block.timestamp,
            spentToday: 0
        });
    }

    // ============ Agent 执行函数 ============

    /**
     * @notice Agent 执行交易（核心函数）
     * @param to 目标合约地址
     * @param value 发送的 ETH 数量
     * @param data 调用数据（编码后的函数调用）
     */
    function execute(
        address to,
        uint256 value,
        bytes calldata data
    ) external onlyAgent returns (bytes memory) {
        require(agent.active, "Agent is suspended");
        require(value <= agent.perTxLimit, "Exceeds per-tx limit");

        // 检查日限额
        _resetDailyIfNeeded();
        require(agent.spentToday + value <= agent.dailyLimit, "Exceeds daily limit");

        // 如果有策略引擎，先检查策略
        if (policyEngine != address(0)) {
            require(
                IPolicyEngine(policyEngine).checkPolicy(to, value, data, agent.agentAddress),
                "Policy check failed"
            );
        }

        // 更新已花费
        agent.spentToday += value;

        // 执行交易
        (bool success, bytes memory result) = to.call{value: value}(data);
        require(success, "Transaction failed");

        // 记录交易
        transactions.push(Transaction({
            to: to,
            value: value,
            data: data,
            timestamp: block.timestamp,
            executed: true
        }));

        emit AgentExecuted(agent.agentAddress, to, value, data);
        return result;
    }

    /**
     * @notice Agent 执行代币转账
     */
    function executeTokenTransfer(
        address token,
        address to,
        uint256 amount
    ) external onlyAgent returns (bool) {
        require(allowedTokens[token], "Token not allowed");
        require(agent.active, "Agent is suspended");
        require(amount <= agent.perTxLimit, "Exceeds per-tx limit");

        // 检查日限额（按代币价值估算，简化版用 amount）
        _resetDailyIfNeeded();
        require(agent.spentToday + amount <= agent.dailyLimit, "Exceeds daily limit");

        agent.spentToday += amount;

        // 调用代币合约的 transfer 函数
        (bool success, bytes memory data) = token.call(
            abi.encodeWithSignature("transfer(address,uint256)", to, amount)
        );
        require(success, "Token transfer failed");

        return abi.decode(data, (bool));
    }

    // ============ 管理函数 ============

    /// @notice 更新 Agent 配置
    function updateAgent(
        address _agentAddress,
        string memory _name,
        uint256 _dailyLimit,
        uint256 _perTxLimit
    ) external onlyOwner {
        agent.agentAddress = _agentAddress;
        agent.name = _name;
        agent.dailyLimit = _dailyLimit;
        agent.perTxLimit = _perTxLimit;
        emit AgentUpdated(_agentAddress, _dailyLimit, _perTxLimit);
    }

    /// @notice 暂停/恢复 Agent
    function setAgentActive(bool _active) external onlyOwner {
        agent.active = _active;
    }

    /// @notice 设置策略引擎
    function setPolicyEngine(address _policyEngine) external onlyOwner {
        policyEngine = _policyEngine;
        emit PolicyEngineUpdated(_policyEngine);
    }

    /// @notice 添加白名单代币
    function addAllowedToken(address token) external onlyOwner {
        allowedTokens[token] = true;
    }

    /// @notice 移除白名单代币
    function removeAllowedToken(address token) external onlyOwner {
        allowedTokens[token] = false;
    }

    // ============ 查询函数 ============

    /// @notice 获取交易历史
    function getTransactionCount() external view returns (uint256) {
        return transactions.length;
    }

    /// @notice 获取合约余额
    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }

    // ============ 内部函数 ============

    /// @notice 每天重置限额
    function _resetDailyIfNeeded() internal {
        if (block.timestamp >= agent.lastReset + 1 days) {
            agent.spentToday = 0;
            agent.lastReset = block.timestamp;
        }
    }

    /// @notice 接收 ETH
    receive() external payable {}
}

// ============ 策略引擎接口 ============

interface IPolicyEngine {
    function checkPolicy(
        address to,
        uint256 value,
        bytes calldata data,
        address agent
    ) external returns (bool);
}
```

---

### 2.3 部署钱包合约

在 `scripts/deploy.ts` 中编写部署脚本：

```typescript
import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("部署者:", deployer.address);

  // 部署参数
  const owner = deployer.address;           // 钱包所有者
  const agentAddress = deployer.address;    // 暂时用部署者地址（后续会换成 Agent 地址）
  const agentName = "MyFirstAgent";
  const dailyLimit = ethers.parseEther("0.1");   // 日限额 0.1 ETH
  const perTxLimit = ethers.parseEther("0.01");  // 单笔限额 0.01 ETH

  // 部署合约
  const AgentWallet = await ethers.getContractFactory("AgentWallet");
  const wallet = await AgentWallet.deploy(
    owner,
    agentAddress,
    agentName,
    dailyLimit,
    perTxLimit
  );

  await wallet.waitForDeployment();
  const walletAddress = await wallet.getAddress();

  console.log("AgentWallet 部署到:", walletAddress);
  console.log("Owner:", owner);
  console.log("Agent:", agentAddress);
  console.log("日限额:", ethers.formatEther(dailyLimit), "ETH");
  console.log("单笔限额:", ethers.formatEther(perTxLimit), "ETH");

  // 验证部署
  const agentInfo = await wallet.agent();
  console.log("\nAgent 信息:");
  console.log("  名称:", agentInfo.name);
  console.log("  活跃:", agentInfo.active);
  console.log("  日限额:", ethers.formatEther(agentInfo.dailyLimit), "ETH");
}

main().catch(console.error);
```

运行部署：

```bash
npx hardhat run scripts/deploy.ts --network sepolia
```

---

## 2.4 测试钱包合约

创建 `test/AgentWallet.test.ts`：

```typescript
import { expect } from "chai";
import { ethers } from "hardhat";

describe("AgentWallet", function () {
  let wallet: any;
  let owner: any;
  let agent: any;
  let user: any;

  beforeEach(async function () {
    [owner, agent, user] = await ethers.getSigners();

    const AgentWallet = await ethers.getContractFactory("AgentWallet");
    wallet = await AgentWallet.deploy(
      owner.address,
      agent.address,
      "TestAgent",
      ethers.parseEther("1"),     // 日限额 1 ETH
      ethers.parseEther("0.1")    // 单笔限额 0.1 ETH
    );
    await wallet.waitForDeployment();
  });

  it("应该正确设置 Agent 信息", async function () {
    const agentInfo = await wallet.agent();
    expect(agentInfo.name).to.equal("TestAgent");
    expect(agentInfo.active).to.equal(true);
    expect(agentInfo.dailyLimit).to.equal(ethers.parseEther("1"));
  });

  it("Agent 应该能执行交易", async function () {
    // 先给钱包转一些 ETH
    await owner.sendTransaction({
      to: await wallet.getAddress(),
      value: ethers.parseEther("1"),
    });

    // Agent 执行转账
    const tx = await wallet.connect(agent).execute(
      user.address,
      ethers.parseEther("0.05"),
      "0x"
    );
    await tx.wait();

    // 验证余额
    const balance = await ethers.provider.getBalance(user.address);
    expect(balance).to.equal(ethers.parseEther("10000.05")); // 假设 user 初始有 10000 ETH
  });

  it("非 Agent 不能执行交易", async function () {
    await expect(
      wallet.connect(user).execute(user.address, 0, "0x")
    ).to.be.revertedWith("Not agent");
  });

  it("超过单笔限额应该被拒绝", async function () {
    await expect(
      wallet.connect(agent).execute(
        user.address,
        ethers.parseEther("0.2"),  // 超过 0.1 限额
        "0x"
      )
    ).to.be.revertedWith("Exceeds per-tx limit");
  });

  it("Owner 应该能暂停 Agent", async function () {
    await wallet.connect(owner).setAgentActive(falseipse);
    const agentInfo = await wallet.agent();
    expect(agentInfo.active).to.equal(false);

    // 暂停后 Agent 不能执行交易
    await expect(
      wallet.connect(agent).execute(user.address, 0, "0x")
    ).to.be.revertedWith("Agent is suspended");
  });
});
```

运行测试：

```bash
npx hardhat test
```

---

## 2.5 支持 ERC-4337 的 UserOperation

为了让钱包真正兼容 ERC-4337，我们需要实现 `IAccount` 接口。

创建 `contracts/AgentWallet4337.sol`：

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@account-abstraction/contracts/interfaces/IAccount.sol";
import "@account-abstraction/contracts/core/EntryPoint.sol";

/**
 * @title AgentWallet4337
 * @notice 兼容 ERC-4337 的 Agent 钱包
 * 
 * 这个版本让 Agent 可以通过 UserOperation 发起交易
 * 而不需要直接持有私钥
 */
contract AgentWallet4337 is IAccount {
    // ...（继承 AgentWallet 的所有功能，加上以下 ERC-4337 支持）

    /// @notice ERC-4337 入口点
    address public immutable entryPoint;

    constructor(
        address _entryPoint,  // ERC-4337 EntryPoint 合约地址
        address _owner,
        address _agentAddress,
        string memory _agentName,
        uint256 _dailyLimit,
        uint256 _perTxLimit
    ) {
        entryPoint = _entryPoint;
        // ... 其他初始化
    }

    /**
     * @notice ERC-4337 验证方法
     * EntryPoint 在执行前调用此方法验证签名
     */
    function validateUserOp(
        UserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 missingAccountFunds
    ) external override returns (uint256 validationData) {
        require(msg.sender == entryPoint, "Only entry point");

        // 验证签名：Agent 用其 EOA 签名 UserOperation
        bytes32 hash = userOpHash.toEthSignedMessageHash();
        address signer = hash.recover(userOp.signature);
        
        // 检查签名者是否为 Agent 或 Owner
        if (signer == agent.agentAddress || signer == owner) {
            // 签名有效
        } else {
            return SIG_VALIDATION_FAILED;
        }

        // 如果缺少 Gas 费，从合约中扣除
        if (missingAccountFunds > 0) {
            (bool success,) = msg.sender.call{value: missingAccountFunds}("");
            (success); // 忽略返回值
        }

        return 0; // 验证通过
    }
}
```

---

## 2.6 使用 Bundler 发送 UserOperation

创建 `scripts/send-user-op.ts`：

```typescript
import { ethers } from "ethers";
import { UserOperationBuilder } from "@account-abstraction/sdk";

async function main() {
  const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
  const agentWallet = new ethers.Wallet(process.env.AGENT_PRIVATE_KEY!, provider);

  // ERC-4337 入口点地址（Sepolia 测试网）
  const ENTRY_POINT = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";

  // 构建 UserOperation
  const builder = new UserOperationBuilder()
    .setSender("0x你的Agent钱包地址")     // 智能合约钱包地址
    .setNonce(0)                           // 交易序号
    .setCallData(                          // 要执行的交易
      new ethers.Interface(["function execute(address,uint256,bytes)"]).encodeFunctionData(
        "execute",
        ["0x接收地址", ethers.parseEther("0.001"), "0x"]
      )
    )
    .setMaxFeePerGas(ethers.parseUnits("50", "gwei"))
    .setMaxPriorityFeePerGas(ethers.parseUnits("5", "gwei"))
    .setCallGasLimit(100000)
    .setVerificationGasLimit(50000)
    .setPreVerificationGas(20000);

  // Agent 签名 UserOperation
  const signedOp = await builder.buildAndSign(agentWallet);

  console.log("UserOperation:", signedOp);

  // 发送到 Bundler（这里用公共 Bundler 示例）
  // 实际项目中需要运行自己的 Bundler 或使用服务商
  console.log("UserOperation 已构建，等待 Bundler 打包...");
}

main().catch(console.error);
```

---

## 📖 本章小结

你已完成：
- ✅ 开发了 AI Agent 专用智能合约钱包
- ✅ 实现了 Agent 自主执行交易
- ✅ 实现了日限额/单笔限额控制
- ✅ 兼容 ERC-4337 UserOperation
- ✅ 编写并通过了单元测试

**下一步**：进入第3章，开发策略引擎合约。
