# 项目问题列表

> 本文档记录了项目 Review 过程中发现的所有问题，方便后续逐项排查和修复。
> 状态标记：🔴 待修复 | 🟡 已知/设计中 | ✅ 已修复

---

## 1. 合约代码问题

### 1.1 `agentIndex` 注释与实际语义不符

- **状态**：✅ 已修复
- **文件**：`contracts/AgentWallet.sol`
- **问题**：`agentIndex` mapping 的注释写的是 `Agent 地址 => Agent 索引`，但实际存储的是 `agents.length`（1-based 索引），0 表示未注册。注释容易让人误解为 0-based 索引（即 `agents.length - 1`），和定义不符。
- **修复**：注释改为 `Agent 地址 => 1-based 索引（值为 agents.length，0 表示未注册，访问时用 agents[idx - 1]）`

---

### 1.2 `checkSlippage` 滑点保护未在 PolicyEngine 合约中实现

- **状态**：✅ 已修复
- **文件**：`contracts/PolicyEngine.sol`
- **问题**：教程文档 `03-policy-engine.md` 的策略设计表中列出了"滑点保护"策略类型，`docs/knowledge/dex-slippage.md` 中也给出了 Solidity 实现思路，但实际 `PolicyEngine.sol` 合约中 **没有实现** 滑点检查。`PolicyType` 枚举只有 5 种策略（Whitelist、Blacklist、SpendingLimit、RateLimit、TimeWindow），缺少 Slippage 类型。`checkTransaction` 函数中也没有滑点检查逻辑。
- **修复**：
  1. ✅ 在 `PolicyType` 枚举中新增 `Slippage`
  2. ✅ 新增 `SlippageParams` 结构体（`enabled`、`maxSlippageBps`）
  3. ✅ 新增 `addSlippagePolicy` 管理函数（含参数校验：1-1000 bps）
  4. ✅ 新增 `checkSlippage` 独立检查函数（由钱包合约在 DEX 交易时调用）
  5. ✅ 在 `checkTransaction` 和 `checkAllPolicies` 中增加 Slippage 分支
  6. ✅ 教程文档中标注滑点保护和紧急暂停为"进阶实现"
- **关联知识文档**：`docs/knowledge/dex-slippage.md`

---

### 1.3 白名单与黑名单策略是否冗余

- **状态**：✅ 已修复
- **文件**：`contracts/PolicyEngine.sol`、`docs/03-policy-engine.md`
- **问题**：合约中同时定义了白名单（Whitelist）和黑名单（Blacklist），两者在逻辑上反向共生——白名单的 false 等价于黑名单的 true，反之亦然。是否有必要同时保留两者？
- **分析结论**：两者解决的是**不同场景**，不冗余：
  - **白名单模式**：默认拒绝，只允许已知安全的（高安全性，适合 Agent 只做特定操作）
  - **黑名单模式**：默认允许，只禁止已知危险的（低安全性但灵活，适合 Agent 操作范围广但需屏蔽特定风险地址）
  - 关键区别在于**默认行为**不同，而非简单的取反关系
- **修复**：在教程文档 `03-policy-engine.md` 的策略设计表后新增"白名单 vs 黑名单"对比说明，包括默认行为、安全级别、适用场景、新增地址、风险等维度的对比，并给出实际建议

---

## 2. 教程文档问题

### 2.1 引用了不存在的脚本文件 `deploy-hello.ts`

- **状态**：✅ 已修复
- **文件**：`docs/01-solidity-basics.md`
- **问题**：1.6 节部署示例引用了 `scripts/deploy-hello.ts`，但项目中不存在此文件。实际存在的部署脚本是 `scripts/deploy.ts` 和 `scripts/deploy-all.ts`。
- **修复**：将文档中的 `deploy-hello.ts` 改为 `deploy.ts`，并更新部署代码示例为 AgentWallet 体系

---

### 2.2 章节间缺少导航链接

- **状态**：✅ 已修复
- **文件**：`docs/02-erc4337-wallet.md`
- **问题**：第2章末尾"下一章预告"只有纯文本 `→ 第3章我们将开发**策略引擎（PolicyEngine）**，实现更丰富的安全策略。`，缺少可点击的 Markdown 链接，读者无法直接跳转到下一章。
- **修复**：改为 `→ 进入 [第3章：策略引擎合约开发](03-policy-engine.md)，实现更丰富的安全策略。`
- **排查结果**：其他章节（第1、3、4、5章）的"下一章预告"链接均正常

---

## 3. 知识盲点与待补充文档

### 3.1 DEX 滑点控制概念需要详细解释

- **状态**：✅ 已补充
- **文件**：`docs/knowledge/dex-slippage.md`
- **问题**：教程中提到"滑点保护"策略，但对交易所业务纯小白的读者来说，DEX、AMM、滑点、三明治攻击等概念难以理解。
- **修复**：创建了 `docs/knowledge/dex-slippage.md` 知识文档，涵盖：
  - DEX vs CEX 对比
  - AMM 机制和恒定乘积公式
  - 流动性池和 LP 概念
  - 滑点的定义、成因（池子流动性变化 + Front-running）
  - 滑点容忍度和 `minAmountOut` 技术实现
  - AI Agent 场景下的滑点保护实现思路
  - 三明治攻击完整数值推演和防御方法

---

### 3.2 前排交易（Front-running）/ 三明治攻击需要数值推演

- **状态**：✅ 已补充
- **文件**：`docs/knowledge/dex-slippage.md`
- **问题**：原文档对 Front-running 的解释过于简略（仅3行文字描述），读者无法理解具体的攻击过程和利润来源。
- **修复**：补充了完整5步数值推演，包括：
  - 池子初始状态 → 你发交易 → 攻击者插队 → 你受损 → 攻击者获利
  - 每一步的池子资产变化和价格变化
  - Mermaid 流程图展示三明治结构
  - Gas 费插队机制的解释
  - 滑点保护如何防御的说明

---

### 3.3 LP 和流动性池的信任模型需要解释

- **状态**：✅ 已补充
- **文件**：`docs/knowledge/dex-slippage.md`
- **问题**：读者对以下概念仍有疑问：
  1. **LP 是什么？** — 流动性提供者，往池子里存钱的人，获得手续费分成
  2. **池子最初的 token 对怎么决定各自数量？** — 第一个 LP 按市场价格比例注入，决定了初始价格；后续 LP 必须按当前比例存入
  3. **池子的合规背书谁来保证？** — 没有人背书，DeFi 的信任模型是"代码即法律"，依赖代码公开、审计、不可篡改、数学保证、自托管、TVL、历史运行记录等多层保障
  4. **LP 的风险** — 无常损失（Impermanent Loss），当池子价格比例变化时，LP 的资产价值可能低于简单持有
- **修复**：在 `docs/knowledge/dex-slippage.md` 中新增"🏊 LP 与流动性池深入"章节，包括：
  - LP 的定义和收益来源（手续费分成）
  - 首个 LP 如何决定初始价格
  - 无常损失的数值推演
  - DeFi 信任模型的7层保障分析
  - 风险提示（合约漏洞、MEV、无常损失、Rug Pull）

---

### 3.4 AMM 同方向交易的"后来者永远更亏"特性需解释

- **状态**：✅ 已补充
- **文件**：`docs/knowledge/dex-slippage.md`
- **问题**：读者通过公式推导发现：在 AMM 中，同方向（同为买入或同为卖出）的连续交易中，后来者永远比前者拿到更差的价格。这是 AMM 机制的固有属性，不是攻击。三明治攻击的特殊性在于攻击者**主动**制造"后来者"局面来套利。
- **修复**：在 `docs/knowledge/dex-slippage.md` 中新增"📊 AMM 价格冲击与后来者更亏特性"章节，包括：
  - 完整数值推演（用户 A 和 B 依次买入同样金额的 ETH，后者拿到的更少）
  - 数学本质解释（双曲线 vs 直线）
  - 正常滑点 vs 三明治攻击的本质区别对比表（6个维度）

---

## 📊 问题统计

| 状态 | 数量 |
|------|------|
| 🔴 待修复 | 0 |
| 🟡 已知/设计中 | 0 |
| ✅ 已修复 | 7 |
| **总计** | **7** |

---

## 🎉 所有问题已修复

全部 7 个问题均已处理完成，无遗留项。
