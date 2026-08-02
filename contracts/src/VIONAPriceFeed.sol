// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/**
 * @title VIONAPriceFeed
 * @notice On-chain price oracle for VIONA Trader.
 *         Owner pushes prices from off-chain data (Yahoo Finance + Robinhood API).
 *         Prices are denominated in USDG with 6 decimal places.
 */
contract VIONAPriceFeed {
    address public owner;

    /// @dev symbol (up to 12 chars, zero-padded) => price in USDG micro-units (1e6 = $1.00)
    mapping(bytes32 => uint256) private _prices;
    mapping(bytes32 => uint256) private _updatedAt;

    uint256 public constant PRICE_STALENESS = 3 minutes;

    event PriceUpdated(bytes32 indexed symbol, uint256 price, uint256 timestamp);
    event OwnershipTransferred(address indexed prev, address indexed next);

    error NotOwner();
    error StalePrice(bytes32 symbol);
    error ZeroPrice();
    error ZeroAddress();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    /// @notice Encode a ticker symbol to bytes32 key.
    function symbolKey(string calldata symbol) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(symbol));
    }

    /// @notice Push a single price. Price must be in USDG micro-units (6 decimals).
    function setPrice(string calldata symbol, uint256 price) external onlyOwner {
        if (price == 0) revert ZeroPrice();
        bytes32 key = keccak256(abi.encodePacked(symbol));
        _prices[key]    = price;
        _updatedAt[key] = block.timestamp;
        emit PriceUpdated(key, price, block.timestamp);
    }

    /// @notice Push multiple prices in one transaction.
    function setPrices(
        string[] calldata symbols,
        uint256[] calldata prices
    ) external onlyOwner {
        uint256 n = symbols.length;
        for (uint256 i = 0; i < n; i++) {
            if (prices[i] == 0) revert ZeroPrice();
            bytes32 key = keccak256(abi.encodePacked(symbols[i]));
            _prices[key]    = prices[i];
            _updatedAt[key] = block.timestamp;
            emit PriceUpdated(key, prices[i], block.timestamp);
        }
    }

    /// @notice Get price and last update timestamp for a symbol.
    function getPrice(string calldata symbol)
        external
        view
        returns (uint256 price, uint256 updatedAt)
    {
        bytes32 key = keccak256(abi.encodePacked(symbol));
        price     = _prices[key];
        updatedAt = _updatedAt[key];
    }

    /// @notice Like getPrice but reverts if the price is stale.
    function getPriceFresh(string calldata symbol)
        external
        view
        returns (uint256 price)
    {
        bytes32 key = keccak256(abi.encodePacked(symbol));
        price = _prices[key];
        if (price == 0 || block.timestamp - _updatedAt[key] > PRICE_STALENESS)
            revert StalePrice(key);
    }
}
