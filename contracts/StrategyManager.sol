// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title StrategyManager
 * @notice DeFi 自动理财策略管理器
 * @dev 管理多个 DeFi 策略的执行、暂停和切换
 *
 * 支持的策略类型：
 * 1. 稳定币挖矿策略（Aave V3 存 USDC）
 * 2. 流动性提供策略（Uniswap V3 LP）
 * 3. 自动复投策略
 * 4. 再平衡策略
 */
contract StrategyManager {
    // ============ 类型定义 ============

    /// @notice 策略状态
    enum StrategyStatus {
        Inactive,
        Active,
        Paused,
        Error
    }

    /// @notice 策略类型
    enum StrategyType {
        Lending,        // 借贷挖矿
        LiquidityPool,  // 流动性提供
        AutoCompound,   // 自动复投
        Rebalance       // 再平衡
    }

    /// @notice 策略结构体
    struct Strategy {
        StrategyType strategyType;
        StrategyStatus status;
        address targetContract;     // 目标合约地址
        bytes initParams;           // 初始化参数
        uint256 allocatedAmount;    // 分配资金
        uint256 createdAt;
        uint256 lastExecutedAt;
        uint256 totalEarned;        // 累计收益
        string name;
        string description;
    }

    /// @notice 执行结果
    struct ExecutionResult {
        bool success;
        uint256 gasUsed;
        uint256 profit;
        string errorMessage;
    }

    // ============ 状态变量 ============

    /// @notice 合约所有者
    address public owner;

    /// @notice Agent 钱包地址
    address public walletAddress;

    /// @notice 策略引擎地址
    address public policyEngine;

    /// @notice 策略列表
    Strategy[] public strategies;

    /// @notice 策略名称 => 索引
    mapping(string => uint256) public strategyIndex;

    /// @notice 总管理资产
    uint256 public totalAUM;

    // ============ 事件 ============

    event StrategyAdded(uint256 indexed strategyId, string name, StrategyType indexed strategyType);
    event StrategyExecuted(uint256 indexed strategyId, bool success, uint256 profit);
    event StrategyStatusChanged(uint256 indexed strategyId, StrategyStatus status);
    event StrategyRemoved(uint256 indexed strategyId);
    event AUMUpdated(uint256 newAUM);

    // ============ 修饰器 ============

    modifier onlyOwner() {
        require(msg.sender == owner, "StrategyManager: only owner");
        _;
    }

    modifier onlyWallet() {
        require(msg.sender == walletAddress, "StrategyManager: only wallet");
        _;
    }

    // ============ 构造函数 ============

    constructor(address _walletAddress, address _policyEngine) {
        owner = msg.sender;
        walletAddress = _walletAddress;
        policyEngine = _policyEngine;
    }

    // ============ 策略管理 ============

    /// @notice 添加新策略
    function addStrategy(
        string calldata _name,
        StrategyType _strategyType,
        address _targetContract,
        bytes calldata _initParams,
        uint256 _allocatedAmount,
        string calldata _description
    ) external onlyOwner {
        require(strategyIndex[_name] == 0, "StrategyManager: strategy already exists");
        require(_targetContract != address(0), "StrategyManager: invalid target");

        strategies.push(Strategy({
            strategyType: _strategyType,
            status: StrategyStatus.Inactive,
            targetContract: _targetContract,
            initParams: _initParams,
            allocatedAmount: _allocatedAmount,
            createdAt: block.timestamp,
            lastExecutedAt: 0,
            totalEarned: 0,
            name: _name,
            description: _description
        }));

        strategyIndex[_name] = strategies.length;
        totalAUM += _allocatedAmount;

        emit StrategyAdded(strategies.length - 1, _name, _strategyType);
        emit AUMUpdated(totalAUM);
    }

    /// @notice 激活策略
    function activateStrategy(uint256 _strategyId) external onlyOwner {
        require(_strategyId < strategies.length, "StrategyManager: invalid id");
        require(strategies[_strategyId].status == StrategyStatus.Inactive ||
                strategies[_strategyId].status == StrategyStatus.Paused,
                "StrategyManager: invalid status transition");

        strategies[_strategyId].status = StrategyStatus.Active;
        emit StrategyStatusChanged(_strategyId, StrategyStatus.Active);
    }

    /// @notice 暂停策略
    function pauseStrategy(uint256 _strategyId) external onlyOwner {
        require(_strategyId < strategies.length, "StrategyManager: invalid id");
        require(strategies[_strategyId].status == StrategyStatus.Active,
                "StrategyManager: strategy not active");

        strategies[_strategyId].status = StrategyStatus.Paused;
        emit StrategyStatusChanged(_strategyId, StrategyStatus.Paused);
    }

    /// @notice 移除策略
    function removeStrategy(uint256 _strategyId) external onlyOwner {
        require(_strategyId < strategies.length, "StrategyManager: invalid id");

        totalAUM -= strategies[_strategyId].allocatedAmount;

        uint256 lastIndex = strategies.length - 1;
        if (_strategyId != lastIndex) {
            strategies[_strategyId] = strategies[lastIndex];
            strategyIndex[strategies[_strategyId].name] = _strategyId + 1;
        }
        strategies.pop();

        emit StrategyRemoved(_strategyId);
        emit AUMUpdated(totalAUM);
    }

    // ============ 策略执行 ============

    /// @notice 执行策略（由 Agent 调用）
    function executeStrategy(
        uint256 _strategyId,
        bytes calldata _executionData
    ) external onlyWallet returns (ExecutionResult memory result) {
        require(_strategyId < strategies.length, "StrategyManager: invalid id");
        require(strategies[_strategyId].status == StrategyStatus.Active,
                "StrategyManager: strategy not active");

        Strategy storage strategy = strategies[_strategyId];

        // 执行策略调用
        (bool success, bytes memory returnData) = strategy.targetContract.call(_executionData);

        result.success = success;
        result.gasUsed = gasleft();

        if (success) {
            strategy.lastExecutedAt = block.timestamp;
            strategy.status = StrategyStatus.Active;

            // 尝试解析收益（假设返回 uint256）
            if (returnData.length >= 32) {
                result.profit = abi.decode(returnData, (uint256));
                strategy.totalEarned += result.profit;
            }
        } else {
            strategy.status = StrategyStatus.Error;
            if (returnData.length > 0) {
                result.errorMessage = string(returnData);
            } else {
                result.errorMessage = "Strategy execution failed";
            }
        }

        emit StrategyExecuted(_strategyId, success, result.profit);
    }

    // ============ 查询函数 ============

    /// @notice 获取策略数量
    function getStrategyCount() external view returns (uint256) {
        return strategies.length;
    }

    /// @notice 获取所有活跃策略
    function getActiveStrategies() external view returns (uint256[] memory activeIds) {
        uint256 count = 0;
        for (uint256 i = 0; i < strategies.length; i++) {
            if (strategies[i].status == StrategyStatus.Active) {
                count++;
            }
        }

        activeIds = new uint256[](count);
        uint256 index = 0;
        for (uint256 i = 0; i < strategies.length; i++) {
            if (strategies[i].status == StrategyStatus.Active) {
                activeIds[index] = i;
                index++;
            }
        }
    }

    /// @notice 获取总收益
    function getTotalEarnings() external view returns (uint256) {
        uint256 total = 0;
        for (uint256 i = 0; i < strategies.length; i++) {
            total += strategies[i].totalEarned;
        }
        return total;
    }

    /// @notice 获取策略详情
    function getStrategy(uint256 _strategyId) external view returns (Strategy memory) {
        require(_strategyId < strategies.length, "StrategyManager: invalid id");
        return strategies[_strategyId];
    }
}
