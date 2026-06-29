// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title PolicyEngine
 * @notice AI Agent 策略引擎 — 管理 Agent 的权限和限制
 * @dev 支持白名单/黑名单、限额、速率限制、时间窗口、滑点保护等策略
 *
 * 策略类型：
 * 1. WhitelistPolicy — 只允许与白名单地址交互
 * 2. BlacklistPolicy — 禁止与黑名单地址交互
 * 3. SpendingLimitPolicy — 日限额/单笔限额
 * 4. RateLimitPolicy — 速率限制（每分钟/每小时最大交易数）
 * 5. TimeWindowPolicy — 仅在指定时间窗口内允许交易
 * 6. SlippagePolicy — DEX 交易滑点保护（限制最大滑点）
 */
contract PolicyEngine {
    // ============ 类型定义 ============

    /// @notice 策略类型枚举
    enum PolicyType {
        Whitelist,
        Blacklist,
        SpendingLimit,
        RateLimit,
        TimeWindow,
        Slippage
    }

    /// @notice 策略状态
    enum PolicyStatus {
        Active,
        Inactive,
        Expired
    }

    /// @notice 策略结构体
    struct Policy {
        PolicyType policyType;
        PolicyStatus status;
        bytes params;           // 策略参数（ABI 编码）
        uint256 createdAt;
        uint256 updatedAt;
        string description;
    }

    /// @notice 白名单策略参数
    struct WhitelistParams {
        address[] allowedAddresses;
    }

    /// @notice 黑名单策略参数
    struct BlacklistParams {
        address[] blockedAddresses;
    }

    /// @notice 限额策略参数
    struct SpendingLimitParams {
        uint256 dailyLimit;
        uint256 perTxLimit;
        uint256 dailyUsed;
        uint256 lastResetDay;
    }

    /// @notice 速率限制策略参数
    struct RateLimitParams {
        uint256 maxTransactions;    // 时间窗口内最大交易数
        uint256 windowDuration;     // 时间窗口（秒）
        uint256[] timestamps;       // 交易时间戳列表（循环缓冲区）
        uint256 currentIndex;       // 当前索引
    }

    /// @notice 时间窗口策略参数
    struct TimeWindowParams {
        uint256 startTime;          // 窗口开始时间（秒从午夜开始）
        uint256 endTime;            // 窗口结束时间（秒从午夜开始）
        uint256[] allowedDays;      // 允许的星期几（0=周日, 1=周一, ...）
    }

    /// @notice 滑点保护策略参数
    struct SlippageParams {
        bool enabled;               // 是否启用滑点保护
        uint256 maxSlippageBps;     // 最大滑点（基点，1% = 100 bps，如 1% → 100，0.5% → 50）
    }

    /// @notice 策略检查结果
    struct PolicyCheckResult {
        bool allowed;
        string reason;
    }

    // ============ 状态变量 ============

    /// @notice 合约所有者
    address public owner;

    /// @notice Agent 地址 => 策略列表
    mapping(address => Policy[]) public agentPolicies;

    /// @notice Agent 地址 => 白名单参数
    mapping(address => WhitelistParams) internal whitelistParams;

    /// @notice Agent 地址 => 黑名单参数
    mapping(address => BlacklistParams) internal blacklistParams;

    /// @notice Agent 地址 => 限额参数
    mapping(address => SpendingLimitParams) public spendingLimitParams;

    /// @notice Agent 地址 => 速率限制参数
    mapping(address => RateLimitParams) public rateLimitParams;

    /// @notice Agent 地址 => 时间窗口参数
    mapping(address => TimeWindowParams) public timeWindowParams;

    /// @notice Agent 地址 => 滑点保护参数
    mapping(address => SlippageParams) public slippageParams;

    /// @notice 钱包合约地址（授权调用者）
    address public walletAddress;

    // ============ 事件 ============

    event PolicyAdded(address indexed agent, PolicyType indexed policyType, string description);
    event PolicyRemoved(address indexed agent, uint256 policyIndex);
    event PolicyUpdated(address indexed agent, uint256 policyIndex);
    event PolicyCheck(address indexed agent, address indexed target, bool allowed, string reason);
    event WalletAddressUpdated(address indexed newWallet);

    // ============ 修饰器 ============

    modifier onlyOwner() {
        require(msg.sender == owner, "PolicyEngine: only owner");
        _;
    }

    modifier onlyWallet() {
        require(msg.sender == walletAddress, "PolicyEngine: only wallet");
        _;
    }

    // ============ 构造函数 ============

    constructor(address _walletAddress) {
        owner = msg.sender;
        walletAddress = _walletAddress;
    }

    // ============ 管理函数 ============

    /// @notice 更新钱包合约地址
    function updateWalletAddress(address _newWallet) external onlyOwner {
        walletAddress = _newWallet;
        emit WalletAddressUpdated(_newWallet);
    }

    // ============ 策略管理 ============

    /// @notice 为 Agent 添加白名单策略
    function addWhitelistPolicy(
        address _agent,
        address[] calldata _allowedAddresses,
        string calldata _description
    ) external onlyOwner {
        whitelistParams[_agent] = WhitelistParams({
            allowedAddresses: _allowedAddresses
        });

        agentPolicies[_agent].push(Policy({
            policyType: PolicyType.Whitelist,
            status: PolicyStatus.Active,
            params: abi.encode(_allowedAddresses),
            createdAt: block.timestamp,
            updatedAt: block.timestamp,
            description: _description
        }));

        emit PolicyAdded(_agent, PolicyType.Whitelist, _description);
    }

    /// @notice 为 Agent 添加黑名单策略
    function addBlacklistPolicy(
        address _agent,
        address[] calldata _blockedAddresses,
        string calldata _description
    ) external onlyOwner {
        blacklistParams[_agent] = BlacklistParams({
            blockedAddresses: _blockedAddresses
        });

        agentPolicies[_agent].push(Policy({
            policyType: PolicyType.Blacklist,
            status: PolicyStatus.Active,
            params: abi.encode(_blockedAddresses),
            createdAt: block.timestamp,
            updatedAt: block.timestamp,
            description: _description
        }));

        emit PolicyAdded(_agent, PolicyType.Blacklist, _description);
    }

    /// @notice 为 Agent 添加限额策略
    function addSpendingLimitPolicy(
        address _agent,
        uint256 _dailyLimit,
        uint256 _perTxLimit,
        string calldata _description
    ) external onlyOwner {
        spendingLimitParams[_agent] = SpendingLimitParams({
            dailyLimit: _dailyLimit,
            perTxLimit: _perTxLimit,
            dailyUsed: 0,
            lastResetDay: block.timestamp / 1 days
        });

        agentPolicies[_agent].push(Policy({
            policyType: PolicyType.SpendingLimit,
            status: PolicyStatus.Active,
            params: abi.encode(_dailyLimit, _perTxLimit),
            createdAt: block.timestamp,
            updatedAt: block.timestamp,
            description: _description
        }));

        emit PolicyAdded(_agent, PolicyType.SpendingLimit, _description);
    }

    /// @notice 为 Agent 添加速率限制策略
    function addRateLimitPolicy(
        address _agent,
        uint256 _maxTransactions,
        uint256 _windowDuration,
        string calldata _description
    ) external onlyOwner {
        rateLimitParams[_agent] = RateLimitParams({
            maxTransactions: _maxTransactions,
            windowDuration: _windowDuration,
            timestamps: new uint256[](_maxTransactions),
            currentIndex: 0
        });

        agentPolicies[_agent].push(Policy({
            policyType: PolicyType.RateLimit,
            status: PolicyStatus.Active,
            params: abi.encode(_maxTransactions, _windowDuration),
            createdAt: block.timestamp,
            updatedAt: block.timestamp,
            description: _description
        }));

        emit PolicyAdded(_agent, PolicyType.RateLimit, _description);
    }

    /// @notice 为 Agent 添加时间窗口策略
    function addTimeWindowPolicy(
        address _agent,
        uint256 _startTime,
        uint256 _endTime,
        uint256[] calldata _allowedDays,
        string calldata _description
    ) external onlyOwner {
        timeWindowParams[_agent] = TimeWindowParams({
            startTime: _startTime,
            endTime: _endTime,
            allowedDays: _allowedDays
        });

        agentPolicies[_agent].push(Policy({
            policyType: PolicyType.TimeWindow,
            status: PolicyStatus.Active,
            params: abi.encode(_startTime, _endTime, _allowedDays),
            createdAt: block.timestamp,
            updatedAt: block.timestamp,
            description: _description
        }));

        emit PolicyAdded(_agent, PolicyType.TimeWindow, _description);
    }

    /// @notice 为 Agent 添加滑点保护策略
    /// @param _agent Agent 地址
    /// @param _maxSlippageBps 最大滑点（基点，1% = 100 bps）
    /// @param _description 策略描述
    function addSlippagePolicy(
        address _agent,
        uint256 _maxSlippageBps,
        string calldata _description
    ) external onlyOwner {
        require(_maxSlippageBps > 0 && _maxSlippageBps <= 1000, "PolicyEngine: slippage bps out of range (1-1000)");

        slippageParams[_agent] = SlippageParams({
            enabled: true,
            maxSlippageBps: _maxSlippageBps
        });

        agentPolicies[_agent].push(Policy({
            policyType: PolicyType.Slippage,
            status: PolicyStatus.Active,
            params: abi.encode(_maxSlippageBps),
            createdAt: block.timestamp,
            updatedAt: block.timestamp,
            description: _description
        }));

        emit PolicyAdded(_agent, PolicyType.Slippage, _description);
    }

    /// @notice 移除 Agent 的策略
    function removePolicy(address _agent, uint256 _policyIndex) external onlyOwner {
        require(_policyIndex < agentPolicies[_agent].length, "PolicyEngine: invalid index");

        uint256 lastIndex = agentPolicies[_agent].length - 1;
        if (_policyIndex != lastIndex) {
            agentPolicies[_agent][_policyIndex] = agentPolicies[_agent][lastIndex];
        }
        agentPolicies[_agent].pop();

        emit PolicyRemoved(_agent, _policyIndex);
    }

    /// @notice 获取 Agent 的策略数量
    function getPolicyCount(address _agent) external view returns (uint256) {
        return agentPolicies[_agent].length;
    }

    // ============ 策略检查 ============

    /// @notice 检查交易是否被允许（由钱包合约调用）
    function checkTransaction(
        address _agent,
        address _target,
        uint256 _value
    ) external onlyWallet returns (bool allowed, string memory reason) {
        Policy[] storage policies = agentPolicies[_agent];

        for (uint256 i = 0; i < policies.length; i++) {
            if (policies[i].status != PolicyStatus.Active) continue;

            PolicyType pType = policies[i].policyType;

            if (pType == PolicyType.Whitelist) {
                (bool ok, string memory errMsg) = checkWhitelist(_agent, _target);
                if (!ok) return (false, errMsg);
            } else if (pType == PolicyType.Blacklist) {
                (bool ok, string memory errMsg) = checkBlacklist(_agent, _target);
                if (!ok) return (false, errMsg);
            } else if (pType == PolicyType.SpendingLimit) {
                (bool ok, string memory errMsg) = checkSpendingLimit(_agent, _value);
                if (!ok) return (false, errMsg);
            } else if (pType == PolicyType.RateLimit) {
                (bool ok, string memory errMsg) = checkRateLimit(_agent);
                if (!ok) return (false, errMsg);
            } else if (pType == PolicyType.TimeWindow) {
                (bool ok, string memory errMsg) = checkTimeWindow(_agent);
                if (!ok) return (false, errMsg);
            } else if (pType == PolicyType.Slippage) {
                // 滑点保护需要通过 checkSlippage 单独调用（因为需要 expectedAmount 和 minAmountOut 参数）
                // 在 checkTransaction 中仅检查滑点策略是否已启用
                SlippageParams storage sp = slippageParams[_agent];
                if (sp.enabled) {
                    // 滑点保护已启用，实际滑点校验在 checkSlippage 中完成
                    continue;
                }
            }
        }

        emit PolicyCheck(_agent, _target, true, "");
        return (true, "");
    }

    /// @notice 白名单检查
    function checkWhitelist(address _agent, address _target) internal view returns (bool, string memory) {
        WhitelistParams storage params = whitelistParams[_agent];
        for (uint256 i = 0; i < params.allowedAddresses.length; i++) {
            if (params.allowedAddresses[i] == _target) {
                return (true, "");
            }
        }
        return (false, "PolicyEngine: target not in whitelist");
    }

    /// @notice 黑名单检查
    function checkBlacklist(address _agent, address _target) internal view returns (bool, string memory) {
        BlacklistParams storage params = blacklistParams[_agent];
        for (uint256 i = 0; i < params.blockedAddresses.length; i++) {
            if (params.blockedAddresses[i] == _target) {
                return (false, "PolicyEngine: target is blacklisted");
            }
        }
        return (true, "");
    }

    /// @notice 限额检查
    function checkSpendingLimit(address _agent, uint256 _value) internal returns (bool, string memory) {
        SpendingLimitParams storage params = spendingLimitParams[_agent];

        uint256 today = block.timestamp / 1 days;
        if (params.lastResetDay < today) {
            params.dailyUsed = 0;
            params.lastResetDay = today;
        }

        if (_value > params.perTxLimit) {
            return (false, "PolicyEngine: exceeds per-tx limit");
        }

        if (params.dailyUsed + _value > params.dailyLimit) {
            return (false, "PolicyEngine: exceeds daily limit");
        }

        params.dailyUsed += _value;
        return (true, "");
    }

    /// @notice 速率限制检查
    function checkRateLimit(address _agent) internal returns (bool, string memory) {
        RateLimitParams storage params = rateLimitParams[_agent];

        uint256 currentTime = block.timestamp;
        uint256 windowStart = currentTime - params.windowDuration;

        // 清理过期的时间戳
        uint256 validCount = 0;
        for (uint256 i = 0; i < params.timestamps.length; i++) {
            if (params.timestamps[i] >= windowStart) {
                validCount++;
            }
        }

        if (validCount >= params.maxTransactions) {
            return (false, "PolicyEngine: rate limit exceeded");
        }

        // 记录当前交易时间戳
        params.timestamps[params.currentIndex] = currentTime;
        params.currentIndex = (params.currentIndex + 1) % params.timestamps.length;

        return (true, "");
    }

    /// @notice 时间窗口检查
    function checkTimeWindow(address _agent) internal view returns (bool, string memory) {
        TimeWindowParams storage params = timeWindowParams[_agent];

        uint256 currentHour = (block.timestamp % 1 days) / 1 hours;
        uint256 currentDay = (block.timestamp / 1 days) % 7;

        // 检查是否在允许的日期
        bool dayAllowed = false;
        for (uint256 i = 0; i < params.allowedDays.length; i++) {
            if (params.allowedDays[i] == currentDay) {
                dayAllowed = true;
                break;
            }
        }

        if (!dayAllowed) {
            return (false, "PolicyEngine: current day not allowed");
        }

        // 检查是否在时间窗口内
        if (currentHour < params.startTime || currentHour >= params.endTime) {
            return (false, "PolicyEngine: outside allowed time window");
        }

        return (true, "");
    }

    /// @notice 滑点保护检查（需由钱包合约在 DEX 交易时调用）
    /// @param _agent Agent 地址
    /// @param _expectedAmount 期望得到的代币数量
    /// @param _minAmountOut 交易参数中设置的最少输出数量
    function checkSlippage(
        address _agent,
        uint256 _expectedAmount,
        uint256 _minAmountOut
    ) external view onlyWallet returns (bool allowed, string memory reason) {
        SlippageParams storage params = slippageParams[_agent];

        if (!params.enabled) return (true, "");
        if (_expectedAmount == 0) return (true, "");

        // 计算实际滑点（基点）
        // slippage = (expectedAmount - minAmountOut) / expectedAmount * 10000
        uint256 slippage = ((_expectedAmount - _minAmountOut) * 10000) / _expectedAmount;

        if (slippage > params.maxSlippageBps) {
            return (false, "PolicyEngine: slippage exceeds limit");
        }
        return (true, "");
    }

    // ============ 批量策略检查 ============

    /// @notice 批量检查所有策略
    function checkAllPolicies(
        address _agent,
        address _target,
        uint256 _value
    ) external view returns (PolicyCheckResult[] memory results) {
        Policy[] storage policies = agentPolicies[_agent];
        results = new PolicyCheckResult[](policies.length);

        for (uint256 i = 0; i < policies.length; i++) {
            if (policies[i].status != PolicyStatus.Active) {
                results[i] = PolicyCheckResult(false, "Policy inactive");
                continue;
            }

            PolicyType pType = policies[i].policyType;

            if (pType == PolicyType.Whitelist) {
                (bool ok, string memory errMsg) = checkWhitelist(_agent, _target);
                results[i] = PolicyCheckResult(ok, errMsg);
            } else if (pType == PolicyType.Blacklist) {
                (bool ok, string memory errMsg) = checkBlacklist(_agent, _target);
                results[i] = PolicyCheckResult(ok, errMsg);
            } else if (pType == PolicyType.SpendingLimit) {
                bool ok = _value <= spendingLimitParams[_agent].perTxLimit;
                results[i] = PolicyCheckResult(ok, ok ? "" : "exceeds per-tx limit");
            } else if (pType == PolicyType.RateLimit) {
                results[i] = PolicyCheckResult(true, "rate limit check at execution");
            } else if (pType == PolicyType.TimeWindow) {
                (bool ok, string memory errMsg) = checkTimeWindow(_agent);
                results[i] = PolicyCheckResult(ok, errMsg);
            } else if (pType == PolicyType.Slippage) {
                SlippageParams storage sp = slippageParams[_agent];
                if (sp.enabled) {
                    results[i] = PolicyCheckResult(true, "slippage check at execution (requires expectedAmount/minAmountOut)");
                } else {
                    results[i] = PolicyCheckResult(true, "slippage protection disabled");
                }
            } else {
                results[i] = PolicyCheckResult(false, "Unknown policy type");
            }
        }
    }
}
