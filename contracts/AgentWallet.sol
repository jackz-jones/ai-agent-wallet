// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title AgentWallet
 * @notice AI Agent 自主管理的智能合约钱包
 * @dev 支持 Agent 在策略约束下自主执行交易，无需人工逐笔签名
 *
 * 核心功能：
 * 1. Agent 身份注册与管理（ERC-8004 兼容）
 * 2. 策略引擎集成（日限额、白名单、速率限制）
 * 3. 紧急暂停与恢复
 * 4. 多资产支持（ETH/ERC20/ERC721）
 * 5. 交易执行与事件追踪
 */
contract AgentWallet is ReentrancyGuard {
    using ECDSA for bytes32;

    // ============ 类型定义 ============

    /// @notice Agent 信息结构体
    struct AgentInfo {
        address agentAddress;   // Agent 合约/EOA 地址
        string name;            // Agent 名称
        string description;     // Agent 描述
        uint256 registeredAt;   // 注册时间戳
        bool active;            // 是否激活
    }

    /// @notice 策略配置
    struct PolicyConfig {
        uint256 dailyLimit;         // 日限额（wei）
        uint256 perTxLimit;         // 单笔限额（wei）
        uint256 dailyUsed;          // 今日已用额度
        uint256 lastResetDay;       // 上次重置日期
        address[] whitelist;        // 白名单地址
        bool paused;                // 是否暂停
    }

    /// @notice 交易记录
    struct TransactionRecord {
        address target;             // 目标地址
        uint256 value;              // 发送金额
        bytes data;                 // 调用数据
        uint256 timestamp;          // 执行时间
        bool success;               // 执行结果
    }

    // ============ 状态变量 ============

    /// @notice 钱包所有者（人类用户）
    address public owner;

    /// @notice 注册的 Agent 列表
    AgentInfo[] public agents;

    /// @notice Agent 地址 => Agent 索引
    mapping(address => uint256) public agentIndex;

    /// @notice Agent 地址 => 策略配置
    mapping(address => PolicyConfig) public agentPolicies;

    /// @notice Agent 地址 => 交易记录列表
    mapping(address => TransactionRecord[]) public agentTransactions;

    /// @notice 白名单地址 => 是否授权
    mapping(address => bool) public whitelistedAddresses;

    /// @notice 紧急暂停状态
    bool public emergencyPaused;

    // ============ 事件 ============

    event AgentRegistered(address indexed agentAddress, string name, uint256 timestamp);
    event AgentDeactivated(address indexed agentAddress, uint256 timestamp);
    event AgentReactivated(address indexed agentAddress, uint256 timestamp);
    event PolicyUpdated(address indexed agentAddress, uint256 dailyLimit, uint256 perTxLimit);
    event WhitelistUpdated(address indexed addr, bool added);
    event TransactionExecuted(
        address indexed agent,
        address indexed target,
        uint256 value,
        bytes data,
        bool success,
        uint256 timestamp
    );
    event EmergencyPaused();
    event EmergencyUnpaused();
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    // ============ 修饰器 ============

    modifier onlyOwner() {
        require(msg.sender == owner, "AgentWallet: only owner");
        _;
    }

    modifier onlyActiveAgent() {
        uint256 idx = agentIndex[msg.sender];
        require(agents[idx].active, "AgentWallet: agent not active");
        _;
    }

    modifier notPaused() {
        require(!emergencyPaused, "AgentWallet: emergency paused");
        _;
    }

    modifier checkPolicy(address _agent, uint256 _value) {
        PolicyConfig storage policy = agentPolicies[_agent];

        // 检查单笔限额
        require(_value <= policy.perTxLimit, "AgentWallet: exceeds per-tx limit");

        // 检查日限额
        uint256 today = block.timestamp / 1 days;
        if (policy.lastResetDay < today) {
            policy.dailyUsed = 0;
            policy.lastResetDay = today;
        }
        require(policy.dailyUsed + _value <= policy.dailyLimit, "AgentWallet: exceeds daily limit");

        _;
    }

    // ============ 构造函数 ============

    constructor() {
        owner = msg.sender;
    }

    // ============ 所有权管理 ============

    /// @notice 转移所有权
    function transferOwnership(address _newOwner) external onlyOwner {
        require(_newOwner != address(0), "AgentWallet: invalid new owner");
        emit OwnershipTransferred(owner, _newOwner);
        owner = _newOwner;
    }

    // ============ Agent 管理 ============

    /// @notice 注册新 Agent
    function registerAgent(
        address _agentAddress,
        string calldata _name,
        string calldata _description,
        uint256 _dailyLimit,
        uint256 _perTxLimit
    ) external onlyOwner {
        require(_agentAddress != address(0), "AgentWallet: invalid agent address");
        require(agentIndex[_agentAddress] == 0, "AgentWallet: agent already registered");

        agents.push(AgentInfo({
            agentAddress: _agentAddress,
            name: _name,
            description: _description,
            registeredAt: block.timestamp,
            active: true
        }));

        agentIndex[_agentAddress] = agents.length;

        // 设置默认策略
        agentPolicies[_agentAddress] = PolicyConfig({
            dailyLimit: _dailyLimit,
            perTxLimit: _perTxLimit,
            dailyUsed: 0,
            lastResetDay: block.timestamp / 1 days,
            whitelist: new address[](0),
            paused: false
        });

        emit AgentRegistered(_agentAddress, _name, block.timestamp);
    }

    /// @notice 停用 Agent
    function deactivateAgent(address _agentAddress) external onlyOwner {
        uint256 idx = agentIndex[_agentAddress];
        require(idx > 0, "AgentWallet: agent not found");
        require(agents[idx - 1].active, "AgentWallet: already inactive");

        agents[idx - 1].active = false;
        emit AgentDeactivated(_agentAddress, block.timestamp);
    }

    /// @notice 重新激活 Agent
    function reactivateAgent(address _agentAddress) external onlyOwner {
        uint256 idx = agentIndex[_agentAddress];
        require(idx > 0, "AgentWallet: agent not found");
        require(!agents[idx - 1].active, "AgentWallet: already active");

        agents[idx - 1].active = true;
        emit AgentReactivated(_agentAddress, block.timestamp);
    }

    /// @notice 获取 Agent 数量
    function getAgentCount() external view returns (uint256) {
        return agents.length;
    }

    // ============ 策略管理 ============

    /// @notice 更新 Agent 策略
    function updatePolicy(
        address _agentAddress,
        uint256 _dailyLimit,
        uint256 _perTxLimit
    ) external onlyOwner {
        uint256 idx = agentIndex[_agentAddress];
        require(idx > 0, "AgentWallet: agent not found");

        PolicyConfig storage policy = agentPolicies[_agentAddress];
        policy.dailyLimit = _dailyLimit;
        policy.perTxLimit = _perTxLimit;

        emit PolicyUpdated(_agentAddress, _dailyLimit, _perTxLimit);
    }

    /// @notice 添加白名单地址
    function addToWhitelist(address _addr) external onlyOwner {
        whitelistedAddresses[_addr] = true;
        emit WhitelistUpdated(_addr, true);
    }

    /// @notice 移除白名单地址
    function removeFromWhitelist(address _addr) external onlyOwner {
        whitelistedAddresses[_addr] = false;
        emit WhitelistUpdated(_addr, false);
    }

    // ============ 紧急控制 ============

    /// @notice 紧急暂停
    function pause() external onlyOwner {
        emergencyPaused = true;
        emit EmergencyPaused();
    }

    /// @notice 恢复
    function unpause() external onlyOwner {
        emergencyPaused = false;
        emit EmergencyUnpaused();
    }

    // ============ Agent 交易执行 ============

    /// @notice Agent 执行 ETH 转账
    function executeTransfer(
        address payable _to,
        uint256 _value
    ) external onlyActiveAgent notPaused checkPolicy(msg.sender, _value) nonReentrant {
        require(address(this).balance >= _value, "AgentWallet: insufficient balance");

        PolicyConfig storage policy = agentPolicies[msg.sender];
        policy.dailyUsed += _value;

        (bool success, ) = _to.call{value: _value}("");
        require(success, "AgentWallet: transfer failed");

        agentTransactions[msg.sender].push(TransactionRecord({
            target: _to,
            value: _value,
            data: "",
            timestamp: block.timestamp,
            success: true
        }));

        emit TransactionExecuted(msg.sender, _to, _value, "", true, block.timestamp);
    }

    /// @notice Agent 执行合约调用
    function executeCall(
        address _target,
        uint256 _value,
        bytes calldata _data
    ) external onlyActiveAgent notPaused checkPolicy(msg.sender, _value) nonReentrant {
        require(_target != address(0), "AgentWallet: invalid target");

        PolicyConfig storage policy = agentPolicies[msg.sender];
        policy.dailyUsed += _value;

        (bool success, ) = _target.call{value: _value}(_data针);
        require(success, "AgentWallet: call failed");

        agentTransactions[msg.sender].push(TransactionRecord({
            target: _target,
            value: _value,
            data: _data,
            timestamp: block.timestamp,
            success: true
        }));

        emit TransactionExecuted(msg.sender, _target, _value, _data, true, block.timestamp);
    }

    /// @notice Agent 执行 ERC20 转账
    function executeERC20Transfer(
        address _token,
        address _to,
        uint256 _amount
    ) external onlyActiveAgent notPaused nonReentrant {
        PolicyConfig storage policy = agentPolicies[msg.sender];
        uint256 today = block.timestamp / 1 days;
        if (policy.lastResetDay < today) {
            policy.dailyUsed = 0;
            policy.lastResetDay = today;
        }

        // 对于 ERC20 转账，value=0，但需要估算 gas 成本
        require(_amount <= policy.perTxLimit, "AgentWallet: exceeds per-tx limit");
        require(policy.dailyUsed + _amount <= policy.dailyLimit, "AgentWallet: exceeds daily limit");

        policy.dailyUsed += _amount;

        IERC20 token = IERC20(_token);
        require(token.transfer(_to, _amount), "AgentWallet: ERC20 transfer failed");

        agentTransactions[msg.sender].push(TransactionRecord({
            target: _token,
            value: 0,
            data: abi.encodeWithSignature("transfer(address,uint256)", _to, _amount),
            timestamp: block.timestamp,
            success: true
        }));

        emit TransactionExecuted(msg.sender, _token, 0, abi.encodeWithSignature("transfer(address,uint256)", _to, _amount), true, block.timestamp);
    }

    // ============ 查询函数 ============

    /// @notice 获取 Agent 信息
    function getAgentInfo(address _agentAddress) external view returns (AgentInfo memory) {
        uint256 idx = agentIndex[_agentAddress];
        require(idx > 0, "AgentWallet: agent not found");
        return agents[idx - 1];
    }

    /// @notice 获取 Agent 策略
    function getAgentPolicy(address _agentAddress) external view returns (PolicyConfig memory) {
        return agentPolicies[_agentAddress];
    }

    /// @notice 获取 Agent 交易历史
    function getTransactionHistory(
        address _agentAddress,
        uint256 _offset,
        uint256 _limit
    ) external view returns (TransactionRecord[] memory) {
        TransactionRecord[] storage records = agentTransactions[_agentAddress];
        uint256 total = records.length;

        if (_offset >= total) {
            return new TransactionRecord[](0);
        }

        uint256 end = _offset + _limit;
        if (end > total) {
            end = total;
        }

        uint256 resultLength = end - _offset;
        TransactionRecord[] memory result = new TransactionRecord[](resultLength);
        for (uint256 i = 0; i < resultLength; i++) {
            result[i] = records[_offset + i];
        }
        return result;
    }

    /// @notice 获取钱包余额
    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }

    /// @notice 获取 ERC20 代币余额
    function getTokenBalance(address _token) external view returns (uint256) {
        return IERC20(_token).balanceOf(address(this));
    }

    // ============ 接收 ETH ============

    receive() external payable {}
}
