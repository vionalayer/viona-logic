# VIONA Shield — Smart Contracts

Shielded liquidity pool on Robinhood Chain (chainId 4663).

## Architecture

```
contracts/src/
  Poseidon2.sol      — BN254 Poseidon2 library (t=4, verified against zkpassport/poseidon2)
  MerkleTree.sol     — Append-only depth-20 incremental Merkle tree
  IVerifier.sol      — Interface for UltraHonk ZK verifier
  StubVerifier.sol   — Dev-only always-true verifier (replaced on go-live)
  ShieldedPool.sol   — Main shielded pool contract
```

## Prerequisites

- Node.js 20+, pnpm
- Funded deployer wallet with ETH on Robinhood Chain (chainId 4663)
- RPC: https://rpc.mainnet.chain.robinhood.com

## Deployment

### Step 1 — StubVerifier + ShieldedPool (deploy now)

The pool can accept shielded deposits immediately; spends need the real verifier.

```bash
cd contracts
pnpm install

export DEPLOYER_KEY=0x<your-private-key>
pnpm deploy   # runs scripts/deploy.ts --network robinhood
```

Output will print:
```
ShieldedPool: 0x...
Deploy block: 12345678
```

Copy those values into `artifacts/viona/src/lib/shield/contract.ts`:
```ts
pool:            "0x<ShieldedPool address>",
poolDeployBlock: 12345678n,
```

The VIONA Shield UI will immediately show live — deposits work, spends show
"contracts pending" until the real verifier is deployed.

---

### Step 2 — Compile Noir circuits + generate UltraHonk verifier

Requirements: `nargo` 1.0.0-beta.6 and `bb` (Barretenberg) matching that version.

```bash
# Install nargo (if not already)
curl -L https://raw.githubusercontent.com/noir-lang/noirup/main/install | bash
source ~/.bashrc
noirup --version 1.0.0-beta.6

# Install bb (matching version)
curl -L https://raw.githubusercontent.com/AztecProtocol/aztec-packages/aztec-packages-v1.0.0-beta.6/barretenberg/bbup/bbup | bash
source ~/.bashrc
bbup --version <bb-version-for-nargo-1.0.0-beta.6>

# Compile the transfer circuit
cd circuits/transfer
nargo compile

# Generate the UltraHonk proving and verification keys
bb write_vk -b target/viona_transfer.json -o target/

# Generate the Solidity verifier contract
bb contract -k target/vk -o ../contracts/src/
# This produces: HonkVerifier.sol (or UltraHonkVerifier.sol)
```

---

### Step 3 — Deploy real verifier and upgrade the pool

```bash
cd contracts
HARDHAT_DISABLE_TELEMETRY_PROMPT=true pnpm run compile   # picks up the generated verifier

# Deploy the generated UltraHonkVerifier contract
npx hardhat run scripts/deploy-verifier.ts --network robinhood

# Set the verifier on the pool
export POOL_ADDRESS=0x<pool>
export VERIFIER_ADDRESS=0x<real-verifier>
npx hardhat run scripts/upgrade-verifier.ts --network robinhood
```

Private spends are now live with real ZK proofs.

---

### Step 4 — Compile browser prover worker

```bash
cd circuits/transfer

# Build the WASM prover for browser use
# (Uses @aztec/bb.js WASM build of Barretenberg)
# Output: artifacts/viona/public/viona-shield-prover.js
node scripts/build-browser-prover.js
```

This step requires a separate build script (to be written) that bundles the
ACIR bytecode + bb.js WASM into the public/ directory as a Web Worker module.

---

## Testing

```bash
cd contracts
HARDHAT_DISABLE_TELEMETRY_PROMPT=true pnpm test
```

Currently tests: Poseidon2BN254 hash2 + hash4 against JS library (all passing).

## Verified constants

| Check                    | Status |
|--------------------------|--------|
| BN254 scalar field prime | Correct: 0x30644e72...f0000001 |
| Poseidon2 hash2(0,0)     | Match: 0x0b63a5... |
| Poseidon2 hash2(1,2)     | Match: 0x038682... |
| Poseidon2 hash4(1,2,3,4) | Match: 0x130bf2... |
| Noir shield circuit      | Compiled OK (nargo 1.0.0-beta.6) |
| Noir transfer circuit    | Compiled OK (nargo 1.0.0-beta.6) |
| Solidity contracts       | Compiled OK (solc 0.8.27, viaIR) |
