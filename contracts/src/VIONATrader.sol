// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

/**
 * @title VIONATrader v2
 * @notice On-chain CFD position manager for tokenized capital markets.
 *
 * Users can fund positions in two ways:
 *   A) openPosition()          — transfer USDG from wallet (approve + call)
 *   B) openShieldedPosition()  — provide a ZK unshield proof; USDG flows
 *      directly from ShieldedPool → this contract (atomic, no wallet exposure)
 *
 * swapShielded() is a convenience wrapper around openShieldedPosition with
 * isLong=true, framed as "buy this stock from your shielded USDG balance".
 *
 * Price precision: 6 decimals (1_000_000 = $1.00)
 * USDG decimals:   6
 */

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

interface IPriceFeed {
    function getPriceFresh(string calldata symbol) external view returns (uint256);
    function getPrice(string calldata symbol) external view returns (uint256 price, uint256 updatedAt);
}

/// @dev Minimal interface to ShieldedPool — only the spend() call we need.
interface IShieldedPool {
    struct SpendStatement {
        bytes32    membershipRoot;
        bytes32[2] nullifiers;
        bytes32[2] commitments;
        bytes32    newRoot;
        uint256    token;
        uint256    value;      // amount of USDG to send to recipient (6 decimals)
        uint256    fee;
        address    recipient;  // MUST equal address(this) for shielded opens
        address    relayer;
    }
    function spend(
        SpendStatement calldata s,
        bytes[2] calldata ciphertexts,
        bytes calldata proof
    ) external;
}

contract VIONATrader {
    // ── Types ─────────────────────────────────────────────────────────────────

    struct Position {
        address  owner;
        string   symbol;
        uint256  usdgCollateral;  // USDG locked (6 decimals)
        uint256  entryPrice;      // price at open (6 decimals, $1 = 1_000_000)
        uint256  shares;          // collateral / entryPrice (18 decimals)
        bool     isLong;
        uint256  openTime;
        bool     closed;
        bool     fromShield;      // true = funded via ZK unshield, not wallet
    }

    // ── Storage ───────────────────────────────────────────────────────────────

    address    public owner;
    IERC20     public usdg;
    IPriceFeed public priceFeed;
    IShieldedPool public shieldedPool;  // ShieldedPool contract

    uint256 public nextPositionId;
    mapping(uint256 => Position) public positions;
    mapping(address => uint256[]) private _ownerPositions;

    uint256   public constant FEE_BPS = 10; // 0.1%
    address   public feeRecipient;

    // ── Events ────────────────────────────────────────────────────────────────

    event PositionOpened(
        uint256 indexed id,
        address indexed owner,
        string  symbol,
        bool    isLong,
        uint256 usdgCollateral,
        uint256 entryPrice,
        uint256 shares,
        bool    fromShield
    );

    event PositionClosed(
        uint256 indexed id,
        address indexed owner,
        string  symbol,
        bool    isLong,
        uint256 entryPrice,
        uint256 exitPrice,
        int256  pnl,
        uint256 usdgReturned
    );

    event OwnershipTransferred(address indexed prev, address indexed next);

    // ── Errors ────────────────────────────────────────────────────────────────

    error NotOwner();
    error NotPositionOwner();
    error PositionAlreadyClosed();
    error ZeroAmount();
    error ZeroAddress();
    error TransferFailed();
    error WrongRecipient();   // s.recipient must be address(this)
    error InsufficientFunds(); // contract didn't receive enough USDG from pool

    // ── Modifiers ─────────────────────────────────────────────────────────────

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    // ── Constructor ───────────────────────────────────────────────────────────

    constructor(
        address _usdg,
        address _priceFeed,
        address _shieldedPool,
        address _feeRecipient
    ) {
        if (_usdg == address(0) || _priceFeed == address(0)) revert ZeroAddress();
        owner         = msg.sender;
        usdg          = IERC20(_usdg);
        priceFeed     = IPriceFeed(_priceFeed);
        shieldedPool  = IShieldedPool(_shieldedPool); // 0x0 = disabled
        feeRecipient  = _feeRecipient == address(0) ? msg.sender : _feeRecipient;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function setPriceFeed(address _priceFeed) external onlyOwner {
        if (_priceFeed == address(0)) revert ZeroAddress();
        priceFeed = IPriceFeed(_priceFeed);
    }

    function setShieldedPool(address _pool) external onlyOwner {
        shieldedPool = IShieldedPool(_pool);
    }

    function setFeeRecipient(address _feeRecipient) external onlyOwner {
        if (_feeRecipient == address(0)) revert ZeroAddress();
        feeRecipient = _feeRecipient;
    }

    // ── Core: wallet-funded position ──────────────────────────────────────────

    /**
     * @notice Open a position using USDG from the caller's wallet.
     * Requires: caller has called usdg.approve(address(this), usdgAmount).
     */
    function openPosition(
        string calldata symbol,
        uint256 usdgAmount,
        bool    isLong
    ) external returns (uint256 positionId) {
        if (usdgAmount == 0) revert ZeroAmount();

        bool ok = usdg.transferFrom(msg.sender, address(this), usdgAmount);
        if (!ok) revert TransferFailed();

        positionId = _recordPosition(msg.sender, symbol, usdgAmount, isLong, false);
    }

    // ── Core: Shield-funded position (ZK unshield → open atomically) ──────────

    /**
     * @notice Open a CFD position funded directly from the VIONA Shield pool.
     *
     * The caller provides a spend() proof where s.recipient == address(this).
     * The ShieldedPool verifies the ZK proof and sends s.value USDG to this
     * contract in the same transaction. VIONATrader then opens the position.
     *
     * No wallet USDG approval needed — the shielded balance is consumed privately.
     *
     * @param s            Spend statement (public inputs). s.recipient MUST be address(this).
     * @param ciphertexts  Encrypted output notes (change + dummy).
     * @param proof        UltraHonk ZK proof bytes.
     * @param symbol       Ticker symbol, e.g. "AAPL".
     * @param isLong       True = long, false = short.
     */
    function openShieldedPosition(
        IShieldedPool.SpendStatement calldata s,
        bytes[2] calldata ciphertexts,
        bytes calldata proof,
        string calldata symbol,
        bool isLong
    ) external returns (uint256 positionId) {
        if (s.value == 0) revert ZeroAmount();
        if (s.recipient != address(this)) revert WrongRecipient();

        // Snapshot balance before
        uint256 balBefore = usdg.balanceOf(address(this));

        // Pool verifies ZK proof, spends nullifiers, emits change note, sends USDG here
        shieldedPool.spend(s, ciphertexts, proof);

        // Confirm we received at least s.value USDG
        uint256 received = usdg.balanceOf(address(this)) - balBefore;
        if (received < s.value) revert InsufficientFunds();

        positionId = _recordPosition(msg.sender, symbol, s.value, isLong, true);
    }

    /**
     * @notice Swap shielded USDG → stock (convenience wrapper: isLong=true).
     * Semantically "buy this stock from your private Shield balance."
     */
    function swapShielded(
        IShieldedPool.SpendStatement calldata s,
        bytes[2] calldata ciphertexts,
        bytes calldata proof,
        string calldata symbol
    ) external returns (uint256 positionId) {
        if (s.value == 0) revert ZeroAmount();
        if (s.recipient != address(this)) revert WrongRecipient();

        uint256 balBefore = usdg.balanceOf(address(this));
        shieldedPool.spend(s, ciphertexts, proof);
        uint256 received = usdg.balanceOf(address(this)) - balBefore;
        if (received < s.value) revert InsufficientFunds();

        positionId = _recordPosition(msg.sender, symbol, s.value, true, true);
    }

    // ── Close ─────────────────────────────────────────────────────────────────

    /**
     * @notice Close an open position and settle P&L.
     * USDG is always returned to the caller's wallet address.
     */
    function closePosition(uint256 positionId) external {
        Position storage pos = positions[positionId];
        if (pos.owner != msg.sender) revert NotPositionOwner();
        if (pos.closed)              revert PositionAlreadyClosed();

        (uint256 exitPrice,) = priceFeed.getPrice(pos.symbol);
        if (exitPrice == 0) exitPrice = pos.entryPrice;

        int256 priceDelta = int256(exitPrice) - int256(pos.entryPrice);
        int256 rawPnl     = (int256(pos.shares) * priceDelta) / int256(1e18);
        int256 pnl        = pos.isLong ? rawPnl : -rawPnl;

        uint256 usdgReturned;
        if (pnl >= 0) {
            usdgReturned = pos.usdgCollateral + uint256(pnl);
        } else {
            uint256 loss = uint256(-pnl);
            usdgReturned = loss >= pos.usdgCollateral ? 0 : pos.usdgCollateral - loss;
        }

        pos.closed = true;

        if (usdgReturned > 0) {
            bool ok = usdg.transfer(msg.sender, usdgReturned);
            if (!ok) revert TransferFailed();
        }

        emit PositionClosed(
            positionId, msg.sender, pos.symbol, pos.isLong,
            pos.entryPrice, exitPrice, pnl, usdgReturned
        );
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    function _recordPosition(
        address posOwner,
        string calldata symbol,
        uint256 usdgAmount,
        bool    isLong,
        bool    fromShield
    ) internal returns (uint256 positionId) {
        uint256 fee        = (usdgAmount * FEE_BPS) / 10_000;
        uint256 collateral = usdgAmount - fee;

        if (fee > 0 && feeRecipient != address(0)) {
            usdg.transfer(feeRecipient, fee);
        }

        uint256 entryPrice = priceFeed.getPriceFresh(symbol);
        uint256 shares     = (collateral * 1e18) / entryPrice;

        positionId = nextPositionId++;

        positions[positionId] = Position({
            owner:          posOwner,
            symbol:         symbol,
            usdgCollateral: collateral,
            entryPrice:     entryPrice,
            shares:         shares,
            isLong:         isLong,
            openTime:       block.timestamp,
            closed:         false,
            fromShield:     fromShield
        });

        _ownerPositions[posOwner].push(positionId);

        emit PositionOpened(positionId, posOwner, symbol, isLong, collateral, entryPrice, shares, fromShield);
    }

    // ── Views ─────────────────────────────────────────────────────────────────

    function getPositionIds(address _owner) external view returns (uint256[] memory) {
        return _ownerPositions[_owner];
    }

    function unrealisedPnl(uint256 positionId)
        external
        view
        returns (int256 pnl, uint256 currentPrice)
    {
        Position storage pos = positions[positionId];
        if (pos.closed) return (0, 0);

        (currentPrice,) = priceFeed.getPrice(pos.symbol);
        if (currentPrice == 0) currentPrice = pos.entryPrice;

        int256 priceDelta = int256(currentPrice) - int256(pos.entryPrice);
        int256 rawPnl     = (int256(pos.shares) * priceDelta) / int256(1e18);
        pnl               = pos.isLong ? rawPnl : -rawPnl;
    }

    function rescueUSDG(uint256 amount) external onlyOwner {
        usdg.transfer(owner, amount);
    }
}
