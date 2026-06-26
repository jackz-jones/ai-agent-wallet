import { expect } from "chai";
import { ethers } from "hardhat";

/**
 * PolicyEngine 测试套件
 *
 * 【使用场景】
 * 测试策略引擎的各项功能：
 * - 白名单策略：只允许与白名单地址交互
 * - 黑名单策略：禁止与黑名单地址交互
 * - 限额策略：单笔/每日限额
 * - 速率限制：控制交易频率
 * - 时间窗口：只在特定时间允许操作
 *
 * 【运行方式】
 * npx hardhat test test/PolicyEngine.test.ts
 */

describe("PolicyEngine", function () {
  let engine: any;
  let wallet: any;
  let owner: any;
  let agent: any;
  let recipient: any;

  beforeEach(async function () {
    [owner, agent, recipient] = await ethers.getSigners();

    // 先部署 AgentWallet 作为 walletAddress
    const AgentWallet = await ethers.getContractFactory("AgentWallet");
    wallet = await AgentWallet.deploy();
    await wallet.waitForDeployment();

    const walletAddr = await wallet.getAddress();

    // 部署 PolicyEngine，传入 walletAddress
    const PolicyEngine = await ethers.getContractFactory("PolicyEngine");
    engine = await PolicyEngine.deploy(walletAddr);
    await engine.waitForDeployment();
  });

  // ============ 部署测试 ============

  describe("Deployment", function () {
    it("应该正确设置 owner", async function () {
      expect(await engine.owner()).to.equal(owner.address);
    });

    it("应该正确设置 walletAddress", async function () {
      const walletAddr = await wallet.getAddress();
      expect(await engine.walletAddress()).to.equal(walletAddr);
    });
  });

  // ============ 白名单策略 ============

  describe("Whitelist Policy", function () {
    it("应该成功添加白名单策略", async function () {
      await engine.addWhitelistPolicy(
        agent.address,
        [recipient.address],
        "只允许与指定地址交互"
      );

      const count = await engine.getPolicyCount(agent.address);
      expect(count).to.equal(1);
    });

    it("只有 owner 能添加策略", async function () {
      await expect(
        engine.connect(agent).addWhitelistPolicy(
          agent.address,
          [recipient.address],
          "测试"
        )
      ).to.be.revertedWith("PolicyEngine: only owner");
    });
  });

  // ============ 黑名单策略 ============

  describe("Blacklist Policy", function () {
    it("应该成功添加黑名单策略", async function () {
      const blacklistedAddr = "0x0000000000000000000000000000000000000001";
      await engine.addBlacklistPolicy(
        agent.address,
        [blacklistedAddr],
        "禁止与风险地址交互"
      );

      const count = await engine.getPolicyCount(agent.address);
      expect(count).to.equal(1);
    });
  });

  // ============ 限额策略 ============

  describe("Spending Limit Policy", function () {
    it("应该成功添加限额策略", async function () {
      await engine.addSpendingLimitPolicy(
        agent.address,
        ethers.parseEther("5"),   // 日限额 5 ETH
        ethers.parseEther("1"),   // 单笔限额 1 ETH
        "标准限额策略"
      );

      const count = await engine.getPolicyCount(agent.address);
      expect(count).to.equal(1);
    });
  });

  // ============ 速率限制策略 ============

  describe("Rate Limit Policy", function () {
    it("应该成功添加速率限制策略", async function () {
      await engine.addRateLimitPolicy(
        agent.address,
        10,     // 最多 10 笔
        3600,   // 1 小时窗口
        "每小时最多 10 笔交易"
      );

      const count = await engine.getPolicyCount(agent.address);
      expect(count).to.equal(1);
    });
  });

  // ============ 时间窗口策略 ============

  describe("Time Window Policy", function () {
    it("应该成功添加时间窗口策略", async function () {
      await engine.addTimeWindowPolicy(
        agent.address,
        9,      // 9:00 开始
        18,     // 18:00 结束
        [1, 2, 3, 4, 5],  // 周一到周五
        "工作日 9:00-18:00 允许交易"
      );

      const count = await engine.getPolicyCount(agent.address);
      expect(count).to.equal(1);
    });
  });

  // ============ 策略移除 ============

  describe("Policy Removal", function () {
    it("应该成功移除策略", async function () {
      await engine.addWhitelistPolicy(
        agent.address,
        [recipient.address],
        "白名单策略"
      );

      await engine.addBlacklistPolicy(
        agent.address,
        ["0x0000000000000000000000000000000000000001"],
        "黑名单策略"
      );

      expect(await engine.getPolicyCount(agent.address)).to.equal(2);

      await engine.removePolicy(agent.address, 0);
      expect(await engine.getPolicyCount(agent.address)).to.equal(1);
    });

    it("移除不存在的策略应该失败", async function () {
      await expect(
        engine.removePolicy(agent.address, 0)
      ).to.be.revertedWith("PolicyEngine: invalid index");
    });
  });

  // ============ 管理函数 ============

  describe("Admin Functions", function () {
    it("应该能更新 walletAddress", async function () {
      const newWallet = recipient.address;
      await engine.updateWalletAddress(newWallet);
      expect(await engine.walletAddress()).to.equal(newWallet);
    });

    it("只有 owner 能更新 walletAddress", async function () {
      await expect(
        engine.connect(agent).updateWalletAddress(recipient.address)
      ).to.be.revertedWith("PolicyEngine: only owner");
    });
  });

  // ============ 批量策略检查（view 函数，不需要 wallet 调用） ============

  describe("Batch Policy Check", function () {
    it("无策略时应返回空数组", async function () {
      const results = await engine.checkAllPolicies(
        agent.address,
        recipient.address,
        ethers.parseEther("0.1")
      );
      expect(results.length).to.equal(0);
    });

    it("白名单策略应正确检查目标地址", async function () {
      await engine.addWhitelistPolicy(
        agent.address,
        [recipient.address],
        "白名单"
      );

      // 检查白名单中的地址
      const results = await engine.checkAllPolicies(
        agent.address,
        recipient.address,
        0
      );
      expect(results.length).to.equal(1);
      expect(results[0].allowed).to.equal(true);

      // 检查不在白名单中的地址
      const results2 = await engine.checkAllPolicies(
        agent.address,
        "0x0000000000000000000000000000000000000099",
        0
      );
      expect(results2.length).to.equal(1);
      expect(results2[0].allowed).to.equal(false);
    });

    it("限额策略应正确检查金额", async function () {
      await engine.addSpendingLimitPolicy(
        agent.address,
        ethers.parseEther("5"),
        ethers.parseEther("1"),
        "限额"
      );

      // 限额内
      const results = await engine.checkAllPolicies(
        agent.address,
        recipient.address,
        ethers.parseEther("0.5")
      );
      expect(results[0].allowed).to.equal(true);

      // 超出单笔限额
      const results2 = await engine.checkAllPolicies(
        agent.address,
        recipient.address,
        ethers.parseEther("2")
      );
      expect(results2[0].allowed).to.equal(false);
    });
  });
});