<div align="center">

```
██╗   ██╗██╗ ██████╗ ███╗   ██╗ █████╗
██║   ██║██║██╔═══██╗████╗  ██║██╔══██╗
██║   ██║██║██║   ██║██╔██╗ ██║███████║
╚██╗ ██╔╝██║██║   ██║██║╚██╗██║██╔══██║
 ╚████╔╝ ██║╚██████╔╝██║ ╚████║██║  ██║
  ╚═══╝  ╚═╝ ╚═════╝ ╚═╝  ╚═══╝╚═╝  ╚═╝

L A Y E R
```

**Confidential Execution Layer for Tokenized Capital Markets**

*Trade Stocks. Keep the Strategy Yours.*

---

![Chain](https://img.shields.io/badge/Chain-Robinhood%20Chain%20%234663-00C805?style=for-the-badge&logo=ethereum&logoColor=white)
![ZK](https://img.shields.io/badge/ZK-UltraHonk%20%2B%20Noir-8B5CF6?style=for-the-badge&logo=zksync&logoColor=white)
![Solidity](https://img.shields.io/badge/Solidity-0.8.27-363636?style=for-the-badge&logo=solidity&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-7-646CFF?style=for-the-badge&logo=vite&logoColor=white)

</div>

---

## ◈ The Problem

Every position you open on a public blockchain is a broadcast.

The moment you submit a trade, the entire network sees your direction, size, and entry price before the transaction even confirms. MEV bots watch the mempool. Sophisticated actors front-run your strategy. Your portfolio — your alpha — is public property.

**VIONA changes that.**

---

## ◈ What is VIONA?

VIONA is a non-custodial, zero-knowledge confidential execution layer running on Robinhood Chain. It lets users:

- **Shield** USDG into a private encrypted balance — visible only to the key holder
- **Trade** tokenized stocks and CFDs from that shielded balance — without ever exposing your wallet, size, or strategy to the mempool
- **Close** positions and withdraw — with cryptographic proof of correctness, no trusted intermediary

The private key never leaves the browser. Proofs are generated entirely client-side using the Barretenberg UltraHonk proving system. The on-chain verifier accepts only valid proofs — no shortcuts, no off-chain escrow.

---

## ◈ Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          VIONA LAYER                                │
│                                                                     │
│  ┌─────────────┐    ┌─────────────────┐    ┌────────────────────┐  │
│  │   Browser   │    │  API Server     │    │  Robinhood Chain   │  │
│  │             │    │  (Node/Express) │    │  (EVM, ID 4663)    │  │
│  │  React +    │◄──►│                 │    │                    │  │
│  │  wagmi/viem │    │  /api/markets   │    │  ┌─────────────┐  │  │
│  │             │    │  /api/portfolio  │    │  │ShieldedPool │  │  │
│  │  ┌────────┐ │    │  /api/orders    │    │  │  Poseidon2  │  │  │
│  │  │ Noir   │ │    │  /api/dashboard │    │  │  Merkle 20  │  │  │
│  │  │ Worker │ │    │                 │    │  └──────┬──────┘  │  │
│  │  │ bb.js  │ │    │  Price Updater  │◄──►│         │         │  │
│  │  └────┬───┘ │    │  Limit Orders  │    │  ┌──────▼──────┐  │  │
│  │       │     │    │  Oracle Push   │    │  │VIONATrader  │  │  │
│  │  ZK Proof   │    │                 │    │  │  CFD engine │  │  │
│  │  (client)   │    └─────────────────┘    │  └──────┬──────┘  │  │
│  └──────┬──────┘                           │         │         │  │
│         │                                  │  ┌──────▼──────┐  │  │
│         └──────────── proof + calldata ───►│  │VIONAPriceFd │  │  │
│                                            │  │  HonkVerify │  │  │
│                                            │  └─────────────┘  │  │
│                                            └────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### Core Cryptographic Flow

```
1. SHIELD
   wallet_sig ──► derive(sk, vk) ──► note = Poseidon2(owner, token, value, blinding)
   browser generates deposit proof ──► ShieldedPool.shield(commitment, ciphertext, proof)
   Merkle tree updated on-chain (depth 20, ~1M notes capacity)

2. SPEND (Private Trade)
   scan NoteCommitted events ──► rebuild local Merkle state
   Merkle membership proof × 2 inputs ──► Noir transfer circuit
   browser generates UltraHonk proof (~50k constraints)
   ShieldedPool.spend(proof, nullifiers[], outputCommitments[], publicValue, recipient)
   nullifiers prevent replay ──► new output notes inserted

3. SETTLEMENT
   VIONATrader receives USDG atomically from spend
   on-chain oracle price (VIONAPriceFeed) ──► position recorded
   close() ──► USDG returned to wallet (P&L settled on-chain)
```

---

## ◈ Repository Structure

```
viona/
├── artifacts/
│   ├── viona/                        # Frontend — React + Vite
│   │   ├── src/
│   │   │   ├── pages/
│   │   │   │   ├── home.tsx          # Landing
│   │   │   │   ├── dashboard.tsx     # Aggregate overview
│   │   │   │   ├── trade.tsx         # CFD trading UI
│   │   │   │   ├── shield.tsx        # ZK shield/unshield
│   │   │   │   ├── portfolio.tsx     # Positions + balances
│   │   │   │   ├── markets.tsx       # Market browser
│   │   │   │   ├── orders.tsx        # Order history
│   │   │   │   ├── wallet.tsx        # Wallet connect + deposit
│   │   │   │   └── docs.tsx          # Protocol documentation
│   │   │   └── lib/
│   │   │       ├── shield/
│   │   │       │   ├── keys.ts       # Deterministic key derivation
│   │   │       │   ├── crypto.ts     # Poseidon2 wrappers
│   │   │       │   ├── notes.ts      # Note structure + encryption
│   │   │       │   ├── tree.ts       # Local Merkle state
│   │   │       │   ├── pool.ts       # ShieldedPool interactions
│   │   │       │   ├── prover.ts     # Proof orchestration
│   │   │       │   ├── prover-worker.ts  # bb.js Web Worker
│   │   │       │   └── contract.ts   # Contract addresses + ABIs
│   │   │       ├── use-shield-trade.ts   # Shielded open/close
│   │   │       ├── use-shield-spend.ts   # Generic spend proof
│   │   │       ├── use-trader.ts         # Wallet-funded trade
│   │   │       ├── use-eth-to-usdg.ts    # Swap ETH → USDG
│   │   │       └── wagmi.ts              # Chain + connector config
│   │   └── public/
│   │       ├── viona_transfer.json   # Compiled circuit bytecode
│   │       └── trader-addresses.json # Live contract addresses
│   │
│   └── api-server/                   # Backend — Node + Express
│       └── src/
│           ├── routes/
│           │   ├── markets.ts        # Yahoo Finance + Robinhood prices
│           │   ├── orders.ts         # Order management
│           │   ├── portfolio.ts      # Holdings + positions
│           │   ├── wallet.ts         # Wallet queries
│           │   └── dashboard.ts     # Aggregate endpoint
│           ├── workers/
│           │   ├── price-updater.ts  # Oracle push → VIONAPriceFeed
│           │   └── limit-order.ts    # Limit order engine
│           └── index.ts
│
├── contracts/
│   └── src/
│       ├── ShieldedPool.sol          # Core privacy pool
│       ├── VIONATrader.sol           # CFD position manager
│       ├── VIONAPriceFeed.sol        # On-chain oracle
│       ├── HonkVerifier.sol          # UltraHonk spend verifier
│       ├── StubVerifier.sol          # Placeholder deposit verifier
│       ├── MerkleTree.sol            # Poseidon2 incremental tree
│       └── IVerifier.sol             # Verifier interface
│
└── circuits/
    ├── shield/                       # Deposit circuit (Noir)
    │   └── src/main.nr
    └── transfer/                     # Spend/transfer circuit (Noir)
        ├── src/main.nr
        └── target/
            ├── viona_transfer.json   # Compiled bytecode
            └── vk                    # Verification key
```

---

## ◈ Smart Contracts

> **Network:** Robinhood Chain Mainnet — Chain ID `4663`
> **RPC:** `https://rpc.mainnet.chain.robinhood.com/`
> **Explorer:** [robinhoodchain.blockscout.com](https://robinhoodchain.blockscout.com)

| Contract | Address | Description |
|---|---|---|
| `ShieldedPool` | `0xF6716fA1d5E58E1982a257d624571FB70b2B19Bf` | Poseidon2 Merkle privacy pool |
| `VIONATrader` | `0x65282D832CD1DEA2d50d8DD88852a5e73CAb94e7` | CFD position engine (v2) |
| `VIONAPriceFeed` | `0xa7c7dC76004360bcfA8cA3Acb41C0D8174F133b6` | On-chain stock price oracle |
| `HonkVerifier` | `0x4dB8c903648f12CE06D03d0Bdbe4B463F3330Ab9` | UltraHonk spend proof verifier |
| `StubVerifier` | `0x82291667D9955aDA131ebd345eF740367376770D` | Deposit verifier (placeholder) |
| `USDG` | `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` | USD-pegged stablecoin |
| `WETH` | `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73` | Wrapped ETH |
| `Uniswap V3 Router` | `0xCaf681a66D020601342297493863E78C959E5cb2` | SwapRouter02 |
| `Uniswap V3 Quoter` | `0x33e885eD0Ec9bF04EcfB19341582aADCb4c8A9E7` | QuoterV2 |

---

## ◈ ZK Proof System

VIONA uses the **Barretenberg UltraHonk** proving system via Aztec's `bb.js` (v0.84.0) and Noir circuits compiled with `nargo` 1.0.0-beta.6.

### Transfer Circuit Constraints

```
Inputs (private):
  - spend_key          : Field          // derived from wallet sig
  - input_note_0       : Note { owner, token, value, blinding }
  - input_note_1       : Note           // optional (zero-padded)
  - merkle_path_0      : [Field; 20]   // Merkle membership path
  - merkle_path_1      : [Field; 20]
  - output_note_0      : Note
  - output_note_1      : Note

Public:
  - root               : Field          // current Merkle root
  - nullifier_0        : Field          // = Poseidon2(sk, commitment_0)
  - nullifier_1        : Field
  - output_commitment_0: Field
  - output_commitment_1: Field
  - public_value       : Field          // tokens leaving the pool
  - token              : Field
  - recipient          : address

Constraint:
  input_0.value + input_1.value == output_0.value + output_1.value + public_value
```

### Nullifier Formula

```
nullifier = Poseidon2_2([spend_key, commitment])   // 2-input, no domain tag
```

> **Critical invariant:** If the Noir circuit is ever recompiled (`nargo compile` + `bb write_vk` + `bb contract`), the on-chain `HonkVerifier` **must** be redeployed and `ShieldedPool.setSpendVerifier(newAddress)` called. A VK mismatch causes silent empty-revert failures that consume gas with no error message.

### Key Derivation (Client-Side)

```typescript
// Deterministic — regeneratable from wallet alone
const message = "VIONA Shield Key v1"
const sig = await wallet.signMessage(message)          // EIP-191

const spend_key = poseidon2([sig_lower_128, sig_upper_128])
const view_key  = poseidon2([spend_key, 1n])
```

---

## ◈ Tech Stack

### Frontend (`artifacts/viona`)

| Layer | Library | Version |
|---|---|---|
| Framework | React | 19 |
| Build | Vite | 7 |
| Routing | Wouter | 3 |
| State / Async | TanStack Query | 5 |
| EVM | wagmi + viem | 2.x |
| Styling | Tailwind CSS | 4 |
| Components | Radix UI | — |
| Charts | Recharts | 2 |
| Animation | Framer Motion | 11 |
| ZK Prover | @aztec/bb.js | **0.84.0** |
| Noir runtime | @noir-lang/noir_js | 1.0.0-beta.7 |
| Poseidon2 | @zkpassport/poseidon2 | 0.6.2 |

### API Server (`artifacts/api-server`)

| Layer | Library |
|---|---|
| Runtime | Node.js (ESM) |
| Framework | Express 5 |
| On-chain | viem |
| Logging | pino / pino-http |
| ORM | Drizzle |
| Validation | Zod |
| Market Data | Yahoo Finance + Robinhood |
| Price Oracle | Background worker → VIONAPriceFeed |

### Contracts (`contracts`)

| Tool | Version |
|---|---|
| Solidity | ^0.8.27 |
| Hash function | Poseidon2 (BN254) |
| Proof system | UltraHonk |
| Merkle depth | 20 levels (~1M notes) |

### Circuits (`circuits`)

| Tool | Version |
|---|---|
| Language | Noir |
| Compiler (nargo) | 1.0.0-beta.6 |
| Proving backend | Barretenberg (bb) |
| Proof scheme | UltraHonk |
| Gate count (transfer) | ~50k |

---

## ◈ API Reference

All endpoints served under `/api`. Full CORS and request logging via pino-http.

```
GET  /healthz                          → server health

Markets
GET  /api/markets                      → all tracked instruments
GET  /api/markets/movers               → top gainers/losers
GET  /api/markets/:symbol              → single instrument + price
GET  /api/markets/:symbol/chart/:range → OHLCV history
GET  /api/markets/logo/:symbol         → company logo URL
GET  /api/markets/corporate-actions    → dividends/splits

Orders
GET  /api/orders                       → order list
GET  /api/orders/recent                → last N orders
GET  /api/orders/:id                   → single order
POST /api/orders                       → create limit/market order
DELETE /api/orders/:id                 → cancel order

Portfolio
GET  /api/portfolio                    → wallet holdings + USDG balance
GET  /api/portfolio/positions          → open VIONATrader positions
GET  /api/portfolio/performance/:range → historical P&L

Wallet
GET  /api/wallet                       → connected wallet info
POST /api/wallet/deposit               → deposit initiation

Dashboard
GET  /api/dashboard                    → aggregate view (market + portfolio)
```

---

## ◈ Getting Started

### Prerequisites

- **pnpm** ≥ 9 (enforced via `preinstall`)
- **Node.js** ≥ 20
- **nargo** 1.0.0-beta.6 — only needed for circuit recompilation
- **bb** (Barretenberg CLI) — only needed for VK/verifier regeneration
- A funded wallet on Robinhood Chain (for trades and gas)

### Install

```bash
git clone https://github.com/your-org/viona.git
cd viona
pnpm install
```

### Environment

**API Server** — create `artifacts/api-server/.env`:

```env
PORT=8080
NODE_ENV=development
DEPLOYER_KEY=0x...    # wallet private key for oracle price updates
```

**Frontend** — `PORT` is injected by the dev runner automatically.

### Run (Development)

```bash
# Terminal 1 — API server
pnpm --filter @workspace/api-server run dev

# Terminal 2 — Frontend
pnpm --filter @workspace/viona run dev
```

### Build (Production)

```bash
pnpm run build
# Typechecks all packages → builds api-server → builds viona (Vite)
```

---

## ◈ Circuit Development

> Only needed if you modify the Noir circuits.

```bash
# Compile transfer circuit
cd circuits/transfer
nargo compile

# Generate Verification Key
bb write_vk -b target/viona_transfer.json -o target/

# Generate Solidity verifier
bb contract -k target/vk -o ../../contracts/src/HonkVerifier.sol

# ⚠️  After this you MUST:
# 1. Deploy new HonkVerifier.sol to Robinhood Chain
# 2. Call ShieldedPool.setSpendVerifier(<new address>)
# 3. Copy target/viona_transfer.json → artifacts/viona/public/viona_transfer.json
# Failure to do all three causes silent empty-revert proof failures.
```

---

## ◈ Security Model

| Property | Mechanism |
|---|---|
| **Non-custodial** | Private keys never leave browser; Shield keys derived from wallet signatures |
| **Note privacy** | Commitments on-chain; plaintext (owner, value, blinding) is client-only |
| **Spend integrity** | UltraHonk proof verified on-chain; invalid proofs rejected at EVM level |
| **Double-spend prevention** | Nullifiers stored in ShieldedPool; duplicate nullifier → revert |
| **Front-running resistance** | Trade size, direction, and entry are not observable in mempool |
| **Merkle integrity** | Poseidon2 incremental Merkle tree; root verified in every spend proof |
| **Oracle trust** | VIONAPriceFeed updated by permissioned key; positions use on-chain price at execution time |

### ⚠️ Current Limitations

- **Deposit circuit**: uses `StubVerifier` (always-true). The shield deposit is not yet ZK-verified on-chain. Full deposit circuit integration is in progress.
- **Slippage**: ETH → USDG swap currently uses `amountOutMinimum: 0`. Slippage protection is a planned improvement.
- **Browser storage**: Note ciphertexts are cached in `localStorage`. Cross-device recovery requires re-scanning `NoteCommitted` events from the shield block.

---

## ◈ Trade Flow (Detailed)

### Wallet-Funded Open

```
User approves USDG → VIONATrader
User calls openPosition(symbol, isLong, collateral, leverage)
  └─ Trader reads VIONAPriceFeed.getPrice(symbol)
  └─ Calculates shares = (collateral × leverage) / price
  └─ Records position { owner, symbol, isLong, collateral, shares, entryPrice }
  └─ Charges 0.1% protocol fee
```

### Shielded Open (Private)

```
Browser builds 2-input transfer proof:
  input_0: user's USDG note (shielded balance)
  output_0: change note back to user
  public_value: trade collateral amount
  recipient: VIONATrader address

ShieldedPool.spend(proof, ...) → verifies proof → transfers USDG to Trader
VIONATrader.openShieldedPosition() → called atomically → records position
No wallet USDG balance touched. No approval. No public exposure.
```

### Close

```
User calls closePosition(positionId)
  └─ Reads current VIONAPriceFeed.getPrice(symbol)
  └─ Calculates P&L: pnl = (exitPrice - entryPrice) / entryPrice × collateral × leverage
  └─ Returns: collateral ± pnl to wallet address
  └─ Position marked closed
```

---

## ◈ Merkle Tree Design

```
Depth: 20 levels
Capacity: 2^20 = 1,048,576 notes
Hash: Poseidon2 (BN254 field)
Zero leaf: Poseidon2(0, 0) propagated up

Note commitment:
  C = Poseidon2_4(owner_field, token_field, value, blinding)

Nullifier:
  N = Poseidon2_2(spend_key, C)

Insertion: append-only, left-to-right
State root: recomputed on every insertion
```

---

## ◈ Monorepo Structure

VIONA is a **pnpm workspace** monorepo with TypeScript project references.

```
viona/
├── package.json           # Root scripts: build, typecheck
├── pnpm-workspace.yaml    # Workspace members
├── tsconfig.base.json     # Shared TS config
├── artifacts/
│   ├── viona/             # @workspace/viona
│   └── api-server/        # @workspace/api-server
├── contracts/             # Foundry/Hardhat project
├── circuits/              # Noir projects
└── packages/
    └── db/                # @workspace/db (shared Drizzle schema)
```

---

## ◈ Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Commit with conventional commits: `feat:`, `fix:`, `chore:`, `docs:`
4. Run `pnpm run typecheck` before pushing
5. Open a pull request with context on what changed and why

---

## ◈ License

MIT © VIONA Layer Contributors

---

<div align="center">

*Built for the conviction that financial privacy is not a feature — it's a right.*

</div>
