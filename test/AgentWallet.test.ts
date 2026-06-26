import { expect } from "chai";
import { ethers } from "hardhat";
import { AgentWallet, PolicyEngine, StrategyManager } from "../typechain-types";

describe("AgentWallet", function () {
  let wallet: AgentWallet;
  let owner: any;
  let agent: any;
  let user: any;

  beforeEach(async function () {
    [owner, agent, user] = await ethers.getSigners();

    const AgentWallet = await ethers.getContractFactory("AgentWallet");
    wallet = await AgentWallet.deploy();
    await wallet.waitForDeployment();
  });

  describe("Deployment", function () {
    it("should set the owner correctly", async function () {
      expect(await wallet.owner()).to.equal(owner.address);
    });

    it("should start with zero balance", async function () {
      expect(await wallet.getBalance()).to.equal(0);
    });

    it("should not be paused initially", async function () {
      expect(await wallet.emergencyPaused()).to.equal(false);
    });
  });

  describe("Agent Management", function () {
    it("should register an agent", async function () {
      const tx = await wallet.registerAgent(
        agent.address,
        "Test Agent",
        "A test agent",
        ethers.parseEther("1"),
        ethers.parseEther("0.1")
      );
      await tx.wait();

      const info = await wallet.getAgentInfo(agent.address);
      expect(info.name).to.equal("Test Agent");
      expect(info.active).to.equal(true);
    });

    it("should not allow duplicate agent registration", async function () {
      await wallet.registerAgent(
        agent.address,
        "Test Agent",
        "A test agent",
        ethers.parseEther("1"),
        ethers.parseEther("0.1")
      );

      await expect(
        wallet.registerAgent(
          agent.address,
          "Another Agent",
          "Duplicate",
          ethers.parseEther("1"),
          ethers.parseEther("0.1")
        )
      ).to.be.revertedWith("AgentWallet: agent already registered");
    });

    it("should deactivate and reactivate an agent", async function () {
      await wallet.registerAgent(
        agent.address,
        "Test Agent",
        "A test agent",
        ethers.parseEther("1"),
        ethers.parseEther("0.1")
      );

      await wallet.deactivateAgent(agent.address);
      const infoAfterDeactivate = await wallet.getAgentInfo(agent.address);
      expect(infoAfterDeactivate.active).to.equal(false);

      await wallet.reactivateAgent(agent.address);
      const infoAfterReactivate = await wallet.getAgentInfo(agent.address);
      expect(infoAfterReactivate.active).to.equal(true);
    });
  });

  describe("Transaction Execution", function () {
    beforeEach(async function () {
      await wallet.registerAgent(
        agent.address,
        "Test Agent",
        "A test agent",
        ethers.parseEther("1"),
        ethers.parseEther("0.1")
      );

      // Fund the wallet
      await owner.sendTransaction({
        to: await wallet.getAddress(),
        value: ethers.parseEther("1"),
      });
    });

    it("should execute ETH transfer as agent", async function () {
      const balanceBefore = await ethers.provider.getBalance(user.address);
      await wallet.connect(agent).executeTransfer(user.address, ethers.parseEther("0.1"));
      const balanceAfter = await ethers.provider.getBalance(user.address);
      expect(balanceAfter - balanceBefore).to.equal(ethers.parseEther("0.1"));
    });

    it("should reject transfer exceeding per-tx limit", async function () {
      await expect(
        wallet.connect(agent).executeTransfer(user.address, ethers.parseEther("0.5"))
      ).to.be.revertedWith("AgentWallet: exceeds per-tx limit");
    });

    it("should reject transfer when paused", async function () {
      await wallet.pause();
      await expect(
        wallet.connect(agent).executeTransfer(user.address, ethers.parseEther("0.01"))
      ).to.be.revertedWith("AgentWallet: emergency paused");
    });

    it("should track transaction history", async function () {
      await wallet.connect(agent).executeTransfer(user.address, ethers.parseEther("0.05"));
      const history = await wallet.getTransactionHistory(agent.address, 0, 10);
      expect(history.length).to.equal(1);
      expect(history[0].target).to.equal(user.address);
      expect(history[0].value).to.equal(ethers.parseEther("0.05"));
      expect(history[0].success).to.equal(true);
    });
  });

  describe("Policy Management", function () {
    it("should update agent policy", async function () {
      await wallet.registerAgent(
        agent.address,
        "Test Agent",
        "A test agent",
        ethers.parseEther("1"),
        ethers.parseEther("0.1")
      );

      await wallet.updatePolicy(
        agent.address,
        ethers.parseEther("2"),
        ethers.parseEther("0.5")
      );

      const policy = await wallet.getAgentPolicy(agent.address);
      expect(policy.dailyLimit).to.equal(ethers.parseEther("2"));
      expect(policy.perTxLimit).to.equal(ethers.parseEther("0.5"));
    });

    it("should manage whitelist", async function () {
      await wallet.addToWhitelist(user.address);
      expect(await wallet.whitelistedAddresses(user.address)).to.equal(true);

      await wallet.removeFromWhitelist(user.address);
      expect(await wallet.whitelistedAddresses(user.address)).to.equal(false);
    });
  });

  describe("Ownership", function () {
    it("should transfer ownership", async function () {
      await wallet.transferOwnership(user.address);
      expect(await wallet.owner()).to.equal(user.address);
    });

    it("should only allow owner to transfer ownership", async function () {
      await expect(
        wallet.connect(agent).transferOwnership(user.address)
      ).to.be.revertedWith("AgentWallet: only owner");
    });
  });
});
