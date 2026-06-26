import { expect } from "chai";
import { ethers } from "hardhat";

/**
 * PolicyEngine 测试套件
 *
 * 【使用场景】
 * 测试策略引擎的各项功能：
 * - 白名单策略：只允许与指定合约交互
 * - 黑名单策略：禁止与已知风险地址交互
 * - 函数白名单：只允许特定函数调用
 * - 金额限制：单笔/每日限额
 * - 速率限制：控制交易频率
 * - 时间窗口：只在特定时间允许操作
 * - 紧急暂停：异常行为自动暂停
 *
 * 【运行方式】
 * npx hardhat test test/PolicyEngine.test.ts
 */

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

  // ============ 白名单策略 ============

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

  it("白名单策略应该允许已授权的合约", async function () {
    const walletAddr = await wallet.getAddress();
    const allowedContract = "0x0000000000000000000000000000000000000002";

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

    // 添加合约到白名单
    await engine.addToWhitelist(walletAddr, allowedContract);

    // 检查已授权的合约
    const result = await engine.checkPolicy(
      allowedContract,
      0,
      "0x",
      agent.address
    );
    expect(result).to.equal(true);
  });

  // ============ 金额限制 ============

  it("金额限制策略应该拒绝超额交易", async function () {
    const walletAddr = await wallet.getAddress();

    await engine.setPolicy(walletAddr, {
      useWhitelist: false,
      useBlacklist: false,
      useFunctionWhitelist: false,
      useAmountLimits: true,
      useRateLimit: false,
      useTimeWindow: false,
      maxPerTx: ethers.parseEther("1"),    // 单笔最多 1 ETH
      maxDaily: ethers.parseEther("5"),     // 每日最多 5 ETH
      maxRate: 0,
      timeWindowStart: 0,
      timeWindowEnd: 0,
    });

    // 检查超额交易（2 ETH > 1 ETH 限额）
    const result = await engine.checkPolicy(
      "0x0000000000000000000000000000000000000001",
      ethers.parseEther("2"),
      "0x",
      agent.address
    );
    expect(result).to.equal(false);
  });

  it("金额限制策略应该允许限额内交易", async function () {
    const walletAddr = await wallet.getAddress();

    await engine.setPolicy(walletAddr, {
      useWhitelist: false,
      useBlacklist: false,
      useFunctionWhitelist: false,
      useAmountLimits: true,
      useRateLimit: false,
      useTimeWindow: false,
      maxPerTx: ethers.parseEther("1"),
      maxDaily: ethers.parseEther("5"),
      maxRate: 0,
      timeWindowStart: 0,
      timeWindowEnd: 0,
    });

    // 检查限额内交易（0.5 ETH < 1 ETH 限额）
    const result = await engine.checkPolicy(
      "0x0000000000000000000000000000000000000001",
      ethers.parseEther("0.5"),
      "0x",
      agent.address
    );
    expect(result).to.equal(true);
  });

  // ============ 紧急暂停 ============

  it("暂停状态下应该拒绝所有交易", async function () {
    const walletAddr = await wallet.getAddress();

    // 暂停钱包
    await engine.setPaused(walletAddr, true);

    // 检查暂停状态下的交易
    const result = await engine.checkPolicy(
      "0x0000000000000000000000000000000000000001",
      0,
      "0x",
      agent.address
    );
    expect(result).to.equal(false);
  });

  it("恢复后应该允许交易", async function () {
    const walletAddr = await wallet.getAddress();

    // 先暂停
    await engine.setPaused(walletAddr, trueipse);

    // 恢复
    await engine.setPaused(walletAddr, false);

    // 恢复后应该允许交易（没有启用其他策略）
    const result = await engine.checkPolicy(
      "0x0000000000000000000000000000000000000001",
      0,
      "0x",
      agent.address
    );
    expect(result).to.equal(true);
  });

  // ============ 函数白名单 ============

  it("函数白名单应该拒绝未授权的函数调用", async function () {
    const walletAddr = await wallet.getAddress();

    await engine.setPolicy(walletAddr, {
      useWhitelist: false,
      useBlacklist: false,
      useFunctionWhitelist: true,
      useAmountLimits: false,
      useRateLimit: false,
      useTimeWindow: false,
      maxPerTx: 0,
      maxDaily: 0,
      maxRate: 0,
      timeWindowStart: 0,
      timeWindowEnd: 0,
    });

    // 添加一个允许的函数选择器
    const allowedSelector = ethers.id("transfer(address,uint256)").substring(0, 10);
    await engine.addFunctionToWhitelist(walletAddr, allowedSelector);

    // 调用未授权的函数
    const unauthorizedData = ethers.id("destroy()").substring(0, 10);
    const result = await engine.checkPolicy(
      "0x0000000000000000000000000000000000000001",
      0,
      unauthorizedData,
      agent.address
    );
    expect(result).to.equal(false);
  });

  // ============ 黑名单 ============

  it("黑名单策略应该拒绝列入黑名单的合约", async function () {
    const walletAddr = await wallet.getAddress();
    const blacklistedContract = "0x0000000000000000000000000000000000000003";

    await engine.setPolicy(walletAddr, {
      useWhitelist: false,
      useBlacklist: true,
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

    // 添加合约到黑名单
    await engine.addToBlacklist(walletAddr, blacklistedContract);

    // 检查黑名单中的合约
    const result = await engine.checkPolicy(
      blacklistedContract,
      0,
      "0x",
      agent.address
    );
    expect(result).to.equal(false);
  });

  // ============ 速率限制 ============

  it("速率限制策略应该拒绝超频交易", async function () {
    const walletAddr = await wallet.getAddress();

    await engine.setPolicy(walletAddr, {
      useWhitelist: false,
      useBlacklist: false,
      useFunctionWhitelist: false,
      useAmountLimits: false,
      useRateLimit: true,
      useTimeWindow: false,
      maxPerTx: 0,
      maxDaily: 0,
      maxRate: 2,  // 每分钟最多 2 笔
      timeWindowStart: 0,
      timeWindowEnd: 0,
    });

    // 前两笔应该成功
    await engine.checkPolicy("0x0000000000000000000000000000000000000001", 0, "0x", agent.address);
    await engine.checkPolicy("0x0000000000000000000000000000000000000001", 0, "0x", agent.address);

    // 第三笔应该被拒绝
    const result = await engine.checkPolicy(
      "0x0000000000000000000000000000000000000001",
      0,
      "0x",
      agent.address
    );
    expect(result).to.equal(false);
  });
});
