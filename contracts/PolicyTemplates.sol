// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title PolicyTemplates
 * @notice 预置策略模板 — 开箱即用的常见策略组合
 * @dev 提供常见场景的策略模板，方便快速配置 Agent 权限
 */
library PolicyTemplates {
    /// @notice 保守型策略 — 低限额、严格白名单
    /// @return dailyLimit 日限额 (0.1 ETH)
    /// @return perTxLimit 单笔限额 (0.01 ETH)
    /// @return rateLimit 每小时最多交易数
    function conservative() external pure returns (
        uint256 dailyLimit,
        uint256 perTxLimit,
        uint256 rateLimit
    ) {
        return (
            0.1 ether,      // 日限额 0.1 ETH
            0.01 ether,     // 单笔限额 0.01 ETH
            5               // 每小时最多 5 笔
        );
    }

    /// @notice 平衡型策略 — 中等限额、常用白名单
    /// @return dailyLimit 日限额 (1 ETH)
    /// @return perTxLimit 单笔限额 (0.1 ETH)
    /// @return rateLimit 每小时最多交易数
    function balanced() external pure returns (
        uint256 dailyLimit,
        uint256 perTxLimit,
        uint256 rateLimit
    ) {
        return (
            1 ether,        // 日限额 1 ETH
            0.1 ether,      // 单笔限额 0.1 ETH
            20              // 每小时最多 20 笔
        );
    }

    /// @notice 激进型策略 — 高限额、宽松限制
    /// @return dailyLimit 日限额 (10 ETH)
    /// @return perTxLimit 单笔限额 (1 ETH)
    /// @return rateLimit 每小时最多交易数
    function aggressive() external pure returns (
        uint256 dailyLimit,
        uint256 perTxLimit,
        uint256 rateLimit
    ) {
        return (
            10 ether,       // 日限额 10 ETH
            1 ether,        // 单笔限额 1 ETH
            100             // 每小时最多 100 笔
        );
    }

    /// @notice DeFi 自动理财策略 — 仅允许与指定 DeFi 协议交互
    /// @return allowedProtocols 允许的 DeFi 协议地址列表
    function defiProtocols() external pure returns (address[] memory allowedProtocols) {
        allowedProtocols = new address[](4);
        // 注意：以下为 Sepolia 测试网地址示例，部署时需替换
        allowedProtocols[0] = address(0x1); // Uniswap V3 Router
        allowedProtocols[1] = address(0x2); // Aave V3 Pool
        allowedProtocols[2] = address(0x3); // Curve Pool
        allowedProtocols[3] = address(0x4); // Lido StETH
    }

    /// @notice NFT 交易策略 — 仅允许与 NFT 市场交互
    /// @return dailyLimit 日限额
    /// @return allowedMarkets 允许的 NFT 市场地址列表
    function nftTrader() external pure returns (
        uint256 dailyLimit,
        address[] memory allowedMarkets
    ) {
        dailyLimit = 5 ether;  // 日限额 5 ETH
        allowedMarkets = new address[](2);
        allowedMarkets[0] = address(0x5); // OpenSea
        allowedMarkets[1] = address(0x6); // Blur
    }

    /// @notice 跨链桥策略 — 仅允许与跨链桥合约交互
    /// @return dailyLimit 日限额
    /// @return allowedBridges 允许的跨链桥地址列表
    function crossChainBridge() external pure returns (
        uint256 dailyLimit,
        address[] memory allowedBridges
    ) {
        dailyLimit = 2 ether;  // 日限额 2 ETH
        allowedBridges = new address[](3);
        allowedBridges[0] = address(0x7); // LayerZero
        allowedBridges[1] = address(0x8); // Wormhole
        allowedBridges[2] = address(0x9); // Stargate
    }
}
