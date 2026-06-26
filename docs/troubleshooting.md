# 常见问题排查（Troubleshooting）

> 遇到问题别慌！本文档收集了学习过程中最常见的错误和解决方案。

---

## 目录

- [环境搭建问题](#环境搭建问题)
- [合约编译问题](#合约编译问题)
- [测试运行问题](#测试运行问题)
- [部署问题](#部署问题)
- [Agent 运行问题](#agent-运行问题)
- [网络和 RPC 问题](#网络和-rpc-问题)
- [安全注意事项](#安全注意事项)

---

## 环境搭建问题

### Node.js 版本不兼容

**现象**：运行 Hardhat 时出现 `WARNING: You are currently using Node.js vXX, which is not supported`

**解决**：
```bash
# 推荐使用 Node.js 18 或 20（LTS 版本）
# 使用 nvm 管理版本
nvm install 20
nvm use 20
node -v  # 应输出 v20.x.x
```

### npm install 报错

**现象**：`npm ERR! ERESOLVE unable to resolve dependency tree`

**解决**：
```bash
# 方法1：使用 --legacy-peer-deps
npm install --legacy-peer-deps

# 方法2：删除 node_modules 重新安装
rm -rf node_modules package-lock.json
npm install
```

### TypeScript 类型错误

**现象**：`Cannot find module 'hardhat/config'` 或类似类型错误

**解决**：
```bash
# 确保安装了所有类型定义
npm install --save-dev @types/node typescript

# 重新生成类型
npx hardhat compile
```

---

## 合约编译问题

### Solidity 版本不匹配

**现象**：`ParserError: Source file requires different compiler version`

**解决**：检查 `hardhat.config.ts` 中的 Solidity 版本与合约中的 `pragma solidity` 是否一致：
```typescript
// hardhat.config.ts
solidity: {
  version: "0.8.24",  // 确保与合约中的 pragma 一致
}
```

### OpenZeppelin 导入失败

**现象**：`Source "@openzeppelin/contracts/..." not found`

**解决**：
```bash
npm install @openzeppelin/contracts
```

### Stack too deep 错误

**现象**：`CompilerError: Stack too deep`

**解决**：这是 Solidity 的局部变量限制。解决方法：
1. 将部分逻辑提取到内部函数
2. 使用结构体打包变量
3. 在 `hardhat.config.ts` 中启用优化器（已默认启用）

### 合约大小超限

**现象**：`Warning: Contract code size exceeds 24576 bytes`

**解决**：
1. 启用优化器（增加 `runs` 值）
2. 将合约拆分为多个库（library）
3. 移除不必要的 `public` 函数

---

## 测试运行问题

### 测试超时

**现象**：`Error: Timeout of 20000ms exceeded`

**解决**：在测试文件中增加超时时间：
```typescript
// 在 describe 块中
this.timeout(60000); // 60 秒

// 或在 hardhat.config.ts 中
mocha: {
  timeout: 60000,
}
```

### Gas 估算失败

**现象**：`Error: cannot estimate gas; transaction may fail or may require manual gas limit`

**解决**：这通常意味着交易会 revert。检查：
1. 调用者是否有正确的权限（如 `onlyOwner`）
2. 参数是否正确（如地址不为零）
3. 合约状态是否满足前置条件

### 事件断言失败

**现象**：`AssertionError: Expected event "XXX" to be emitted`

**解决**：
```typescript
// 确保使用正确的断言语法
await expect(tx)
  .to.emit(contract, "EventName")
  .withArgs(arg1, arg2);

// 注意：withArgs 中的参数类型必须精确匹配
// BigInt 和 number 不能混用
```

---

## 部署问题

### 余额不足

**现象**：`Error: insufficient funds for intrinsic transaction cost`

**解决**：
1. 确认 `.env` 中的 `PRIVATE_KEY` 对应的账户有足够的测试网 ETH
2. 获取测试网 ETH：
   - **Sepolia**: https://sepoliafaucet.com/ 或 https://www.alchemy.com/faucets/ethereum-sepolia
   - **Base Sepolia**: https://www.coinbase.com/faucets/base-ethereum-goerli-faucet

### Nonce 错误

**现象**：`Error: nonce has already been used`

**解决**：
```bash
# 方法1：等待之前的交易确认后重试
# 方法2：在 MetaMask 中重置账户（Settings → Advanced → Reset Account）
# 方法3：手动指定 nonce
```

### 合约验证失败

**现象**：`Error: Failed to verify contract`

**解决**：
```bash
# 确保 ETHERSCAN_API_KEY 或 BASESCAN_API_KEY 已配置
# 等待几个区块确认后再验证
npx hardhat verify --network baseSepolia <合约地址> <构造函数参数>
```

---

## Agent 运行问题

### 没有 OpenAI API Key

**现象**：想运行 Agent 但没有 API Key

**解决**：使用 mock 模式：
```bash
# 运行 mock demo（不需要任何 API Key）
npx hardhat run scripts/agent-mock-demo.ts --network hardhat

# 或使用免费替代方案：
# 1. Groq（免费额度）: https://console.groq.com/
# 2. Ollama（本地运行）: https://ollama.ai/
# 3. Together AI（免费试用）: https://www.together.ai/
```

### Agent 交易被拒绝

**现象**：Agent 调用合约时报错 `Not authorized agent`

**解决**：
1. 确认 Agent 已注册：调用 `wallet.agent()` 查看
2. 确认 Agent 地址正确：`.env` 中的 `AGENT_PRIVATE_KEY` 对应的地址
3. 确认 Agent 处于活跃状态：`agent.active` 应为 `true`

### Function Calling 不触发

**现象**：Agent 只返回文本，不调用工具

**解决**：
1. 检查 system prompt 是否清晰描述了工具用途
2. 确认 `tools` 参数格式正确
3. 尝试更明确的用户指令（如"请调用 getWalletBalance 查询余额"）

---

## 网络和 RPC 问题

### RPC 连接超时

**现象**：`Error: could not detect network` 或 `TIMEOUT`

**解决**：
1. 检查 RPC URL 是否正确
2. 尝试其他 RPC 提供商：
   - Sepolia: `https://rpc.sepolia.org` 或 `https://eth-sepolia.g.alchemy.com/v2/<KEY>`
   - Base Sepolia: `https://sepolia.base.org` 或 `https://base-sepolia.g.alchemy.com/v2/<KEY>`
3. 检查网络连接（是否需要代理）

### 测试网 vs 主网

> ⚠️ **重要警告**：本教程所有操作都在**测试网**进行，不涉及真实资金！

| | 测试网 | 主网 |
|---|---|---|
| **资金** | 免费水龙头获取 | 真实资金 |
| **风险** | 无 | 可能损失资金 |
| **Chain ID** | Sepolia: 11155111, Base Sepolia: 84532 | Ethereum: 1, Base: 8453 |
| **用途** | 开发、测试、学习 | 生产环境 |

**如何确认你在测试网**：
```typescript
const network = await ethers.provider.getNetwork();
console.log("Chain ID:", network.chainId);
// 如果是 31337（本地）、11155111（Sepolia）或 84532（Base Sepolia），你是安全的
// 如果是 1 或 8453，你在主网！立即停止！
```

---

## 安全注意事项

### 私钥安全

```
⚠️ 绝对不要：
- 把私钥提交到 Git（确保 .env 在 .gitignore 中）
- 在代码中硬编码私钥
- 把主钱包私钥用于测试
- 在公共场合展示私钥

✅ 正确做法：
- 使用 .env 文件存储私钥
- 为测试创建专用钱包
- 生产环境使用 KMS 或硬件钱包
- 定期轮换测试用私钥
```

### 合约安全

| 常见漏洞 | 说明 | 防范 |
|---------|------|------|
| 重入攻击 | 外部调用前修改状态 | 使用 ReentrancyGuard |
| 整数溢出 | Solidity 0.8+ 已自动检查 | 使用 0.8+ 版本 |
| 权限绕过 | 缺少访问控制 | 使用 onlyOwner/onlyAgent |
| 前端运行 | 交易被 MEV 机器人抢跑 | 使用 Flashbots 或设置滑点 |

---

## 还是解决不了？

1. **搜索错误信息**：将完整错误信息粘贴到 Google/Stack Overflow
2. **查看 Hardhat 文档**：https://hardhat.org/docs
3. **查看 OpenZeppelin 文档**：https://docs.openzeppelin.com/
4. **提 Issue**：在项目仓库中提交 Issue，附上完整错误日志
