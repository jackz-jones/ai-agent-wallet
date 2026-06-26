# 第3章：策略引擎合约开发

> **本章在整体架构中的位置**：策略引擎是 AI Agent 钱包的"安全大脑"，位于 Agent 和钱包之间，决定 Agent 能做什么、不能做什么。

---

## 📍 前情回顾

在第2章中，你已经：
- ✅ 理解了 EOA 钱包 vs 智能合约钱包的区别
- ✅ 开发了 AgentWallet 合约（Agent 注册、限额控制、交易执行）
- ✅ 所有测试通过，合约可以编译部署

但 AgentWallet 中的限额控制还比较简单（只有日限额和单笔限额）。现实中，我们需要更丰富的安全策略。

---

## 3.1 为什么需要策略引擎？（反面案例）

> ⚠️ **安全警示**：如果没有策略引擎，AI Agent 可能造成灾难性损失。

### 没有策略引擎会怎样？

想象一下这些场景：

| 场景 | 没有策略引擎 | 有策略引擎 |
|------|-------------|-----------|
| Agent 被 Prompt Injection 攻击 | 💀 Agent 把所有资金转给攻击者 | ✅ 超出限额，交易被拒绝 |
| LLM 产生幻觉（Hallucination） | 💀 Agent 向不存在的合约转账 | ✅ 目标不在白名单，交易被拒绝 |
| Agent 陷入死循环 | 💀 疯狂发交易耗尽 Gas | ✅ 速率限制触发，自动暂停 |
| 凌晨3点市场剧烈波动 | 💀 Agent 恐慌性抛售 | ✅ 不在允许时间窗口，交易被拒绝 |

### 真实案例警示

```
2024年某 DeFi Agent 事故：
- Agent 被恶意 prompt 诱导，认为需要"紧急转移资金到安全地址"
- 没有策略引擎约束，Agent 将 50 ETH 转给了攻击者
- 如果有白名单策略，这笔交易会被立即拦截

教训：AI 不是 100% 可靠的，必须用代码（策略引擎）来兜底
```

### 最小权限原则

> 💡 **核心安全理念**：给 Agent 的权限应该是完成任务所需的**最小权限**，而不是"方便起见"给最大权限。

```
❌ 错误做法：Agent 可以向任何地址转任意金额
✅ 正确做法：Agent 只能向白名单地址转账，每笔不超过 0.1 ETH，每天不超过 1 ETH
```

---

## 3.2 策略引擎的设计

```
Agent 想: "我要把钱包里所有钱转给这个地址"
策略引擎: "❌ 目标地址不在白名单中，拒绝"
```

**策略引擎检查的内容**：

| 策略类型 | 说明 | 例子 |
|---------|------|------|
| **白名单** | 只允许与指定合约交互 | 只允许 Uniswap、Aave |
| **黑名单** | 禁止与已知风险地址交互 | 禁止与钓鱼地址交互 |
| **金额限制** | 单笔/每日/每周限额 | 单笔最多 $1000 |
| **操作类型** | 只允许特定操作 | 只允许 swap，不允许 transfer |
| **速率限制** | 控制交易频率 | 每分钟最多 5 笔 |
| **时间窗口** | 只在特定时间允许操作 | 只在 UTC 8:00-20:00 |
| **滑点保护** | DEX 交易的滑点控制 | 滑点不超过 1% |
| **紧急暂停** | 异常行为自动暂停 | 余额变动 > 20% 时暂停 |

---

## 3.2 开发策略引擎合约

创建 `contracts/PolicyEngine.sol`：

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title PolicyEngine
 * @notice AI Agent 的策略引擎
 * 
 * 功能：
 * 1. 合约白名单/黑名单
 * 2. 函数选择器白名单（只允许特定函数调用）
 * 3. 金额限制
 * 4. 速率限制
 * 5. 时间窗口
 * 6. 紧急暂停
 */
contract PolicyEngine {
    // ============ 类型定义 ============

    /// @notice 策略配置
    struct PolicyConfig {
        bool useWhitelist;              // 启用合约白名单
        bool useBlacklist;              // 启用合约黑名单
        bool useFunctionWhitelist;      // 启用函数白名单
        bool useAmountLimits;           // 启用金额限制
        bool useRateLimit;              // 启用速率限制
        bool useTimeWindow;             // 启用时间窗口
        uint256 maxPerTx;               // 单笔最大金额（wei）
        uint256 maxDaily;               // 每日最大金额
        uint256 maxRate;                // 速率限制（笔/分钟）
        uint256 timeWindowStart;        // 允许开始时间（UTC 小时）
        uint256 timeWindowEnd;          // 允许结束时间
    }

    /// @notice 策略检查结果
    struct PolicyCheck {
        bool passed;
        string reason;
    }

    // ============ 状态变量 ============

    address public owner;
    mapping(address => PolicyConfig) public walletPolicies;  // 钱包地址 => 策略
    mapping(address => mapping(address => bool)) public contractWhitelist;  // 钱包 => 合约白名单
    mapping(address => mapping(address => bool)) public contractBlacklist;  // 钱包 => 合约黑名单
    mapping(address => mapping(bytes4 => bool)) public functionWhitelist;   // 钱包 => 函数选择器白名单

    // 速率限制追踪
    mapping(address => uint256[]) public txTimestamps;  // 钱包 => 交易时间戳列表

    // 紧急暂停
    mapping(address => bool) public paused;

    // ============ 事件 ============

    event PolicyUpdated(address indexed wallet);
    event ContractWhitelisted(address indexed wallet, address indexed contractAddr, bool whitelisted);
    event ContractBlacklisted(address indexed wallet, address indexed contractAddr, bool blacklisted);
    event PolicyCheckResult(address indexed wallet, bool passed, string reason);
    event WalletPaused(address indexed wallet, bool paused);

    // ============ 构造函数 ============

    constructor() {
        owner = msg.sender;
    }

    // ============ 策略检查（核心函数） ============

    /**
     * @notice 检查交易是否符合策略
     * @param to 目标合约地址
     * @param value 发送的 ETH 数量
     * @param data 调用数据
     * @param agent Agent 地址
     * @return bool 是否通过检查
     */
    function checkPolicy(
        address to,
        uint256 value,
        bytes calldata data,
        address agent
    ) external returns (bool) {
        PolicyConfig storage config = walletPolicies[msg.sender];
        string memory failReason = "";

        // 1. 检查是否暂停
        if (paused[msg.sender]) {
            emit PolicyCheckResult(msg.sender, false, "Wallet is paused");
            return false;
        }

        // 2. 检查合约白名单
        if (config.useWhitelist) {
            if (!contractWhitelist[msg.sender][to]) {
                failReason = "Contract not in whitelist";
                emit PolicyCheckResult(msg.sender, false, failReason);
                return false;
            }
        }

        // 3. 检查合约黑名单
        if (config.useBlacklist) {
            if (contractBlacklist[msg.sender][to]) {
                failReason = "Contract is blacklisted";
                emit PolicyCheckResult(msg.sender, false, failReason);
                return false;
            }
        }

        // 4. 检查函数白名单
        if (config.useFunctionWhitelist && data.length >= 4) {
            bytes4 selector = bytes4(data[:4]);
            if (!functionWhitelist[msg.sender][selector]) {
                failReason = "Function not allowed";
                emit PolicyCheckResult(msg.sender, false, failReason);
                return false;
            }
        }

        // 5. 检查金额限制
        if (config.useAmountLimits) {
            if (value > config.maxPerTx) {
                failReason = "Exceeds per-transaction limit";
                emit PolicyCheckResult(msg.sender, false, failReason);
                return false;
            }
        }

        // 6. 检查速率限制
        if (config.useRateLimit) {
            if (!_checkRateLimit(msg.sender, config.maxRate)) {
                failReason = "Rate limit exceeded";
                emit PolicyCheckResult(msg.sender, false, failReason);
                return false;
            }
        }

        // 7. 检查时间窗口
        if (config.useTimeWindow) {
            if (!_checkTimeWindow(config.timeWindowStart, config.timeWindowEnd)) {
                failReason = "Outside allowed time window";
                emit PolicyCheckResult(msg.sender, false, failReason);
                return false;
            }
        }

        emit PolicyCheckResult(msg.sender, true, "Passed");
        return true;
    }

    // ============ 策略配置函数 ============

    /// @notice 设置钱包策略
    function setPolicy(
        address wallet,
        PolicyConfig calldata config
    ) external {
        require(msg.sender == owner, "Only owner");
        walletPolicies[wallet] = config;
        emit PolicyUpdated(wallet);
    }

    /// @notice 添加合约到白名单
    function addToWhitelist(address wallet, address contractAddr) external {
        require(msg.sender == owner, "Only owner");
        contractWhitelist[wallet][contractAddr] = true;
        emit ContractWhitelisted(wallet, contractAddr, true);
    }

    /// @notice 从白名单移除
    function removeFromWhitelist(address wallet, address contractAddr) external {
        require(msg.sender == owner, "Only owner");
        contractWhitelist[wallet][contractAddr] = false;
        emit ContractWhitelisted(wallet, contractAddr, false);
    }

    /// @notice 添加合约到黑名单
    function addToBlacklist(address wallet, address contractAddr) external {
        require(msg.sender == owner, "Only owner");
        contractBlacklist[wallet][contractAddr] = true;
        emit ContractBlacklisted(wallet, contractAddr, true);
    }

    /// @notice 添加允许的函数选择器
    function addFunctionToWhitelist(address wallet, bytes4 selector) external {
        require(msg.sender == owner, "Only owner");
        functionWhitelist[wallet][selector] = true;
    }

    /// @notice 暂停/恢复钱包
    function setPaused(address wallet, bool _paused) external {
        require(msg.sender == owner, "Only owner");
        paused[wallet] = _paused;
        emit WalletPaused(wallet, _paused);
    }

    // ============ 内部函数 ============

    /// @notice 检查速率限制
    function _checkRateLimit(address wallet, uint256 maxRate) internal returns (bool) {
        if (maxRate == 0) return true; // 不限制

        uint256[] storage timestamps = txTimestamps[wallet];
        uint256 currentTime = block.timestamp;

        // 清理超过1分钟的记录
        while (timestamps.length > 0 && timestamps[0] < currentTime - 60) {
            // 移除第一个元素
            for (uint i = 0; i < timestamps.length - 1; i++) {
                timestamps[i] = timestamps[i + 1];
            }
            timestamps.pop();
        }

        // 检查是否超过速率限制
        if (timestamps.length >= maxRate) {
            return false;
        }

        // 记录本次交易
        timestamps.push(currentTime);
        return true;
    }

    /// @notice 检查时间窗口
    function _checkTimeWindow(uint256 start, uint256 end) internal view returns (bool) {
        uint256 hour = (block.timestamp % 86400) / 3600;
        if (start <= end) {
            return hour >= start && hour < end;
        } else {
            // 跨天的情况（如 22:00 - 6:00）
            return hour >= start || hour < end;
        }
    }

    // ============ 管理函数 ============

    /// @notice 转移所有权
    function transferOwnership(address newOwner) external {
        require(msg.sender == owner, "Only owner");
        owner = newOwner;
    }
}
```

---

## 3.3 预置策略模板

创建 `contracts/PolicyTemplates.sol`：

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./PolicyEngine.sol";

/**
 * @title PolicyTemplates
 * @notice 预置策略模板，方便快速配置
 */
contract PolicyTemplates {
    PolicyEngine public policyEngine;

    constructor(address _policyEngine) {
        policyEngine = PolicyEngine(_policyEngine);
    }

    /// @notice 仅限 Uniswap 交易的策略
    function setupUniswapOnlyPolicy(
        address wallet,
        address uniswapRouter,
        uint256 maxPerTx,
        uint256 maxDaily
    ) external {
        PolicyEngine.PolicyConfig memory config = PolicyEngine.PolicyConfig({
            useWhitelist: true,
            useBlacklist: false,
            useFunctionWhitelist: true,
            useAmountLimits: true,
            useRateLimit: true,
            useTimeWindow: false,
            maxPerTx: maxPerTx,
            maxDaily: maxDaily,
            maxRate: 10,  // 每分钟最多 10 笔
            timeWindowStart: 0,
            timeWindowEnd: 0
        });

        policyEngine.setPolicy(wallet, config);
        policyEngine.addToWhitelist(wallet, uniswapRouter);

        // 只允许 swapExactTokensForTokens 和 swapExactETHForTokens
        policyEngine.addFunctionToWhitelist(wallet, bytes4(keccak256("swapExactTokensForTokens(uint256,uint256,address[],address,uint256)")));
        policyEngine.addFunctionToWhitelist(wallet, bytes4(keccak256("swapExactETHForTokens(uint256,address[],address,uint256)")));
    }

    /// @notice 仅限 Aave 借贷的策略
    function setupAaveLendingPolicy(
        address wallet,
        address aavePool,
        uint256 maxPerTx,
        uint256 maxDaily
    ) external {
        PolicyEngine.PolicyConfig memory config = PolicyEngine.PolicyConfig({
            useWhitelist: true,
            useBlacklist: false,
            useFunctionWhitelist: true,
            useAmountLimits: true,
            useRateLimit: true,
            useTimeWindow: false,
            maxPerTx: maxPerTx,
            maxDaily: maxDaily,
            maxRate: 5,
            timeWindowStart: 0,
            timeWindowEnd: 0
        });

        policyEngine.setPolicy(wallet, config);
        policyEngine.addToWhitelist(wallet, aavePool);

        // 只允许 supply 和 withdraw
        policyEngine.addFunctionToWhitelist(wallet, bytes4(keccak256("supply(address,uint256,address,uint16)")));
        policyEngine.addFunctionToWhitelist(wallet, bytes4(keccak256("withdraw(address,uint256,address)")));
    }

    /// @notice 严格限制策略（仅转账给白名单地址）
    function setupStrictTransferPolicy(
        address wallet,
        address[] memory allowedAddresses,
        uint256 maxPerTx
    ) external {
        PolicyEngine.PolicyConfig memory config = PolicyEngine.PolicyConfig({
            useWhitelist: true,
            useBlacklist: false,
            useFunctionWhitelist: false,
            useAmountLimits: true,
            useRateLimit: true,
            useTimeWindow: true,
            maxPerTx: maxPerTx,
            maxDaily: maxPerTx * 10,
            maxRate: 3,
            timeWindowStart: 8,   // UTC 8:00
            timeWindowEnd: 20     // UTC 20:00
        });

        policyEngine.setPolicy(wallet, config);
        for (uint i = 0; i < allowedAddresses.length; i++) {
            policyEngine.addToWhitelist(wallet, allowedAddresses[i]);
        }
    }
}
```

---

### 3.4 部署策略引擎

在 `scripts/deploy.ts` 中已经包含了 PolicyEngine 的部署代码：

```typescript
import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("部署者:", deployer.address);

  // 1. 部署策略引擎
  const PolicyEngine = await ethers.getContractFactory("PolicyEngine");
  const engine = await PolicyEngine.deploy();
  await engine.waitForDeployment();
  const engineAddress = await engine.getAddress();
  console.log("PolicyEngine 部署到:", engineAddress);

  // 2. 部署策略模板
  const PolicyTemplates = await ethers.getContractFactory("PolicyTemplates");
  const templates = await PolicyTemplates.deploy(engineAddress);
  await templates.waitForDeployment();
  const templatesAddress = await templates.getAddress();
  console.log("PolicyTemplates 部署到:", templatesAddress);

  // 3. 配置一个示例策略
  const walletAddress = "0x你的Agent钱包地址";
  const config = {
    useWhitelist: true,
    useBlacklist: false,
    useFunctionWhitelist: false,
    useAmountLimits: true,
    useRateLimit: true,
    useTimeWindow: false,
    maxPerTx: ethers.parseEther("0.01"),    // 单笔最多 0.01 ETH
    maxDaily: ethers.parseEther("0.1"),      // 每日最多 0.1 ETH
    maxRate: 10,                              // 每分钟最多 10 笔
    timeWindowStart: 0,
    timeWindowEnd: 0,
  };

  const tx = await engine.setPolicy(walletAddress, config);
  await tx.wait();
  console.log("策略已配置");

  // 4. 将策略引擎地址设置到钱包合约
  console.log("\n下一步：在钱包合约中调用 setPolicyEngine()");
  console.log("策略引擎地址:", engineAddress);
}

main().catch(console.error);
```

---

## 3.5 测试策略引擎

创建 `test/PolicyEngine.test.ts`：

```typescript
import { expect } from "chai";
import { ethers } from "hardhat";

describe("PolicyEngine", function () {
  let engine: any;
  let wallet: any;
  let owner: any;
  let agent: any;

  beforeEach(async function () {
    [owner, agent] = await ethers.getSigners();

    const PolicyEngine = await ethers.getContractFactory("PolicyEngine");
    engine = await PolicyEngine.deploy();
    await engine.waitForDeployment();

    // 部署一个测试钱包
    const AgentWallet = await ethers.getContractFactory("AgentWallet");
    wallet = await AgentWallet.deploy(
      owner.address,
      agent.address,
      "TestAgent",
      ethers.parseEther("1"),
      ethers.parseEther("0.1")
    );
    await wallet.waitForDeployment();
  });

  it("白名单策略应该拒绝未授权的合约", async function () {
    const walletAddr = await wallet.getAddress();

    // 设置白名单策略
    await engine.setPolicy(walletAddr, {
      useWhitelist: true,
      useBlacklist: false,
      useFunctionWhitelist: false,
      useAmountLimits: false,
      useRateLimit: false,
      useTimeWindow: false,
      maxPerTx: 0,
      maxDaily: 0,
      maxRate: 0,
      timeWindowStart: 0,
      timeWindowEnd: 0,
    });

    // 检查未在白名单的合约
    const result = await engine.checkPolicy(
      "0x0000000000000000000000000000000000000001",  // 未授权合约
      0,
      "0x",
      agent.address
    );
    expect(result).to.equal(false);
  });

  it("白名单中的合约应该通过检查", async function () {
    const walletAddr = await wallet.getAddress();
    const allowedContract = "0x0000000000000000000000000000000000000002";

    // 设置策略并添加白名单
    await engine.setPolicy(walletAddr, {
      useWhitelist: true,
      useBlacklist: false,
      useFunctionWhitelist: false,
      useAmountLimits: false,
      useRateLimit: false,
      useTimeWindow: false,
      maxPerTx: 0,
      maxDaily: 0,
      maxRate: 0,
      timeWindowStart: 0,
      timeWindowEnd: 0,
    });
    await engine.addToWhitelist(walletAddr, allowedContract);

    const result = await engine.checkPolicy(
      allowedContract,
      0,
      "0x",
      agent.address
    );
    expect(result).to.equal(true);
  });

  it("金额限制应该生效", async function () {
    const walletAddr = await wallet.getAddress();

    // 设置金额限制
    await engine.setPolicy(walletAddr, {
      useWhitelist: false,
      useBlacklist: false,
      useFunctionWhitelist: false,
      useAmountLimits: true,
      useRateLimit: false,
      useTimeWindow: false,
      maxPerTx: ethers.parseEther("0.1"),  // 单笔最多 0.1 ETH
      maxDaily: ethers.parseEther("1"),
      maxRate: 0,
      timeWindowStart: 0,
      timeWindowEnd: 0,
    });

    // 超过限额应该被拒绝
    const result = await engine.checkPolicy(
      "0x0000000000000000000000000000000000000001",
      ethers.parseEther("0.5"),  // 超过 0.1
      "0x",
      agent.address
    );
    expect(result).to.equal(false);
  });
});
```

---

## 3.6 将策略引擎接入钱包

在钱包合约中，Agent 执行交易时会自动调用策略引擎：

```solidity
// 在 AgentWallet.sol 的 execute 函数中
function execute(address to, uint256 value, bytes calldata data) 
    external onlyAgent returns (bytes memory) 
{
    // ... 其他检查 ...

    // 调用策略引擎
    if (policyEngine != address(0)) {
        require(
            IPolicyEngine(policyEngine).checkPolicy(to, value, data, agent.agentAddress),
            "Policy check failed"
        );
    }

    // ... 执行交易 ...
}
```

---

## ✅ 本章检查点

完成本章后，确认以下事项：

### 文件清单
- [x] `contracts/PolicyEngine.sol` — 策略引擎合约
- [x] `contracts/PolicyTemplates.sol` — 策略模板库
- [x] `test/PolicyEngine.test.ts` — 策略引擎测试

### 验证命令
```bash
# 编译通过
npx hardhat compile

# 策略引擎测试通过
npx hardhat test test/PolicyEngine.test.ts
```

### 你应该理解的概念
- [x] 策略引擎的作用：在 Agent 和链上操作之间加一层"安检"
- [x] 各种策略类型：白名单、黑名单、限额、速率限制、时间窗口
- [x] 策略模板的设计思路：针对不同场景预设安全规则
- [x] 策略引擎如何与钱包合约集成

### 常见问题

| 问题 | 解决方案 |
|------|----------|
| 编译报错 "internal type" | 包含动态数组的结构体不能用 `public`，改为 `internal` |
| 测试中 `checkTransaction` 报错 | 确保调用者是 `walletAddress`（onlyWallet 修饰器） |
| 速率限制测试不稳定 | 时间相关测试需要用 `hardhat_mine` 推进区块 |

---

## 🔗 下一章预告

合约层面的工作已经完成！现在我们有了：
- AgentWallet（Agent 的链上钱包）
- PolicyEngine（安全策略引擎）

但这些合约需要有人来"驱动"——这就是 AI Agent 应用的角色：
- Agent 如何连接到链上合约？
- Agent 如何用 LLM 做出交易决策？
- Agent 如何安全地签名和提交交易？

→ 进入 [第4章：Agent 应用开发](04-agent-app.md)
