# 附录：常用工具与参考资源

---

## A.1 开发工具

| 工具 | 用途 | 链接 |
|------|------|------|
| **Hardhat** | 合约开发框架 | https://hardhat.org |
| **Remix IDE** | 在线合约编辑器 | https://remix.ethereum.org |
| **Etherscan** | 区块链浏览器 | https://sepolia.etherscan.io |
| **OpenZeppelin** | 合约库 | https://www.openzeppelin.com/contracts |
| **Alchemy** | RPC 节点服务 | https://www.alchemy.com |
| **Infura** | RPC 节点服务 | https://infura.io |

## A.2 测试网水龙头

| 网络 | 水龙头地址 |
|------|-----------|
| **Sepolia ETH** | https://sepoliafaucet.com |
| **Sepolia ETH** | https://www.alchemy.com/faucets/ethereum-sepolia |
| **Base Sepolia** | https://www.alchemy.com/faucets/base-sepolia |
| **Goerli ETH** | https://goerlifaucet.com |

## A.3 常用合约地址（Sepolia 测试网）

| 合约 | 地址 |
|------|------|
| **ERC-4337 EntryPoint** | `0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789` |
| **Uniswap V3 Router** | `0xE592427A0AEce92De3Edee1F18E0157C05861564` |
| **Aave V3 Pool** | `0x6Ae43d3271ff6888e7Fc43Fd7321a503ff738951` |
| **WETH** | `0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14` |
| **USDC** | `0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238` |

## A.4 常用命令速查

```bash
# 编译合约
npx hardhat compile

# 运行测试
npx hardhat test

# 部署到测试网
npx hardhat run scripts/deploy.ts --network sepolia

# 部署到本地网络
npx hardhat run scripts/deploy.ts --network localhost

# 启动本地节点
npx hardhat node

# 验证合约
npx hardhat verify --network sepolia <合约地址> <构造函数参数>

# 生成 TypeScript 类型
npx hardhat typechain
```

## A.5 推荐学习路径

```
1. 完成本教程（1-2周）
   ↓
2. 学习更多 Solidity（1-2周）
   - CryptoZombies: https://cryptozombies.io
   - Solidity By Example: https://solidity-by-example.org
   ↓
3. 学习 DeFi 协议（2-4周）
   - Uniswap V3 白皮书
   - Aave V3 文档
   - Curve 稳定币兑换
   ↓
4. 学习 AI Agent 框架（1-2周）
   - LangChain: https://js.langchain.com
   - Coinbase AgentKit: https://github.com/coinbase/agentkit
   - Eliza: https://elizaos.github.io
   ↓
5. 实战项目（持续）
   - 开发自己的 DeFi 策略
   - 参与黑客松
   - 贡献开源项目
```

## A.6 安全最佳实践

```
✅ 必须做：
  - 使用 OpenZeppelin 审计过的合约
  - 所有合约通过测试
  - 使用策略引擎限制 Agent 权限
  - 设置合理的限额
  - 保留紧急暂停能力

❌ 不要做：
  - 在主网直接使用未经审计的合约
  - 给 Agent 无限制的权限
  - 使用未经验证的第三方合约
  - 在测试网使用真钱
  - 泄露私钥

⚠️ 注意事项：
  - 测试网和主网地址不同
  - Gas 费用会波动
  - 合约一旦部署不可修改
  - 智能合约漏洞可能导致资金损失
```

## A.7 参考链接

- **ERC-4337 官方文档**: https://eips.ethereum.org/EIPS/eip-4337
- **ERC-8004 草案**: https://ethereum-magicians.org/t/erc-8004
- **x402 协议**: https://www.x402.org
- **Coinbase AgentKit**: https://github.com/coinbase/agentkit
- **Account Abstraction SDK**: https://github.com/eth-infinitism/account-abstraction
- **OpenZeppelin 合约库**: https://github.com/OpenZeppelin/openzeppelin-contracts
- **Hardhat 文档**: https://hardhat.org/docs
- **ethers.js 文档**: https://docs.ethers.org
