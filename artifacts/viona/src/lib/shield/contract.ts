// VIONA Shield — on-chain ABI and client helpers for Robinhood Chain.
import { createPublicClient, createWalletClient, http, custom, parseEventLogs } from "viem";
import type { Address } from "viem";
import { defineChain } from "viem";

// Robinhood Chain mainnet — chain 4663
export const robinhoodChain = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.mainnet.chain.robinhood.com"] },
    public: {
      http: [
        "https://rpc.mainnet.chain.robinhood.com",
        "https://robinhood-rpc.publicnode.com",
      ],
    },
  },
  blockExplorers: {
    default: { name: "Blockscout", url: "https://robinhoodchain.blockscout.com" },
  },
});

/**
 * VIONA Shield contract addresses on Robinhood Chain.
 * Deployed 2026-07-31 on Robinhood Chain (chainId 4663).
 */
export const CONTRACTS = {
  /**
   * VIONA Shield shielded pool (v2, dual-verifier) — live on Robinhood Chain.
   * spendVerifier=HonkVerifier (real UltraHonk), shieldVerifier=StubVerifier.
   */
  pool: "0xF6716fA1d5E58E1982a257d624571FB70b2B19Bf" as Address,
  /**
   * StubVerifier (always-true) — active as shieldVerifier until the shield
   * Noir circuit is compiled. Not the spend verifier.
   */
  stubVerifier: "0x82291667D9955aDA131ebd345eF740367376770D" as Address,
  /** HonkVerifier — bb 0.84.0 UltraHonk verifier for the transfer circuit. Active as spendVerifier. */
  honkVerifier: "0xAEa82dbA04e11F7455DF1D19344AD49026f69a83" as Address,
  /** Uniswap V3 SwapRouter on Robinhood Chain — public infrastructure. */
  swapRouter: "0xCaf681a66D020601342297493863E78C959E5cb2" as Address,
  /** Uniswap V3 Quoter on Robinhood Chain — public infrastructure. */
  quoter: "0x33e885eD0Ec9bF04EcfB19341582aADCb4c8A9E7" as Address,
  /** VIONATrader — CFD position manager, deployed 2026-08-01. */
  trader: "0x65282D832CD1DEA2d50d8DD88852a5e73CAb94e7" as Address,
  /** VIONAPriceFeed — on-chain oracle, deployed 2026-08-01. */
  priceFeed: "0xa7c7dC76004360bcfA8cA3Acb41C0D8174F133b6" as Address,
  /** Wrapped Ether on Robinhood Chain. */
  weth: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73" as Address,
  /** Global Dollar (USDG) on Robinhood Chain. */
  usdg: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168" as Address,
  /** Block at which ShieldedPool v2 was deployed — event scanning starts here. */
  poolDeployBlock: 24099195n,
  /** Uniswap V3 fee tier used for quotes (0.05%). */
  feeTier: 500,
};

// Re-export for pool.ts compatibility
export { parseEventLogs };

/** VIONA Shield pool ABI — matches the on-chain interface to be deployed. */
export const SHIELDED_POOL_ABI = [
  // Errors
  { type: "error", name: "DuplicateCommitment", inputs: [] },
  { type: "error", name: "TreeFull",            inputs: [] },
  { type: "error", name: "ZeroValue",           inputs: [] },
  { type: "error", name: "NotAField",           inputs: [] },
  { type: "error", name: "WrongDeposit",        inputs: [] },
  { type: "error", name: "InvalidProof",        inputs: [] },
  { type: "error", name: "TransferFailed",      inputs: [] },
  { type: "error", name: "UnknownRoot",         inputs: [] },
  { type: "error", name: "AlreadySpent",        inputs: [] },
  { type: "error", name: "RepeatedNullifier",   inputs: [] },
  { type: "error", name: "NoRecipient",         inputs: [] },
  { type: "error", name: "BadCipherLength",     inputs: [] },
  { type: "error", name: "ExceedsPooledValue",  inputs: [] },
  { type: "error", name: "NotOwner",            inputs: [] },
  { type: "error", name: "NoPendingSwap",       inputs: [] },
  { type: "error", name: "SwapNotReady",        inputs: [] },
  { type: "error", name: "ZeroAddress",         inputs: [] },
  // Functions
  {
    type: "function",
    name: "shield",
    stateMutability: "payable",
    inputs: [
      { name: "token",      type: "uint256" },
      { name: "value",      type: "uint256" },
      { name: "commitment", type: "bytes32" },
      { name: "newRoot",    type: "bytes32" },
      { name: "ciphertext", type: "bytes"   },
      { name: "proof",      type: "bytes"   },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "spend",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "s",
        type: "tuple",
        components: [
          { name: "membershipRoot", type: "bytes32"    },
          { name: "nullifiers",     type: "bytes32[2]" },
          { name: "commitments",    type: "bytes32[2]" },
          { name: "newRoot",        type: "bytes32"    },
          { name: "token",          type: "uint256"    },
          { name: "value",          type: "uint256"    },
          { name: "fee",            type: "uint256"    },
          { name: "recipient",      type: "address"    },
          { name: "relayer",        type: "address"    },
        ],
      },
      { name: "ciphertexts", type: "bytes[2]" },
      { name: "proof",       type: "bytes"    },
    ],
    outputs: [],
  },
  {
    type: "function", name: "spendVerifier",
    stateMutability: "view", inputs: [], outputs: [{ type: "address" }],
  },
  {
    type: "function", name: "shieldVerifier",
    stateMutability: "view", inputs: [], outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "setSpendVerifier",
    stateMutability: "nonpayable",
    inputs: [{ name: "_verifier", type: "address" }],
    outputs: [],
  },
  {
    type: "function",
    name: "setShieldVerifier",
    stateMutability: "nonpayable",
    inputs: [{ name: "_verifier", type: "address" }],
    outputs: [],
  },
  {
    type: "function", name: "nextLeafIndex",
    stateMutability: "view", inputs: [], outputs: [{ type: "uint32" }],
  },
  {
    type: "function", name: "root",
    stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }],
  },
  {
    type: "function", name: "knownRoot",
    stateMutability: "view",
    inputs: [{ name: "r", type: "bytes32" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function", name: "committed",
    stateMutability: "view",
    inputs: [{ name: "c", type: "bytes32" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function", name: "nullifierSpent",
    stateMutability: "view",
    inputs: [{ name: "n", type: "bytes32" }],
    outputs: [{ type: "bool" }],
  },
  // Events
  {
    type: "event",
    name: "NoteCommitted",
    inputs: [
      { name: "leafIndex",  type: "uint32",  indexed: false },
      { name: "commitment", type: "bytes32", indexed: false },
      { name: "ciphertext", type: "bytes",   indexed: false },
    ],
  },
  {
    type: "event",
    name: "Nullified",
    inputs: [{ name: "nullifier", type: "bytes32", indexed: false }],
  },
] as const;

export const QUOTER_ABI = [
  {
    type: "function",
    name: "quoteExactInputSingle",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenIn",          type: "address" },
          { name: "tokenOut",         type: "address" },
          { name: "amountIn",         type: "uint256" },
          { name: "fee",              type: "uint24"  },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [
      { name: "amountOut",               type: "uint256" },
      { name: "sqrtPriceX96After",       type: "uint160" },
      { name: "initializedTicksCrossed", type: "uint32"  },
      { name: "gasEstimate",             type: "uint256" },
    ],
  },
] as const;

export const ERC20_ABI = [
  {
    type: "function", name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function", name: "allowance",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function", name: "approve",
    stateMutability: "nonpayable",
    inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
    outputs: [{ type: "bool" }],
  },
] as const;

/** Read-only public client for Robinhood Chain. */
export function publicClient() {
  return createPublicClient({
    chain: robinhoodChain,
    transport: http(),
  });
}

/** Wallet client that uses the browser's injected provider. */
export function walletClient() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eth = typeof window !== "undefined" ? (window as any).ethereum : undefined;
  if (!eth) throw new Error("No injected wallet found");
  return createWalletClient({
    chain: robinhoodChain,
    transport: custom(eth),
  });
}
